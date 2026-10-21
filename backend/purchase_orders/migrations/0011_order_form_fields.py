from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase_orders", "0010_line_rate_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseorder",
            name="place",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="purchaseorder",
            name="mode_of_despatch",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="purchaseorder",
            name="destination",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="purchaseorder",
            name="documents_through",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="purchaseorder",
            name="special_instructions",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="shade",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="size",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="unit",
            field=models.CharField(
                choices=[("Pieces", "Pieces"), ("Meters", "Meters")],
                default="Pieces",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="delivery_from",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="delivery_to",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="line_remarks",
            field=models.CharField(blank=True, max_length=240),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="form_row_no",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
