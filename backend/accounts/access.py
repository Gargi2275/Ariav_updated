"""Shared admin/operator access helpers.

This is not the full roles/permissions module — only the existing
AuthUser.role admin vs operator split.
"""

from django.db.models import Q


def is_admin_user(user) -> bool:
    return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "is_admin_role", False))


def operator_related_customer_ids(user) -> set[int]:
    from invoices.models import Invoice
    from payments.models import Payment
    from purchase_orders.models import PurchaseOrder

    ids = set()
    ids.update(PurchaseOrder.objects.filter(created_by=user).values_list("customer_id", flat=True))
    ids.update(Invoice.objects.filter(created_by=user).values_list("customer_id", flat=True))
    ids.update(Payment.objects.filter(created_by=user).values_list("customer_id", flat=True))
    return {cid for cid in ids if cid}


def operator_can_view_customer(user, customer) -> bool:
    if is_admin_user(user):
        return True
    return customer.pk in operator_related_customer_ids(user)


def operator_notification_filter(user) -> Q:
    """Notifications for records this operator created, or addressed to them."""
    from dispatches.models import Dispatch
    from invoices.models import Invoice
    from payments.models import Payment
    from purchase_orders.models import PurchaseOrder

    q = Q(recipient_user=user)
    po_ids = list(PurchaseOrder.objects.filter(created_by=user).values_list("id", flat=True))
    inv_ids = list(Invoice.objects.filter(created_by=user).values_list("id", flat=True))
    dsp_ids = list(Dispatch.objects.filter(created_by=user).values_list("id", flat=True))
    pay_ids = list(Payment.objects.filter(created_by=user).values_list("id", flat=True))
    if po_ids:
        q |= Q(reference_type="PurchaseOrder", reference_id__in=po_ids)
    if inv_ids:
        q |= Q(reference_type="Invoice", reference_id__in=inv_ids)
    if dsp_ids:
        q |= Q(reference_type="Dispatch", reference_id__in=dsp_ids)
    if pay_ids:
        q |= Q(reference_type="Payment", reference_id__in=pay_ids)
    return q
