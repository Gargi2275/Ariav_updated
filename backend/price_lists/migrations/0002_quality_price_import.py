from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("price_lists", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PriceListImportBatch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("format_id", models.CharField(max_length=80)),
                ("file_name", models.CharField(max_length=255)),
                ("file_sha256", models.CharField(max_length=64)),
                ("file_size", models.PositiveBigIntegerField()),
                ("imported_at", models.DateTimeField(auto_now_add=True)),
                ("rows_read", models.PositiveIntegerField(default=0)),
                ("rows_imported", models.PositiveIntegerField(default=0)),
                ("skipped_blank", models.PositiveIntegerField(default=0)),
                ("skipped_header", models.PositiveIntegerField(default=0)),
                ("skipped_page", models.PositiveIntegerField(default=0)),
                ("skipped_title", models.PositiveIntegerField(default=0)),
                ("collection_count", models.PositiveIntegerField(default=0)),
                ("warnings", models.JSONField(default=list)),
                ("declared_page_count", models.PositiveIntegerField(blank=True, null=True)),
                ("brand", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="quality_price_import_batches", to="brands.brand")),
                ("imported_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="quality_price_import_batches", to=settings.AUTH_USER_MODEL)),
                ("price_list", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="quality_import_batches", to="price_lists.pricelist")),
            ],
        ),
        migrations.CreateModel(
            name="PriceListQualityEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_row", models.PositiveIntegerField()),
                ("source_page", models.PositiveIntegerField(blank=True, null=True)),
                ("collection_name", models.CharField(blank=True, max_length=255)),
                ("collection_code", models.CharField(blank=True, max_length=80)),
                ("serial_no", models.PositiveIntegerField(blank=True, null=True)),
                ("quality_no", models.CharField(db_index=True, max_length=255)),
                ("code1", models.CharField(blank=True, max_length=80)),
                ("code2", models.CharField(blank=True, max_length=80)),
                ("code3", models.CharField(blank=True, max_length=80)),
                ("code4", models.CharField(blank=True, max_length=80)),
                ("code5", models.CharField(blank=True, max_length=80)),
                ("shades_raw", models.TextField(blank=True)),
                ("delivery_raw", models.CharField(blank=True, max_length=120)),
                ("delivery_month", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("ex_mill", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("wholesale", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("retail", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("unit_text", models.CharField(blank=True, max_length=120)),
                ("flags", models.JSONField(default=list)),
                ("raw_values", models.JSONField(default=dict)),
                ("review_status", models.CharField(default="pending", max_length=24)),
                ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="entries", to="price_lists.pricelistimportbatch")),
                ("price_list", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="quality_entries", to="price_lists.pricelist")),
            ],
            options={"ordering": ["source_row", "id"]},
        ),
        migrations.CreateModel(
            name="PriceListQualityShade",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("position", models.PositiveIntegerField()),
                ("shade_raw", models.CharField(max_length=120)),
                ("shade_norm", models.CharField(max_length=120)),
                ("entry", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shades", to="price_lists.pricelistqualityentry")),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.AddConstraint(
            model_name="pricelistimportbatch",
            constraint=models.UniqueConstraint(fields=("brand", "file_sha256"), name="quality_import_brand_file_unique"),
        ),
        migrations.AddConstraint(
            model_name="pricelistqualityshade",
            constraint=models.UniqueConstraint(fields=("entry", "position"), name="quality_shade_position_unique"),
        ),
    ]
