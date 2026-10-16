"""Format-driven purchase-order workbook import."""

from __future__ import annotations

import hashlib
import secrets
from collections import OrderedDict
from datetime import date
from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.db import transaction
from openpyxl import load_workbook
from rest_framework.exceptions import PermissionDenied, ValidationError

from brands.models import Brand
from customers.models import Customer, CustomerEntity
from customers.serializers import CustomerSerializer
from accounts.models import AuditLog
from entities.models import Entity
from purchase_orders.models import PurchaseOrder
from purchase_orders.serializers import create_purchase_order_with_lines
from .import_formats import PROFILES, profiles_for_brand
from .import_formats.base import ImportProfile, normalize_header, text_parser

PREVIEW_CACHE_PREFIX = "po_import_preview:"
PREVIEW_TTL_SECONDS = 30 * 60
MAX_DESCRIPTION = 240
RATE_WARNING = (
    "Rate is not present in the source file — all lines will import "
    "with rate left blank. POs will be created as Draft and MUST have "
    "rates entered manually before they can be submitted."
)


def _cell_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).strip()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _norm_header(value) -> str:
    """Legacy header normalizer used by the dispatch importer."""
    raw = _cell_str(value).lower().replace("_", " ").replace(".", " ")
    return " ".join(raw.split())


def _parse_qty(value) -> Decimal | None:
    if value is None or _cell_str(value) == "":
        return None
    try:
        quantity = Decimal(_cell_str(value).replace(",", ""))
    except Exception:
        return None
    if quantity <= 0:
        return None
    return quantity.quantize(Decimal("0.01"))


def compose_description(parts: dict) -> str:
    chunks = [_cell_str(parts.get(key)) for key in ("code1", "code5", "code6", "template", "size")]
    return "-".join(chunks)[:MAX_DESCRIPTION]


def _profile_header_mapping(profile: ImportProfile, values) -> dict[int, str]:
    aliases = {
        normalize_header(alias): field
        for field, names in profile.aliases.items()
        for alias in names
    }
    return {index: aliases[normalize_header(value)] for index, value in enumerate(values or ()) if normalize_header(value) in aliases}


def _header_candidates(workbook, profiles: tuple[ImportProfile, ...]):
    for sheet in workbook.worksheets:
        rows = list(sheet.iter_rows(min_row=1, max_row=10, values_only=True))
        for row_number, values in enumerate(rows, start=1):
            normalized = {normalize_header(value) for value in (values or ()) if normalize_header(value)}
            for profile in profiles:
                missing = [header for header in profile.signature if header not in normalized]
                if not missing:
                    yield sheet, row_number, values, profile, missing


def _detect(file_bytes: bytes, brand: Brand, override: str | None = None):
    try:
        workbook = load_workbook(BytesIO(file_bytes), read_only=False, data_only=True)
    except Exception as exc:
        raise ValidationError({"file": f"Could not read the spreadsheet: {exc}"}) from exc
    try:
        allowed = profiles_for_brand(brand.brand_code)
        # Existing OCM files have historically been accepted for other legacy
        # digital brands; retain that compatibility, but never cross-match AVD.
        if brand.brand_code.upper() != "AVD" and PROFILES[0] not in allowed:
            allowed = (PROFILES[0], *allowed)
        if override:
            allowed = tuple(profile for profile in allowed if profile.id == override)
            if not allowed:
                raise ValidationError({"format": "Selected format is not allowed for this brand."})
        candidates = list(_header_candidates(workbook, allowed))
        if candidates:
            sheet, row_number, values, profile, _ = candidates[0]
            return workbook, sheet, row_number, values, profile

        all_candidates = list(_header_candidates(workbook, PROFILES))
        found = []
        for sheet in workbook.worksheets:
            for values in list(sheet.iter_rows(min_row=1, max_row=10, values_only=True)):
                headers = [_cell_str(value) for value in (values or ()) if _cell_str(value)]
                if headers:
                    found = headers
                    break
            if found:
                break
        if all_candidates:
            other = all_candidates[0][4]
            raise ValidationError({"format": f"This file looks like {all_candidates[0][3].display_name} but brand {brand.brand_code} is selected."})
        closest = min(PROFILES, key=lambda p: len(set(p.signature) - {normalize_header(v) for v in found}))
        missing = [header for header in closest.signature if header not in {normalize_header(v) for v in found}]
        raise ValidationError({"file": f"No format matched. Headers found: {', '.join(found) or '(none)'}. Closest profile: {closest.display_name}; missing headers: {', '.join(missing) or '(none)' }."})
    except ValidationError:
        workbook.close()
        raise


