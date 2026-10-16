from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class PriceList(models.Model):
    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        ACTIVE = "Active", "Active"
        EXPIRED = "Expired", "Expired"

    brand = models.ForeignKey("brands.Brand", on_delete=models.PROTECT, related_name="price_lists")
    season_label = models.CharField(max_length=120)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    revision_label = models.CharField(max_length=120, blank=True)
    season_name = models.CharField(max_length=40, blank=True)
    season_year = models.PositiveSmallIntegerField(null=True, blank=True)
    source_file = models.CharField(max_length=255, blank=True)
    source_sha256 = models.CharField(max_length=64, blank=True)
    source_filename = models.CharField(max_length=255, blank=True)
    tax_note = models.TextField(blank=True)
    unit_text = models.CharField(max_length=120, blank=True)
    packing_note = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_price_lists")

    class Meta:
        db_table = "price_lists_pricelist"
        ordering = ["-valid_from", "-id"]

    def __str__(self):
        return f"{self.brand.brand_name} - {self.season_label}"


class PriceListEntry(models.Model):
    class PriceBasis(models.TextChoices):
        PER_METER = "Per Meter", "Per Meter"
        PER_TAKA = "Per Taka", "Per Taka"

    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name="entries")
    product = models.ForeignKey("products.Product", on_delete=models.PROTECT, related_name="price_list_entries")
    taka_length_meters = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    price_basis = models.CharField(max_length=16, choices=PriceBasis.choices)
    price_value = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    price_per_meter = models.DecimalField(max_digits=14, decimal_places=2, editable=False)
    price_per_taka = models.DecimalField(max_digits=14, decimal_places=2, editable=False)
    taka_quantity = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "price_lists_pricelistentry"
        constraints = [models.UniqueConstraint(fields=["price_list", "product"], name="price_list_product_unique")]
        ordering = ["product__product_code", "id"]

    def calculate_prices(self):
        if self.price_basis == self.PriceBasis.PER_TAKA:
            self.price_per_taka = self.price_value
            self.price_per_meter = (self.price_value / self.taka_length_meters).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        else:
            self.price_per_meter = self.price_value
            self.price_per_taka = (self.price_value * self.taka_length_meters).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def save(self, *args, **kwargs):
        self.calculate_prices()
        super().save(*args, **kwargs)


class PriceListImportBatch(models.Model):
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name="quality_import_batches")
    brand = models.ForeignKey("brands.Brand", on_delete=models.PROTECT, related_name="quality_price_import_batches")
    format_id = models.CharField(max_length=80)
    file_name = models.CharField(max_length=255)
    file_sha256 = models.CharField(max_length=64)
    file_size = models.PositiveBigIntegerField()
    imported_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="quality_price_import_batches")
    imported_at = models.DateTimeField(auto_now_add=True)
    rows_read = models.PositiveIntegerField(default=0)
    rows_imported = models.PositiveIntegerField(default=0)
    skipped_blank = models.PositiveIntegerField(default=0)
    skipped_header = models.PositiveIntegerField(default=0)
    skipped_page = models.PositiveIntegerField(default=0)
    skipped_title = models.PositiveIntegerField(default=0)
    collection_count = models.PositiveIntegerField(default=0)
    warnings = models.JSONField(default=list)
    declared_page_count = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["brand", "file_sha256"],
                name="quality_import_brand_file_unique",
            )
        ]


class PriceListQualityEntry(models.Model):
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name="quality_entries")
    batch = models.ForeignKey(PriceListImportBatch, on_delete=models.CASCADE, related_name="entries")
    source_row = models.PositiveIntegerField()
    source_page = models.PositiveIntegerField(null=True, blank=True)
    collection_name = models.CharField(max_length=255, blank=True)
    collection_code = models.CharField(max_length=80, blank=True)
    serial_no = models.PositiveIntegerField(null=True, blank=True)
    quality_no = models.CharField(max_length=255, db_index=True)
    code1 = models.CharField(max_length=80, blank=True)
    code2 = models.CharField(max_length=80, blank=True)
    code3 = models.CharField(max_length=80, blank=True)
    code4 = models.CharField(max_length=80, blank=True)
    code5 = models.CharField(max_length=80, blank=True)
    shades_raw = models.TextField(blank=True)
    delivery_raw = models.CharField(max_length=120, blank=True)
    delivery_month = models.PositiveSmallIntegerField(null=True, blank=True)
    ex_mill = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    wholesale = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    retail = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    unit_text = models.CharField(max_length=120, blank=True)
    flags = models.JSONField(default=list)
    raw_values = models.JSONField(default=dict)
    review_status = models.CharField(max_length=24, default="pending")

    class Meta:
        ordering = ["source_row", "id"]


class BrandQualityPrice(models.Model):
    """One quality from a brand PDF price list. Null prices mean not priced."""

    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name="brand_quality_prices")
    product = models.ForeignKey(
        "products.Product",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="brand_quality_prices",
    )
    sr_no = models.PositiveIntegerField()
    source_page = models.PositiveIntegerField()
    quality_code = models.CharField(max_length=80)
    quality_prefix = models.CharField(max_length=20)
    seg_a = models.CharField(max_length=20)
    seg_b = models.CharField(max_length=20)
    seg_c = models.CharField(max_length=20)
    quality_number = models.CharField(max_length=7)
    ex_mill = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    wholesale = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    retail = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_percent = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    discount_min_meters = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    discount_note = models.TextField(blank=True)
    unit_text = models.CharField(max_length=120, blank=True)
    raw_line = models.TextField(blank=True)
    collection_name = models.CharField(max_length=255, blank=True)
    collection_code = models.CharField(max_length=80, blank=True)
    shades_raw = models.TextField(blank=True)
    delivery_raw = models.CharField(max_length=80, blank=True)

    class Meta:
        db_table = "price_lists_brandqualityprice"
        ordering = ["sr_no", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["price_list", "quality_prefix", "quality_number"],
                name="brand_quality_prefix_number_unique",
            )
        ]


class PriceListQualityShade(models.Model):
    entry = models.ForeignKey(PriceListQualityEntry, on_delete=models.CASCADE, related_name="shades")
    position = models.PositiveIntegerField()
    shade_raw = models.CharField(max_length=120)
    shade_norm = models.CharField(max_length=120)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["entry", "position"], name="quality_shade_position_unique")
        ]
