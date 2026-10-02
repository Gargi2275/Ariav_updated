"""Read-only integrity report across PO, Dispatch, Invoice and Payment.

Prints a count and the first 20 offending IDs per check. Never writes.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import DecimalField, ExpressionWrapper, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from brands.models import Brand
from customers.models import Customer
from dispatches.services import line_dispatched_total, po_dispatch_progress, quantize_qty
from entities.models import Entity
from invoices.models import Invoice, InvoiceLine
from invoices.services import line_invoiced_total
from payments.models import Payment, PaymentAllocation
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine

SAMPLE_SIZE = 20
MONEY = DecimalField(max_digits=16, decimal_places=2)


def _allocated_sum(**filters):
    return Coalesce(
        Subquery(
            PaymentAllocation.objects.filter(**filters)
            .values(next(iter(filters)))
            .annotate(s=Sum("allocated_amount"))
            .values("s")[:1],
            output_field=MONEY,
        ),
        Value(Decimal("0"), output_field=MONEY),
    )


def invoiced_over_dispatched():
    ids = []
    over_ordered = []
    po_lines = PurchaseOrderLine.objects.filter(invoice_lines__isnull=False).distinct().prefetch_related(
        "dispatch_lines", "invoice_lines__invoice"
    )
    for po_line in po_lines:
        dispatched = line_dispatched_total(po_line)
        live_rows = [row.id for row in po_line.invoice_lines.all() if row.invoice.status != Invoice.Status.CANCELLED]
        if line_invoiced_total(po_line) > dispatched:
            ids.extend(live_rows)
        if dispatched > quantize_qty(po_line.quantity):
            over_ordered.extend(live_rows)
    return sorted(ids), sorted(over_ordered)


def net_amount_mismatch():
    expected = ExpressionWrapper(
        F("subtotal") - F("discount_amount") + F("tax_amount") + F("other_charges"),
        output_field=MONEY,
    )
    return list(
        Invoice.objects.annotate(expected_net=expected)
        .exclude(net_amount=F("expected_net"))
        .order_by("id")
        .values_list("id", flat=True)
    )


def status_vs_allocations():
    qs = Invoice.objects.annotate(paid=_allocated_sum(invoice_id=OuterRef("pk")))
    paid_short = qs.filter(status=Invoice.Status.PAID, paid__lt=F("net_amount"))
    issued_with_payments = qs.filter(status=Invoice.Status.ISSUED, paid__gt=0)
    return list(paid_short.order_by("id").values_list("id", flat=True)), list(
        issued_with_payments.order_by("id").values_list("id", flat=True)
    )


def payments_over_allocated():
    return list(
        Payment.objects.annotate(allocated=_allocated_sum(payment_id=OuterRef("pk")))
        .filter(allocated__gt=F("amount"))
        .order_by("id")
        .values_list("id", flat=True)
    )


def missing_links():
    customers = Customer.objects.values("id")
    entities = Entity.objects.values("id")
    brands = Brand.objects.values("id")
    pos = PurchaseOrder.objects.values("id")
    invoices = list(
        Invoice.objects.filter(
            ~Q(customer_id__in=customers)
            | ~Q(entity_id__in=entities)
            | ~Q(brand_id__in=brands)
            | ~Q(purchase_order_id__in=pos)
        )
        .order_by("id")
        .values_list("id", flat=True)
    )
    purchase_orders = list(
        PurchaseOrder.objects.filter(
            ~Q(customer_id__in=customers) | ~Q(entity_id__in=entities) | ~Q(brand_id__in=brands)
        )
        .order_by("id")
        .values_list("id", flat=True)
    )
    invoice_lines = list(
        InvoiceLine.objects.exclude(purchase_order_line__purchase_order_id=F("invoice__purchase_order_id"))
        .order_by("id")
        .values_list("id", flat=True)
    )
    payments = list(
        Payment.objects.filter(~Q(customer_id__in=customers) | ~Q(entity_id__in=entities))
        .order_by("id")
        .values_list("id", flat=True)
    )
    return invoices, purchase_orders, invoice_lines, payments


def cross_customer_links():
    invoices = list(
        Invoice.objects.exclude(customer_id=F("purchase_order__customer_id"))
        .order_by("id")
        .values_list("id", flat=True)
    )
    allocations = list(
        PaymentAllocation.objects.exclude(payment__customer_id=F("invoice__customer_id"))
        .order_by("id")
        .values_list("id", flat=True)
    )
    return invoices, allocations


def po_dispatch_status_mismatches():
    expected_by_progress = {
        "Not Started": PurchaseOrder.Status.BRAND_ACCEPTED,
        "Partial": PurchaseOrder.Status.PARTIALLY_DISPATCHED,
        "Complete": PurchaseOrder.Status.FULLY_DISPATCHED,
    }
    mismatches = []
    purchase_orders = (
        PurchaseOrder.objects.filter(
            status__in=(
                PurchaseOrder.Status.BRAND_ACCEPTED,
                PurchaseOrder.Status.PARTIALLY_DISPATCHED,
                PurchaseOrder.Status.FULLY_DISPATCHED,
            )
        )
        .prefetch_related("lines__dispatch_lines")
        .order_by("id")
    )
    for po in purchase_orders:
        progress = po_dispatch_progress(po)
        if po.status != expected_by_progress[progress]:
            mismatches.append(po.id)
    return mismatches


def run_checks() -> list[tuple[str, list[int]]]:
    over_dispatched, over_ordered = invoiced_over_dispatched()
    paid_short, issued_with_payments = status_vs_allocations()
    bad_invoices, bad_pos, bad_invoice_lines, bad_payments = missing_links()
    cross_invoices, cross_allocations = cross_customer_links()
    return [
        ("Invoice lines: invoiced quantity > dispatched quantity", over_dispatched),
        ("Invoice lines: dispatched quantity > ordered quantity", over_ordered),
        ("Invoices: net amount != subtotal - discount + tax + other charges", net_amount_mismatch()),
        ("Invoices: status Paid but total paid < net amount", paid_short),
        ("Invoices: status Issued but payment allocations > 0", issued_with_payments),
        ("Payments: allocations exceed payment amount", payments_over_allocated()),
        ("Invoices: missing Customer / Entity / Brand / PO link", bad_invoices),
        ("Purchase Orders: missing Customer / Entity / Brand link", bad_pos),
        ("Invoice lines: PO line not on the invoice's PO", bad_invoice_lines),
        ("Payments: missing Customer / Entity link", bad_payments),
        ("Invoices: Customer differs from the PO's Customer", cross_invoices),
        ("Payment allocations: payment Customer differs from invoice Customer", cross_allocations),
        ("Purchase Orders: dispatch status disagrees with live Dispatch records", po_dispatch_status_mismatches()),
    ]


class Command(BaseCommand):
    help = "Read-only traceability report: prints counts and the first 20 offending IDs per check."

    def handle(self, *args, **options):
        results = run_checks()
        failing = 0
        for label, ids in results:
            if ids:
                failing += 1
                sample = ", ".join(str(i) for i in ids[:SAMPLE_SIZE])
                more = f" (+{len(ids) - SAMPLE_SIZE} more)" if len(ids) > SAMPLE_SIZE else ""
                self.stdout.write(self.style.WARNING(f"[{len(ids)}] {label}: {sample}{more}"))
            else:
                self.stdout.write(f"[0] {label}")
        summary = f"{failing} of {len(results)} checks found issues."
        self.stdout.write(self.style.WARNING(summary) if failing else self.style.SUCCESS(summary))
