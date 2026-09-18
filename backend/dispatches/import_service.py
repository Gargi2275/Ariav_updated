"""Dispatch bulk import — match existing Purchase Orders only; never create a PO.

Preview is read-only. Commit re-validates and writes one Dispatch per
(Order Code, Invoice No) group inside a single transaction.
"""

from __future__ import annotations

import hashlib
import secrets
from collections import OrderedDict, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.db import transaction
from openpyxl import load_workbook
from rest_framework.exceptions import ValidationError

from purchase_orders.import_service import (
    MAX_DESCRIPTION,
    _cell_str,
    _norm_header,
    _parse_qty,
    compose_description,
)
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine

from .models import Dispatch, DispatchLine
from .services import (
    DISPATCH_STATUS_LOCK,
    line_pending_quantity,
    qty_label,
    sync_purchase_order_dispatch_status,
)

PREVIEW_CACHE_PREFIX = "dispatch_import_preview:"
PREVIEW_TTL_SECONDS = 30 * 60

HEADER_ALIASES = {
    "companycd": "company_cd",
    "company cd": "company_cd",
    "company code": "company_cd",
    "agent": "agent",
    "agent code": "agent",
    "order code": "order_code",
    "order no": "order_code",
    "order number": "order_code",
    "invoice no": "invoice_no",
    "invoice number": "invoice_no",
    "invoice date": "invoice_date",
    "customer code": "customer_code",
    "customer name": "customer_name",
    "customer city": "city",
    "state": "state",
    "transport name": "transporter",
    "transporter": "transporter",
    "transport": "transporter",
    "lr no": "lr_number",
    "lr number": "lr_number",
    "lr date": "lr_date",
    "code1": "code1",
    "code 1": "code1",
    "code5": "code5",
    "code 5": "code5",
    "code6": "code6",
    "code 6": "code6",
    "template": "template",
    "size": "size",
    "qty": "qty",
    "quantity": "qty",
    "ord qty": "qty",
    "order qty": "qty",
    "disp qty": "qty",
    "dispatch qty": "qty",
    "meters": "qty",
    "meter": "qty",
    "product code": "product_code",
    "item code": "product_code",
    "sku": "product_code",
    "product description": "description",
    "item description": "description",
    "fabric description": "description",
    "item": "description",
}

RECORD_FIELDS = (
    "order_code",
    "invoice_no",
    "invoice_date",
    "customer_code",
    "customer_name",
    "transporter",
    "lr_number",
    "lr_date",
    "code1",
    "code5",
    "code6",
    "template",
    "size",
    "qty",
    "product_code",
    "description",
)


def group_key(order_code: str, invoice_no: str) -> str:
    return f"{order_code}||{invoice_no}"


def _parse_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()
        except (OverflowError, ValueError):
            return None
    raw = _cell_str(value)
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw[:10], fmt).date()
        except ValueError:
            continue
    return None


def _line_description(record: dict) -> str:
    composed = compose_description(record)
    if composed.replace("-", "").strip():
        return composed[:MAX_DESCRIPTION]
    desc = _cell_str(record.get("description"))
    if desc:
        return desc[:MAX_DESCRIPTION]
    return _cell_str(record.get("product_code"))[:MAX_DESCRIPTION]


def _norm_match(value: str) -> str:
    return " ".join(_cell_str(value).lower().replace("-", " ").split())


