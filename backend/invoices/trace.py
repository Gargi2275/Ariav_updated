"""Key Transaction Traceability (#31) — everything behind one invoice.

Read-only. Quantities and balances come from the shared helpers in
dispatches.services, invoices.services and payments.services.
"""

from decimal import Decimal

from django.db.models import Prefetch

from dispatches.models import Dispatch
from dispatches.services import line_dispatched_total, line_pending_quantity, quantize_qty
from purchase_orders.models import PurchaseOrderLine, PurchaseOrderStatusChange

from .models import Invoice, InvoiceLine
from .services import (
    invoice_display_status,
    invoice_is_overdue,
    line_invoiceable_quantity,
    line_invoiced_total,
    money,
)

ADJUSTMENTS_NOTE = "Invoice Adjustment not yet available"
DISPATCHES_NOTE = (
    "Dispatches on this PO. A dispatch is not linked to a specific invoice, "
    "so this list is not a record of what this invoice billed."
)

ISSUED_STATUSES = {
    Invoice.Status.ISSUED,
    Invoice.Status.PARTIALLY_PAID,
    Invoice.Status.PAID,
    Invoice.Status.ADJUSTED,
}


def trace_queryset():
    from payments.models import PaymentAdjustment, PaymentAllocation

    po_lines = PurchaseOrderLine.objects.select_related("product").prefetch_related(
        "dispatch_lines",
        Prefetch("invoice_lines", queryset=InvoiceLine.objects.select_related("invoice")),
    )
    return Invoice.objects.select_related(
        "entity",
        "customer",
        "brand",
        "purchase_order",
        "purchase_order__created_by",
        "created_by",
        "issued_by",
        "cancelled_by",
    ).prefetch_related(
        "lines__product",
        Prefetch(
            "allocations",
            queryset=PaymentAllocation.objects.select_related(
                "payment", "payment__created_by"
            ).order_by("payment__payment_date", "id"),
        ),
        Prefetch(
            "payment_adjustments",
            queryset=PaymentAdjustment.objects.select_related(
                "payment", "created_by", "approved_by"
            ).order_by("created_at", "id"),
        ),
        Prefetch(
            "purchase_order__status_changes",
            queryset=PurchaseOrderStatusChange.objects.select_related("changed_by"),
        ),
        Prefetch("purchase_order__lines", queryset=po_lines),
        Prefetch(
            "purchase_order__dispatches",
            queryset=Dispatch.objects.select_related("created_by")
            .prefetch_related("lines")
            .order_by("dispatch_date", "id"),
        ),
    )


def _user(user):
    if user is None:
        return None
    return {"id": user.id, "name": user.display_name or user.username}


def _iso(value):
    return value.isoformat() if value else None


def _qty(value) -> str:
    return str(quantize_qty(value))


def _line_label(product, description: str) -> str:
    if product is not None:
        return f"{product.product_code} · {product.product_name}"
    return description or "—"


def _withheld_line(row) -> dict:
    """PO-derived figures for a PO the user cannot see are withheld, not zeroed."""
    return {
        "invoice_line_id": row.id,
        "purchase_order_line_id": None,
        "product": _line_label(row.product, row.product_description),
        "ordered_quantity": None,
        "dispatched_on_po_line": None,
        "quantity_on_this_invoice": _qty(row.quantity),
        "invoiced_across_invoices": None,
        "remaining_undispatched": None,
        "remaining_uninvoiced": None,
        "dispatched_not_invoiced": None,
    }


def _event(at, kind: str, label: str, actor, link_type: str, link_id: int, **extra) -> dict:
    return {
        "at": at,
        "kind": kind,
        "label": label,
        "actor": _user(actor),
        "link": {"type": link_type, "id": link_id},
        **extra,
    }


