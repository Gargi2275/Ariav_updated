from django.conf import settings
from django.db import models


class Entity(models.Model):
    class EntityType(models.TextChoices):
        HEAD_OFFICE = "Head Office", "Head Office"
        REGIONAL = "Regional", "Regional"
        BRANCH = "Branch", "Branch"

    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    short_code = models.CharField(max_length=20, unique=True)
    entity_name = models.CharField(max_length=200, unique=True)
    entity_type = models.CharField(max_length=40, choices=EntityType.choices, default=EntityType.BRANCH)
    parent_entity = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="child_entities",
    )
    cash_code = models.CharField(max_length=40, blank=True)
    invoice_series = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_entities",
    )

    address_line_1 = models.CharField(max_length=200, blank=True)
    street = models.CharField(max_length=200, blank=True)
    address_line_2 = models.CharField(max_length=200, blank=True)
    area = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=80, blank=True)
    state = models.CharField(max_length=80, blank=True)
    country = models.CharField(max_length=80, blank=True, default="India")
    pin_code = models.CharField(max_length=12, blank=True)
    district = models.CharField(max_length=80, blank=True)
    zone = models.CharField(max_length=80, blank=True)

    contact_person = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    mobile = models.CharField(max_length=30, blank=True)
    fax = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    website = models.CharField(max_length=200, blank=True)
    std_code = models.CharField(max_length=12, blank=True)

    pan_no = models.CharField(max_length=16, blank=True)
    gst_no = models.CharField(max_length=20, blank=True)
    cst_tin = models.CharField(max_length=20, blank=True)
    licence_no = models.CharField(max_length=40, blank=True)
    ecc = models.CharField(max_length=40, blank=True)
    division = models.CharField(max_length=80, blank=True)
    range = models.CharField(max_length=80, blank=True)

    other_1 = models.CharField(max_length=255, blank=True)
    other_2 = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "entities_entity"
        ordering = ["short_code"]

    def __str__(self):
        return f"{self.short_code} {self.entity_name}"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE
