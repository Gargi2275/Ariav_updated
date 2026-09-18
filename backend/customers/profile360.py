"""Customer 360° aggregation — histories plus ledger KPIs, not a stored profile."""

from datetime import date
from decimal import Decimal

from django.db.models import DecimalField, Max, Sum, Value
from django.db.models.functions import Coalesce

from dashboards.services import SALES_STATUSES
from dispatches.models import Dispatch
from invoices.models import Invoice, InvoiceLine
from invoices.services import invoice_display_status, invoice_is_overdue, money
from ledger.customer import build_customer_ledger
from payments.models import Payment
from payments.services import invoice_remaining_balance
from purchase_orders.models import PurchaseOrder

HISTORY_LIMIT = 20
LEDGER_PREVIEW_LIMIT = 10
TREND_LIMIT = 10


def _as_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _in_range(qs, field, date_from, date_to):
    if date_from:
        qs = qs.filter(**{f"{field}__gte": date_from})
    if date_to:
        qs = qs.filter(**{f"{field}__lte": date_to})
    return qs


def _money(value) -> str:
    return str(money(value or 0))


def _basic_info(customer) -> dict:
    links = list(customer.entity_links.all())
    return {
        "customer_code": customer.customer_code,
        "customer_name": customer.customer_name,
        "customer_type": customer.customer_type,
        "status": customer.status,
        "contact_person": customer.contact_person or "",
        "phone": customer.phone or "",
        "mobile": customer.mobile or "",
        "email": customer.email or "",
        "address_line_1": customer.address_line_1 or "",
        "city": customer.city or "",
        "state": customer.state or "",
        "pincode": customer.pincode or "",
        "gst_no": customer.gst_no or "",
        "pan_no": customer.pan_no or "",
        "credit_days": customer.credit_days,
        "credit_limit": _money(customer.credit_limit),
        "entities": [
            {
                "entity_id": link.entity_id,
                "short_code": link.entity.short_code,
                "entity_name": link.entity.entity_name,
                "primary_entity": link.primary_entity,
            }
            for link in links
        ],
    }


def _purchase_history(customer, date_from, date_to) -> dict:
    qs = PurchaseOrder.objects.filter(customer=customer).select_related("brand", "entity")
    qs = _in_range(qs, "po_date", date_from, date_to)
    total = qs.count()
    rows = list(
        qs.annotate(
            amount=Coalesce(Sum("lines__line_total"), Value(Decimal("0.00"), output_field=DecimalField()))
        ).order_by("-po_date", "-id")[
            :HISTORY_LIMIT
        ]
    )
    return {
        "total_count": total,
        "rows": [
            {
                "id": po.id,
                "po_number": po.po_number,
                "po_date": po.po_date.isoformat(),
                "status": po.status,
                "brand_name": po.brand.brand_name if po.brand_id else "",
                "entity_name": po.entity.entity_name if po.entity_id else "",
                "total_amount": _money(po.amount),
            }
            for po in rows
        ],
    }


def _dispatch_history(customer, date_from, date_to) -> dict:
    qs = Dispatch.objects.filter(purchase_order__customer=customer).select_related("purchase_order")
    qs = _in_range(qs, "dispatch_date", date_from, date_to)
    total = qs.count()
    rows = list(qs.order_by("-dispatch_date", "-id")[:HISTORY_LIMIT])
    return {
        "total_count": total,
        "rows": [
            {
                "id": row.id,
                "dispatch_date": row.dispatch_date.isoformat(),
                "lr_number": row.lr_number,
                "transporter": row.transporter,
                "challan_reference": row.challan_reference,
                "po_number": row.purchase_order.po_number,
                "purchase_order_id": row.purchase_order_id,
            }
            for row in rows
        ],
    }


def _invoice_history(customer, date_from, date_to) -> dict:
    qs = Invoice.objects.filter(customer=customer).prefetch_related("allocations")
    qs = _in_range(qs, "invoice_date", date_from, date_to)
    total = qs.count()
    rows = list(qs.order_by("-invoice_date", "-id")[:HISTORY_LIMIT])
    return {
        "total_count": total,
        "rows": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "invoice_date": inv.invoice_date.isoformat(),
                "due_date": inv.due_date.isoformat() if inv.due_date else None,
                "status": inv.status,
                "display_status": invoice_display_status(inv),
                "is_overdue": invoice_is_overdue(inv),
                "net_amount": _money(inv.net_amount),
                "remaining_balance": _money(invoice_remaining_balance(inv)),
            }
            for inv in rows
        ],
    }


