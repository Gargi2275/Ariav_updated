"""Live dashboard aggregations — no stored dashboard tables.

Commission Management is not built; commission KPIs are omitted (not fabricated).
Bad debt has no write-off mechanism yet and is always 0.
"""

from decimal import Decimal

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from brands.models import Brand
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from invoices.models import Invoice, InvoiceLine
from invoices.services import invoice_is_overdue, money
from payments.models import Payment, PaymentAllocation
from products.models import Product
from purchase_orders.models import PurchaseOrder

SALES_STATUSES = (
    Invoice.Status.ISSUED,
    Invoice.Status.PARTIALLY_PAID,
    Invoice.Status.PAID,
    Invoice.Status.OVERDUE,
)
UNPAID_STATUSES = (
    Invoice.Status.ISSUED,
    Invoice.Status.PARTIALLY_PAID,
    Invoice.Status.OVERDUE,
)
PENDING_PO_STATUSES = (
    PurchaseOrder.Status.DRAFT,
    PurchaseOrder.Status.SUBMITTED,
    PurchaseOrder.Status.SENT_TO_BRAND,
)
PENDING_INVOICE_STATUSES = (
    Invoice.Status.DRAFT,
    Invoice.Status.ISSUED,
    Invoice.Status.PARTIALLY_PAID,
    Invoice.Status.OVERDUE,
)


def money_str(value) -> str:
    return str(money(value or 0))


def _sum(qs, field) -> Decimal:
    total = qs.aggregate(s=Sum(field))["s"] or Decimal("0")
    return money(total)


def scope_customers(qs, customer_ids, field="customer_id"):
    """customer_ids is None (unrestricted) or an id collection / subquery from customers_visible_to."""
    if customer_ids is not None:
        qs = qs.filter(**{f"{field}__in": customer_ids})
    return qs


def _invoice_qs(entity_id=None, customer_ids=None):
    qs = Invoice.objects.all()
    if entity_id:
        qs = qs.filter(entity_id=entity_id)
    return scope_customers(qs, customer_ids)


def _payment_qs(entity_id=None, customer_ids=None):
    qs = Payment.objects.all()
    if entity_id:
        qs = qs.filter(entity_id=entity_id)
    return scope_customers(qs, customer_ids)


def _po_qs(entity_id=None, customer_ids=None):
    qs = PurchaseOrder.objects.all()
    if entity_id:
        qs = qs.filter(entity_id=entity_id)
    return scope_customers(qs, customer_ids)


def _remaining_by_invoice(invoices) -> dict[int, Decimal]:
    ids = [row.id for row in invoices]
    if not ids:
        return {}
    paid_rows = (
        PaymentAllocation.objects.filter(invoice_id__in=ids)
        .values("invoice_id")
        .annotate(s=Sum("allocated_amount"))
    )
    paid = {row["invoice_id"]: money(row["s"] or 0) for row in paid_rows}
    remaining = {}
    for invoice in invoices:
        left = money(invoice.net_amount) - paid.get(invoice.id, Decimal("0.00"))
        if left < 0:
            left = Decimal("0.00")
        remaining[invoice.id] = left
    return remaining


def _kpis(entity_id=None, customer_ids=None) -> dict:
    invoices = _invoice_qs(entity_id, customer_ids)
    payments = _payment_qs(entity_id, customer_ids)
    pos = _po_qs(entity_id, customer_ids)
    sales = invoices.filter(status__in=SALES_STATUSES)
    unpaid = list(invoices.filter(status__in=UNPAID_STATUSES))
    remaining = _remaining_by_invoice(unpaid)
    outstanding = sum((remaining.get(inv.id, Decimal("0.00")) for inv in unpaid), Decimal("0.00"))
    overdue = sum(
        (remaining.get(inv.id, Decimal("0.00")) for inv in unpaid if invoice_is_overdue(inv)),
        Decimal("0.00"),
    )
    advance = _sum(payments, "unallocated_amount")
    customers = scope_customers(Customer.objects.filter(status=Customer.Status.ACTIVE), customer_ids, "id")
    brands = Brand.objects.filter(status=Brand.Status.ACTIVE)
    products = Product.objects.filter(status=Product.Status.ACTIVE)
    entities = Entity.objects.filter(status=Entity.Status.ACTIVE)
    if entity_id:
        customers = customers.filter(entity_links__entity_id=entity_id)
        brands = brands.filter(
            Q(purchase_orders__entity_id=entity_id) | Q(invoices__entity_id=entity_id)
        ).distinct()
        products = products.filter(
            Q(purchase_order_lines__purchase_order__entity_id=entity_id)
            | Q(invoice_lines__invoice__entity_id=entity_id)
        ).distinct()
        entities = entities.filter(pk=entity_id)
    return {
        "total_sales": money_str(_sum(sales, "net_amount")),
        "total_invoices": sales.count(),
        "total_collections": money_str(_sum(payments, "amount")),
        "total_outstanding": money_str(outstanding),
        "total_overdue": money_str(overdue),
        "total_advance": money_str(advance),
        "unadjusted_payments": money_str(advance),
        # TODO: Bad Debt stays 0 until a write-off / bad-debt module exists.
        "bad_debt": money_str(0),
        "total_pos": pos.count(),
        "pending_pos": pos.filter(status__in=PENDING_PO_STATUSES).count(),
        "dispatched_pos": pos.filter(status=PurchaseOrder.Status.FULLY_DISPATCHED).count(),
        "partially_dispatched_pos": pos.filter(status=PurchaseOrder.Status.PARTIALLY_DISPATCHED).count(),
        "active_customers": customers.distinct().count(),
        "active_brands": brands.count(),
        "active_products": products.count(),
        "active_entities": entities.count(),
    }


