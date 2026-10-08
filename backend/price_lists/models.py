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
    valid_to = models.DateField()
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
