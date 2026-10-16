from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0003_client_item_code"),
        ("price_lists", "0003_pdf_quality_prices"),
    ]

    operations = [
        migrations.AddField(
            model_name="pricelist",
            name="unit_text",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="pricelist",
            name="packing_note",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="brandqualityprice",
            name="product",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="brand_quality_prices", to="products.product"),
        ),
        migrations.AddField(
            model_name="brandqualityprice",
            name="discount_note",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="brandqualityprice",
            name="unit_text",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="brandqualityprice",
            name="raw_line",
            field=models.TextField(blank=True),
        ),
    ]
