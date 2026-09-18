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

    class Meta:
        db_table = "dispatches_dispatchline"
        ordering = ["id"]

    def __str__(self):
        return f"{self.dispatch_id} line {self.pk}"
