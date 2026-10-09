from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0002_product_legacy_item_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="client_item_code",
            field=models.CharField(blank=True, db_index=True, max_length=120, null=True),
        ),
    ]
