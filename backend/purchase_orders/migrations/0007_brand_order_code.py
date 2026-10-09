from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase_orders", "0006_optional_rate_history"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseorder",
            name="brand_order_code",
            field=models.CharField(blank=True, db_index=True, max_length=80, null=True),
        ),
        migrations.AddConstraint(
            model_name="purchaseorder",
            constraint=models.UniqueConstraint(
                fields=("brand", "brand_order_code"),
                name="purchase_order_brand_order_code_unique",
            ),
        ),
    ]
