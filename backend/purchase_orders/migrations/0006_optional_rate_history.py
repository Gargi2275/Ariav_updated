from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("purchase_orders", "0005_purchaseorderstatuschange_reason_and_correction"),
    ]

    operations = [
        migrations.AlterField(
            model_name="purchaseorderline",
            name="line_total",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="purchaseorderstatuschange",
            name="purchase_order_line",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="rate_history",
                to="purchase_orders.purchaseorderline",
            ),
        ),
        migrations.AddField(
            model_name="purchaseorderstatuschange",
            name="rate",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AlterField(
            model_name="purchaseorderstatuschange",
            name="source",
            field=models.CharField(
                choices=[
                    ("manual", "Manual"),
                    ("dispatch_auto", "Dispatch (automatic)"),
                    ("import", "Import"),
                    ("correction", "Correction"),
                    ("rate_fill", "Rate filled"),
                ],
                max_length=16,
            ),
        ),
    ]
