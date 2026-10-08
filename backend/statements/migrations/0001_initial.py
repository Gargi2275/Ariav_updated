from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ("customers", "0001_initial"),
        ("entities", "0001_entity_master"),
    ]
    operations = [
        migrations.CreateModel(
            name="CustomerStatement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("customer_code", models.CharField(max_length=30)),
                ("period_from", models.DateField()),
                ("period_to", models.DateField()),
                ("ledger_code", models.CharField(max_length=40)),
                ("ledger_description", models.CharField(blank=True, max_length=255)),
                ("opening_amount", models.DecimalField(decimal_places=2, max_digits=15)),
                ("opening_dc", models.CharField(choices=[("DR", "DR"), ("CR", "CR")], max_length=2)),
                ("total_debit", models.DecimalField(decimal_places=2, max_digits=15)),
                ("total_credit", models.DecimalField(decimal_places=2, max_digits=15)),
                ("closing_amount", models.DecimalField(decimal_places=2, max_digits=15)),
                ("closing_dc", models.CharField(choices=[("DR", "DR"), ("CR", "CR")], max_length=2)),
                ("source_file", models.CharField(max_length=255)),
                ("loaded_at", models.DateTimeField(auto_now=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="statements", to="customers.customer")),
                ("entity", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="customer_statements", to="entities.entity")),
            ],
            options={"db_table": "statements_customerstatement", "ordering": ("customer_code",)},
        ),
        migrations.CreateModel(
            name="StatementEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("line_no", models.PositiveIntegerField()),
                ("post_date", models.DateField()),
                ("doc_type", models.CharField(max_length=40)),
                ("doc_no", models.CharField(max_length=80)),
                ("text", models.CharField(blank=True, max_length=255)),
                ("debit", models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ("credit", models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ("balance_amount", models.DecimalField(decimal_places=2, max_digits=15)),
                ("balance_dc", models.CharField(choices=[("DR", "DR"), ("CR", "CR")], max_length=2)),
                ("reference", models.CharField(blank=True, max_length=120)),
                ("tds_amount", models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ("due_date", models.DateField(blank=True, null=True)),
                ("agent_code", models.CharField(blank=True, max_length=80)),
                ("statement", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="entries", to="statements.customerstatement")),
            ],
            options={"db_table": "statements_statemententry", "ordering": ("line_no",)},
        ),
        migrations.AddConstraint(
            model_name="customerstatement",
            constraint=models.UniqueConstraint(fields=("entity", "customer", "period_from", "period_to"), name="statements_statement_natural_key"),
        ),
        migrations.AddConstraint(
            model_name="statemententry",
            constraint=models.UniqueConstraint(fields=("statement", "doc_type", "doc_no"), name="statements_entry_statement_doc_key"),
        ),
    ]
