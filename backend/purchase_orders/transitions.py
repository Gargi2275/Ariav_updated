"""Digital PO status transitions. Not a full state machine — basic allowed-next map."""

from .models import PurchaseOrder

S = PurchaseOrder.Status

TERMINAL = {S.CLOSED, S.REJECTED, S.CANCELLED}

ALLOWED_TRANSITIONS = {
    S.DRAFT: {S.SUBMITTED, S.CANCELLED},
    S.SUBMITTED: {S.SENT_TO_BRAND, S.REJECTED, S.CANCELLED, S.ON_HOLD},
    S.SENT_TO_BRAND: {S.BRAND_ACCEPTED, S.REJECTED, S.CANCELLED, S.ON_HOLD},
    S.BRAND_ACCEPTED: {
        S.PARTIALLY_DISPATCHED,
        S.FULLY_DISPATCHED,
        S.CANCELLED,
        S.ON_HOLD,
    },
    S.PARTIALLY_DISPATCHED: {S.FULLY_DISPATCHED, S.CANCELLED, S.ON_HOLD},
    S.FULLY_DISPATCHED: {S.CLOSED},
    # On Hold is toggle-able without strict reversion to the prior status.
    S.ON_HOLD: {
        S.SUBMITTED,
        S.SENT_TO_BRAND,
        S.BRAND_ACCEPTED,
        S.CANCELLED,
        S.REJECTED,
    },
}


def allowed_next_statuses(current: str) -> set[str]:
    return set(ALLOWED_TRANSITIONS.get(current, set()))


def validate_transition(current: str, target: str) -> str | None:
    """Return an error message if the transition is illegal, else None."""
    if current == target:
        return "Purchase order is already in that status."
    if current in TERMINAL:
        return (
            f"Purchase order is {current} and cannot change status."
        )
    allowed = allowed_next_statuses(current)
    if target not in allowed:
        return (
            f"Cannot change status from {current} to {target}."
        )
    return None
