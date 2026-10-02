"""Break-glass admin PIN reset. Requires server shell access; the PIN is only ever read from a prompt."""

from getpass import getpass

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts import throttle
from accounts.models import AuditLog, AuthUser, AuthUserMstLogin, UserToken

PIN_LENGTH = 6


class Command(BaseCommand):
    help = "Set a new Master PIN for an admin (prompted, never a CLI argument) and sign out all their sessions."

    def add_arguments(self, parser):
        parser.add_argument("username")

    def handle(self, *args, **options):
        username = options["username"]
        user = AuthUser.objects.filter(username__iexact=username).first()
        if user is None or not user.is_admin_role:
            raise CommandError(f"No admin account named {username!r}.")

        new_pin = getpass(f"New {PIN_LENGTH}-digit PIN for {user.username}: ").strip()
        if len(new_pin) != PIN_LENGTH or not new_pin.isdigit():
            raise CommandError(f"PIN must be exactly {PIN_LENGTH} digits. Nothing was changed.")
        if getpass("Repeat the new PIN: ").strip() != new_pin:
            raise CommandError("PINs do not match. Nothing was changed.")

        with transaction.atomic():
            user.phone = make_password(new_pin)
            user.save(update_fields=["phone"])
            revoked = UserToken.objects.filter(user=user, revoked=False).update(revoked=True)
            AuthUserMstLogin.objects.filter(user=user).update(failed_attempts=0, locked_until=None)
            throttle.reset_subject(str(user.id))
            AuditLog.objects.create(
                user=user.display_name or user.username,
                role="admin",
                action="Admin Master PIN Reset (server shell)",
                module="Security Gate",
                ip_address="server-shell",
                details=f"PIN reset with manage.py reset_admin_pin; {revoked} session(s) revoked",
                severity=AuditLog.Severity.CRITICAL,
            )
        self.stdout.write(self.style.SUCCESS(f"PIN updated for {user.username}. {revoked} session(s) signed out."))
