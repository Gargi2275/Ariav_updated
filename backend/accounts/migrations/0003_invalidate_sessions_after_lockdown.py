"""One-time: sign everyone out and close open operator login tickets after the auth lockdown.

Tokens issued while the approve / PIN-reset routes were public cannot be trusted.
Plaintext verbal OTPs stored by the old flow are cleared.
"""

from django.db import migrations
from django.utils import timezone


def invalidate(apps, schema_editor):
    UserToken = apps.get_model("accounts", "UserToken")
    LoginRequest = apps.get_model("accounts", "LoginRequest")
    UserToken.objects.filter(revoked=False).update(revoked=True)
    LoginRequest.objects.filter(status__in=["pending", "approved"]).update(status="expired", expires_at=timezone.now())
    LoginRequest.objects.exclude(verbal_otp="").update(verbal_otp="")
    LoginRequest.objects.exclude(otp_hash="").update(otp_hash="")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_auth_throttle_and_otp_attempts"),
    ]

    operations = [
        migrations.RunPython(invalidate, migrations.RunPython.noop),
    ]
