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
    place = models.CharField(max_length=80, blank=True)
    mode_of_despatch = models.CharField(max_length=80, blank=True)
    destination = models.CharField(max_length=120, blank=True)
    documents_through = models.CharField(max_length=120, blank=True)
    special_instructions = models.TextField(blank=True)
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


class ManualPoNumberSequence(models.Model):
    """Issued manual PO sequence for one branch-letter, brand-letter, month, and year.

    last_value only moves forward. Deleting or cancelling a purchase order does not
    return a number to the pool. The row is locked while a number is allocated.
    """

    scope = models.CharField(max_length=6, unique=True)
    last_value = models.PositiveSmallIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "purchase_orders_manualposequence"

    def __str__(self):
        return f"{self.scope} {self.last_value:02d}"


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
    class Unit(models.TextChoices):
        PIECES = "Pieces", "Pieces"
        METERS = "Meters", "Meters"

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
    rate_source = models.CharField(max_length=240, blank=True)
    shade = models.CharField(max_length=40, blank=True)
    size = models.CharField(max_length=40, blank=True)
    unit = models.CharField(max_length=16, choices=Unit.choices, default=Unit.PIECES)
    delivery_from = models.DateField(null=True, blank=True)
    delivery_to = models.DateField(null=True, blank=True)
    line_remarks = models.CharField(max_length=240, blank=True)
    form_row_no = models.PositiveIntegerField(null=True, blank=True)
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


class OfficialOcmImport(models.Model):
    """One uploaded official OCM workbook. The checksum stops the same file creating a second copy."""

    brand = models.ForeignKey(
        "brands.Brand",
        on_delete=models.PROTECT,
        related_name="official_ocm_imports",
    )
    filename = models.CharField(max_length=240)
    checksum = models.CharField(max_length=64, unique=True)
    source_file = models.FileField(upload_to="ocm_official/", blank=True)
    imported_at = models.DateTimeField(auto_now_add=True)
    imported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="official_ocm_imports",
    )

    class Meta:
        db_table = "purchase_orders_officialocmimport"


class OfficialOcmOrder(models.Model):
    class Status(models.TextChoices):
        AWAITING_REVIEW = "Awaiting Review", "Awaiting Review"
        READY = "Ready for Approval", "Ready for Approval"
        APPROVED = "Approved", "Approved"
        NEEDS_REVIEW = "Needs Review", "Needs Review"

    import_batch = models.ForeignKey(
        OfficialOcmImport,
        on_delete=models.PROTECT,
        related_name="orders",
    )
    brand = models.ForeignKey(
        "brands.Brand",
        on_delete=models.PROTECT,
        related_name="official_ocm_orders",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="official_ocm_orders",
    )
    purchase_order = models.OneToOneField(
        PurchaseOrder,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="official_ocm_order",
    )
    candidate_purchase_order = models.ForeignKey(
        PurchaseOrder,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="official_ocm_candidates",
    )
    order_number = models.CharField(max_length=80)
    season = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.AWAITING_REVIEW)
    customer_code = models.CharField(max_length=80, blank=True)
    customer_name = models.CharField(max_length=240, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_official_ocm_orders",
    )

    class Meta:
        db_table = "purchase_orders_officialocmorder"
        constraints = [
            models.UniqueConstraint(fields=["brand", "order_number"], name="official_ocm_order_number_unique"),
        ]

    def __str__(self):
        return self.order_number


class OfficialOcmOrderLine(models.Model):
    order = models.ForeignKey(OfficialOcmOrder, on_delete=models.CASCADE, related_name="lines")
    row_number = models.PositiveIntegerField()
    code1 = models.CharField(max_length=80, blank=True)
    code2 = models.CharField(max_length=80, blank=True)
    code3 = models.CharField(max_length=80, blank=True)
    code4 = models.CharField(max_length=80, blank=True)
    code5 = models.CharField(max_length=80, blank=True)
    code6 = models.CharField(max_length=80, blank=True)
    template = models.CharField(max_length=80, blank=True)
    size = models.CharField(max_length=80, blank=True)
    identity_key = models.CharField(max_length=520)
    ordered_qty = models.DecimalField(max_digits=12, decimal_places=2)
    dispatched_qty = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    packed_qty = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    allocated_qty = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    pending_qty = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    delivery_start = models.DateField(null=True, blank=True)
    delivery_end = models.DateField(null=True, blank=True)
    duplicate = models.BooleanField(default=False)
    raw = models.JSONField(default=dict)

    class Meta:
        db_table = "purchase_orders_officialocmorderline"
        ordering = ["row_number", "id"]


