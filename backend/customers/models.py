"""Customer Master — trading customers keyed by unique customer_code.

A customer may trade with multiple Entities (M2M via CustomerEntity).
Exactly one linked entity is flagged primary_entity for default UI flows.
Do not seed this table.
"""

from django.conf import settings
from django.db import models


class Customer(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    class CustomerType(models.TextChoices):
        COMPANY = "Company", "Company"
        INDIVIDUAL = "Individual", "Individual"
        DISTRIBUTOR = "Distributor", "Distributor"

    customer_code = models.CharField(max_length=30, unique=True)
    customer_name = models.CharField(max_length=200)
    customer_type = models.CharField(
        max_length=40,
        choices=CustomerType.choices,
        default=CustomerType.COMPANY,
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_customers",
    )

    entities = models.ManyToManyField(
        "entities.Entity",
        through="CustomerEntity",
        related_name="customers",
    )

    contact_person = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    mobile = models.CharField(max_length=30, blank=True)
    fax = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    website = models.CharField(max_length=200, blank=True)

    address_line_1 = models.CharField(max_length=200, blank=True)
    address_line_2 = models.CharField(max_length=200, blank=True)
    area = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=80, blank=True)
    state = models.CharField(max_length=80, blank=True)
    pincode = models.CharField(max_length=12, blank=True)
    country = models.CharField(max_length=80, blank=True, default="India")
    district = models.CharField(max_length=80, blank=True)
    zone = models.CharField(max_length=80, blank=True)
    std_code = models.CharField(max_length=12, blank=True)

    pan_no = models.CharField(max_length=16, blank=True)
    gst_no = models.CharField(max_length=20, blank=True)
    vat_tin = models.CharField(max_length=20, blank=True)
    cst_tin = models.CharField(max_length=20, blank=True)
    licence_no = models.CharField(max_length=40, blank=True)
    ecc = models.CharField(max_length=40, blank=True)
    division = models.CharField(max_length=80, blank=True)
    range = models.CharField(max_length=80, blank=True)

    credit_days = models.PositiveIntegerField(default=0)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    interest_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    # TODO: confirm meaning of lower_rate with business (legacy field, kept as-is).
    lower_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    salesman_ref = models.CharField(
        max_length=120,
        blank=True,
        help_text="Placeholder until Salesman master exists.",
    )
    broker_ref = models.CharField(
        max_length=120,
        blank=True,
        help_text="Placeholder until Broker FK is wired.",
    )
    commission_type = models.CharField(max_length=80, blank=True)

    bank_name = models.CharField(max_length=160, blank=True)
    rtgs_details = models.CharField(max_length=255, blank=True)

    tds_percent = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    tds_form_no = models.CharField(max_length=40, blank=True)
    vat_date = models.DateField(null=True, blank=True)
    vat_date_1 = models.DateField(null=True, blank=True)

    comp_id = models.CharField(max_length=40, blank=True)
    visit_day = models.CharField(max_length=40, blank=True)
    file_no = models.CharField(max_length=40, blank=True)
    mill_code = models.CharField(max_length=40, blank=True)
    transport = models.CharField(max_length=120, blank=True)
    other_1 = models.CharField(max_length=255, blank=True)
    other_2 = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "customers_customer"
        ordering = ["customer_code"]
        constraints = [
            models.CheckConstraint(
                check=~models.Q(customer_code=""),
                name="customers_customer_code_not_blank",
            ),
        ]

    def __str__(self):
        return f"{self.customer_code} {self.customer_name}"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE


class CustomerEntity(models.Model):
    """Join: one customer, many entities; exactly one primary per customer (enforced in serializer)."""

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="entity_links",
    )
    entity = models.ForeignKey(
        "entities.Entity",
        on_delete=models.PROTECT,
        related_name="customer_links",
    )
    primary_entity = models.BooleanField(default=False)

    class Meta:
        db_table = "customers_customer_entity"
        unique_together = [("customer", "entity")]
        ordering = ["-primary_entity", "id"]

    def __str__(self):
        flag = " primary" if self.primary_entity else ""
        return f"{self.customer_id}→{self.entity_id}{flag}"
