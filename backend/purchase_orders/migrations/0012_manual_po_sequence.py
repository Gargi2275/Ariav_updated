from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase_orders", "0011_order_form_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="ManualPoNumberSequence",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("scope", models.CharField(max_length=6, unique=True)),
                ("last_value", models.PositiveSmallIntegerField(default=0)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "purchase_orders_manualposequence",
            },
        ),
    ]