def _parse_workbook(file_bytes: bytes, brand: Brand, override: str | None = None):
    workbook, sheet, header_row, header_values, profile = _detect(file_bytes, brand, override)
    mapping = _profile_header_mapping(profile, header_values)
    canonical = set(mapping.values())
    missing_columns = [field for field in profile.required_fields if field not in canonical]
    if missing_columns:
        workbook.close()
        raise ValidationError({"file": f"Missing required column(s): {', '.join(missing_columns)}."})

    groups: OrderedDict[str, dict] = OrderedDict()
    errors: list[str] = []
    warnings: list[str] = []
    try:
        for excel_row, values in enumerate(
            sheet.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1
        ):
            if not values or all(_cell_str(value) == "" for value in values):
                continue
            raw = {field: values[index] if index < len(values) else None for index, field in mapping.items()}
            parsed = {}
            row_messages = []
            for field, value in raw.items():
                parser = profile.field_parsers.get(field, text_parser)
                parsed[field], warning, error = parser(value)
                if warning:
                    warnings.append(f"Row {excel_row} ({field}): {warning}")
                if error:
                    row_messages.append(f"{field}: {error}")
            order_no = _cell_str(parsed.get(profile.order_field))
            if not order_no:
                errors.append(f"Row {excel_row}: Order No is blank.")
                continue
            group = groups.setdefault(order_no, {
                "order_no": order_no, "rows": [], "lines": [], "errors": [],
                "header_values": {}, "customer_codes": [], "customer_name": "",
            })
            group["rows"].append(excel_row)
            if row_messages:
                group["errors"].append(f"Row {excel_row} (Order No {order_no}): {'; '.join(row_messages)}")
                continue
            for field in profile.header_fields:
                if field not in parsed or parsed[field] in (None, ""):
                    continue
                previous = group["header_values"].get(field)
                if previous is not None and previous[0] != parsed[field]:
                    group["errors"].append(
                        f"Rows {group['header_values'][field][1]} and {excel_row}: header field {field} differs within Order No {order_no}."
                    )
                else:
                    group["header_values"][field] = (parsed[field], excel_row)
            code = _cell_str(parsed.get(profile.customer_code_field))
            name = _cell_str(parsed.get(profile.customer_name_field))
            if code and code not in group["customer_codes"]:
                group["customer_codes"].append(code)
            if name and not group["customer_name"]:
                group["customer_name"] = name
            if profile.id == "ocm_po":
                description = compose_description(parsed)
            else:
                description = _cell_str(parsed.get(profile.description_field))
            quantity = parsed.get(profile.quantity_field)
            rate = parsed.get(profile.rate_field) if profile.rate_field else None
            line = {
                "description": description[:MAX_DESCRIPTION],
                "line_key": _cell_str(parsed.get(profile.line_key_field)) if profile.line_key_field != "ocm_description" else description,
                "quantity": str(quantity) if quantity is not None else None,
                "rate": str(rate) if rate is not None else None,
                "row_number": excel_row,
                "extra_data": {field: parsed.get(field) for field in profile.line_extra_fields if parsed.get(field) not in (None, "")},
                "expected_delivery_period": _cell_str(parsed.get("expected_delivery_period")),
                "customer_delivery_date": parsed.get("customer_delivery_date"),
            }
            if quantity is None:
                group["errors"].append(f"Row {excel_row} (Order No {order_no}): {profile.quantity_field} is missing or invalid.")
            else:
                group["lines"].append(line)
        for group in groups.values():
            if not profile.allow_duplicate_line_keys:
                seen = {}
                for line in group["lines"]:
                    if line["line_key"] in seen:
                        group["errors"].append(f"Rows {seen[line['line_key']]} and {line['row_number']}: duplicate product {line['line_key']} within Order No {group['order_no']}.")
                    seen[line["line_key"]] = line["row_number"]
    finally:
        workbook.close()
    return profile, groups, warnings, errors


