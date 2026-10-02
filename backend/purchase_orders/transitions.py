"""Digital PO status transitions. Not a full state machine — basic allowed-next map."""

from .models import PurchaseOrder, PurchaseOrderStatusChange

S = PurchaseOrder.Status
Source = PurchaseOrderStatusChange.Source

TERMINAL = {S.CLOSED, S.REJECTED, S.CANCELLED}
DISPATCH_STATUSES = {S.PARTIALLY_DISPATCHED, S.FULLY_DISPATCHED}
MANUAL_DISPATCH_ERROR = (
    "This status can only be set automatically when a Dispatch is recorded "
    "against this PO — it cannot be set manually."
)

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


def validate_transition(current: str, target: str, *, source: str = Source.MANUAL) -> str | None:
    """Return an error message if the transition is illegal, else None."""
    if source == Source.MANUAL and target in DISPATCH_STATUSES:
        return MANUAL_DISPATCH_ERROR
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


def apply_status_change(
    po: PurchaseOrder,
    target: str,
    *,
    user=None,
    source: str = Source.MANUAL,
    reason: str = "",
) -> bool:
    """The only place PO status is written. Records history and notifies.

    Callers validate first; dispatch sync intentionally bypasses the allowed-next map.
    Returns False when the PO is already in ``target``.
    """
    if po.status == target:
        return False
    from_status = po.status
    po.status = target
    po.save(update_fields=["status", "updated_at"])
    PurchaseOrderStatusChange.objects.create(
        purchase_order=po,
        from_status=from_status,
        to_status=target,
        changed_by=user if getattr(user, "is_authenticated", False) else None,
        source=source,
        reason=reason,
    )
    from notifications.services import notify_po_status_changed

    notify_po_status_changed(po)
    return True
