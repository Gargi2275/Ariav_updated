from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase_orders", "0002_purchaseorder_handy_form_upload_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="purchaseorderline",
            name="rate",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
            ),
        ),
    ]
