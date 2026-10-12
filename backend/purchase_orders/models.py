"""Purchase Order — Digital PO and Manual/POR on one document model.

order_type is derived from Brand.order_method at save (not staff-chosen).
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class PurchaseOrder(models.Model):
    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        SUBMITTED = "Submitted", "Submitted"
        SENT_TO_BRAND = "Sent to Brand", "Sent to Brand"
        BRAND_ACCEPTED = "Brand Accepted", "Brand Accepted"
        PARTIALLY_DISPATCHED = "Partially Dispatched", "Partially Dispatched"
        FULLY_DISPATCHED = "Fully Dispatched", "Fully Dispatched"
        CLOSED = "Closed", "Closed"
        REJECTED = "Rejected", "Rejected"
        CANCELLED = "Cancelled", "Cancelled"
        ON_HOLD = "On Hold", "On Hold"

    class OrderType(models.TextChoices):
        DIGITAL = "Digital", "Digital"
        MANUAL = "Manual", "Manual"

    po_number = models.CharField(max_length=40, unique=True)
    brand_order_code = models.CharField(max_length=80, null=True, blank=True, db_index=True)
    order_type = models.CharField(
        max_length=16,
        choices=OrderType.choices,
        default=OrderType.DIGITAL,
    )
    entity = models.ForeignKey(
        "entities.Entity",
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    brand = models.ForeignKey(
        "brands.Brand",
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    po_date = models.DateField(default=date.today)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    remarks = models.TextField(blank=True)
    source_format = models.CharField(max_length=80, blank=True)
    extra_data = models.JSONField(default=dict)
    handy_form_upload = models.FileField(upload_to="po_handy_forms/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_purchase_orders",
    )

    class Meta:
        db_table = "purchase_orders_purchaseorder"
        ordering = ["-po_date", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["brand", "brand_order_code"],
                name="purchase_order_brand_order_code_unique",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.brand_order_code is not None and not self.brand_order_code.strip():
            self.brand_order_code = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.po_number} {self.order_type} {self.status}"

    @property
    def is_draft(self) -> bool:
        return self.status == self.Status.DRAFT

    @property
    def is_terminal(self) -> bool:
        return self.status in {
            self.Status.CLOSED,
            self.Status.REJECTED,
            self.Status.CANCELLED,
        }


class PurchaseOrderStatusChange(models.Model):
    """One row per PO status change, written only by transitions.apply_status_change."""

    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        DISPATCH_AUTO = "dispatch_auto", "Dispatch (automatic)"
        IMPORT = "import", "Import"
        CORRECTION = "correction", "Correction"
        RATE_FILL = "rate_fill", "Rate filled"

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="status_changes",
    )
    from_status = models.CharField(max_length=32)
    to_status = models.CharField(max_length=32)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="po_status_changes",
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(max_length=16, choices=Source.choices)
    reason = models.TextField(blank=True)
    purchase_order_line = models.ForeignKey(
        "PurchaseOrderLine",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="rate_history",
    )
    rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "purchase_orders_purchaseorderstatuschange"
        ordering = ["changed_at", "id"]

    def __str__(self):
        return f"{self.purchase_order_id} {self.from_status} -> {self.to_status}"


class PurchaseOrderLine(models.Model):
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="purchase_order_lines",
        null=True,
        blank=True,
    )
    product_description = models.CharField(max_length=240, blank=True)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    expected_delivery_period = models.CharField(max_length=160, blank=True)
    customer_delivery_date = models.DateField(null=True, blank=True)
    extra_data = models.JSONField(default=dict)

    class Meta:
        db_table = "purchase_orders_purchaseorderline"
        ordering = ["id"]

    def save(self, *args, **kwargs):
        qty = self.quantity if self.quantity is not None else Decimal("0")
        self.line_total = (
            (qty * self.rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if self.rate is not None
            else None
        )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.purchase_order_id} line {self.pk}"
