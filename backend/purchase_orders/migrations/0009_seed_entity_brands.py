from django.db import migrations


def seed_from_existing_purchase_orders(apps, schema_editor):
    EntityBrand = apps.get_model("entities", "EntityBrand")
    PurchaseOrder = apps.get_model("purchase_orders", "PurchaseOrder")
    pairs = PurchaseOrder.objects.values_list("entity_id", "brand_id").distinct()
    EntityBrand.objects.bulk_create(
        [EntityBrand(entity_id=entity_id, brand_id=brand_id) for entity_id, brand_id in pairs],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("entities", "0002_entitybrand"),
        ("purchase_orders", "0008_import_metadata"),
    ]

    operations = [
        migrations.RunPython(seed_from_existing_purchase_orders, migrations.RunPython.noop),
    ]
