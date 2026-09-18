"""Customer payments and invoice allocations."""

from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Payment(models.Model):
    class PaymentMode(models.TextChoices):
        CASH = "Cash", "Cash"
        CHEQUE = "Cheque", "Cheque"
        BANK_TRANSFER = "Bank Transfer", "Bank Transfer"
        UPI = "UPI", "UPI"
        RTGS = "RTGS", "RTGS"
        NEFT = "NEFT", "NEFT"
        OTHER = "Other", "Other"

    payment_number = models.CharField(max_length=40, unique=True)
    payment_date = models.DateField(default=date.today)
    entity = models.ForeignKey(
        "entities.Entity",
        on_delete=models.PROTECT,
        related_name="payments",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="payments",
    )
    customer_code = models.CharField(max_length=30)
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    payment_mode = models.CharField(max_length=24, choices=PaymentMode.choices)
    bank_cash_account = models.CharField(max_length=120)
    transaction_reference = models.CharField(max_length=80, blank=True)
    remarks = models.TextField(blank=True)
    unallocated_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_payments",
    )

    class Meta:
        db_table = "payments_payment"
        ordering = ["-payment_date", "-id"]

    def __str__(self):
        return f"{self.payment_number} {self.amount}"


class PaymentAllocation(models.Model):
    payment = models.ForeignKey(
        Payment,
        on_delete=models.CASCADE,
        related_name="allocations",
    )
    invoice = models.ForeignKey(
        "invoices.Invoice",
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    allocated_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    class Meta:
        db_table = "payments_paymentallocation"
        ordering = ["id"]

    def __str__(self):
        return f"{self.payment_id} → {self.invoice_id} {self.allocated_amount}"


class PaymentAdjustment(models.Model):
    """Audit record for applying an existing payment's unallocated balance.

    Money movement stays on PaymentAllocation. This row is created only when
    POST /api/payments/:id/allocate/ runs — not when a payment is first recorded.

    TODO: once roles/permissions exist, apply a configurable amount threshold
    and a pending-approval queue instead of auto-approving every adjustment.
    There is currently no threshold — every allocate action is Approved
    immediately (approved_by = created_by, approved_at = now).
    """

    class Status(models.TextChoices):
        PENDING_APPROVAL = "Pending Approval", "Pending Approval"
        APPROVED = "Approved", "Approved"
        REJECTED = "Rejected", "Rejected"

    payment = models.ForeignKey(
        Payment,
        on_delete=models.CASCADE,
        related_name="adjustments",
    )
    payment_allocation = models.ForeignKey(
        PaymentAllocation,
        on_delete=models.SET_NULL,
        null=True,
        related_name="adjustments",
    )
    invoice = models.ForeignKey(
        "invoices.Invoice",
        on_delete=models.PROTECT,
        related_name="payment_adjustments",
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    reason = models.CharField(max_length=255)
    reference = models.CharField(max_length=80, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_payment_adjustments",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_payment_adjustments",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.APPROVED,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payments_paymentadjustment"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.payment_id} adj {self.amount}"
