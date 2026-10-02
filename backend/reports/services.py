"""Live report aggregations — no stored report tables.

Commission Management is not built; commission_earned is omitted.
on_time_dispatch_rate is omitted: POs have no promised dispatch date.
Bad debt has no write-off mechanism — empty rows plus a note, never overdue-as-proxy.
"""

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Max, Sum
from django.utils import timezone

from brands.models import Brand
from customers.models import Customer
from dashboards.services import (
    SALES_STATUSES,
    _kpis,
    customer_outstanding_report,
    money_str,
    scope_customers,
)
from dispatches.models import DispatchLine
from entities.models import Entity
from invoices.models import Invoice, InvoiceLine
from invoices.services import money
from payments.models import Payment, PaymentAllocation
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine

PO_EXCLUDED = (
    PurchaseOrder.Status.CANCELLED,
    PurchaseOrder.Status.REJECTED,
)
BAD_DEBT_NOTE = "Not tracked yet — no write-off mechanism exists."


def default_date_range():
    date_to = timezone.localdate()
    return date_to - timedelta(days=365), date_to


def month_key(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def month_starts(date_from: date, date_to: date) -> list[date]:
    cursor = date(date_from.year, date_from.month, 1)
    last = date(date_to.year, date_to.month, 1)
    out = []
    while cursor <= last:
        out.append(cursor)
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return out


def _month_bounds(start: date) -> tuple[date, date]:
    last = monthrange(start.year, start.month)[1]
    return start, date(start.year, start.month, last)


def _scope_entity(qs, entity_id, field="entity_id"):
    if entity_id:
        qs = qs.filter(**{field: entity_id})
    return qs


def _po_value_by_month(date_from, date_to, entity_id=None, customer_ids=None) -> dict[str, Decimal]:
    lines = PurchaseOrderLine.objects.filter(
        purchase_order__po_date__range=(date_from, date_to),
    ).exclude(purchase_order__status__in=PO_EXCLUDED)
    if entity_id:
        lines = lines.filter(purchase_order__entity_id=entity_id)
    lines = scope_customers(lines, customer_ids, "purchase_order__customer_id")
    grouped = {}
    for row in lines.values("purchase_order__po_date").annotate(total=Sum("line_total")):
        key = month_key(row["purchase_order__po_date"])
        grouped[key] = grouped.get(key, Decimal("0.00")) + money(row["total"] or 0)
    return grouped


def _sales_value_by_month(date_from, date_to, entity_id=None, customer_ids=None) -> dict[str, Decimal]:
    invoices = Invoice.objects.filter(
        status__in=SALES_STATUSES,
        invoice_date__range=(date_from, date_to),
    )
    invoices = _scope_entity(invoices, entity_id)
    invoices = scope_customers(invoices, customer_ids)
    grouped = {}
    for row in invoices.values("invoice_date").annotate(total=Sum("net_amount")):
        key = month_key(row["invoice_date"])
        grouped[key] = grouped.get(key, Decimal("0.00")) + money(row["total"] or 0)
    return grouped


def purchase_sales_trend(date_from, date_to, entity_id=None, customer_ids=None) -> list[dict]:
    po_map = _po_value_by_month(date_from, date_to, entity_id, customer_ids)
    sales_map = _sales_value_by_month(date_from, date_to, entity_id, customer_ids)
    return [
        {
            "month": month_key(start),
            "po_value": money_str(po_map.get(month_key(start), 0)),
            "sales_value": money_str(sales_map.get(month_key(start), 0)),
        }
        for start in month_starts(date_from, date_to)
    ]


def payment_trend(date_from, date_to, entity_id=None, customer_ids=None) -> list[dict]:
    payments = Payment.objects.filter(payment_date__range=(date_from, date_to))
    payments = _scope_entity(payments, entity_id)
    payments = scope_customers(payments, customer_ids)
    grouped = {}
    for row in payments.values("payment_date").annotate(total=Sum("amount")):
        key = month_key(row["payment_date"])
        grouped[key] = grouped.get(key, Decimal("0.00")) + money(row["total"] or 0)
    return [
        {
            "month": month_key(start),
            "payment_value": money_str(grouped.get(month_key(start), 0)),
        }
        for start in month_starts(date_from, date_to)
    ]


def _sales_lines(date_from, date_to, entity_id=None, customer_ids=None):
    lines = InvoiceLine.objects.filter(
        invoice__status__in=SALES_STATUSES,
        invoice__invoice_date__range=(date_from, date_to),
        product_id__isnull=False,
    )
    if entity_id:
        lines = lines.filter(invoice__entity_id=entity_id)
    return scope_customers(lines, customer_ids, "invoice__customer_id")


def product_trend(date_from, date_to, entity_id=None, customer_ids=None, limit=10) -> list[dict]:
    lines = _sales_lines(date_from, date_to, entity_id, customer_ids)
    ranked = list(
        lines.values("product_id", "product__product_name", "product__product_code")
        .annotate(total_value=Sum("line_total"), total_qty=Sum("quantity"))
        .order_by("-total_value")[:limit]
    )
    if not ranked:
        return []
    ids = [row["product_id"] for row in ranked]
    monthly_rows = (
        lines.filter(product_id__in=ids)
        .values("product_id", "invoice__invoice_date")
        .annotate(quantity=Sum("quantity"), value=Sum("line_total"))
    )
    by_product = {pid: {} for pid in ids}
    for row in monthly_rows:
        key = month_key(row["invoice__invoice_date"])
        by_product[row["product_id"]][key] = {
            "quantity": money(row["quantity"] or 0),
            "value": money(row["value"] or 0),
        }
    months = [month_key(start) for start in month_starts(date_from, date_to)]
    out = []
    for row in ranked:
        pid = row["product_id"]
        series = by_product.get(pid, {})
        out.append(
            {
                "product_id": pid,
                "product_code": row["product__product_code"],
                "product_name": row["product__product_name"],
                "total_value": money_str(row["total_value"] or 0),
                "monthly": [
                    {
                        "month": month,
                        "quantity": money_str(series.get(month, {}).get("quantity", 0)),
                        "value": money_str(series.get(month, {}).get("value", 0)),
                    }
                    for month in months
                ],
            }
        )
    return out


def seasonal_trend(date_from, date_to, entity_id=None, customer_ids=None) -> list[dict]:
    lines = _sales_lines(date_from, date_to, entity_id, customer_ids).select_related("product")
    grouped = {}
    for line in lines:
        season = (line.product.season or "").strip() or "Unspecified"
        grouped[season] = grouped.get(season, Decimal("0.00")) + money(line.line_total)
    return [
        {"season": name, "total_value": money_str(total)}
        for name, total in sorted(grouped.items(), key=lambda item: item[1], reverse=True)
    ]


def bad_debt_trend(date_from, date_to, entity_id=None, customer_ids=None) -> dict:
    # TODO: populate monthly write-off totals once a bad-debt / write-off module exists.
    # Do not substitute overdue invoice remaining — overdue is not bad debt.
    return {
        "note": BAD_DEBT_NOTE,
        "rows": [
            {"month": month_key(start), "bad_debt": money_str(0)}
            for start in month_starts(date_from, date_to)
        ],
    }


def outstanding_report(entity_id=None, customer_ids=None) -> list[dict]:
    return customer_outstanding_report(entity_id, customer_ids=customer_ids)


def customer_performance(date_from, date_to, entity_id=None, customer_ids=None) -> list[dict]:
    pos = PurchaseOrder.objects.filter(po_date__range=(date_from, date_to)).exclude(
        status__in=PO_EXCLUDED
    )
    invoices = Invoice.objects.filter(
        status__in=SALES_STATUSES,
        invoice_date__range=(date_from, date_to),
    )
    payments = Payment.objects.filter(payment_date__range=(date_from, date_to))
    if entity_id:
        pos = pos.filter(entity_id=entity_id)
        invoices = invoices.filter(entity_id=entity_id)
        payments = payments.filter(entity_id=entity_id)
    pos = scope_customers(pos, customer_ids)
    invoices = scope_customers(invoices, customer_ids)
    payments = scope_customers(payments, customer_ids)

    po_counts = {
        row["customer_id"]: row["n"]
        for row in pos.values("customer_id").annotate(n=Count("id"))
    }
    invoiced = {
        row["customer_id"]: money(row["total"] or 0)
        for row in invoices.values("customer_id").annotate(total=Sum("net_amount"))
    }
    paid = {
        row["customer_id"]: money(row["total"] or 0)
        for row in payments.values("customer_id").annotate(total=Sum("amount"))
    }

    paid_invoices = invoices.filter(status=Invoice.Status.PAID)
    last_pay = {
        row["invoice_id"]: row["last_date"]
        for row in PaymentAllocation.objects.filter(invoice_id__in=paid_invoices.values("id"))
        .values("invoice_id")
        .annotate(last_date=Max("payment__payment_date"))
    }
    days_acc = {}
    for invoice in paid_invoices.only("id", "customer_id", "invoice_date"):
        last = last_pay.get(invoice.id)
        if not last:
            continue
        bucket = days_acc.setdefault(invoice.customer_id, {"sum": 0, "n": 0})
        bucket["sum"] += (last - invoice.invoice_date).days
        bucket["n"] += 1

    outstanding_map = {
        row["customer_id"]: row
        for row in customer_outstanding_report(entity_id, customer_ids=customer_ids)
    }
    row_customer_ids = set(po_counts) | set(invoiced) | set(paid)
    if not row_customer_ids:
        return []
    customers = {
        row.id: row
        for row in Customer.objects.filter(id__in=row_customer_ids)
    }
    rows = []
    for cid in row_customer_ids:
        customer = customers.get(cid)
        if not customer:
            continue
        days = days_acc.get(cid)
        avg = None
        if days and days["n"]:
            avg = str(round(days["sum"] / days["n"], 1))
        out_row = outstanding_map.get(cid)
        rows.append(
            {
                "customer_id": cid,
                "customer_code": customer.customer_code,
                "customer_name": customer.customer_name,
                "total_orders": po_counts.get(cid, 0),
                "total_invoiced": money_str(invoiced.get(cid, 0)),
                "total_paid": money_str(paid.get(cid, 0)),
                "average_days_to_pay": avg,
                "outstanding_balance": out_row["outstanding_balance"] if out_row else money_str(0),
            }
        )
    rows.sort(key=lambda row: Decimal(row["total_invoiced"]), reverse=True)
    return rows


def brand_performance(date_from, date_to, entity_id=None, customer_ids=None) -> list[dict]:
    """on_time_dispatch_rate omitted: POs have no promised dispatch date or lead time.

    commission_earned omitted: Commission Management is not built.
    """
    pos = PurchaseOrder.objects.filter(po_date__range=(date_from, date_to)).exclude(
        status__in=PO_EXCLUDED
    )
    invoices = Invoice.objects.filter(
        status__in=SALES_STATUSES,
        invoice_date__range=(date_from, date_to),
    )
    dispatch_lines = DispatchLine.objects.filter(
        dispatch__dispatch_date__range=(date_from, date_to),
    ).select_related("purchase_order_line", "dispatch__purchase_order")
    if entity_id:
        pos = pos.filter(entity_id=entity_id)
        invoices = invoices.filter(entity_id=entity_id)
        dispatch_lines = dispatch_lines.filter(dispatch__purchase_order__entity_id=entity_id)
    pos = scope_customers(pos, customer_ids)
    invoices = scope_customers(invoices, customer_ids)
    dispatch_lines = scope_customers(dispatch_lines, customer_ids, "dispatch__purchase_order__customer_id")

    po_counts = {
        row["brand_id"]: row["n"]
        for row in pos.values("brand_id").annotate(n=Count("id"))
    }
    invoiced = {
        row["brand_id"]: money(row["total"] or 0)
        for row in invoices.values("brand_id").annotate(total=Sum("net_amount"))
    }
    dispatched = {}
    for line in dispatch_lines:
        brand_id = line.dispatch.purchase_order.brand_id
        value = money(line.dispatched_quantity * line.purchase_order_line.rate)
        dispatched[brand_id] = dispatched.get(brand_id, Decimal("0.00")) + value

    brand_ids = set(po_counts) | set(invoiced) | set(dispatched)
    if not brand_ids:
        return []
    brands = {row.id: row for row in Brand.objects.filter(id__in=brand_ids)}
    rows = []
    for bid in brand_ids:
        brand = brands.get(bid)
        if not brand:
            continue
        rows.append(
            {
                "brand_id": bid,
                "brand_code": brand.brand_code,
                "brand_name": brand.brand_name,
                "total_pos": po_counts.get(bid, 0),
                "total_dispatched_value": money_str(dispatched.get(bid, 0)),
                "total_invoiced_value": money_str(invoiced.get(bid, 0)),
            }
        )
    rows.sort(key=lambda row: Decimal(row["total_invoiced_value"]), reverse=True)
    return rows


def entity_performance(date_from, date_to, entity_id=None, customer_ids=None) -> list[dict]:
    """Side-by-side entity comparison. Outstanding/overdue reuse dashboard KPIs."""
    entities = Entity.objects.all().order_by("short_code")
    if entity_id:
        entities = entities.filter(pk=entity_id)
    rows = []
    for entity in entities:
        kpis = _kpis(entity.id, customer_ids=customer_ids)
        pos = PurchaseOrder.objects.filter(
            entity=entity,
            po_date__range=(date_from, date_to),
        ).exclude(status__in=PO_EXCLUDED)
        sales = Invoice.objects.filter(
            entity=entity,
            status__in=SALES_STATUSES,
            invoice_date__range=(date_from, date_to),
        )
        pos = scope_customers(pos, customer_ids)
        sales = scope_customers(sales, customer_ids)
        total_sales = money(sales.aggregate(s=Sum("net_amount"))["s"] or 0)
        rows.append(
            {
                "entity_id": entity.id,
                "short_code": entity.short_code,
                "entity_name": entity.entity_name,
                "total_sales": money_str(total_sales),
                "total_orders": pos.count(),
                "total_customers": kpis["active_customers"],
                "total_outstanding": kpis["total_outstanding"],
                "total_overdue": kpis["total_overdue"],
            }
        )
    return rows
