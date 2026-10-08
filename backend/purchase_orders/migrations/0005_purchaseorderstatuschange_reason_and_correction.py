from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase_orders", "0004_purchaseorderstatuschange"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseorderstatuschange",
            name="reason",
            field=models.TextField(blank=True),
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
                ],
                max_length=16,
            ),
        ),
    ]