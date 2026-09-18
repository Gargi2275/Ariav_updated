from django.db import models, transaction


class MasterBranch(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=160)
    city = models.CharField(max_length=80)
    gstin = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    is_head_office = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_masterbranch"

    def save(self, *args, **kwargs):
        with transaction.atomic():
            super().save(*args, **kwargs)
            if self.is_head_office:
                type(self).objects.filter(is_head_office=True).exclude(pk=self.pk).update(is_head_office=False)

    def __str__(self):
        return f"{self.code} {self.name}"


class MstFinYear(models.Model):
    code = models.CharField(max_length=16, unique=True)
    starts_on = models.DateField()
    ends_on = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = "masters_mstfinyear"


class GroupProduct(models.Model):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=160)
    category = models.CharField(max_length=80, blank=True)
    hsn_chapter = models.CharField(max_length=20, blank=True)
    construction = models.CharField(max_length=120, blank=True)
    gsm_range = models.CharField(max_length=80, blank=True)
    avg_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_groupproduct"

    def __str__(self):
        return f"{self.code} {self.name}"


class ItemMaster(models.Model):
    sku = models.CharField(max_length=40, unique=True)
    description = models.CharField(max_length=255)
    group = models.ForeignKey(GroupProduct, null=True, blank=True, on_delete=models.SET_NULL, related_name="items")
    category = models.CharField(max_length=80, blank=True)
    construction = models.CharField(max_length=80, blank=True)
    width_inches = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    hsn = models.CharField(max_length=12)
    base_rate = models.DecimalField(max_digits=12, decimal_places=2)
    packing_unit = models.CharField(max_length=20, default="Meters")
    stock_quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=5)
    tax_slab = models.ForeignKey("TaxSlab", null=True, blank=True, on_delete=models.SET_NULL, related_name="items")
    mill_origin = models.CharField(max_length=160, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_itemmaster"

    def __str__(self):
        return self.sku


class AccountMaster(models.Model):
    """Parties (debtors/creditors) and GL/bank accounts."""

    class AccountGroup(models.TextChoices):
        DEBTORS = "Sundry Debtors", "Sundry Debtors"
        CREDITORS = "Sundry Creditors", "Sundry Creditors"
        BANKS = "Bank Accounts", "Bank Accounts"
        CASH = "Cash-in-Hand", "Cash-in-Hand"
        INCOME = "Income", "Income"
        EXPENSE = "Expense", "Expense"
        CAPITAL = "Capital", "Capital"

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    trade_name = models.CharField(max_length=200, blank=True)
    group = models.CharField(max_length=40, choices=AccountGroup.choices)
    city = models.CharField(max_length=80, blank=True)
    state = models.CharField(max_length=80, blank=True)
    gstin = models.CharField(max_length=20, blank=True)
    pan = models.CharField(max_length=16, blank=True)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit_days = models.PositiveIntegerField(default=0)
    broker = models.CharField(max_length=120, blank=True)
    broker_ref = models.ForeignKey(
        "BrokerMaster",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="parties",
    )
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    balance_type = models.CharField(max_length=2, default="Dr")
    is_active = models.BooleanField(default=True)
    linked_branches = models.ManyToManyField(MasterBranch, blank=True, related_name="party_accounts")

    class Meta:
        db_table = "masters_accountmaster"

    def __str__(self):
        return f"{self.code} {self.name}"


class Parameter(models.Model):
    category = models.CharField(max_length=80)
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=160)
    value = models.CharField(max_length=120, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_parameter"
        unique_together = ("category", "code")

    def __str__(self):
        return f"{self.category}:{self.code}"


class TaxSlab(models.Model):
    STATUTORY_RATES = (0, 5, 12, 18, 28)

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2)
    cgst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    sgst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    igst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cess_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    hsn_coverage = models.CharField(max_length=255, blank=True)
    statutory_notification = models.CharField(max_length=255, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    rcm_applicable = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_taxslab"
        ordering = ["gst_percent", "code"]

    def __str__(self):
        return f"{self.code} {self.gst_percent}%"


class BrokerMaster(models.Model):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=160)
    firm_name = models.CharField(max_length=200, blank=True)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    pan = models.CharField(max_length=16, blank=True)
    mobile = models.CharField(max_length=30, blank=True)
    city = models.CharField(max_length=80, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_brokermaster"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name}"


class ChartAccount(models.Model):
    class AccountType(models.TextChoices):
        ASSETS = "Assets", "Assets"
        LIABILITIES = "Liabilities", "Liabilities"
        INCOME = "Income", "Income"
        EXPENSE = "Expense", "Expense"
        EQUITY = "Equity", "Equity"

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=20, choices=AccountType.choices)
    nature = models.CharField(max_length=10, default="Debit")
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="children",
    )
    is_group = models.BooleanField(default=False)
    opening_balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "masters_chartaccount"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name}"