def build_invoice_trace(invoice: Invoice, *, user=None) -> dict:
    """The invoice itself is already scoped by the viewset queryset. Nested records
    are re-checked so a cross-customer link can never surface another Customer's data."""
    from accounts.access import visible_customer_ids
    from payments.services import invoice_remaining_balance, invoice_total_paid, rupee_label

    visible = visible_customer_ids(user)

    def in_scope(customer_id) -> bool:
        return visible is None or customer_id in visible

    po = invoice.purchase_order
    po_visible = in_scope(po.customer_id)
    po_lines = {line.id: line for line in po.lines.all()} if po_visible else {}

    lines = []
    for row in invoice.lines.all():
        if not po_visible:
            lines.append(_withheld_line(row))
            continue
        po_line = po_lines.get(row.purchase_order_line_id) or row.purchase_order_line
        ordered = quantize_qty(po_line.quantity)
        invoiced = line_invoiced_total(po_line)
        remaining_uninvoiced = ordered - invoiced
        lines.append(
            {
                "invoice_line_id": row.id,
                "purchase_order_line_id": po_line.id,
                "product": _line_label(row.product, row.product_description),
                "ordered_quantity": _qty(ordered),
                "dispatched_on_po_line": _qty(line_dispatched_total(po_line)),
                "quantity_on_this_invoice": _qty(row.quantity),
                "invoiced_across_invoices": _qty(invoiced),
                "remaining_undispatched": _qty(line_pending_quantity(po_line)),
                "remaining_uninvoiced": _qty(max(remaining_uninvoiced, Decimal("0"))),
                "dispatched_not_invoiced": _qty(line_invoiceable_quantity(po_line)),
            }
        )

    dispatches = []
    for dispatch in po.dispatches.all() if po_visible else []:
        dispatch_lines = []
        for dl in dispatch.lines.all():
            po_line = po_lines.get(dl.purchase_order_line_id)
            dispatch_lines.append(
                {
                    "purchase_order_line_id": dl.purchase_order_line_id,
                    "product": _line_label(po_line.product, po_line.product_description) if po_line else "—",
                    "quantity": _qty(dl.dispatched_quantity),
                }
            )
        dispatches.append(
            {
                "id": dispatch.id,
                "dispatch_date": dispatch.dispatch_date.isoformat(),
                "lr_number": dispatch.lr_number,
                "transporter": dispatch.transporter,
                "challan_reference": dispatch.challan_reference,
                "total_quantity": _qty(sum((dl.dispatched_quantity for dl in dispatch.lines.all()), Decimal("0"))),
                "lines": dispatch_lines,
                "created_by": _user(dispatch.created_by),
                "created_at": _iso(dispatch.created_at),
            }
        )

    allocations = [row for row in invoice.allocations.all() if in_scope(row.payment.customer_id)]
    adjustments = [adj for adj in invoice.payment_adjustments.all() if in_scope(adj.payment.customer_id)]
    adjusted_allocation_ids = {adj.payment_allocation_id for adj in adjustments if adj.payment_allocation_id}

    payment_rows = [
        {
            "allocation_id": row.id,
            "payment_id": row.payment_id,
            "payment_number": row.payment.payment_number,
            "payment_date": row.payment.payment_date.isoformat(),
            "payment_mode": row.payment.payment_mode,
            "allocated_amount": str(money(row.allocated_amount)),
            "created_by": _user(row.payment.created_by),
            "created_at": _iso(row.payment.created_at),
        }
        for row in allocations
    ]
    adjustment_rows = [
        {
            "id": adj.id,
            "payment_id": adj.payment_id,
            "payment_number": adj.payment.payment_number,
            "amount": str(money(adj.amount)),
            "reason": adj.reason,
            "reference": adj.reference,
            "status": adj.status,
            "created_by": _user(adj.created_by),
            "created_at": _iso(adj.created_at),
            "approved_by": _user(adj.approved_by),
            "approved_at": _iso(adj.approved_at),
        }
        for adj in adjustments
    ]

    status_history = [
        {
            "from_status": change.from_status,
            "to_status": change.to_status,
            "source": change.source,
            "changed_by": _user(change.changed_by),
            "changed_at": _iso(change.changed_at),
            "reason": change.reason,
        }
        for change in po.status_changes.all()
    ]

    events = []
    if po_visible:
        events.append(
            _event(po.created_at, "po_created", f"PO {po.po_number} created", po.created_by, "purchase_order", po.id)
        )
    for change in po.status_changes.all() if po_visible else []:
        events.append(
            _event(
                change.changed_at,
                "po_status",
                f"PO status {change.from_status} → {change.to_status}",
                change.changed_by,
                "purchase_order",
                po.id,
                source=change.source,
            )
        )
    for dispatch in po.dispatches.all() if po_visible else []:
        events.append(
            _event(
                dispatch.created_at,
                "dispatch",
                f"Dispatch LR {dispatch.lr_number} recorded (dispatch date {dispatch.dispatch_date.isoformat()})",
                dispatch.created_by,
                "dispatch",
                dispatch.id,
            )
        )
    events.append(
        _event(
            invoice.created_at,
            "invoice_created",
            f"Invoice {invoice.invoice_number} created",
            invoice.created_by,
            "invoice",
            invoice.id,
        )
    )
    if invoice.issued_at or invoice.status in ISSUED_STATUSES:
        events.append(
            _event(invoice.issued_at, "invoice_issued", f"Invoice {invoice.invoice_number} issued", invoice.issued_by, "invoice", invoice.id)
        )
    if invoice.status == Invoice.Status.CANCELLED:
        events.append(
            _event(
                invoice.cancelled_at,
                "invoice_cancelled",
                f"Invoice {invoice.invoice_number} cancelled",
                invoice.cancelled_by,
                "invoice",
                invoice.id,
            )
        )
    for row in allocations:
        if row.id in adjusted_allocation_ids:
            continue
        events.append(
            _event(
                row.payment.created_at,
                "payment",
                f"Payment {row.payment.payment_number} recorded — {rupee_label(row.allocated_amount)} allocated to this invoice",
                row.payment.created_by,
                "payment",
                row.payment_id,
            )
        )
    for adj in adjustments:
        events.append(
            _event(
                adj.created_at,
                "payment_adjustment",
                f"Payment adjustment on {adj.payment.payment_number} — {rupee_label(adj.amount)} ({adj.status})",
                adj.created_by,
                "payment",
                adj.payment_id,
                approved_by=_user(adj.approved_by),
            )
        )
    events.sort(key=lambda e: (e["at"] is None, e["at"] or 0))
    for event in events:
        event["at"] = _iso(event["at"])

    return {
        "invoice": {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date.isoformat(),
            "due_date": invoice.due_date.isoformat(),
            "status": invoice.status,
            "display_status": invoice_display_status(invoice),
            "is_overdue": invoice_is_overdue(invoice),
            "net_amount": str(money(invoice.net_amount)),
            "created_by": _user(invoice.created_by),
            "created_at": _iso(invoice.created_at),
            "issued_by": _user(invoice.issued_by),
            "issued_at": _iso(invoice.issued_at),
            "cancelled_by": _user(invoice.cancelled_by),
            "cancelled_at": _iso(invoice.cancelled_at),
        },
        "customer": {
            "id": invoice.customer_id,
            "customer_code": invoice.customer.customer_code,
            "customer_name": invoice.customer.customer_name,
        },
        "entity": {
            "id": invoice.entity_id,
            "short_code": invoice.entity.short_code,
            "entity_name": invoice.entity.entity_name,
        },
        "brand": {
            "id": invoice.brand_id,
            "brand_code": invoice.brand.brand_code,
            "brand_name": invoice.brand.brand_name,
        },
        "purchase_order": {
            "id": po.id,
            "po_number": po.po_number,
            "po_date": po.po_date.isoformat(),
            "order_type": po.order_type,
            "status": po.status,
            "created_by": _user(po.created_by),
            "created_at": _iso(po.created_at),
            "status_history": status_history,
        } if po_visible else None,
        "lines": lines,
        "dispatches": dispatches,
        "dispatches_note": DISPATCHES_NOTE,
        "payments": {"allocations": payment_rows, "adjustments": adjustment_rows},
        "financials": {
            "net_amount": str(money(invoice.net_amount)),
            "total_paid": str(invoice_total_paid(invoice)),
            "outstanding_balance": str(invoice_remaining_balance(invoice)),
        },
        "adjustments": [],
        "adjustments_note": ADJUSTMENTS_NOTE,
        "timeline": events,
    }