def parse_workbook(file_bytes: bytes) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    try:
        workbook = load_workbook(BytesIO(file_bytes), read_only=True, data_only=True)
    except Exception as exc:
        raise ValidationError({"file": f"Could not read the spreadsheet: {exc}"}) from exc

    try:
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=True)
        try:
            header_row = next(rows)
        except StopIteration:
            raise ValidationError({"file": "The spreadsheet is empty."}) from None

        mapping: dict[int, str] = {}
        mapped_values: set[str] = set()
        for index, cell in enumerate(header_row or ()):
            key = HEADER_ALIASES.get(_norm_header(cell))
            if not key:
                continue
            if key == "qty" and "qty" in mapped_values:
                continue
            mapping[index] = key
            mapped_values.add(key)

        missing = []
        if "order_code" not in mapped_values:
            missing.append("Order Code")
        if "invoice_no" not in mapped_values:
            missing.append("Invoice No")
        if "qty" not in mapped_values:
            missing.append("Qty")
        if missing:
            raise ValidationError(
                {"file": f"Missing required column(s): {', '.join(missing)}."}
            )

        grouped: OrderedDict[str, dict] = OrderedDict()
        for excel_row, values in enumerate(rows, start=2):
            if not values or all(v is None or _cell_str(v) == "" for v in values):
                continue
            record = {field: None for field in RECORD_FIELDS}
            for index, field in mapping.items():
                if index < len(values):
                    record[field] = values[index]

            order_code = _cell_str(record["order_code"])
            invoice_no = _cell_str(record["invoice_no"])
            if not order_code or not invoice_no:
                warnings.append(
                    f"Row {excel_row}: skipped — Order Code or Invoice No is blank."
                )
                continue

            qty = _parse_qty(record["qty"])
            key = group_key(order_code, invoice_no)
            group = grouped.get(key)
            if group is None:
                group = {
                    "group_key": key,
                    "order_code": order_code,
                    "invoice_no": invoice_no,
                    "customer_codes": [],
                    "customer_name": _cell_str(record["customer_name"]),
                    "transporter": _cell_str(record["transporter"]),
                    "lr_number": _cell_str(record["lr_number"]),
                    "lr_date": record["lr_date"],
                    "invoice_date": record["invoice_date"],
                    "lines": [],
                }
                grouped[key] = group

            customer_code = _cell_str(record["customer_code"])
            if customer_code and customer_code not in group["customer_codes"]:
                group["customer_codes"].append(customer_code)
            if _cell_str(record["customer_name"]) and not group["customer_name"]:
                group["customer_name"] = _cell_str(record["customer_name"])
            if _cell_str(record["transporter"]) and not group["transporter"]:
                group["transporter"] = _cell_str(record["transporter"])
            if _cell_str(record["lr_number"]) and not group["lr_number"]:
                group["lr_number"] = _cell_str(record["lr_number"])
            if group["lr_date"] in (None, "") and record["lr_date"] not in (None, ""):
                group["lr_date"] = record["lr_date"]
            if group["invoice_date"] in (None, "") and record["invoice_date"] not in (None, ""):
                group["invoice_date"] = record["invoice_date"]

            if qty is None:
                warnings.append(
                    f"Row {excel_row} (Order Code {order_code} / Invoice {invoice_no}): "
                    "skipped line — Qty is missing or invalid."
                )
                continue

            group["lines"].append(
                {
                    "description": _line_description(record),
                    "product_code": _cell_str(record["product_code"]),
                    "quantity": str(qty),
                    "excel_row": excel_row,
                }
            )
    finally:
        workbook.close()

    return list(grouped.values()), warnings


def _po_by_number() -> dict[str, PurchaseOrder]:
    mapping: dict[str, PurchaseOrder] = {}
    qs = PurchaseOrder.objects.select_related("customer").prefetch_related(
        "lines__product",
        "lines__dispatch_lines",
    )
    for po in qs:
        mapping[po.po_number.strip().lower()] = po
    return mapping


def _file_keys(line: dict) -> set[str]:
    keys: set[str] = set()
    desc = _norm_match(line.get("description") or "")
    if desc:
        keys.add(desc)
    code = _norm_match(line.get("product_code") or "")
    if code:
        keys.add(code)
    return keys


def _po_line_keys(line: PurchaseOrderLine) -> set[str]:
    keys: set[str] = set()
    desc = _norm_match(line.product_description)
    if desc:
        keys.add(desc)
    if line.product_id:
        code = _norm_match(line.product.product_code)
        name = _norm_match(line.product.product_name)
        if code:
            keys.add(code)
        if name:
            keys.add(name)
    return keys


