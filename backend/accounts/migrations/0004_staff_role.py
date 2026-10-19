from django.db import migrations, models
import django.db.models.deletion


def operator_to_staff(apps, schema_editor):
    AuthUser = apps.get_model("accounts", "AuthUser")
    AuthUser.objects.filter(role="operator").update(role="staff")


class Migration(migrations.Migration):

    dependencies = [
        ("entities", "0002_entitybrand"),
        ("accounts", "0003_invalidate_sessions_after_lockdown"),
    ]

    operations = [
        migrations.AddField(
            model_name="authuser",
            name="can_delete",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="authuser",
            name="can_edit",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="authuser",
            name="entity",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="staff_users",
                to="entities.entity",
            ),
        ),
        migrations.AddField(
            model_name="authuser",
            name="login_bypass",
            field=models.BooleanField(
                default=False,
                help_text="When set, this staff account signs in with a password only. Admin approval and the verbal OTP are skipped.",
            ),
        ),
        migrations.RunPython(operator_to_staff, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="authuser",
            name="role",
            field=models.CharField(
                choices=[("admin", "Admin"), ("staff", "Staff")],
                default="staff",
                max_length=20,
            ),
        ),
    ]
