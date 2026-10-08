from django.db import models


class CustomerStatement(models.Model):
    entity = models.ForeignKey("entities.Entity", on_delete=models.PROTECT, related_name="customer_statements")
    customer = models.ForeignKey("customers.Customer", on_delete=models.PROTECT, related_name="statements")
    customer_code = models.CharField(max_length=30)
    period_from = models.DateField()
    period_to = models.DateField()
    ledger_code = models.CharField(max_length=40)
    ledger_description = models.CharField(max_length=255, blank=True)
    opening_amount = models.DecimalField(max_digits=15, decimal_places=2)
    opening_dc = models.CharField(max_length=2, choices=[("DR", "DR"), ("CR", "CR")])
    total_debit = models.DecimalField(max_digits=15, decimal_places=2)
    total_credit = models.DecimalField(max_digits=15, decimal_places=2)
    closing_amount = models.DecimalField(max_digits=15, decimal_places=2)
    closing_dc = models.CharField(max_length=2, choices=[("DR", "DR"), ("CR", "CR")])
    source_file = models.CharField(max_length=255)
    loaded_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "statements_customerstatement"
        constraints = [
            models.UniqueConstraint(
                fields=("entity", "customer", "period_from", "period_to"),
                name="statements_statement_natural_key",
            )
        ]
        ordering = ("customer_code",)


class StatementEntry(models.Model):
    statement = models.ForeignKey(CustomerStatement, on_delete=models.CASCADE, related_name="entries")
    line_no = models.PositiveIntegerField()
    post_date = models.DateField()
    doc_type = models.CharField(max_length=40)
    doc_no = models.CharField(max_length=80)
    text = models.CharField(max_length=255, blank=True)
    debit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    balance_amount = models.DecimalField(max_digits=15, decimal_places=2)
    balance_dc = models.CharField(max_length=2, choices=[("DR", "DR"), ("CR", "CR")])
    reference = models.CharField(max_length=120, blank=True)
    tds_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    due_date = models.DateField(null=True, blank=True)
    agent_code = models.CharField(max_length=80, blank=True)

    class Meta:
        db_table = "statements_statemententry"
        constraints = [
            models.UniqueConstraint(
                fields=("statement", "doc_type", "doc_no"),
                name="statements_entry_statement_doc_key",
            )
        ]
        ordering = ("line_no",)
