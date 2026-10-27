from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_staff_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("data", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="preferences", to="accounts.authuser")),
            ],
            options={"db_table": "accounts_userpreference"},
        ),
    ]
