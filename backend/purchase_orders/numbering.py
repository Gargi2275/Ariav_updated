from __future__ import annotations

"""Manual purchase-order numbers.

Format is BBMMYYNN (8 characters):

- B: first letter of the branch code, or the branch name when the code has no letter
- B: first letter of the brand code, or the brand name when the code has no letter
- MM: month from the business timezone (Asia/Kolkata), 01-12
- YY: last two digits of that year
- NN: sequence 01-99 for that prefix, month, and year

The sequence is the counter row, not the count of purchase orders still in the
database. A number is issued only when the purchase-order insert commits in the
same transaction. A rolled-back create does not issue the number. A committed
number is never reused, including after delete, cancel, or reject.

Digital purchase orders and file imports keep the number they supply.
"""

from datetime import date

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import ManualPoNumberSequence, PurchaseOrder

SEQUENCE_LIMIT = 99


class ManualPoNumberError(Exception):
    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


def _letter(value: str) -> str:
    for char in (value or "").strip():
        if char.isalpha():
            return char.upper()
    return ""


def sequence_scope(entity, brand, on: date) -> str:
    branch = _letter(getattr(entity, "short_code", "")) or _letter(getattr(entity, "entity_name", ""))
    if not branch:
        raise ManualPoNumberError(
            "entity_id",
            "This branch has no letter in its code or name, so a purchase order number cannot be generated.",
        )
    brand_letter = _letter(getattr(brand, "brand_code", "")) or _letter(getattr(brand, "brand_name", ""))
    if not brand_letter:
        raise ManualPoNumberError(
            "brand_id",
            "This brand has no letter in its code or name, so a purchase order number cannot be generated.",
        )
    return f"{branch}{brand_letter}{on.month:02d}{on.year % 100:02d}"


def _issued_sequences(scope: str) -> set[int]:
    found = set()
    for number in PurchaseOrder.objects.filter(po_number__istartswith=scope).values_list("po_number", flat=True):
        normalized = (number or "").strip().upper()
        if len(normalized) == 8 and normalized.startswith(scope) and normalized[6:].isdigit():
            found.add(int(normalized[6:]))
    return found


def _highest_issued(scope: str) -> int:
    found = _issued_sequences(scope)
    return max(found) if found else 0


def _locked_sequence(scope: str) -> ManualPoNumberSequence:
    row = ManualPoNumberSequence.objects.select_for_update().filter(scope=scope).first()
    if row is not None:
        return row
    try:
        with transaction.atomic():
            ManualPoNumberSequence.objects.create(scope=scope, last_value=_highest_issued(scope))
    except IntegrityError:
        pass
    return ManualPoNumberSequence.objects.select_for_update().get(scope=scope)


def _next_free(scope: str, start: int) -> str | None:
    taken = _issued_sequences(scope)
    candidate = start
    while candidate <= SEQUENCE_LIMIT:
        if candidate not in taken:
            return f"{scope}{candidate:02d}"
        candidate += 1
    return None


def preview_manual_po_number(entity, brand, on: date | None = None) -> str:
    """Next number that would be issued. Does not reserve it."""
    when = on or timezone.localdate()
    scope = sequence_scope(entity, brand, when)
    row = ManualPoNumberSequence.objects.filter(scope=scope).first()
    start = (row.last_value if row is not None else _highest_issued(scope)) + 1
    number = _next_free(scope, start)
    if number is None:
        raise ManualPoNumberError(
            "po_number",
            "All 99 purchase order numbers for this branch, brand, and month have been issued.",
        )
    return number


def allocate_manual_po_number(entity, brand, on: date | None = None) -> str:
    """Reserve the next manual number. Call inside transaction.atomic()."""
    when = on or timezone.localdate()
    scope = sequence_scope(entity, brand, when)
    row = _locked_sequence(scope)
    taken = _issued_sequences(scope)
    candidate = row.last_value
    while candidate < SEQUENCE_LIMIT:
        candidate += 1
        if candidate in taken:
            continue
        row.last_value = candidate
        row.save(update_fields=["last_value", "updated_at"])
        return f"{scope}{candidate:02d}"
    row.last_value = SEQUENCE_LIMIT
    row.save(update_fields=["last_value", "updated_at"])
    raise ManualPoNumberError(
        "po_number",
        "All 99 purchase order numbers for this branch, brand, and month have been issued.",
    )
