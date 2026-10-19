from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase_orders", "0009_seed_entity_brands"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseorderline",
            name="rate_source",
            field=models.CharField(blank=True, max_length=240),
        ),
    ]
