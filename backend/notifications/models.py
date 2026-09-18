"""In-app reminders and event notifications.

Email/SMS/WhatsApp exist as channel choices only — no external delivery is wired.
Admin Access Request is a defined type that stays unused until Admin PIN Approval
(#25) exists; nothing in this app creates those rows yet.
"""

from django.conf import settings
from django.db import models


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        UPCOMING_DUE = "Upcoming Due", "Upcoming Due"
        DUE_TODAY = "Due Today", "Due Today"
        OVERDUE = "Overdue", "Overdue"
        PAYMENT_CONFIRMATION = "Payment Confirmation", "Payment Confirmation"
        PO_NOTIFICATION = "PO Notification", "PO Notification"
        DISPATCH_NOTIFICATION = "Dispatch Notification", "Dispatch Notification"
        # TODO: emit this type once Admin PIN Approval (#25) is built.
        ADMIN_ACCESS_REQUEST = "Admin Access Request", "Admin Access Request"

    class ReferenceType(models.TextChoices):
        INVOICE = "Invoice", "Invoice"
        PURCHASE_ORDER = "PurchaseOrder", "PurchaseOrder"
        DISPATCH = "Dispatch", "Dispatch"
        PAYMENT = "Payment", "Payment"
        ADMIN_ACCESS_REQUEST = "AdminAccessRequest", "AdminAccessRequest"

    class Status(models.TextChoices):
        UNREAD = "Unread", "Unread"
        READ = "Read", "Read"
        DISMISSED = "Dismissed", "Dismissed"

    class Channel(models.TextChoices):
        IN_APP = "In-App", "In-App"
        EMAIL = "Email", "Email"
        SMS = "SMS", "SMS"
        WHATSAPP = "WhatsApp", "WhatsApp"

    class DeliveryStatus(models.TextChoices):
        SENT = "Sent", "Sent"
        FAILED = "Failed", "Failed"
        PENDING = "Pending", "Pending"
        NOT_APPLICABLE = "Not Applicable", "Not Applicable"

    notification_type = models.CharField(max_length=32, choices=NotificationType.choices)
    title = models.CharField(max_length=255)
    message = models.TextField()
    reference_type = models.CharField(max_length=24, choices=ReferenceType.choices)
    reference_id = models.PositiveIntegerField()
    customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="notifications",
    )
    entity = models.ForeignKey(
        "entities.Entity",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="notifications",
    )
    recipient_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="notifications",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.UNREAD,
    )
    channel = models.CharField(
        max_length=16,
        choices=Channel.choices,
        default=Channel.IN_APP,
    )
    delivery_status = models.CharField(
        max_length=24,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.SENT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications_notification"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(
                fields=["notification_type", "reference_type", "reference_id", "created_at"],
                name="notif_type_ref_created_idx",
            ),
            models.Index(fields=["status", "created_at"], name="notif_status_created_idx"),
        ]

    def __str__(self):
        return f"{self.notification_type}: {self.title}"