def _entity_turnover(entity_id=None) -> list[dict]:
    sales = Invoice.objects.filter(status__in=SALES_STATUSES)
    if entity_id:
        sales = sales.filter(entity_id=entity_id)
    rows = list(
        sales.values("entity_id", "entity__short_code", "entity__entity_name")
        .annotate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))
        .order_by("-total")
    )
    grand = sum((money(row["total"] or 0) for row in rows), Decimal("0.00"))
    out = []
    for row in rows:
        total = money(row["total"] or 0)
        percent = (total * Decimal("100") / grand) if grand else Decimal("0.00")
        out.append(
            {
                "entity_id": row["entity_id"],
                "short_code": row["entity__short_code"],
                "entity_name": row["entity__entity_name"],
                "total_sales": money_str(total),
                "percent": str(money(percent)),
            }
        )
    return out


def _category_share(entity_id=None) -> list[dict]:
    lines = InvoiceLine.objects.filter(
        invoice__status__in=SALES_STATUSES,
        product_id__isnull=False,
    )
    if entity_id:
        lines = lines.filter(invoice__entity_id=entity_id)
    grouped = {}
    for line in lines.select_related("product__category__parent_category"):
        category = line.product.category if line.product_id else None
        if category is None:
            name = "Uncategorised"
        elif category.parent_category_id:
            name = category.parent_category.category_name
        else:
            name = category.category_name
        grouped[name] = grouped.get(name, Decimal("0.00")) + money(line.quantity)
    grand = sum(grouped.values(), Decimal("0.00"))
    out = []
    for name, qty in sorted(grouped.items(), key=lambda item: item[1], reverse=True):
        percent = (qty * Decimal("100") / grand) if grand else Decimal("0.00")
        out.append(
            {
                "category_name": name,
                "quantity": money_str(qty),
                "percent": str(money(percent)),
            }
        )
    return out


def customer_unpaid_buckets(entity_id=None, customer_ids=None) -> dict:
    """Per-customer remaining / overdue from unpaid invoices.

    Shared by the Admin Dashboard debtor table and Reports → Outstanding.
    """
    today = timezone.localdate()
    unpaid = list(
        _invoice_qs(entity_id, customer_ids)
        .filter(status__in=UNPAID_STATUSES)
        .select_related("customer")
    )
    remaining = _remaining_by_invoice(unpaid)
    by_customer = {}
    for invoice in unpaid:
        left = remaining.get(invoice.id, Decimal("0.00"))
        if left <= 0:
            continue
        bucket = by_customer.setdefault(
            invoice.customer_id,
            {
                "customer": invoice.customer,
                "outstanding": Decimal("0.00"),
                "overdue_amount": Decimal("0.00"),
                "overdue": False,
                "due_soon": False,
                "max_overdue_days": 0,
            },
        )
        bucket["outstanding"] += left
        if invoice_is_overdue(invoice):
            bucket["overdue"] = True
            bucket["overdue_amount"] += left
            days = (today - invoice.due_date).days
            if days > bucket["max_overdue_days"]:
                bucket["max_overdue_days"] = days
        elif invoice.due_date and 0 <= (invoice.due_date - today).days <= 7:
            bucket["due_soon"] = True
    return by_customer


def customer_outstanding_report(entity_id=None, customer_ids=None) -> list[dict]:
    buckets = customer_unpaid_buckets(entity_id, customer_ids=customer_ids)
    if not buckets:
        return []
    primary = {
        row.customer_id: row.entity
        for row in CustomerEntity.objects.filter(
            customer_id__in=buckets.keys(),
            primary_entity=True,
        ).select_related("entity")
    }
    rows = []
    for customer_id, bucket in buckets.items():
        if bucket["outstanding"] <= 0:
            continue
        customer = bucket["customer"]
        entity = primary.get(customer_id)
        rows.append(
            {
                "customer_id": customer.id,
                "customer_code": customer.customer_code,
                "customer_name": customer.customer_name,
                "entity_id": entity.id if entity else None,
                "entity_short_code": entity.short_code if entity else "",
                "entity_name": entity.entity_name if entity else "",
                "outstanding_balance": money_str(bucket["outstanding"]),
                "overdue_amount": money_str(bucket["overdue_amount"]),
                "oldest_overdue_days": bucket["max_overdue_days"],
            }
        )
    rows.sort(key=lambda row: Decimal(row["outstanding_balance"]), reverse=True)
    return rows