def parse_workbook(file_bytes: bytes) -> tuple[list[dict], list[str]]:
    """Legacy OCM parser retained for dispatch importer compatibility."""
    profile, groups, warnings, errors = _parse_workbook(file_bytes, _LegacyBrand("OCM"))
    result = []
    for group in groups.values():
        result.append({
            "order_no": group["order_no"],
            "customer_codes": group["customer_codes"],
            "customer_name": group["customer_name"],
            "lines": [{"description": line["description"], "quantity": line["quantity"], "rate": None} for line in group["lines"]],
        })
    return result, [*warnings, *errors]


class _LegacyBrand:
    def __init__(self, brand_code):
        self.brand_code = brand_code


def _customers_for_entity(entity: Entity) -> dict[str, object]:
    return {
        (link.customer.customer_code or "").strip().upper(): link.customer
        for link in CustomerEntity.objects.filter(entity=entity).select_related("customer")
        if (link.customer.customer_code or "").strip()
    }


def _existing_po_numbers() -> dict[str, str]:
    return {number.strip().lower(): number for number in PurchaseOrder.objects.values_list("po_number", flat=True)}


def _normalised_party_code(value: str) -> str:
    raw = "".join(character for character in _cell_str(value).upper() if character.isalnum())
    return raw.lstrip("0") or "0"


def _party_suggestions(code: str, name: str, city: str, gst: str = "", pan: str = "") -> list[dict]:
    queryset = Customer.objects.filter(status=Customer.Status.ACTIVE)
    exact = list(queryset.filter(customer_code__iexact=code))
    normalised = _normalised_party_code(code)
    candidates = list(queryset.exclude(pk__in=[item.pk for item in exact])[:250])
    ranked: list[tuple[int, Customer, str]] = [(0, item, "same code after normalisation") for item in exact]
    for item in candidates:
        if gst and item.gst_no and item.gst_no.strip().casefold() == gst.strip().casefold():
            ranked.append((1, item, "same GST"))
        elif pan and item.pan_no and item.pan_no.strip().casefold() == pan.strip().casefold():
            ranked.append((1, item, "same PAN"))
        elif _normalised_party_code(item.customer_code) == normalised:
            ranked.append((1, item, "same code after normalisation"))
        elif name and item.customer_name.casefold() == name.casefold() and (
            not city or item.city.casefold() == city.casefold()
        ):
            ranked.append((2, item, "same name and city"))
    ranked.sort(key=lambda item: (item[0], item[1].customer_name.casefold()))
    return [
        {
            "id": item.id,
            "code": item.customer_code,
            "name": item.customer_name,
            "city": item.city,
            "why": why,
        }
        for _, item, why in ranked[:3]
    ]


def _existing_party_details(code: str, entity: Entity) -> tuple[list[dict], int | None, str]:
    party = Customer.objects.filter(customer_code__iexact=code).prefetch_related("entity_links__entity").first()
    if party is None:
        return [], None, ""
    branches = [
        {"code": link.entity.short_code, "name": link.entity.entity_name}
        for link in party.entity_links.all()
        if link.entity_id != entity.id
    ]
    return branches, party.id, party.customer_name