def match_lines_to_po(group_lines: list[dict], po: PurchaseOrder) -> tuple[list[dict], str | None]:
    """Return (allocated lines, error reason). Error means exclude the group."""
    po_lines = list(po.lines.all())
    if not po_lines:
        return [], f"Purchase Order {po.po_number} has no line items to dispatch against."

    allocated: dict[int, Decimal] = defaultdict(lambda: Decimal("0.00"))
    matched_rows: list[dict] = []

    for file_line in group_lines:
        qty = Decimal(str(file_line["quantity"]))
        file_keys = _file_keys(file_line)
        candidates = [
            line for line in po_lines if file_keys and (file_keys & _po_line_keys(line))
        ]
        unique_ids = {line.id for line in candidates}
        if not unique_ids:
            label = file_line.get("description") or file_line.get("product_code") or "(blank)"
            return [], (
                f"No matching PO line for '{label}' on {po.po_number}."
            )
        if len(unique_ids) > 1:
            label = file_line.get("description") or file_line.get("product_code") or "(blank)"
            return [], (
                f"Ambiguous PO line match for '{label}' on {po.po_number} "
                f"— {len(unique_ids)} lines could match. Resolve on the PO before importing."
            )
        po_line = candidates[0]
        allocated[po_line.id] += qty
        matched_rows.append(
            {
                "description": file_line.get("description") or "",
                "product_code": file_line.get("product_code") or "",
                "quantity": str(qty),
                "purchase_order_line_id": po_line.id,
                "po_line_description": po_line.product_description
                or (po_line.product.product_name if po_line.product_id else ""),
            }
        )

    by_id = {line.id: line for line in po_lines}
    for po_line_id, extra in allocated.items():
        po_line = by_id[po_line_id]
        pending = line_pending_quantity(po_line)
        if extra > pending:
            label = (
                po_line.product_description
                or (po_line.product.product_code if po_line.product_id else f"line {po_line_id}")
            )
            return [], (
                f"Cannot dispatch {qty_label(extra)} units — only "
                f"{qty_label(pending)} units pending for this line ({label})."
            )

    collapsed: dict[int, dict] = {}
    for row in matched_rows:
        line_id = row["purchase_order_line_id"]
        if line_id not in collapsed:
            collapsed[line_id] = dict(row)
        else:
            collapsed[line_id]["quantity"] = str(
                Decimal(collapsed[line_id]["quantity"]) + Decimal(row["quantity"])
            )
    return list(collapsed.values()), None


def _status_reason(po: PurchaseOrder) -> str | None:
    if po.status in DISPATCH_STATUS_LOCK:
        return None
    if po.status in {
        PurchaseOrder.Status.DRAFT,
        PurchaseOrder.Status.SUBMITTED,
        PurchaseOrder.Status.SENT_TO_BRAND,
    }:
        return (
            f"PO exists but not yet Brand Accepted (current status: {po.status})"
        )
    return f"PO exists but cannot be dispatched (current status: {po.status})"


def _customer_mismatch_reason(po: PurchaseOrder, file_code: str) -> str:
    actual = (po.customer.customer_code or "").strip()
    return (
        f"Customer mismatch: file has Customer Code {file_code or '(blank)'} "
        f"but Purchase Order {po.po_number} belongs to {actual} "
        f"({po.customer.customer_name})."
    )


