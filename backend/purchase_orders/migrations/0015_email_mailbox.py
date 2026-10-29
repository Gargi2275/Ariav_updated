from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase_orders", "0014_po_email"),
    ]

    operations = [
        migrations.AddField(
            model_name="emailsettings",
            name="from_email",
            field=models.CharField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="emailsettings",
            name="smtp_host",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="emailsettings",
            name="smtp_password",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="emailsettings",
            name="smtp_port",
            field=models.PositiveIntegerField(default=587),
        ),
        migrations.AddField(
            model_name="emailsettings",
            name="smtp_user",
            field=models.CharField(blank=True, max_length=254),
        ),
    ]
