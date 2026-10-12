from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase_orders", "0007_brand_order_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseorder",
            name="source_format",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="purchaseorder",
            name="extra_data",
            field=models.JSONField(default=dict),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="expected_delivery_period",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="customer_delivery_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="extra_data",
            field=models.JSONField(default=dict),
        ),
    ]
