from invoices.models import Invoice

S = Invoice.Status

TERMINAL = {S.PAID, S.CANCELLED, S.ADJUSTED}

# Overdue is display-only — never set via this map.
ALLOWED_TRANSITIONS = {
    S.DRAFT: {S.ISSUED, S.CANCELLED},
    S.ISSUED: {S.CANCELLED, S.PARTIALLY_PAID, S.PAID, S.ADJUSTED},
    S.PARTIALLY_PAID: {S.PAID, S.CANCELLED, S.ADJUSTED},
    S.PAID: set(),
    S.CANCELLED: set(),
    S.ADJUSTED: set(),
    S.OVERDUE: set(),
}


def allowed_next_statuses(current: str) -> set[str]:
    return set(ALLOWED_TRANSITIONS.get(current, set()))


def validate_transition(current: str, target: str) -> str | None:
    if target == S.OVERDUE:
        return "Overdue is computed from the due date and cannot be set manually."
    if current == target:
        return "Invoice is already in that status."
    if current in TERMINAL:
        return f"Invoice is {current} and cannot change status."
    allowed = allowed_next_statuses(current)
    if target not in allowed:
        return f"Cannot change status from {current} to {target}."
    return None
