from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("customers", "0001_initial")]

    operations = [
        migrations.AddField("customer", "address_line_3", models.CharField(max_length=200, blank=True)),
        migrations.AddField("customer", "address_line_4", models.CharField(max_length=200, blank=True)),
        migrations.AddField("customer", "name_2", models.CharField(max_length=200, blank=True, null=True)),
        migrations.AddField("customer", "search_term_1", models.CharField(max_length=120, blank=True, null=True)),
        migrations.AddField("customer", "search_term_2", models.CharField(max_length=120, blank=True, null=True)),
        migrations.AddField("customer", "state_code", models.CharField(max_length=20, blank=True, null=True)),
        migrations.AddField("customer", "country_code", models.CharField(max_length=10, blank=True, null=True)),
        migrations.AddField("customer", "account_group", models.CharField(max_length=120, blank=True, null=True)),
        migrations.AddField("customer", "distribution_channel", models.CharField(max_length=40, blank=True, null=True)),
        migrations.AddField("customer", "transportation_zone", models.CharField(max_length=80, blank=True, null=True)),
    ]
