"""Downstream checks for Customer Master.

Invoices, orders, payments, and ledger lines are not built yet.
These helpers return 0 so deactivate / hard-delete 409 wiring is in place
and will start blocking as soon as those modules query this table.
"""


def active_downstream_count(_customer_id: int) -> int:
    return 0


def downstream_count(_customer_id: int) -> int:
    return 0
