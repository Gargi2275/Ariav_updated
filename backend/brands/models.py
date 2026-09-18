"""Brand Master — mill/label commercial terms, independent of Entity.

Product (not built yet) will have a required brand_id FK to Brand.
Do not add entity_id: Brand and Entity are unrelated master hierarchies.
"""

from django.conf import settings
from django.db import models


class Brand(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    class OrderMethod(models.TextChoices):
        DIGITAL_PO = "Digital PO", "Digital PO"
        MANUAL_POR = "Manual/POR", "Manual/POR"

    class CommissionBasis(models.TextChoices):
        INVOICE_VALUE = "% of invoice value", "% of invoice value"
        QUANTITY = "% of quantity", "% of quantity"
        FIXED_PER_ORDER = "Fixed per order", "Fixed per order"

    brand_code = models.CharField(max_length=20, unique=True)
    brand_name = models.CharField(max_length=200)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_brands",
    )

    contact_person = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    mobile = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)

    gst_no = models.CharField(max_length=20, blank=True)
    pan_no = models.CharField(max_length=16, blank=True)

    commission_rate = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    commission_basis = models.CharField(
        max_length=40,
        choices=CommissionBasis.choices,
        default=CommissionBasis.INVOICE_VALUE,
        blank=True,
    )
    payment_terms = models.TextField(blank=True)
    credit_days = models.PositiveIntegerField(default=0)

    order_method = models.CharField(max_length=20, choices=OrderMethod.choices)

    class Meta:
        db_table = "brands_brand"
        ordering = ["brand_code"]

    def __str__(self):
        return f"{self.brand_code} {self.brand_name}"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE
