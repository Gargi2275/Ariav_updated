"""Dispatch quantity totals and Purchase Order status sync."""

from decimal import ROUND_HALF_UP, Decimal

from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


def quantize_qty(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def qty_label(value: Decimal) -> str:
    q = quantize_qty(value)
    text = format(q, "f")
    if text.endswith(".00"):
        return text[:-3]
    return text.rstrip("0").rstrip(".")


def line_dispatched_total(line: PurchaseOrderLine, extra: Decimal | None = None) -> Decimal:
    total = sum((row.dispatched_quantity for row in line.dispatch_lines.all()), Decimal("0"))
    if extra is not None:
        total += extra
    return quantize_qty(total)


def line_pending_quantity(line: PurchaseOrderLine, extra: Decimal | None = None) -> Decimal:
    pending = quantize_qty(line.quantity) - line_dispatched_total(line, extra)
    if pending < 0:
        return Decimal("0.00")
    return pending


def po_dispatch_progress(po: PurchaseOrder) -> str:
    lines = list(po.lines.all())
    if not lines:
        return "Not Started"
    any_dispatched = False
    all_complete = True
    for line in lines:
        dispatched = line_dispatched_total(line)
        if dispatched > 0:
            any_dispatched = True
        if line_pending_quantity(line) > 0:
            all_complete = False
    if not any_dispatched:
        return "Not Started"
    if all_complete:
        return "Complete"
    return "Partial"


DISPATCH_STATUS_LOCK = {
    PurchaseOrder.Status.BRAND_ACCEPTED,
    PurchaseOrder.Status.PARTIALLY_DISPATCHED,
    PurchaseOrder.Status.FULLY_DISPATCHED,
}


def sync_purchase_order_dispatch_status(po: PurchaseOrder) -> str:
    """Set Partially/Fully Dispatched or revert to Brand Accepted from live totals.

    Only touches Brand Accepted / Partially Dispatched / Fully Dispatched.
    Closed, Rejected, Cancelled, and On Hold are left alone.
    """
    po = PurchaseOrder.objects.prefetch_related("lines__dispatch_lines").get(pk=po.pk)
    if po.status not in DISPATCH_STATUS_LOCK:
        return po.status

    progress = po_dispatch_progress(po)
    if progress == "Complete":
        next_status = PurchaseOrder.Status.FULLY_DISPATCHED
    elif progress == "Partial":
        next_status = PurchaseOrder.Status.PARTIALLY_DISPATCHED
    else:
        next_status = PurchaseOrder.Status.BRAND_ACCEPTED

    if po.status != next_status:
        po.status = next_status
        po.save(update_fields=["status", "updated_at"])
        from notifications.services import notify_po_status_changed

        notify_po_status_changed(po)
    return po.status