def evaluate_group(group: dict, pos: dict[str, PurchaseOrder]) -> tuple[dict | None, dict | None]:
    """Return (importable_row, excluded_row) — exactly one is set."""
    order_code = group["order_code"]
    invoice_no = group["invoice_no"]
    codes = [c for c in group["customer_codes"] if c]
    customer_code = codes[0] if codes else ""
    customer_name = group["customer_name"]
    line_count = len(group["lines"])
    base_excluded = {
        "group_key": group["group_key"],
        "order_code": order_code,
        "invoice_no": invoice_no,
        "customer_code": customer_code,
        "customer_name": customer_name,
        "line_count": line_count,
    }

    if line_count == 0:
        return None, {**base_excluded, "reason": "No valid line items"}

    if len(codes) > 1:
        return None, {
            **base_excluded,
            "customer_code": ", ".join(codes),
            "reason": "Invoice/order group has mixed customer codes",
        }

    po = pos.get(order_code.lower())
    if po is None:
        return None, {
            **base_excluded,
            "reason": f"No matching Purchase Order found for Order Code {order_code}",
        }

    po_code = (po.customer.customer_code or "").strip().upper()
    if customer_code and po_code and customer_code.upper() != po_code:
        return None, {
            **base_excluded,
            "reason": _customer_mismatch_reason(po, customer_code),
        }
    if customer_code and not po_code:
        return None, {
            **base_excluded,
            "reason": _customer_mismatch_reason(po, customer_code),
        }

    status_err = _status_reason(po)
    if status_err:
        return None, {**base_excluded, "reason": status_err}

    lr_date = _parse_date(group["lr_date"]) or _parse_date(group["invoice_date"])
    if lr_date is None:
        return None, {**base_excluded, "reason": "LR Date is missing or invalid"}

    lr_number = group["lr_number"]
    if not lr_number:
        return None, {**base_excluded, "reason": "LR No is missing"}

    matched_lines, match_err = match_lines_to_po(group["lines"], po)
    if match_err:
        return None, {**base_excluded, "reason": match_err}

    return (
        {
            "group_key": group["group_key"],
            "order_code": order_code,
            "invoice_no": invoice_no,
            "po_id": po.id,
            "po_number": po.po_number,
            "customer_code": po.customer.customer_code,
            "customer_name": po.customer.customer_name,
            "file_customer_code": customer_code,
            "lr_number": lr_number,
            "lr_date": lr_date.isoformat(),
            "transporter": group["transporter"],
            "challan_reference": invoice_no,
            "line_count": len(matched_lines),
            "lines": matched_lines,
        },
        None,
    )


def build_preview(file_bytes: bytes) -> dict:
    groups, parse_warnings = parse_workbook(file_bytes)
    pos = _po_by_number()
    importable: list[dict] = []
    excluded: list[dict] = []
    warnings = list(parse_warnings)

    for group in groups:
        row, skip = evaluate_group(group, pos)
        if skip:
            excluded.append(skip)
        else:
            importable.append(row)

    return {
        "file_sha256": hashlib.sha256(file_bytes).hexdigest(),
        "importable": importable,
        "excluded": excluded,
        "warnings": warnings,
    }


def store_preview(user_id: int, preview: dict) -> str:
    token = secrets.token_urlsafe(32)
    cache.set(
        f"{PREVIEW_CACHE_PREFIX}{token}",
        {"user_id": user_id, **preview},
        timeout=PREVIEW_TTL_SECONDS,
    )
    return token


def load_preview(token: str) -> dict | None:
    if not token:
        return None
    cached = cache.get(f"{PREVIEW_CACHE_PREFIX}{token}")
    return cached if isinstance(cached, dict) else None


def drop_preview(token: str) -> None:
    if token:
        cache.delete(f"{PREVIEW_CACHE_PREFIX}{token}")


def public_preview_payload(preview: dict, token: str) -> dict:
    importable = []
    for row in preview["importable"]:
        importable.append(
            {
                "group_key": row["group_key"],
                "order_code": row["order_code"],
                "invoice_no": row["invoice_no"],
                "po_id": row["po_id"],
                "po_number": row["po_number"],
                "customer_code": row["customer_code"],
                "customer_name": row["customer_name"],
                "lr_number": row["lr_number"],
                "lr_date": row["lr_date"],
                "transporter": row["transporter"],
                "challan_reference": row["challan_reference"],
                "line_count": row["line_count"],
                "lines": row["lines"],
            }
        )
    return {
        "preview_token": token,
        "importable": importable,
        "excluded": preview["excluded"],
        "warnings": preview["warnings"],
    }


