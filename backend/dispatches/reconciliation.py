"""PO line versus linked dispatch lines.

Quantities follow the Arvind import rule already in use: Purchase Order
"Units" and dispatch "No. of Pieces" are pieces. "Batch Qty." metres are
reported beside the line and are not added to the piece balance.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Prefetch
from django.utils import timezone

from accounts.access import scope_to_visible_customers
from config.dates import parse_query_dates
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine

from .models import DispatchLine
from .services import quantize_qty

NOT_DISPATCHED = "Not Dispatched"
PARTIAL = "Partially Dispatched"
FULL = "Fully Dispatched"
EXCESS = "Excess Dispatched"
UNMATCHED = "Unmatched"
NEEDS_REVIEW = "Needs Review"

NOT_YET_DUE = "Not Yet Due"
ON_TIME = "Dispatched On Time"
LATE = "Dispatched Late"
OVERDUE = "Overdue / Not Dispatched"
DATE_REVIEW = "Date Needs Review"

MONEY = Decimal("0.01")


def _norm(value) -> str:
    return " ".join(str(value or "").casefold().split())


def _money(value) -> Decimal | None:
    if value is None:
        return None
    amount = Decimal(value)
    if amount != amount.quantize(MONEY):
        return None
    return amount.quantize(MONEY)


def _product_code(line: PurchaseOrderLine) -> str:
    if (line.product_description or "").strip():
        return line.product_description.strip()
    if line.product_id and line.product.product_code:
        return line.product.product_code
    return ""


def _trade_name(line: PurchaseOrderLine) -> str:
    extra = line.extra_data if isinstance(line.extra_data, dict) else {}
    trade = str(extra.get("dtr_trade_name") or "").strip()
    if trade:
        return trade
    if line.product_id and line.product.brand_id:
        return line.product.brand.brand_name
    return line.purchase_order.brand.brand_name


def _unit_label(line: PurchaseOrderLine) -> str:
    if line.purchase_order.brand.brand_code.casefold() == "avd":
        return "Piece"
    if line.product_id and line.product.unit:
        return line.product.unit
    return ""


def build_reconciliation(*, user, params) -> dict:
    today = timezone.localdate()
    queryset = scope_to_visible_customers(
        PurchaseOrder.objects.select_related("customer", "brand", "entity"),
        user,
        "customer_id",
    )
    brand_id = params.get("brand_id")
    customer_id = params.get("customer_id")
    entity_id = params.get("entity_id")
    if brand_id:
        queryset = queryset.filter(brand_id=brand_id)
    if customer_id:
        queryset = queryset.filter(customer_id=customer_id)
    if entity_id and entity_id != "all":
        queryset = queryset.filter(entity_id=entity_id)
    date_from, date_to = parse_query_dates(params)
    if date_from:
        queryset = queryset.filter(po_date__gte=date_from)
    if date_to:
        queryset = queryset.filter(po_date__lte=date_to)
    kam = _norm(params.get("kam") or "")
    search = _norm(params.get("search") or "")

    lines = (
        PurchaseOrderLine.objects.filter(purchase_order__in=queryset)
        .select_related(
            "purchase_order__customer",
            "purchase_order__brand",
            "purchase_order__entity",
            "product__brand",
        )
        .prefetch_related(
            Prefetch(
                "dispatch_lines",
                queryset=DispatchLine.objects.select_related("dispatch").order_by("dispatch__dispatch_date", "id"),
            )
        )
        .order_by("-purchase_order__po_date", "purchase_order_id", "id")
    )

    grouped: dict[int, list[PurchaseOrderLine]] = defaultdict(list)
    materialised = list(lines)
    for line in materialised:
        grouped[line.purchase_order_id].append(line)

    rows = []
    for line in materialised:
        po_extra = line.purchase_order.extra_data if isinstance(line.purchase_order.extra_data, dict) else {}
        if kam and _norm(po_extra.get("kam_name")) != kam:
            continue
        row = _reconcile_line(line, grouped[line.purchase_order_id], today)
        if search and search not in row["search_text"]:
            continue
        rows.append(row)

    summary = _summary(rows)
    status_filter = (params.get("status") or "").strip()
    visible = [row for row in rows if not status_filter or row["status"] == status_filter]
    for row in visible:
        row.pop("search_text", None)
    return {
        "summary": summary,
        "rows": visible,
        "statuses": [NOT_DISPATCHED, PARTIAL, FULL, EXCESS, UNMATCHED, NEEDS_REVIEW],
        "notes": [
            "Arvind is the Brand (code AVD). The KAM name is a person on the purchase order, not the Brand.",
            "Ordered and dispatched quantities are pieces (PO Units and dispatch No. of Pieces). Batch metres are shown on each shipment and are not added to the piece balance.",
            "The PO rate is Ex Mill. It is compared with the plant sales-order price only. A different net rate per metre is explained and is not by itself a rate mismatch.",
        ],
    }


def _summary(rows: list[dict]) -> dict:
    def count(status: str) -> int:
        return sum(1 for row in rows if row["status"] == status)

    return {
        "total": len(rows),
        "fully_dispatched": count(FULL),
        "partially_dispatched": count(PARTIAL),
        "not_dispatched": count(NOT_DISPATCHED),
        "excess_dispatched": count(EXCESS),
        "unmatched": count(UNMATCHED),
        "needs_review": count(NEEDS_REVIEW),
        "rate_mismatches": sum(1 for row in rows if row["rate_mismatch"]),
        "overdue": sum(1 for row in rows if row["delivery_status"] == OVERDUE),
    }


def _reconcile_line(line: PurchaseOrderLine, siblings: list[PurchaseOrderLine], today: date) -> dict:
    po = line.purchase_order
    product_code = _product_code(line)
    ordered = quantize_qty(line.quantity)
    reasons: list[str] = []
    product_key = _norm(product_code)
    if not product_key:
        reasons.append("This line has no product code, so a dispatch customer reference cannot be matched to it.")
    sibling_keys = [_norm(_product_code(other)) for other in siblings if other.id != line.id]
    if product_key and product_key in sibling_keys:
        reasons.append("Another line on this purchase order uses the same product code. Dispatch quantities stay on the line they were linked to.")

    counted, duplicates, shipments = _counted_shipments(line)
    reasons.extend(duplicates)

    dispatched = quantize_qty(sum((item["quantity"] for item in counted), Decimal("0")))
    if dispatched > ordered:
        balance = Decimal("0.00")
        excess = quantize_qty(dispatched - ordered)
    else:
        balance = quantize_qty(ordered - dispatched)
        excess = Decimal("0.00")

    unit = _unit_label(line)
    if po.brand.brand_code.casefold() != "avd" and line.product_id and line.product.unit not in ("", "Piece"):
        reasons.append(
            f"The catalogue unit is {line.product.unit}. The stored dispatch quantity uses the purchase-order line unit and was not converted."
        )

    po_rate = _money(line.rate)
    rate_values = {item["source_rate"] for item in counted if item["source_rate"] is not None}
    dispatch_rate = None
    rate_mismatch = False
    rate_note = ""
    if not counted:
        rate_note = "No dispatch is linked, so there is no dispatch rate to compare."
    elif any(item["source_rate"] is None for item in counted):
        rate_note = "The plant sales-order price was not recorded on one or more shipments, so the rate was not compared."
    elif len(rate_values) > 1:
        reasons.append("Shipments for this line have different sales-order prices.")
        rate_note = "Dispatch rates differ across shipments, so no single rate was compared."
    else:
        dispatch_rate = next(iter(rate_values))
        if po_rate is None:
            reasons.append("The purchase-order rate is blank.")
            rate_note = "The purchase-order rate is blank, so it was not compared."
        elif dispatch_rate != po_rate:
            rate_mismatch = True
            rate_note = f"Sales-order price {dispatch_rate} does not match Ex Mill {po_rate}."
        else:
            rate_note = "Sales-order price matches Ex Mill."
        net_values = {item["net_rate"] for item in counted if item["net_rate"] is not None}
        if net_values and (len(net_values) > 1 or next(iter(net_values)) != dispatch_rate):
            shown = ", ".join(str(value) for value in sorted(net_values))
            rate_note = f"{rate_note} Net rate per metre ({shown}) is shown for information and was not used as the comparison."

    delivery_status, delivery_note = _delivery_status(line.customer_delivery_date, counted, today)
    status = _quantity_status(ordered, dispatched, reasons, product_key)

    po_value = _money(line.line_total) if po_rate is not None else None
    dispatched_value = None
    if counted and all(item["source_rate"] is not None for item in counted):
        dispatched_value = quantize_qty(sum((item["quantity"] * item["source_rate"] for item in counted), Decimal("0")))

    order_code = (po.brand_order_code or "").strip()
    search_text = _norm(" ".join([
        po.po_number,
        order_code,
        po.customer.customer_code or "",
        po.customer.customer_name or "",
        product_code,
        _trade_name(line),
        po.brand.brand_name,
    ]))
    return {
        "purchase_order_line_id": line.id,
        "purchase_order_id": po.id,
        "po_number": po.po_number,
        "order_code": order_code,
        "customer_code": po.customer.customer_code or "",
        "customer_name": po.customer.customer_name or "",
        "branch_code": po.entity.short_code,
        "branch_name": po.entity.entity_name,
        "brand_code": po.brand.brand_code,
        "brand_name": po.brand.brand_name,
        "trade_name": _trade_name(line),
        "product_code": product_code,
        "ordered_quantity": str(ordered),
        "dispatched_quantity": str(dispatched),
        "balance_quantity": str(balance),
        "excess_quantity": str(excess),
        "unit": unit,
        "po_rate": str(po_rate) if po_rate is not None else None,
        "dispatch_rate": str(dispatch_rate) if dispatch_rate is not None else None,
        "rate_mismatch": rate_mismatch,
        "rate_note": rate_note,
        "po_value": str(po_value) if po_value is not None else None,
        "dispatched_value": str(dispatched_value) if dispatched_value is not None else None,
        "customer_delivery_date": line.customer_delivery_date.isoformat() if line.customer_delivery_date else None,
        "delivery_status": delivery_status,
        "delivery_note": delivery_note,
        "status": status,
        "reasons": reasons,
        "shipments": shipments,
        "search_text": search_text,
    }


def _counted_shipments(line: PurchaseOrderLine):
    seen: dict[str, dict] = {}
    counted = []
    reasons = []
    shipments = []
    for row in line.dispatch_lines.all():
        invoice = (row.dispatch.challan_reference or "").strip()
        quantity = quantize_qty(row.dispatched_quantity)
        source_rate = _money(row.source_rate)
        net_rate = _money(row.net_rate)
        shipment = {
            "dispatch_id": row.dispatch_id,
            "dispatch_line_id": row.id,
            "invoice_number": invoice,
            "dispatch_date": row.dispatch.dispatch_date.isoformat(),
            "quantity": str(quantity),
            "meters": str(row.dispatched_meters) if row.dispatched_meters is not None else None,
            "source_rate": str(source_rate) if source_rate is not None else None,
            "net_rate": str(net_rate) if net_rate is not None else None,
            "lr_number": row.dispatch.lr_number,
            "counted": True,
        }
        if invoice and invoice in seen:
            previous = seen[invoice]
            shipment["counted"] = False
            if previous["quantity"] == quantity:
                reasons.append(f"Plant invoice {invoice} is already counted for this line. The repeat was not added again.")
            else:
                reasons.append(
                    f"Plant invoice {invoice} appears again with {quantity} pieces after {previous['quantity']} pieces. The repeat was not added."
                )
        else:
            if invoice:
                seen[invoice] = {"quantity": quantity}
            counted.append({"quantity": quantity, "source_rate": source_rate, "net_rate": net_rate, "dispatch_date": row.dispatch.dispatch_date})
        shipments.append(shipment)
    return counted, reasons, shipments


def _quantity_status(ordered: Decimal, dispatched: Decimal, reasons: list[str], product_key: str) -> str:
    if not product_key:
        return UNMATCHED
    if reasons:
        return NEEDS_REVIEW
    if dispatched == 0:
        return NOT_DISPATCHED
    if dispatched > ordered:
        return EXCESS
    if dispatched == ordered:
        return FULL
    return PARTIAL


def _delivery_status(due: date | None, counted: list[dict], today: date) -> tuple[str, str]:
    if due is None:
        return DATE_REVIEW, "The customer delivery date is blank."
    if not counted:
        if due < today:
            return OVERDUE, f"Nothing has been dispatched and the delivery date {due.isoformat()} has passed."
        return NOT_YET_DUE, f"Nothing has been dispatched. The delivery date {due.isoformat()} has not passed."
    late = [item for item in counted if item["dispatch_date"] > due]
    if late:
        return LATE, f"{len(late)} shipment(s) left after the delivery date {due.isoformat()}."
    return ON_TIME, f"Every counted shipment is on or before {due.isoformat()}."
