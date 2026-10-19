from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("price_lists", "0002_quality_price_import"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pricelist",
            name="valid_to",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="pricelist",
            name="revision_label",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="pricelist",
            name="season_name",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="pricelist",
            name="season_year",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="pricelist",
            name="source_file",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="pricelist",
            name="source_sha256",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="pricelist",
            name="source_filename",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="pricelist",
            name="tax_note",
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name="BrandQualityPrice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sr_no", models.PositiveIntegerField()),
                ("source_page", models.PositiveIntegerField()),
                ("quality_code", models.CharField(max_length=80)),
                ("quality_prefix", models.CharField(max_length=20)),
                ("seg_a", models.CharField(max_length=20)),
                ("seg_b", models.CharField(max_length=20)),
                ("seg_c", models.CharField(max_length=20)),
                ("quality_number", models.CharField(max_length=7)),
                ("ex_mill", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("wholesale", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("retail", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("discount_percent", models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ("discount_min_meters", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("price_list", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="brand_quality_prices", to="price_lists.pricelist")),
            ],
            options={
                "db_table": "price_lists_brandqualityprice",
                "ordering": ["sr_no", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="brandqualityprice",
            constraint=models.UniqueConstraint(fields=("price_list", "quality_prefix", "quality_number"), name="brand_quality_prefix_number_unique"),
        ),
    ]
