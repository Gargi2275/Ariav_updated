"""Computed customer ledger — merged from invoices and payments, not stored."""

from datetime import date
from decimal import Decimal

from invoices.models import Invoice
from invoices.services import invoice_is_overdue, money
from payments.models import Payment
from payments.services import customer_advance_credit, invoice_remaining_balance

LEDGER_INVOICE_STATUSES = (
    Invoice.Status.ISSUED,
    Invoice.Status.PARTIALLY_PAID,
    Invoice.Status.PAID,
)

TYPE_INVOICE = "Invoice"
TYPE_PAYMENT = "Payment"
TYPE_ADJUSTMENT = "Adjustment"

TYPE_RANK = {
    TYPE_INVOICE: 0,
    TYPE_PAYMENT: 1,
    TYPE_ADJUSTMENT: 2,
}


def _as_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def adjustment_entries(_customer_id: int):
    """Invoice Adjustment is not built yet — keep the type in the merge with zero rows."""
    return []


def _invoice_entries(customer_id: int):
    rows = []
    invoices = Invoice.objects.filter(
        customer_id=customer_id,
        status__in=LEDGER_INVOICE_STATUSES,
    ).order_by("invoice_date", "id")
    for invoice in invoices:
        amount = money(invoice.net_amount)
        rows.append(
            {
                "date": invoice.invoice_date,
                "type": TYPE_INVOICE,
                "reference": invoice.invoice_number,
                "source_id": invoice.id,
                "debit_amount": amount,
                "credit_amount": Decimal("0.00"),
                "adjustment_amount": Decimal("0.00"),
            }
        )
    return rows


def _payment_entries(customer_id: int):
    rows = []
    payments = Payment.objects.filter(customer_id=customer_id).order_by("payment_date", "id")
    for payment in payments:
        amount = money(payment.amount)
        rows.append(
            {
                "date": payment.payment_date,
                "type": TYPE_PAYMENT,
                "reference": payment.payment_number,
                "source_id": payment.id,
                "debit_amount": Decimal("0.00"),
                "credit_amount": amount,
                "adjustment_amount": Decimal("0.00"),
            }
        )
    return rows


def _all_entries(customer_id: int):
    rows = _invoice_entries(customer_id) + _payment_entries(customer_id) + list(adjustment_entries(customer_id))
    rows.sort(key=lambda row: (row["date"], TYPE_RANK.get(row["type"], 9), row["source_id"]))
    return rows


def _delta(row) -> Decimal:
    return money(row["debit_amount"]) - money(row["credit_amount"]) - money(row.get("adjustment_amount") or 0)


def _serialize_entry(row, running: Decimal) -> dict:
    return {
        "date": row["date"].isoformat() if hasattr(row["date"], "isoformat") else str(row["date"]),
        "type": row["type"],
        "reference": row["reference"],
        "source_id": row["source_id"],
        "debit_amount": str(money(row["debit_amount"])),
        "credit_amount": str(money(row["credit_amount"])),
        "running_balance": str(money(running)),
    }


def customer_ledger_summary(customer) -> dict:
    invoices = list(
        Invoice.objects.filter(customer=customer, status__in=LEDGER_INVOICE_STATUSES).prefetch_related("allocations")
    )
    total_invoiced = sum((money(inv.net_amount) for inv in invoices), Decimal("0.00"))
    total_paid = sum(
        (money(p.amount) for p in Payment.objects.filter(customer=customer)),
        Decimal("0.00"),
    )
    outstanding = sum((invoice_remaining_balance(inv) for inv in invoices), Decimal("0.00"))
    overdue = sum(
        (invoice_remaining_balance(inv) for inv in invoices if invoice_is_overdue(inv)),
        Decimal("0.00"),
    )
    return {
        "total_invoiced": str(money(total_invoiced)),
        "total_paid": str(money(total_paid)),
        "outstanding_balance": str(money(outstanding)),
        "advance_credit_balance": str(customer_advance_credit(customer.id)),
        "overdue_amount": str(money(overdue)),
    }


def build_customer_ledger(customer, date_from=None, date_to=None) -> dict:
    date_from = _as_date(date_from)
    date_to = _as_date(date_to)
    entries = _all_entries(customer.id)

    opening = Decimal("0.00")
    visible = []
    for row in entries:
        row_date = row["date"]
        if date_from and row_date < date_from:
            opening += _delta(row)
            continue
        if date_to and row_date > date_to:
            continue
        visible.append(row)

    running = money(opening)
    serialized = []
    for row in visible:
        running = money(running + _delta(row))
        serialized.append(_serialize_entry(row, running))

    return {
        "customer_id": customer.id,
        "customer_code": customer.customer_code,
        "customer_name": customer.customer_name,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "opening_balance": str(money(opening)),
        "summary": customer_ledger_summary(customer),
        "entries": serialized,
    }