def _record_unmatched_party(
    unmatched: OrderedDict,
    unmatched_rows: dict,
    group: dict,
    code: str,
    profile: ImportProfile,
    entity: Entity,
) -> None:
    header_values = {field: value for field, (value, _row) in group["header_values"].items()}
    party = unmatched.setdefault(code, {
        "code": code,
        "name": group["customer_name"],
        "city": _cell_str(header_values.get("city")),
        "state": _cell_str(header_values.get("state")),
        "address": _cell_str(header_values.get("address")),
        "gst": _cell_str(header_values.get("gst_no") or header_values.get("gst")),
        "pan": _cell_str(header_values.get("pan_no") or header_values.get("pan")),
        "po_count": 0,
        "line_count": 0,
        "order_nos": [],
        "suggested_matches": [],
        "exists_in_branches": [],
        "existing_party_id": None,
        "existing_party_name": "",
    })
    party["po_count"] += 1
    party["line_count"] += len(group["lines"])
    party["order_nos"].append(group["order_no"])
    party["suggested_matches"] = _party_suggestions(
        party["code"], party["name"], party["city"], party["gst"], party["pan"],
    )
    branches, existing_id, existing_name = _existing_party_details(code, entity)
    party["exists_in_branches"] = branches
    party["existing_party_id"] = existing_id
    party["existing_party_name"] = existing_name
    extra_data = {
        field: header_values.get(field, "")
        for field in profile.source_extra_fields
        if header_values.get(field, "") not in ("", None)
    }
    unmatched_rows.setdefault(code, []).append({
        "order_no": group["order_no"],
        "customer_code": code,
        "customer_name": group["customer_name"],
        "file_customer_name": group["customer_name"],
        "matched_customer_id": None,
        "line_count": len(group["lines"]),
        "lines": group["lines"],
        "po_date": header_values.get(profile.date_field) if profile.date_field else date.today(),
        "remarks": header_values.get(profile.remarks_field, "") if profile.remarks_field else "",
        "extra_data": extra_data,
    })


def unmatched_reason(customer_code: str, entity: Entity) -> str:
    return f"Customer code {customer_code or '(blank)'} not found under {entity.entity_name}"


def build_preview(file_bytes: bytes, entity: Entity, brand: Brand, format_id: str | None = None) -> dict:
    if entity.status != Entity.Status.ACTIVE or brand.status != Brand.Status.ACTIVE:
        raise ValidationError({"brand_id": "Only active branch and brand combinations can be imported."})
    if not entity.brands.filter(pk=brand.pk).exists():
        raise ValidationError(
            {"brand_id": f"Brand {brand.brand_name} is not mapped to branch {entity.entity_name}."}
        )
    profile, groups, parse_warnings, parse_errors = _parse_workbook(file_bytes, brand, format_id)
    customers = _customers_for_entity(entity)
    existing = _existing_po_numbers()
    importable, excluded, unmatched, unmatched_rows = [], [], OrderedDict(), {}
    warnings = list(parse_warnings)
    errors = list(parse_errors)
    allowed_profiles = profiles_for_brand(brand.brand_code)
    if brand.brand_code.upper() != "AVD" and PROFILES[0] not in allowed_profiles:
        allowed_profiles = (PROFILES[0], *allowed_profiles)
    if profile.rate_field is None:
        warnings.insert(0, RATE_WARNING)
    for group in groups.values():
        order_no = group["order_no"]
        code = group["customer_codes"][0] if len(group["customer_codes"]) == 1 else ", ".join(group["customer_codes"])
        reason = None
        if group["errors"]:
            reason = "; ".join(group["errors"])
        elif len(group["customer_codes"]) != 1:
            reason = "Order No has mixed or missing customer codes."
        elif order_no.lower() in existing:
            reason = "Order No already imported (already exists as an existing po_number)."
        elif code.upper() not in customers:
            reason = unmatched_reason(code, entity)
        if reason:
            errors.extend(group["errors"])
            row = {"order_no": order_no, "customer_code": code, "customer_name": group["customer_name"], "reason": reason, "line_count": len(group["lines"]), "errors": group["errors"]}
            excluded.append(row)
            if len(group["customer_codes"]) == 1 and code.upper() not in customers and order_no.lower() not in existing:
                _record_unmatched_party(unmatched, unmatched_rows, group, code, profile, entity)
            if order_no.lower() in existing:
                warnings.append(f"Order No {order_no} already exists as an existing po_number.")
            continue
        if (
            group["customer_name"]
            and group["customer_name"].strip().casefold()
            != customers[code.upper()].customer_name.strip().casefold()
        ):
            warnings.append(
                f"Order No {order_no}: Shop/Customer name {group['customer_name']!r} "
                f"differs from master name {customers[code.upper()].customer_name!r}."
            )
        header_values = {field: value for field, (value, _row) in group["header_values"].items()}
        extra_data = {field: header_values.get(field, "") for field in profile.source_extra_fields if header_values.get(field, "") not in ("", None)}
        importable.append({
            "order_no": order_no, "customer_code": code, "customer_name": customers[code.upper()].customer_name,
            "file_customer_name": group["customer_name"], "matched_customer_id": customers[code.upper()].id,
            "line_count": len(group["lines"]), "lines": group["lines"], "po_date": header_values.get(profile.date_field) if profile.date_field else date.today(),
            "remarks": header_values.get(profile.remarks_field, "") if profile.remarks_field else "",
            "extra_data": extra_data,
        })
    return {
        "entity_id": entity.id, "entity_name": entity.entity_name, "brand_id": brand.id,
        "format_id": profile.id, "format_name": profile.display_name,
        "allowed_formats": [{"id": p.id, "name": p.display_name} for p in allowed_profiles],
        "file_sha256": hashlib.sha256(file_bytes).hexdigest(), "importable": importable,
        "unmatched_parties": list(unmatched.values()),
        "unmatched_rows": unmatched_rows,
        "excluded": excluded, "warnings": warnings, "errors": errors,
    }