def _payment_history(customer, date_from, date_to) -> dict:
    qs = Payment.objects.filter(customer=customer)
    qs = _in_range(qs, "payment_date", date_from, date_to)
    total = qs.count()
    rows = list(qs.order_by("-payment_date", "-id")[:HISTORY_LIMIT])
    return {
        "total_count": total,
        "rows": [
            {
                "id": pay.id,
                "payment_number": pay.payment_number,
                "payment_date": pay.payment_date.isoformat(),
                "amount": _money(pay.amount),
                "unallocated_amount": _money(pay.unallocated_amount),
                "payment_mode": pay.payment_mode,
            }
            for pay in rows
        ],
    }


def _product_purchase_trends(customer, date_from, date_to) -> list:
    lines = InvoiceLine.objects.filter(
        invoice__customer=customer,
        invoice__status__in=SALES_STATUSES,
        product_id__isnull=False,
    )
    lines = _in_range(lines, "invoice__invoice_date", date_from, date_to)
    ranked = list(
        lines.values("product_id", "product__product_code", "product__product_name")
        .annotate(total_qty=Sum("quantity"), total_value=Sum("line_total"))
        .order_by("-total_value")[:TREND_LIMIT]
    )
    return [
        {
            "rank": index + 1,
            "product_id": row["product_id"],
            "product_code": row["product__product_code"] or "",
            "product_name": row["product__product_name"] or "",
            "total_qty": _money(row["total_qty"]),
            "total_value": _money(row["total_value"]),
        }
        for index, row in enumerate(ranked)
    ]


def _payment_behaviour(customer, date_from, date_to) -> dict:
    paid = Invoice.objects.filter(customer=customer, status=Invoice.Status.PAID)
    paid = _in_range(paid, "invoice_date", date_from, date_to)
    paid = paid.annotate(last_pay=Max("allocations__payment__payment_date"))
    deltas = []
    on_time = 0
    for invoice in paid:
        last_pay = invoice.last_pay
        if not last_pay or not invoice.due_date:
            continue
        deltas.append((last_pay - invoice.due_date).days)
        if last_pay <= invoice.due_date:
            on_time += 1
    payments = Payment.objects.filter(customer=customer)
    payments = _in_range(payments, "payment_date", date_from, date_to)
    counted = len(deltas)
    avg = None
    rate = None
    if counted:
        avg = str(money(Decimal(sum(deltas)) / Decimal(counted)))
        rate = str(money(Decimal(on_time) * Decimal("100") / Decimal(counted)))
    return {
        "average_days_to_pay": avg,
        "on_time_payment_rate": rate,
        "total_payment_count": payments.count(),
        "paid_invoice_count": counted,
    }


def build_customer_360(customer, date_from=None, date_to=None) -> dict:
    date_from = _as_date(date_from)
    date_to = _as_date(date_to)
    ledger = build_customer_ledger(customer, date_from=date_from, date_to=date_to)
    summary = ledger["summary"]
    entries = ledger["entries"]
    return {
        "customer_id": customer.id,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "basic_info": _basic_info(customer),
        "outstanding": summary["outstanding_balance"],
        "advance": summary["advance_credit_balance"],
        "overdue": summary["overdue_amount"],
        "summary": summary,
        "purchase_history": _purchase_history(customer, date_from, date_to),
        "dispatch_history": _dispatch_history(customer, date_from, date_to),
        "invoice_history": _invoice_history(customer, date_from, date_to),
        "payment_history": _payment_history(customer, date_from, date_to),
        "ledger_preview": entries[-LEDGER_PREVIEW_LIMIT:],
        "product_purchase_trends": _product_purchase_trends(customer, date_from, date_to),
        "payment_behaviour": _payment_behaviour(customer, date_from, date_to),
    }
