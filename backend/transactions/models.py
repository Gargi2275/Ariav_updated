from django.db import models


class OrderForm(models.Model):
    order_no = models.CharField(max_length=30, unique=True)
    order_date = models.DateField()
    delivery_date = models.DateField(null=True, blank=True)
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="orders")
    branch = models.ForeignKey("masters.MasterBranch", null=True, blank=True, on_delete=models.SET_NULL)
    item = models.ForeignKey("masters.ItemMaster", null=True, blank=True, on_delete=models.SET_NULL)
    meters = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    broker = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=30, default="booked")
    narration = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "transactions_orderform"


class SalesInvoice(models.Model):
    invoice_no = models.CharField(max_length=30, unique=True)
    invoice_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="sales_invoices")
    branch = models.ForeignKey("masters.MasterBranch", null=True, blank=True, on_delete=models.SET_NULL)
    item = models.ForeignKey("masters.ItemMaster", null=True, blank=True, on_delete=models.SET_NULL)
    meters = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    eway_bill = models.CharField(max_length=30, blank=True)
    vehicle_no = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_salesinvoice"


class BankReceivedVoucher(models.Model):
    voucher_no = models.CharField(max_length=30, unique=True)
    voucher_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="bank_receipts")
    bank_account = models.ForeignKey(
        "masters.AccountMaster", on_delete=models.PROTECT, related_name="bank_receipts_as_bank"
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    cheque_no = models.CharField(max_length=40, blank=True)
    drawn_on = models.CharField(max_length=120, blank=True)
    narration = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="cleared")

    class Meta:
        db_table = "transactions_bankreceivedvoucher"


class CashReceivedVoucher(models.Model):
    voucher_no = models.CharField(max_length=30, unique=True)
    voucher_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="cash_receipts")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    narration = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_cashreceivedvoucher"


class BankPayment(models.Model):
    voucher_no = models.CharField(max_length=30, unique=True)
    voucher_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="bank_payments")
    bank_account = models.ForeignKey(
        "masters.AccountMaster", on_delete=models.PROTECT, related_name="bank_payments_as_bank"
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=80, blank=True)
    narration = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_bankpayment"


class CashPayment(models.Model):
    voucher_no = models.CharField(max_length=30, unique=True)
    voucher_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="cash_payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    narration = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_cashpayment"


class JournalEntry(models.Model):
    voucher_no = models.CharField(max_length=30, unique=True)
    voucher_date = models.DateField()
    narration = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_journalentry"


class JournalLine(models.Model):
    journal = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT)
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    narration = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "transactions_journalline"


class CreditNote(models.Model):
    note_no = models.CharField(max_length=30, unique=True)
    note_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="credit_notes")
    original_invoice_no = models.CharField(max_length=30, blank=True)
    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_creditnote"


class DebitNote(models.Model):
    note_no = models.CharField(max_length=30, unique=True)
    note_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="debit_notes")
    original_bill_no = models.CharField(max_length=30, blank=True)
    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_debitnote"


class MaterialReturned(models.Model):
    return_no = models.CharField(max_length=30, unique=True)
    return_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="material_returns")
    item = models.ForeignKey("masters.ItemMaster", null=True, blank=True, on_delete=models.SET_NULL)
    meters = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason = models.CharField(max_length=255, blank=True)
    disposition = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_materialreturned"


class PaymentAdjustment(models.Model):
    adjustment_no = models.CharField(max_length=30, unique=True)
    adjustment_date = models.DateField()
    party = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="adjustments")
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    narration = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="posted")

    class Meta:
        db_table = "transactions_paymentadjustment"
