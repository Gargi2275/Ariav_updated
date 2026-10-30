"""Invoice raised automatically when a purchase order becomes Fully Dispatched."""

from datetime import date
from decimal import Decimal

from django.db import transaction

from purchase_orders.models import PurchaseOrder

from .models import Invoice, InvoiceLine
from .services import (
    compute_invoice_totals,
    default_due_date,
    default_payment_terms,
    issue_invoice,
    line_invoiceable_quantity,
    money,
)

MAX_NUMBER = 40


def _number_for(po: PurchaseOrder, mill_number: str) -> str | None:
    base = (mill_number or "").strip()[:MAX_NUMBER]
    if not base:
        return None
    taken = Invoice.objects.filter(invoice_number__iexact=base).first()
    if taken is None:
        return base
    if taken.purchase_order_id == po.id:
        return None
    combined = f"{base}/{po.po_number}"[:MAX_NUMBER]
    if Invoice.objects.filter(invoice_number__iexact=combined).exists():
        return None
    return combined


def invoice_fully_dispatched(po: PurchaseOrder, *, user, mill_number: str, invoice_date=None, tax_percent=None) -> dict:
    """Create and issue one invoice for the remaining dispatched quantity.

    Returns {"invoice": Invoice | None, "message": str}. Never raises, so a dispatch
    import is not undone when the invoice cannot be raised.
    """
    from price_lists.order_price import resolve_invoice_rate

    po.refresh_from_db()
    if po.status != PurchaseOrder.Status.FULLY_DISPATCHED:
        return {"invoice": None, "message": ""}
    number = _number_for(po, mill_number)
    if number is None:
        return {"invoice": None, "message": f"{po.po_number}: no invoice raised because invoice number {mill_number or '(blank)'} is missing or already used."}
    when = invoice_date or date.today()
    lines = []
    for po_line in po.lines.prefetch_related("dispatch_lines", "invoice_lines__invoice"):
        quantity = line_invoiceable_quantity(po_line)
        if quantity <= 0:
            continue
        rate = resolve_invoice_rate(po_line, when, None)
        lines.append({"po_line": po_line, "quantity": quantity, "rate": rate})
    if not lines:
        return {"invoice": None, "message": ""}

    customer = po.customer
    priced = all(item["rate"] is not None and item["rate"] > 0 for item in lines)
    subtotal = sum((money(item["quantity"]) * money(item["rate"] or 0) for item in lines), Decimal("0"))
    try:
        totals = compute_invoice_totals(subtotal, tax_percent=tax_percent or 0)
    except ValueError as exc:
        return {"invoice": None, "message": f"{po.po_number}: no invoice raised. {exc}"}

    try:
        with transaction.atomic():
            invoice = Invoice.objects.create(
                invoice_number=number,
                invoice_date=when,
                due_date=default_due_date(when, customer.credit_days),
                entity=po.entity,
                customer=customer,
                customer_code=customer.customer_code,
                purchase_order=po,
                brand=po.brand,
                payment_terms=default_payment_terms(customer.credit_days),
                remarks=f"Raised automatically when {po.po_number} was fully dispatched.",
                created_by=user if getattr(user, "is_authenticated", False) else None,
                **totals,
            )
            for item in lines:
                InvoiceLine.objects.create(
                    invoice=invoice,
                    purchase_order_line=item["po_line"],
                    product=item["po_line"].product,
                    product_description=item["po_line"].product_description,
                    quantity=item["quantity"],
                    rate=item["rate"] if item["rate"] is not None else Decimal("0"),
                )
            if priced:
                issue_invoice(invoice, user)
    except Exception as exc:  # the dispatch must stay recorded even if the invoice fails
        return {"invoice": None, "message": f"{po.po_number}: no invoice raised. {exc}"}

    from accounts.models import AuditLog

    AuditLog.objects.create(
        user=getattr(user, "display_name", "") or getattr(user, "username", ""),
        role=getattr(user, "role", ""),
        action="Invoice Raised Automatically",
        module="Invoices",
        details=f"Invoice {invoice.invoice_number} for {po.po_number} ({invoice.status}).",
    )
    if priced:
        return {"invoice": invoice, "message": f"Invoice {invoice.invoice_number} issued for {po.po_number}."}
    return {
        "invoice": invoice,
        "message": f"Invoice {invoice.invoice_number} saved as Draft for {po.po_number} because a line has no rate. Set the rate and issue it.",
    }