class OcmProductMapping(models.Model):
    """Approved link from a full OCM code identity to an internal product or quality label."""

    brand = models.ForeignKey("brands.Brand", on_delete=models.PROTECT, related_name="ocm_product_mappings")
    identity_key = models.CharField(max_length=520)
    code1 = models.CharField(max_length=80, blank=True)
    code2 = models.CharField(max_length=80, blank=True)
    code3 = models.CharField(max_length=80, blank=True)
    code4 = models.CharField(max_length=80, blank=True)
    code5 = models.CharField(max_length=80, blank=True)
    code6 = models.CharField(max_length=80, blank=True)
    template = models.CharField(max_length=80, blank=True)
    size = models.CharField(max_length=80, blank=True)
    product = models.ForeignKey(
        "products.Product",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ocm_mappings",
    )
    quality_label = models.CharField(max_length=240, blank=True)
    shade = models.CharField(max_length=40, blank=True)
    approved = models.BooleanField(default=False)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ocm_product_mappings",
    )

    class Meta:
        db_table = "purchase_orders_ocmproductmapping"
        constraints = [
            models.UniqueConstraint(fields=["brand", "identity_key"], name="ocm_product_mapping_identity_unique"),
        ]


class OfficialOcmAudit(models.Model):
    order = models.ForeignKey(OfficialOcmOrder, on_delete=models.CASCADE, related_name="audit_events")
    action = models.CharField(max_length=40)
    reason = models.TextField(blank=True)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="official_ocm_audit_events",
    )

    class Meta:
        db_table = "purchase_orders_officialocmaudit"
        ordering = ["created_at", "id"]


class EmailSettings(models.Model):
    """One row. The mailbox can be changed here. The API never returns the password."""

    class AfterSend(models.TextChoices):
        NONE = "none", "None"
        ASK = "ask", "Ask"
        MARK_SENT_TO_BRAND = "mark_sent_to_brand", "Mark sent to brand"

    enabled = models.BooleanField(default=False)
    from_name = models.CharField(max_length=120, blank=True)
    smtp_host = models.CharField(max_length=200, blank=True)
    smtp_port = models.PositiveIntegerField(default=587)
    smtp_user = models.CharField(max_length=254, blank=True)
    smtp_password = models.CharField(max_length=200, blank=True)
    from_email = models.CharField(max_length=254, blank=True)
    reply_to_default = models.EmailField(blank=True)
    daily_cap = models.PositiveIntegerField(default=100)
    per_minute_cap = models.PositiveSmallIntegerField(default=10)
    require_preview = models.BooleanField(default=True)
    after_send_status_action = models.CharField(
        max_length=32,
        choices=AfterSend.choices,
        default=AfterSend.ASK,
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="email_settings_updates",
    )

    class Meta:
        db_table = "purchase_orders_emailsettings"


class BrandEmailConfig(models.Model):
    brand = models.OneToOneField(
        "brands.Brand",
        on_delete=models.CASCADE,
        related_name="email_config",
    )
    to_addresses = models.JSONField(default=list, blank=True)
    cc_addresses = models.JSONField(default=list, blank=True)
    bcc_addresses = models.JSONField(default=list, blank=True)
    subject_template = models.CharField(max_length=200, blank=True)
    body_template = models.TextField(blank=True)
    attach_pdf = models.BooleanField(default=True)
    include_rates = models.BooleanField(default=False)
    copy_label = models.CharField(max_length=80, default="Mill's Copy")
    require_preview = models.BooleanField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "purchase_orders_brandemailconfig"


class EmailOutbox(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        UNKNOWN = "unknown", "Unknown"

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name="email_outbox",
    )
    brand = models.ForeignKey(
        "brands.Brand",
        on_delete=models.PROTECT,
        related_name="email_outbox",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="purchase_order_emails",
    )
    to_addresses = models.JSONField(default=list)
    cc_addresses = models.JSONField(default=list, blank=True)
    bcc_addresses = models.JSONField(default=list, blank=True)
    subject = models.CharField(max_length=200)
    body = models.TextField()
    attachment_filename = models.CharField(max_length=180, blank=True)
    attachment_sha256 = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True)
    message_id = models.CharField(max_length=255, blank=True)
    idempotency_key = models.CharField(max_length=64, unique=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    sending_started_at = models.DateTimeField(null=True, blank=True)
    resend_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="resends",
    )
    resend_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "purchase_orders_emailoutbox"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "id"], name="po_email_outbox_status_idx"),
            models.Index(fields=["purchase_order", "created_at"], name="po_email_outbox_po_idx"),
        ]



