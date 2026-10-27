"""Dispatch — one physical shipment event against a Purchase Order."""

from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Dispatch(models.Model):
    purchase_order = models.ForeignKey(
        "purchase_orders.PurchaseOrder",
        on_delete=models.PROTECT,
        related_name="dispatches",
    )
    dispatch_date = models.DateField(default=date.today)
    lr_number = models.CharField(max_length=80)
    transporter = models.CharField(max_length=160)
    challan_reference = models.CharField(max_length=80)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_dispatches",
    )

    class Meta:
        db_table = "dispatches_dispatch"
        ordering = ["-dispatch_date", "-id"]

    def __str__(self):
        return f"{self.lr_number} / {self.purchase_order_id}"


class DispatchLine(models.Model):
    dispatch = models.ForeignKey(
        Dispatch,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    purchase_order_line = models.ForeignKey(
        "purchase_orders.PurchaseOrderLine",
        on_delete=models.PROTECT,
        related_name="dispatch_lines",
    )
    dispatched_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    dispatched_meters = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    source_rate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Sales order price from the plant dispatch. Null means the rate was not recorded.",
    )
    net_rate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Net rate per metre after discount. Not used as the PO rate comparison.",
    )

    class Meta:
        db_table = "dispatches_dispatchline"
        ordering = ["id"]

    def __str__(self):
        return f"{self.dispatch_id} line {self.pk}"


class OcmDispatchSource(models.Model):
    """Stops the same OCM invoice line from being counted twice."""

    invoice_no = models.CharField(max_length=80)
    invoice_line = models.CharField(max_length=40)
    dispatch_line = models.OneToOneField(
        DispatchLine,
        on_delete=models.CASCADE,
        related_name="ocm_source",
    )

    class Meta:
        db_table = "dispatches_ocmdispatchsource"
        constraints = [
            models.UniqueConstraint(fields=["invoice_no", "invoice_line"], name="ocm_dispatch_invoice_line_unique"),
        ]
