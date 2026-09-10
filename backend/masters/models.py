from django.db import models


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
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_groupproduct"


class ItemMaster(models.Model):
    sku = models.CharField(max_length=40, unique=True)
    description = models.CharField(max_length=255)
    group = models.ForeignKey(GroupProduct, null=True, blank=True, on_delete=models.SET_NULL)
    category = models.CharField(max_length=80, blank=True)
    construction = models.CharField(max_length=80, blank=True)
    width_inches = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    hsn = models.CharField(max_length=12)
    base_rate = models.DecimalField(max_digits=12, decimal_places=2)
    packing_unit = models.CharField(max_length=20, default="Meters")
    stock_quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=5)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_itemmaster"


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
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    balance_type = models.CharField(max_length=2, default="Dr")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_accountmaster"

    def __str__(self):
        return f"{self.code} {self.name}"


class Parameter(models.Model):
    category = models.CharField(max_length=80)
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=160)
    value = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "masters_parameter"
        unique_together = ("category", "code")