def _revalidate_importable(row: dict, pos: dict[str, PurchaseOrder]) -> str | None:
    po = pos.get(row["order_code"].lower())
    if po is None:
        return f"No matching Purchase Order found for Order Code {row['order_code']}"
    if po.id != row["po_id"]:
        return f"Purchase Order match for {row['order_code']} changed since preview. Run preview again."
    file_code = (row.get("file_customer_code") or "").strip()
    po_code = (po.customer.customer_code or "").strip().upper()
    if file_code and po_code and file_code.upper() != po_code:
        return _customer_mismatch_reason(po, file_code)
    status_err = _status_reason(po)
    if status_err:
        return status_err
    file_lines = [
        {
            "description": line["description"],
            "product_code": line.get("product_code") or "",
            "quantity": line["quantity"],
        }
        for line in row["lines"]
    ]
    _matched, match_err = match_lines_to_po(file_lines, po)
    return match_err


def commit_import(*, user, token: str, group_keys: list[str]) -> dict:
    cached = load_preview(token)
    if not cached:
        raise ValidationError(
            {"detail": "Preview has expired or was not found. Run preview again before committing."}
        )
    if cached.get("user_id") != getattr(user, "id", None):
        raise ValidationError(
            {"detail": "Preview has expired or was not found. Run preview again before committing."}
        )

    approved = [_cell_str(value) for value in group_keys if _cell_str(value)]
    if not approved:
        raise ValidationError({"group_keys": "Select at least one dispatch group to import."})

    importable_by_key = {row["group_key"]: row for row in cached["importable"]}
    excluded_by_key = {row["group_key"]: row for row in cached["excluded"]}
    unknown = [key for key in approved if key not in importable_by_key and key not in excluded_by_key]
    if unknown:
        raise ValidationError(
            {
                "group_keys": (
                    "Group "
                    + ", ".join(unknown)
                    + " was not part of the preview. Run preview again."
                )
            }
        )

    to_create = [importable_by_key[key] for key in approved if key in importable_by_key]
    skipped_excluded = [excluded_by_key[key] for key in approved if key in excluded_by_key]

    pos = _po_by_number()
    stale: list[str] = []
    for row in to_create:
        err = _revalidate_importable(row, pos)
        if err:
            stale.append(err)
    if stale:
        raise ValidationError(
            {
                "detail": (
                    "Import was rejected because data changed since preview. "
                    + " ".join(stale)
                )
            }
        )

    created: list[dict] = []
    with transaction.atomic():
        for row in to_create:
            po = pos[row["order_code"].lower()]
            file_lines = [
                {
                    "description": line["description"],
                    "product_code": line.get("product_code") or "",
                    "quantity": line["quantity"],
                }
                for line in row["lines"]
            ]
            matched, match_err = match_lines_to_po(file_lines, po)
            if match_err:
                raise ValidationError({"detail": match_err})

            dispatch = Dispatch.objects.create(
                purchase_order=po,
                dispatch_date=date.fromisoformat(row["lr_date"]),
                lr_number=row["lr_number"],
                transporter=row["transporter"],
                challan_reference=row["challan_reference"],
                created_by=user if getattr(user, "is_authenticated", False) else None,
            )
            for line in matched:
                DispatchLine.objects.create(
                    dispatch=dispatch,
                    purchase_order_line_id=line["purchase_order_line_id"],
                    dispatched_quantity=Decimal(str(line["quantity"])),
                )
            sync_purchase_order_dispatch_status(po)
            po.refresh_from_db()
            from notifications.services import notify_dispatch_created

            notify_dispatch_created(dispatch)
            created.append(
                {
                    "id": dispatch.id,
                    "po_id": po.id,
                    "po_number": po.po_number,
                    "po_status": po.status,
                    "lr_number": dispatch.lr_number,
                    "invoice_no": row["invoice_no"],
                    "customer_name": po.customer.customer_name,
                    "line_count": len(matched),
                }
            )
            pos = _po_by_number()

    drop_preview(token)
    remaining_excluded = list(cached["excluded"])
    return {
        "created": created,
        "created_count": len(created),
        "excluded": remaining_excluded,
        "excluded_count": len(remaining_excluded),
        "skipped_excluded_group_keys": [row["group_key"] for row in skipped_excluded],
    }
