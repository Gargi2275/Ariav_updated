from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class AuthUser(AbstractUser):
    """Custom user. `phone` is repurposed to store the hashed admin PIN."""

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        OPERATOR = "operator", "Operator"

    phone = models.CharField(
        max_length=128,
        blank=True,
        help_text="Hashed admin PIN (phone column repurposed). Empty for staff.",
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.OPERATOR)
    display_name = models.CharField(max_length=160, blank=True)
    operator_code = models.CharField(max_length=20, blank=True)
    branch = models.ForeignKey(
        "masters.MasterBranch",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
    )

    class Meta:
        db_table = "accounts_authuser"

    def __str__(self):
        return self.username

    @property
    def is_admin_role(self):
        return self.role == self.Role.ADMIN or self.is_superuser


class AuthUserMstLogin(models.Model):
    """Per-user login gate: PIN attempt counter and 5-minute lockout (DB, not memory)."""

    user = models.OneToOneField(AuthUser, on_delete=models.CASCADE, related_name="login_mst")
    failed_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    first_login = models.BooleanField(default=True)

    class Meta:
        db_table = "accounts_authusermstlogin"

    def lockout_remaining_seconds(self) -> int:
        if not self.locked_until:
            return 0
        remaining = int((self.locked_until - timezone.now()).total_seconds())
        return max(remaining, 0)

    def is_locked(self) -> bool:
        return self.lockout_remaining_seconds() > 0


class UserToken(models.Model):
    """24-hour opaque bearer token stored in MySQL."""

    user = models.ForeignKey(AuthUser, on_delete=models.CASCADE, related_name="tokens")
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked = models.BooleanField(default=False)

    class Meta:
        db_table = "accounts_usertoken"

    def is_valid(self) -> bool:
        return (not self.revoked) and timezone.now() < self.expires_at


class AuditLog(models.Model):
    class Severity(models.TextChoices):
        INFO = "info", "Info"
        NOTICE = "notice", "Notice"
        CRITICAL = "critical", "Critical"

    timestamp = models.DateTimeField(auto_now_add=True)
    user = models.CharField(max_length=160)
    role = models.CharField(max_length=80, blank=True)
    action = models.CharField(max_length=200)
    module = models.CharField(max_length=80)
    ip_address = models.CharField(max_length=64, blank=True)
    details = models.TextField(blank=True)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.INFO)

    class Meta:
        db_table = "accounts_auditlog"
        ordering = ["-timestamp"]


class LoginRequest(models.Model):
    """Staff login ticket. Status also mirrored in cache with 5-minute TTL."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        COMPLETED = "completed", "Completed"
        EXPIRED = "expired", "Expired"

    request_code = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(
        AuthUser, null=True, blank=True, on_delete=models.SET_NULL, related_name="login_requests"
    )
    username = models.CharField(max_length=150)
    operator_code = models.CharField(max_length=20, blank=True)
    operator_name = models.CharField(max_length=160, blank=True)
    branch = models.CharField(max_length=160, blank=True)
    terminal_ip = models.CharField(max_length=64, blank=True)
    action_requested = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    verbal_otp = models.CharField(max_length=16, blank=True)
    otp_hash = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "accounts_loginrequest"
        ordering = ["-created_at"]

    def seconds_remaining(self) -> int:
        if not self.expires_at:
            return 0
        return max(int((self.expires_at - timezone.now()).total_seconds()), 0)
