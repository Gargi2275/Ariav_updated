from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dispatches", "0002_add_dispatched_meters"),
    ]

    operations = [
        migrations.AddField(
            model_name="dispatchline",
            name="source_rate",
            field=models.DecimalField(blank=True, decimal_places=2, help_text="Sales order price from the plant dispatch. Null means the rate was not recorded.", max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name="dispatchline",
            name="net_rate",
            field=models.DecimalField(blank=True, decimal_places=2, help_text="Net rate per metre after discount. Not used as the PO rate comparison.", max_digits=12, null=True),
        ),
    ]
