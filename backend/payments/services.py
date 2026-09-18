"""Payment totals, invoice remaining balance, and payment-driven invoice status."""

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from invoices.models import Invoice
from invoices.services import money


def rupee_label(value) -> str:
    q = money(value)
    text = format(q, "f")
    if text.endswith(".00"):
        text = text[:-3]
    else:
        text = text.rstrip("0").rstrip(".")
    return f"₹{text}"


def _sum_amount(qs) -> Decimal:
    total = qs.aggregate(s=Sum("allocated_amount"))["s"] or Decimal("0")
    return money(total)


def payment_allocated_total(payment, extra: Decimal | None = None) -> Decimal:
    from payments.models import PaymentAllocation

    total = _sum_amount(PaymentAllocation.objects.filter(payment_id=payment.pk))
    if extra is not None:
        total += extra
        total = money(total)
    return total


def refresh_unallocated_amount(payment) -> Decimal:
    unallocated = money(payment.amount) - payment_allocated_total(payment)
    if unallocated < 0:
        unallocated = Decimal("0.00")
    if payment.unallocated_amount != unallocated:
        payment.unallocated_amount = unallocated
        payment.save(update_fields=["unallocated_amount", "updated_at"])
    return unallocated


def invoice_total_paid(invoice, exclude_allocation_id=None) -> Decimal:
    from payments.models import PaymentAllocation

    qs = PaymentAllocation.objects.filter(invoice_id=invoice.pk)
    if exclude_allocation_id:
        qs = qs.exclude(pk=exclude_allocation_id)
    return _sum_amount(qs)


def invoice_remaining_balance(invoice, exclude_allocation_id=None) -> Decimal:
    remaining = money(invoice.net_amount) - invoice_total_paid(invoice, exclude_allocation_id)
    if remaining < 0:
        return Decimal("0.00")
    return money(remaining)


def customer_advance_credit(customer_id: int) -> Decimal:
    from payments.models import Payment

    total = sum(
        (row.unallocated_amount for row in Payment.objects.filter(customer_id=customer_id)),
        Decimal("0"),
    )
    return money(total)


ALLOCATABLE_STATUSES = {Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID}


def sync_invoice_payment_status(invoice: Invoice) -> str:
    """Set Issued / Partially Paid / Paid from live allocation totals.

    Draft, Cancelled, and Adjusted invoices are left untouched.
    Bypasses the generic status-transition map so a Paid invoice can revert
    when an allocation is removed.
    """
    if invoice.status in {
        Invoice.Status.DRAFT,
        Invoice.Status.CANCELLED,
        Invoice.Status.ADJUSTED,
    }:
        return invoice.status

    paid = invoice_total_paid(invoice)
    net = money(invoice.net_amount)
    if paid <= 0:
        next_status = Invoice.Status.ISSUED
    elif paid >= net:
        next_status = Invoice.Status.PAID
    else:
        next_status = Invoice.Status.PARTIALLY_PAID

    if invoice.status != next_status:
        invoice.status = next_status
        invoice.save(update_fields=["status", "updated_at"])
    return invoice.status


def create_payment_adjustment(*, payment, allocation, invoice, amount, reason, reference, user):
    """Create the audit row for an /allocate/ action.

    TODO: once roles/permissions exist, apply a configurable amount threshold
    and a pending-approval queue instead of auto-approving every payment
    adjustment. There is currently no threshold — every adjustment is
    approved immediately by the creating user.
    """
    from payments.models import PaymentAdjustment

    now = timezone.now()
    return PaymentAdjustment.objects.create(
        payment=payment,
        payment_allocation=allocation,
        invoice=invoice,
        amount=money(amount),
        reason=(reason or "").strip(),
        reference=(reference or "").strip(),
        created_by=user,
        status=PaymentAdjustment.Status.APPROVED,
        approved_by=user,
        approved_at=now,
    )
