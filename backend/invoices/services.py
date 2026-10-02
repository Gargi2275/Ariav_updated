"""Invoice totals, invoiceable quantity, and overdue display."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from dispatches.services import line_dispatched_total, quantize_qty
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


def money(value) -> Decimal:
    return quantize_qty(value)


def default_due_date(invoice_date, credit_days: int):
    days = int(credit_days or 0)
    return invoice_date + timedelta(days=days)


def default_payment_terms(credit_days: int) -> str:
    days = int(credit_days or 0)
    if days > 0:
        return f"Net {days} days"
    return ""


def line_invoiced_total(line: PurchaseOrderLine, exclude_invoice_id=None) -> Decimal:
    from invoices.models import Invoice

    total = Decimal("0")
    for row in line.invoice_lines.all():
        if row.invoice.status == Invoice.Status.CANCELLED:
            continue
        if exclude_invoice_id and row.invoice_id == exclude_invoice_id:
            continue
        total += row.quantity
    return money(total)


def line_invoiceable_quantity(line: PurchaseOrderLine, exclude_invoice_id=None) -> Decimal:
    pending = line_dispatched_total(line) - line_invoiced_total(line, exclude_invoice_id)
    if pending < 0:
        return Decimal("0.00")
    return money(pending)


def po_has_dispatched_quantity(po: PurchaseOrder) -> bool:
    return any(line_dispatched_total(line) > 0 for line in po.lines.all())


def invoice_is_overdue(invoice) -> bool:
    from invoices.models import Invoice

    if invoice.status not in {Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID}:
        return False
    return invoice.due_date < timezone.localdate()


def invoice_display_status(invoice) -> str:
    if invoice_is_overdue(invoice):
        return "Overdue"
    return invoice.status


class InvoiceTransitionError(ValueError):
    pass


def _actor(user):
    return user if getattr(user, "is_authenticated", False) else None


def issue_invoice(invoice, user):
    """Draft → Issued, recording who issued it and when."""
    from invoices.models import Invoice
    from invoices.transitions import validate_transition

    err = validate_transition(invoice.status, Invoice.Status.ISSUED)
    if err:
        raise InvoiceTransitionError(err)
    if not invoice.lines.exists():
        raise InvoiceTransitionError("Add at least one line item before issuing.")
    invoice.status = Invoice.Status.ISSUED
    invoice.issued_by = _actor(user)
    invoice.issued_at = timezone.now()
    invoice.save(update_fields=["status", "issued_by", "issued_at", "updated_at"])
    return invoice


def change_invoice_status(invoice, target: str, user):
    """Manual status change; Issued and Cancelled record their actor and time."""
    from invoices.models import Invoice
    from invoices.transitions import validate_transition

    if target == Invoice.Status.ISSUED:
        return issue_invoice(invoice, user)
    err = validate_transition(invoice.status, target)
    if err:
        raise InvoiceTransitionError(err)
    invoice.status = target
    fields = ["status", "updated_at"]
    if target == Invoice.Status.CANCELLED:
        invoice.cancelled_by = _actor(user)
        invoice.cancelled_at = timezone.now()
        fields += ["cancelled_by", "cancelled_at"]
    invoice.save(update_fields=fields)
    return invoice


def compute_invoice_totals(
    subtotal,
    discount_percent=None,
    discount_amount=None,
    tax_percent=None,
    other_charges=None,
):
    """Resolve discount % vs amount, then tax on (subtotal - discount)."""
    subtotal = money(subtotal)
    tax_percent = money(tax_percent or 0)
    other_charges = money(other_charges or 0)
    if tax_percent < 0 or other_charges < 0:
        raise ValueError("Tax percent and other charges cannot be negative.")
    if tax_percent > 100:
        raise ValueError("Tax percent cannot exceed 100.")

    pct = None if discount_percent in (None, "") else money(discount_percent)
    amt = None if discount_amount in (None, "") else money(discount_amount)
    pct_given = pct is not None and pct != 0
    amt_given = amt is not None and amt != 0

    if pct is not None and pct < 0:
        raise ValueError("Discount percent cannot be negative.")
    if amt is not None and amt < 0:
        raise ValueError("Discount amount cannot be negative.")
    if pct is not None and pct > 100:
        raise ValueError("Discount percent cannot exceed 100.")

    if pct_given and amt_given:
        expected = money(subtotal * pct / Decimal("100"))
        if abs(expected - amt) > Decimal("0.01"):
            raise ValueError("Discount percent and amount do not match.")
        final_pct, final_amt = pct, amt
    elif pct_given:
        final_pct = pct
        final_amt = money(subtotal * pct / Decimal("100"))
    elif amt_given:
        final_amt = amt
        final_pct = money(amt * Decimal("100") / subtotal) if subtotal else Decimal("0.00")
    else:
        final_pct = pct or Decimal("0.00")
        final_amt = Decimal("0.00")

    if final_amt > subtotal:
        raise ValueError("Discount cannot exceed subtotal.")

    taxable = subtotal - final_amt
    tax_amount = money(taxable * tax_percent / Decimal("100"))
    net_amount = money(taxable + tax_amount + other_charges)
    return {
        "discount_percent": final_pct,
        "discount_amount": final_amt,
        "tax_percent": tax_percent,
        "tax_amount": tax_amount,
        "other_charges": other_charges,
        "subtotal": subtotal,
        "net_amount": net_amount,
    }
