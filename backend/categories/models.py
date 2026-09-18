"""Category Master — shared two-level Category → Subcategory list.

Not scoped to Brand. Product (this release) FKs to a Subcategory only.
"""

from django.conf import settings
from django.db import models


class Category(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    category_code = models.CharField(max_length=20, unique=True)
    category_name = models.CharField(max_length=200)
    parent_category = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="child_categories",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_categories",
    )

    class Meta:
        db_table = "categories_category"
        ordering = ["category_code"]
        verbose_name_plural = "categories"

    def __str__(self):
        return f"{self.category_code} {self.category_name}"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE

    @property
    def is_subcategory(self) -> bool:
        return self.parent_category_id is not None
