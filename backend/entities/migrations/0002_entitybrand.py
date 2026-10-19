from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("brands", "0001_brand_master"),
        ("entities", "0001_entity_master"),
    ]

    operations = [
        migrations.CreateModel(
            name="EntityBrand",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("brand", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="entity_links", to="brands.brand")),
                ("entity", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="brand_links", to="entities.entity")),
            ],
            options={
                "ordering": ["entity_id", "brand_id"],
                "constraints": [
                    models.UniqueConstraint(fields=("entity", "brand"), name="entity_brand_unique"),
                ],
            },
        ),
        migrations.AddField(
            model_name="entity",
            name="brands",
            field=models.ManyToManyField(blank=True, related_name="entities", through="entities.EntityBrand", to="brands.brand"),
        ),
    ]