def _debtors(entity_id=None) -> list[dict]:
    rows = []
    for bucket in customer_unpaid_buckets(entity_id).values():
        if bucket["outstanding"] <= 0:
            continue
        if bucket["overdue"]:
            risk = "Overdue"
        elif bucket["due_soon"]:
            risk = "Due Soon"
        else:
            risk = "Current"
        customer = bucket["customer"]
        rows.append(
            {
                "customer_id": customer.id,
                "customer_code": customer.customer_code,
                "customer_name": customer.customer_name,
                "outstanding": money_str(bucket["outstanding"]),
                "credit_days": customer.credit_days,
                "days_overdue": bucket["max_overdue_days"],
                "risk_band": risk,
            }
        )
    rows.sort(key=lambda row: Decimal(row["outstanding"]), reverse=True)
    return rows


def _top_products(entity_id=None, limit=5) -> list[dict]:
    lines = InvoiceLine.objects.filter(
        invoice__status__in=SALES_STATUSES,
        product_id__isnull=False,
    )
    if entity_id:
        lines = lines.filter(invoice__entity_id=entity_id)
    rows = (
        lines.values("product_id", "product__product_code", "product__product_name")
        .annotate(quantity=Sum("quantity"))
        .order_by("-quantity")[:limit]
    )
    return [
        {
            "product_id": row["product_id"],
            "product_code": row["product__product_code"],
            "product_name": row["product__product_name"],
            "quantity": money_str(row["quantity"] or 0),
        }
        for row in rows
    ]


def _entity_options() -> list[dict]:
    return [
        {
            "id": row.id,
            "short_code": row.short_code,
            "entity_name": row.entity_name,
        }
        for row in Entity.objects.all().order_by("short_code")
    ]


def admin_snapshot(entity_id=None) -> dict:
    return {
        "kpis": _kpis(entity_id),
        "entity_turnover": _entity_turnover(entity_id),
        "category_share": _category_share(entity_id),
        "debtors": _debtors(entity_id),
        "top_products": _top_products(entity_id),
        "entities": _entity_options(),
    }


def staff_snapshot(user) -> dict:
    """Records created by the logged-in user.

    TODO: once roles/permissions exist, scope this to assigned customers
    instead of created_by == current user.
    """
    pos = PurchaseOrder.objects.filter(created_by=user)
    invoices = Invoice.objects.filter(created_by=user)
    from dispatches.models import Dispatch

    dispatches = Dispatch.objects.filter(created_by=user)
    payments = Payment.objects.filter(created_by=user)
    pending_pos = pos.filter(status__in=PENDING_PO_STATUSES)
    pending_invoices = invoices.filter(status__in=PENDING_INVOICE_STATUSES)

    def _po_row(row):
        return {
            "id": row.id,
            "po_number": row.po_number,
            "status": row.status,
            "po_date": row.po_date.isoformat(),
            "customer_name": row.customer.customer_name,
        }

    def _inv_row(row):
        return {
            "id": row.id,
            "invoice_number": row.invoice_number,
            "status": row.status,
            "invoice_date": row.invoice_date.isoformat(),
            "net_amount": money_str(row.net_amount),
        }

    def _dsp_row(row):
        return {
            "id": row.id,
            "lr_number": row.lr_number,
            "dispatch_date": row.dispatch_date.isoformat(),
            "po_number": row.purchase_order.po_number,
            "transporter": row.transporter,
        }

    def _pay_row(row):
        return {
            "id": row.id,
            "payment_number": row.payment_number,
            "payment_date": row.payment_date.isoformat(),
            "amount": money_str(row.amount),
            "customer_name": row.customer.customer_name,
        }

    return {
        "kpis": {
            "purchase_orders_created": pos.count(),
            "pending_pos_created": pending_pos.count(),
            "pending_invoices_created": pending_invoices.count(),
            "dispatches_recorded": dispatches.count(),
            "payments_recorded": payments.count(),
        },
        "recent_purchase_orders": [
            _po_row(row) for row in pos.select_related("customer").order_by("-id")[:8]
        ],
        "pending_purchase_orders": [
            _po_row(row) for row in pending_pos.select_related("customer").order_by("-id")[:8]
        ],
        "pending_invoices": [
            _inv_row(row) for row in pending_invoices.order_by("-id")[:8]
        ],
        "recent_dispatches": [
            _dsp_row(row)
            for row in dispatches.select_related("purchase_order").order_by("-id")[:8]
        ],
        "recent_payments": [
            _pay_row(row) for row in payments.select_related("customer").order_by("-id")[:8]
        ],
    }
