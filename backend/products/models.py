"""Product Catalogue — SKU under a Brand and a Category subcategory.

Brand and Category 409 checks count Active products via this model's FKs.
Purchase Orders (not built yet) will later FK here.
"""

from django.conf import settings
from django.db import models


class Product(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    class Availability(models.TextChoices):
        IN_STOCK = "In Stock", "In Stock"
        OUT_OF_STOCK = "Out of Stock", "Out of Stock"
        DISCONTINUED = "Discontinued", "Discontinued"

    class Unit(models.TextChoices):
        METER = "Meter", "Meter"
        PIECE = "Piece", "Piece"
        KG = "Kg", "Kg"
        TAKA = "Taka", "Taka"
        ROLL = "Roll", "Roll"

    product_code = models.CharField(max_length=40, unique=True)
    product_name = models.CharField(max_length=200)
    brand = models.ForeignKey(
        "brands.Brand",
        on_delete=models.PROTECT,
        related_name="products",
    )
    category = models.ForeignKey(
        "categories.Category",
        on_delete=models.PROTECT,
        related_name="products",
        help_text="Must be a subcategory (Category with a parent).",
    )
    print_name = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    design = models.CharField(max_length=120, blank=True)
    colour = models.CharField(max_length=80, blank=True)
    quality = models.CharField(max_length=80, blank=True)
    width_size = models.CharField(max_length=80, blank=True)
    product_type = models.CharField(max_length=80, blank=True)
    group = models.CharField(max_length=80, blank=True)
    unit = models.CharField(max_length=16, choices=Unit.choices, default=Unit.METER)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    frate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    trate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    season = models.CharField(max_length=80, blank=True)
    collection = models.CharField(max_length=120, blank=True)
    image = models.ImageField(upload_to="product_images/", blank=True, null=True)
    availability = models.CharField(
        max_length=20,
        choices=Availability.choices,
        default=Availability.IN_STOCK,
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_products",
    )

    class Meta:
        db_table = "products_product"
        ordering = ["product_code"]

    def __str__(self):
        return f"{self.product_code} {self.product_name}"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE
