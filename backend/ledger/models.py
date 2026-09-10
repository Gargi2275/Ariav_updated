from django.db import models


class LedgerLine(models.Model):
    """Posted double-entry line used for TB / P&L / balance sheet / party ledger."""

    posted_on = models.DateField()
    account = models.ForeignKey("masters.AccountMaster", on_delete=models.PROTECT, related_name="ledger_lines")
    debit = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    narration = models.CharField(max_length=255, blank=True)
    voucher_type = models.CharField(max_length=40)
    voucher_no = models.CharField(max_length=30)
    fin_year = models.ForeignKey("masters.MstFinYear", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ledger_ledgerline"
        ordering = ["posted_on", "id"]
