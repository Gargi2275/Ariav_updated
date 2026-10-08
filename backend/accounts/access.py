"""Shared admin/operator access helpers.

This is not the full roles/permissions module — only the existing
AuthUser.role admin vs operator split, plus the one rule for which
Customers' transactions an operator may see.
"""

from django.db.models import Q


def is_admin_user(user) -> bool:
    return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "is_admin_role", False))


def customers_visible_to(user):
    """Customers whose Purchase Orders, Dispatches, Invoices and Payments this user may see.

    Admin: every Customer. Operator: Customers on at least one Purchase Order,
    Invoice, Payment or Dispatch the operator created. Anyone else: none.
    Returns a lazy Customer queryset so callers can use it as a subquery.
    """
    from customers.models import Customer
    from dispatches.models import Dispatch
    from invoices.models import Invoice
    from payments.models import Payment
    from purchase_orders.models import PurchaseOrder

    if not (user and getattr(user, "is_authenticated", False)):
        return Customer.objects.none()
    if is_admin_user(user):
        return Customer.objects.all()
    return Customer.objects.filter(
        Q(id__in=PurchaseOrder.objects.filter(created_by=user).values("customer_id"))
        | Q(id__in=Invoice.objects.filter(created_by=user).values("customer_id"))
        | Q(id__in=Payment.objects.filter(created_by=user).values("customer_id"))
        | Q(id__in=Dispatch.objects.filter(created_by=user).values("purchase_order__customer_id"))
    )


def scope_to_visible_customers(qs, user, field: str = "customer_id"):
    """Filter any queryset by `field` ∈ customers_visible_to(user). Admins are unfiltered."""
    if is_admin_user(user):
        return qs
    return qs.filter(**{f"{field}__in": customers_visible_to(user).values("id")})


def visible_customer_ids(user) -> set[int] | None:
    """Materialised form for in-Python checks. None means unrestricted (admin)."""
    if is_admin_user(user):
        return None
    return set(customers_visible_to(user).values_list("id", flat=True))


def can_view_customer(user, customer_id) -> bool:
    if is_admin_user(user):
        return True
    return customers_visible_to(user).filter(pk=customer_id).exists()