def store_preview(user_id: int, preview: dict) -> str:
    token = secrets.token_urlsafe(32)
    cache.set(f"{PREVIEW_CACHE_PREFIX}{token}", {"user_id": user_id, **preview}, timeout=PREVIEW_TTL_SECONDS)
    return token


def load_preview(token: str) -> dict | None:
    cached = cache.get(f"{PREVIEW_CACHE_PREFIX}{token}") if token else None
    return cached if isinstance(cached, dict) else None


def drop_preview(token: str) -> None:
    if token:
        cache.delete(f"{PREVIEW_CACHE_PREFIX}{token}")


def public_preview_payload(preview: dict, token: str) -> dict:
    return {"preview_token": token, "preview_id": token, **{key: preview[key] for key in (
        "entity_id", "brand_id", "format_id", "format_name", "allowed_formats",
        "importable", "excluded", "warnings", "errors",
        "unmatched_parties",
    )}}


def commit_import(*, user, token: str, entity_id: int, brand_id: int, order_nos: list[str], decisions: dict | None = None) -> dict:
    cached = load_preview(token)
    if not cached or cached.get("user_id") != getattr(user, "id", None):
        raise ValidationError({"detail": "Preview has expired or was not found. Run preview again before committing."})
    if int(cached["entity_id"]) != int(entity_id) or int(cached["brand_id"]) != int(brand_id):
        raise ValidationError({"detail": "Import context does not match the preview."})
    legacy_commit = decisions is None
    decisions = decisions or {}
    stored_parties = {item["code"]: item for item in cached.get("unmatched_parties", [])}
    unknown = sorted(set(decisions) - set(stored_parties))
    missing = sorted(set(stored_parties) - set(decisions))
    if unknown:
        raise ValidationError({"decisions": f"Party code(s) not found in the stored preview: {', '.join(unknown)}."})
    if missing and not legacy_commit:
        raise ValidationError({"decisions": f"A decision is required for Party code(s): {', '.join(missing)}."})
    for code, decision in decisions.items():
        if not isinstance(decision, dict) or decision.get("action") not in {"create", "map", "link", "skip"}:
            raise ValidationError({"decisions": f"Invalid decision for Party code {code}."})
    if any(item["action"] in {"create", "link"} for item in decisions.values()) and not user.is_admin_role:
        raise PermissionDenied("Only administrators can add or link Parties.")

    approved = {_cell_str(value) for value in order_nos if _cell_str(value)}
    rows = [row for row in cached["importable"] if row["order_no"] in approved]
    skipped = [row for row in cached["excluded"] if row["order_no"] in approved]
    for code, decision in decisions.items():
        party_rows = cached.get("unmatched_rows", {}).get(code, [])
        if decision["action"] in {"create", "map", "link"}:
            rows.extend(party_rows)
        else:
            skipped.extend(party_rows)
    if not rows and not skipped:
        raise ValidationError({"order_nos": "Select at least one purchase order to import."})

    entity = Entity.objects.filter(pk=entity_id).first()
    brand = Brand.objects.filter(pk=brand_id).first()
    if entity is None:
        raise ValidationError({"entity_id": "Branch was not found."})
    if brand is None:
        raise ValidationError({"brand_id": "Brand was not found."})
    if entity.status != Entity.Status.ACTIVE:
        raise ValidationError({"entity_id": "Only active branches can be used for purchase order imports."})
    if brand.status != Brand.Status.ACTIVE:
        raise ValidationError({"brand_id": "Only active brands can be used for purchase order imports."})
    if not entity.brands.filter(pk=brand.pk).exists():
        raise ValidationError(
            {"brand_id": f"Brand {brand.brand_name} is not mapped to branch {entity.entity_name}."}
        )
    customers = _customers_for_entity(entity)
    existing = _existing_po_numbers()
    if any(row["order_no"].lower() in existing for row in rows):
        raise ValidationError({"detail": "Import was rejected because a PO was already imported since preview."})

    created, parties_created, parties_mapped, parties_linked = [], [], [], []
    with transaction.atomic():
        resolved = {}
        for code, decision in decisions.items():
            if decision["action"] == "skip":
                continue
            if decision["action"] == "map":
                customer = Customer.objects.filter(
                    pk=decision.get("map_to_party_id"),
                    status=Customer.Status.ACTIVE,
                    entity_links__entity_id=entity.id,
                ).first()
                if customer is None:
                    raise ValidationError({"decisions": f"Selected Party for code {code} is not Active or is not linked to the import Branch."})
                resolved[code] = customer
                parties_mapped.append({"source_code": code, "id": customer.id, "code": customer.customer_code, "name": customer.customer_name})
                continue
            if decision["action"] == "link":
                customer = Customer.objects.filter(
                    customer_code=code,
                    status=Customer.Status.ACTIVE,
                ).first()
                if customer is None:
                    raise ValidationError({"decisions": f"Party code {code} does not exist or is not Active."})
                if CustomerEntity.objects.filter(customer=customer, entity=entity).exists():
                    raise ValidationError({"decisions": f"Party code {code} is already linked to the import Branch."})
                CustomerEntity.objects.create(customer=customer, entity=entity, primary_entity=False)
                parties_linked.append({
                    "source_code": code,
                    "id": customer.id,
                    "code": customer.customer_code,
                    "name": customer.customer_name,
                    "branch": {"code": entity.short_code, "name": entity.entity_name},
                })
                AuditLog.objects.create(
                    user=user.display_name or user.username,
                    role=user.role,
                    action="PO Import Party Linked",
                    module="Purchase Orders",
                    details=f"Party {customer.customer_code}; Branch {entity.short_code}; Preview {token}",
                )
                resolved[code] = customer
                continue
            decision_code = _cell_str(decision.get("code"))
            decision_name = _cell_str(decision.get("name"))
            try:
                branch_ids = [int(value) for value in decision.get("branch_ids", [])]
                primary_id = int(decision.get("primary_branch_id"))
            except (TypeError, ValueError):
                raise ValidationError({"decisions": f"New Party {code} has invalid Branch selection."})
            if not decision_code or not decision_name or not isinstance(branch_ids, list) or not branch_ids or primary_id not in branch_ids:
                raise ValidationError({"decisions": f"New Party {code} requires code, name, at least one Branch, and exactly one primary Branch."})
            if entity.id not in branch_ids or len(set(branch_ids)) != len(branch_ids):
                raise ValidationError({"decisions": f"New Party {code} must include the import Branch and contain no duplicate Branches."})
            if Customer.objects.filter(customer_code__iexact=decision_code).exists():
                raise ValidationError({"detail": f"Party code {decision_code} now exists. Re-run the preview before committing."})
            serializer = CustomerSerializer(data={
                "customer_code": decision_code,
                "customer_name": decision_name,
                "customer_type": decision.get("type") or Customer.CustomerType.COMPANY,
                "city": decision.get("city") or "",
                "state": decision.get("state") or "",
                "address_line_1": decision.get("address") or "",
                "gst_no": decision.get("gst") or "",
                "entities": [{"entity_id": branch_id, "primary_entity": branch_id == primary_id} for branch_id in branch_ids],
            })
            serializer.is_valid(raise_exception=True)
            customer = serializer.save()
            resolved[code] = customer
            branches = list(customer.entity_links.select_related("entity").values_list("entity__short_code", "entity__entity_name"))
            parties_created.append({"id": customer.id, "code": customer.customer_code, "name": customer.customer_name, "branches": [{"code": short, "name": name} for short, name in branches]})
            AuditLog.objects.create(user=user.display_name or user.username, role=user.role, action="PO Import Party Created", module="Purchase Orders", details=f"Preview {token}; Branches {branches}")

        for row in rows:
            customer = resolved.get(row["customer_code"]) or customers.get(row["customer_code"].upper())
            if customer is None:
                raise ValidationError({"detail": f"Import was rejected because data changed since preview. Party code {row['customer_code']} is no longer linked to {entity.entity_name}."})
            lines = [{
                "product": None,
                "product_description": line["description"],
                "quantity": Decimal(line["quantity"]),
                "rate": Decimal(line["rate"]) if line.get("rate") is not None else None,
                "expected_delivery_period": line.get("expected_delivery_period", ""),
                "customer_delivery_date": line.get("customer_delivery_date"),
                "extra_data": line.get("extra_data", {}),
            } for line in row["lines"]]
            po = create_purchase_order_with_lines(
                user=user, po_number=row["order_no"],
                order_type=PurchaseOrder.OrderType.MANUAL if brand.order_method == Brand.OrderMethod.MANUAL_POR else PurchaseOrder.OrderType.DIGITAL,
                entity=entity, customer=customer, brand=brand, po_date=row["po_date"] or date.today(),
                status=PurchaseOrder.Status.BRAND_ACCEPTED, remarks=row.get("remarks", ""), source_format=cached["format_id"],
                extra_data=row.get("extra_data", {}), lines=lines,
            )
            created.append({"id": po.id, "po_number": po.po_number, "customer_id": po.customer_id, "line_count": len(row["lines"])})
        AuditLog.objects.create(user=user.display_name or user.username, role=user.role, action="Purchase Order Import", module="Purchase Orders", details=f"Preview {token}; created {len(created)} POs; created {len(parties_created)} Parties; mapped {len(parties_mapped)} Parties; linked {len(parties_linked)} Parties; skipped {len(skipped)} POs.")
    drop_preview(token)
    reported_excluded = cached["excluded"] if legacy_commit else skipped
    return {
        "created": created, "created_count": len(created),
        "parties_created": parties_created, "parties_mapped": parties_mapped, "parties_linked": parties_linked,
        "parties_created_count": len(parties_created), "parties_mapped_count": len(parties_mapped), "parties_linked_count": len(parties_linked),
        "excluded": reported_excluded, "excluded_count": len(reported_excluded),
        "skipped_excluded_order_nos": [row["order_no"] for row in skipped],
    }
