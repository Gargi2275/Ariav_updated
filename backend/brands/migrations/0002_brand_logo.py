from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("brands", "0001_brand_master"),
    ]

    operations = [
        migrations.AddField(
            model_name="brand",
            name="logo",
            field=models.ImageField(blank=True, null=True, upload_to="brand_logos/"),
        ),
    ]
