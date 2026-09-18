"""Client Invoice — billed against dispatched (not yet invoiced) PO quantities."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Invoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        ISSUED = "Issued", "Issued"
        PARTIALLY_PAID = "Partially Paid", "Partially Paid"
        PAID = "Paid", "Paid"
        OVERDUE = "Overdue", "Overdue"
        CANCELLED = "Cancelled", "Cancelled"
        ADJUSTED = "Adjusted", "Adjusted"

    invoice_number = models.CharField(max_length=40, unique=True)
    invoice_date = models.DateField(default=date.today)
    due_date = models.DateField()
    entity = models.ForeignKey(
        "entities.Entity",
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    customer_code = models.CharField(max_length=30)
    purchase_order = models.ForeignKey(
        "purchase_orders.PurchaseOrder",
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    brand = models.ForeignKey(
        "brands.Brand",
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)
    discount_percent = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_percent = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    other_charges = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_terms = models.CharField(max_length=160, blank=True)
    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_invoices",
    )

    class Meta:
        db_table = "invoices_invoice"
        ordering = ["-invoice_date", "-id"]

    def __str__(self):
        return f"{self.invoice_number} {self.status}"

    @property
    def is_draft(self) -> bool:
        return self.status == self.Status.DRAFT

    @property
    def is_terminal(self) -> bool:
        return self.status in {
            self.Status.PAID,
            self.Status.CANCELLED,
            self.Status.ADJUSTED,
        }


class InvoiceLine(models.Model):
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    purchase_order_line = models.ForeignKey(
        "purchase_orders.PurchaseOrderLine",
        on_delete=models.PROTECT,
        related_name="invoice_lines",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="invoice_lines",
        null=True,
        blank=True,
    )
    product_description = models.CharField(max_length=240, blank=True)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "invoices_invoiceline"
        ordering = ["id"]

    def save(self, *args, **kwargs):
        qty = self.quantity if self.quantity is not None else Decimal("0")
        rate = self.rate if self.rate is not None else Decimal("0")
        self.line_total = (qty * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice_id} line {self.pk}"
