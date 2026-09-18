"""Create in-app notifications for invoice reminders and document events."""

from datetime import datetime, time, timedelta

from django.conf import settings
from django.utils import timezone

from invoices.models import Invoice
from invoices.services import invoice_is_overdue, money

from .models import Notification

UPCOMING_DUE_DAYS_DEFAULT = 3


def upcoming_due_days() -> int:
    return int(getattr(settings, "NOTIFICATION_UPCOMING_DUE_DAYS", UPCOMING_DUE_DAYS_DEFAULT))


def _rupee(value) -> str:
    q = money(value)
    text = format(q, "f")
    if text.endswith(".00"):
        text = text[:-3]
    else:
        text = text.rstrip("0").rstrip(".")
    return f"₹{text}"


def _start_of_local_day():
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime.combine(timezone.localdate(), time.min), tz)


def _already_notified(notification_type, reference_type, reference_id, *, since) -> bool:
    return Notification.objects.filter(
        notification_type=notification_type,
        reference_type=reference_type,
        reference_id=reference_id,
        created_at__gte=since,
    ).exists()


def emit_in_app_notification(
    *,
    notification_type,
    title,
    message,
    reference_type,
    reference_id,
    customer_id=None,
    entity_id=None,
    recipient_user=None,
) -> Notification:
    """Persist an In-App row. Other channels are schema-only (no delivery)."""
    return Notification.objects.create(
        notification_type=notification_type,
        title=title,
        message=message,
        reference_type=reference_type,
        reference_id=reference_id,
        customer_id=customer_id,
        entity_id=entity_id,
        recipient_user=recipient_user,
        status=Notification.Status.UNREAD,
        channel=Notification.Channel.IN_APP,
        delivery_status=Notification.DeliveryStatus.SENT,
    )


def notify_payment_created(payment) -> Notification:
    customer_name = payment.customer.customer_name if payment.customer_id else payment.customer_code
    title = f"Payment {payment.payment_number} received"
    message = (
        f"Payment {payment.payment_number} of {_rupee(payment.amount)} "
        f"({payment.payment_mode}) recorded for {customer_name}."
    )
    return emit_in_app_notification(
        notification_type=Notification.NotificationType.PAYMENT_CONFIRMATION,
        title=title,
        message=message,
        reference_type=Notification.ReferenceType.PAYMENT,
        reference_id=payment.id,
        customer_id=payment.customer_id,
        entity_id=payment.entity_id,
    )


def notify_po_status_changed(po) -> Notification:
    title = f"PO {po.po_number} marked {po.status}"
    message = f"Purchase order {po.po_number} is now {po.status}."
    return emit_in_app_notification(
        notification_type=Notification.NotificationType.PO_NOTIFICATION,
        title=title,
        message=message,
        reference_type=Notification.ReferenceType.PURCHASE_ORDER,
        reference_id=po.id,
        customer_id=po.customer_id,
        entity_id=po.entity_id,
    )


def notify_dispatch_created(dispatch) -> Notification:
    po = dispatch.purchase_order
    title = f"Dispatch recorded against PO {po.po_number}"
    message = (
        f"Dispatch recorded against PO {po.po_number} — "
        f"LR {dispatch.lr_number}, Transporter {dispatch.transporter}."
    )
    return emit_in_app_notification(
        notification_type=Notification.NotificationType.DISPATCH_NOTIFICATION,
        title=title,
        message=message,
        reference_type=Notification.ReferenceType.DISPATCH,
        reference_id=dispatch.id,
        customer_id=po.customer_id,
        entity_id=po.entity_id,
    )


def _notify_invoice_reminder(invoice, notification_type, title, message) -> Notification | None:
    return emit_in_app_notification(
        notification_type=notification_type,
        title=title,
        message=message,
        reference_type=Notification.ReferenceType.INVOICE,
        reference_id=invoice.id,
        customer_id=invoice.customer_id,
        entity_id=invoice.entity_id,
    )


def generate_due_reminders(*, upcoming_days: int | None = None) -> dict:
    """Scan issued invoices and create Upcoming Due / Due Today / Overdue rows.

    Idempotent: Upcoming Due and Due Today skip if the same invoice+type was
    created in the last 24 hours. Overdue is throttled to once per local day.
    """
    days = upcoming_days if upcoming_days is not None else upcoming_due_days()
    today = timezone.localdate()
    since_24h = timezone.now() - timedelta(hours=24)
    since_today = _start_of_local_day()
    open_statuses = {Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID}
    created = {"upcoming_due": 0, "due_today": 0, "overdue": 0}

    upcoming_date = today + timedelta(days=days)
    upcoming_qs = Invoice.objects.filter(status__in=open_statuses, due_date=upcoming_date)
    for invoice in upcoming_qs:
        if _already_notified(
            Notification.NotificationType.UPCOMING_DUE,
            Notification.ReferenceType.INVOICE,
            invoice.id,
            since=since_24h,
        ):
            continue
        when = "tomorrow" if days == 1 else f"in {days} days"
        _notify_invoice_reminder(
            invoice,
            Notification.NotificationType.UPCOMING_DUE,
            f"Invoice {invoice.invoice_number} due {when}",
            (
                f"Invoice {invoice.invoice_number} for {invoice.customer.customer_name} "
                f"({_rupee(invoice.net_amount)}) is due on {invoice.due_date.isoformat()}."
            ),
        )
        created["upcoming_due"] += 1

    due_today_qs = Invoice.objects.filter(status__in=open_statuses, due_date=today)
    for invoice in due_today_qs:
        if _already_notified(
            Notification.NotificationType.DUE_TODAY,
            Notification.ReferenceType.INVOICE,
            invoice.id,
            since=since_24h,
        ):
            continue
        _notify_invoice_reminder(
            invoice,
            Notification.NotificationType.DUE_TODAY,
            f"Invoice {invoice.invoice_number} due today",
            (
                f"Invoice {invoice.invoice_number} for {invoice.customer.customer_name} "
                f"({_rupee(invoice.net_amount)}) is due today."
            ),
        )
        created["due_today"] += 1

    overdue_qs = Invoice.objects.filter(status__in=open_statuses, due_date__lt=today)
    for invoice in overdue_qs:
        if not invoice_is_overdue(invoice):
            continue
        if _already_notified(
            Notification.NotificationType.OVERDUE,
            Notification.ReferenceType.INVOICE,
            invoice.id,
            since=since_today,
        ):
            continue
        _notify_invoice_reminder(
            invoice,
            Notification.NotificationType.OVERDUE,
            f"Invoice {invoice.invoice_number} is overdue",
            (
                f"Invoice {invoice.invoice_number} for {invoice.customer.customer_name} "
                f"({_rupee(invoice.net_amount)}) was due on {invoice.due_date.isoformat()}."
            ),
        )
        created["overdue"] += 1

    return created
