from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("price_lists", "0004_osm_pdf_product_link"),
    ]

    operations = [
        migrations.AddField(
            model_name="brandqualityprice",
            name="collection_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="brandqualityprice",
            name="collection_code",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="brandqualityprice",
            name="shades_raw",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="brandqualityprice",
            name="delivery_raw",
            field=models.CharField(blank=True, max_length=80),
        ),
    ]
