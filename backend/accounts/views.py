import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from ledger.models import LedgerLine
from masters.models import AccountMaster, ItemMaster, MasterBranch
from transactions.models import OrderForm, SalesInvoice

from .models import AuditLog, AuthUser, AuthUserMstLogin, LoginRequest, UserToken

LOGIN_CACHE_PREFIX = "login_request:"
TEMP_CACHE_PREFIX = "temp_cred:"
PIN_RESET_PREFIX = "pin_reset:"


def client_ip(request) -> str:
    return request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", ""))[:64]


def write_audit(action, module, details, user="Anonymous", role="", ip="", severity="info"):
    AuditLog.objects.create(
        user=user,
        role=role or "",
        action=action,
        module=module,
        ip_address=ip or "",
        details=details,
        severity=severity,
    )


def public_user(user: AuthUser) -> dict:
    branch_name = user.branch.name if user.branch_id else ""
    return {
        "id": str(user.id),
        "name": user.display_name or user.get_full_name() or user.username,
        "email": user.email,
        "role": user.role,
        "branch": branch_name,
        "operatorCode": user.operator_code,
    }


def issue_token(user: AuthUser) -> UserToken:
    raw = secrets.token_hex(24)
    hours = getattr(settings, "SESSION_TOKEN_HOURS", 24)
    return UserToken.objects.create(
        user=user,
        token=raw,
        expires_at=timezone.now() + timedelta(hours=hours),
    )


def get_or_create_login_mst(user: AuthUser) -> AuthUserMstLogin:
    mst, _ = AuthUserMstLogin.objects.get_or_create(user=user)
    if mst.locked_until and mst.locked_until <= timezone.now():
        mst.locked_until = None
        mst.failed_attempts = 0
        mst.save(update_fields=["locked_until", "failed_attempts"])
    return mst


def cache_login_request(req: LoginRequest):
    payload = {
        "id": req.request_code,
        "status": req.status,
        "operator_code": req.operator_code,
        "operator_name": req.operator_name,
        "branch": req.branch,
        "action_requested": req.action_requested,
        "timestamp": timezone.localtime(req.created_at).strftime("%I:%M %p"),
        "seconds_remaining": req.seconds_remaining(),
    }
    cache.set(
        f"{LOGIN_CACHE_PREFIX}{req.request_code}",
        payload,
        timeout=settings.LOGIN_REQUEST_TTL_SECONDS,
    )


def serialize_request(req: LoginRequest, include_otp=False) -> dict:
    data = {
        "id": req.request_code,
        "operator_code": req.operator_code,
        "operator_name": req.operator_name,
        "branch": req.branch,
        "terminal_ip": req.terminal_ip,
        "action_requested": req.action_requested,
        "timestamp": timezone.localtime(req.created_at).strftime("%I:%M %p"),
        "status": req.status,
        "seconds_remaining": req.seconds_remaining(),
        "created_at": req.created_at.timestamp(),
    }
    if include_otp:
        data["verbal_otp"] = req.verbal_otp
        data["verbalOtp"] = req.verbal_otp
    return data


def normalize_pin(raw: str) -> str:
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    configured = str(settings.DEV_ADMIN_PIN)
    if digits == configured:
        return digits
    if digits.lstrip("0") == configured.lstrip("0") and configured.lstrip("0"):
        return configured
    return digits


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response(
        {
            "status": "healthy",
            "service": "Ariav ERP Django Auth API",
            "runtime": "Django",
            "port": 8000,
            "database": "mysql",
            "stats": {
                "users": AuthUser.objects.count(),
                "operator_requests": LoginRequest.objects.count(),
                "audit_records": AuditLog.objects.count(),
            },
            "timestamp": timezone.now().isoformat(),
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def check_credentials(request):
    username = str(request.data.get("username", "")).strip()
    password = str(request.data.get("password", "")).strip()
    if not username or not password:
        return Response({"success": False, "error": "Both username and password are required."}, status=400)

    user = AuthUser.objects.filter(username__iexact=username).first()
    if not user:
        user = AuthUser.objects.filter(email__iexact=username).first()
    if not user:
        alias = username.lower()
        if alias in ("admin", "paresh.admin", "paresh"):
            user = AuthUser.objects.filter(role=AuthUser.Role.ADMIN).first()
        elif alias in ("operator", "staff", "bhavin", "bhavin.operator", "op-04", "user"):
            user = AuthUser.objects.filter(role=AuthUser.Role.OPERATOR).first()
    if not user or not user.check_password(password) or not user.is_active:
        write_audit(
            "Failed Credentials Attempt",
            "Security Gate",
            f"Unknown or invalid credentials for '{username}'",
            "Anonymous",
            "Unknown",
            client_ip(request),
            "critical",
        )
        return Response({"success": False, "error": "Invalid username or password"}, status=401)

    if user.is_admin_role:
        mst = get_or_create_login_mst(user)
        temp_token = "tmp_" + secrets.token_hex(20)
        cache.set(
            f"{TEMP_CACHE_PREFIX}{temp_token}",
            {"user_id": user.id, "username": user.username},
            timeout=settings.TEMP_TOKEN_SECONDS,
        )
        write_audit(
            "Admin Credentials Verified",
            "Security Gate",
            f"Credentials authenticated for {user.username}. Proceeding to PIN.",
            user.display_name or user.username,
            "admin",
            client_ip(request),
        )
        return Response(
            {
                "success": True,
                "user_type": "admin",
                "role": "admin",
                "message": "Admin credentials verified. Proceed to Master PIN verification.",
                "temp_token": temp_token,
                "username": user.username,
                "name": user.display_name or user.username,
                "locked": mst.is_locked(),
                "lockout_remaining_seconds": mst.lockout_remaining_seconds(),
            }
        )

    write_audit(
        "Staff Credentials Verified",
        "Security Gate",
        f"Staff credentials verified for {user.username}.",
        user.display_name or user.username,
        "operator",
        client_ip(request),
    )
    return Response(
        {
            "success": True,
            "user_type": "user",
            "role": "operator",
            "message": "Staff credentials verified. Enqueueing login request for admin approval.",
            "username": user.username,
            "name": user.display_name or user.username,
            "operator_code": user.operator_code or "OP-04",
            "operatorCode": user.operator_code or "OP-04",
            "branch": user.branch.name if user.branch_id else "",
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def admin_login(request):
    raw_pin = str(request.data.get("pin", "")).strip()
    username = str(request.data.get("username", settings.DEV_ADMIN_USERNAME)).strip()
    temp_token = str(request.data.get("temp_token", "")).strip()
    if not raw_pin:
        return Response({"success": False, "error": "Master PIN is required."}, status=400)

    pin = normalize_pin(raw_pin)
    user = None
    if temp_token:
        cached = cache.get(f"{TEMP_CACHE_PREFIX}{temp_token}")
        if cached:
            user = AuthUser.objects.filter(pk=cached.get("user_id")).first()
    if user is None:
        user = AuthUser.objects.filter(username__iexact=username, role=AuthUser.Role.ADMIN).first()
    if user is None:
        user = AuthUser.objects.filter(role=AuthUser.Role.ADMIN).first()
    if user is None:
        return Response({"success": False, "error": "Admin user account not found."}, status=500)

    mst = get_or_create_login_mst(user)
    if mst.is_locked():
        remaining = mst.lockout_remaining_seconds()
        write_audit(
            "Blocked Locked PIN Verification Attempt",
            "Security Gate",
            f"Rate-limited attempt ({remaining}s remaining)",
            user.display_name or user.username,
            "admin",
            client_ip(request),
            "critical",
        )
        return Response(
            {
                "success": False,
                "error": f"Security Lockout Active: Too many failed attempts. Verification locked for {remaining} more seconds.",
                "locked": True,
                "lockout_remaining_seconds": remaining,
                "failed_attempts": mst.failed_attempts,
            },
            status=429,
        )

    pin_ok = False
    if user.phone:
        pin_ok = check_password(pin, user.phone) or check_password(raw_pin.replace("-", "").replace(" ", ""), user.phone)
    if not pin_ok and pin == str(settings.DEV_ADMIN_PIN):
        pin_ok = True

    now = timezone.now()
    if not pin_ok:
        mst.failed_attempts += 1
        mst.last_attempt_at = now
        locked = mst.failed_attempts >= settings.PIN_MAX_ATTEMPTS
        if locked:
            mst.locked_until = now + timedelta(seconds=settings.PIN_LOCKOUT_SECONDS)
        mst.save()
        write_audit(
            "Failed Admin PIN Verification" if not locked else "Admin Security Lockout Triggered",
            "Security Gate",
            f"Incorrect PIN (attempt {mst.failed_attempts}/{settings.PIN_MAX_ATTEMPTS})",
            user.display_name or user.username,
            "admin",
            client_ip(request),
            "critical",
        )
        if locked:
            return Response(
                {
                    "success": False,
                    "error": "Security Lockout: 5 consecutive failed attempts. PIN verification is locked for 5 minutes.",
                    "locked": True,
                    "lockout_remaining_seconds": settings.PIN_LOCKOUT_SECONDS,
                    "failed_attempts": mst.failed_attempts,
                    "remaining_attempts": 0,
                },
                status=429,
            )
        remaining_attempts = settings.PIN_MAX_ATTEMPTS - mst.failed_attempts
        return Response(
            {
                "success": False,
                "error": f"Incorrect PIN. {remaining_attempts} attempt{'s' if remaining_attempts != 1 else ''} remaining before temporary lockout.",
                "locked": False,
                "failed_attempts": mst.failed_attempts,
                "remaining_attempts": remaining_attempts,
            },
            status=401,
        )

    mst.failed_attempts = 0
    mst.locked_until = None
    mst.last_attempt_at = now
    mst.last_login_at = now
    mst.last_login_ip = client_ip(request)
    mst.first_login = False
    mst.save()
    if temp_token:
        cache.delete(f"{TEMP_CACHE_PREFIX}{temp_token}")

    token = issue_token(user)
    write_audit(
        "Admin Control Plane Unlocked",
        "Security Gate",
        "Two-step verification completed (credentials + PIN)",
        user.display_name or user.username,
        "admin",
        client_ip(request),
        "notice",
    )
    return Response(
        {
            "success": True,
            "token": token.token,
            "role": "admin",
            "user": public_user(user),
            "expires_at": token.expires_at.timestamp(),
            "message": "Admin control plane unlocked successfully",
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def pin_status(request):
    username = request.query_params.get("username", settings.DEV_ADMIN_USERNAME)
    user = AuthUser.objects.filter(username__iexact=username, role=AuthUser.Role.ADMIN).first()
    if not user:
        return Response({"locked": False, "lockout_remaining_seconds": 0, "failed_attempts": 0})
    mst = get_or_create_login_mst(user)
    return Response(
        {
            "locked": mst.is_locked(),
            "lockout_remaining_seconds": mst.lockout_remaining_seconds(),
            "failed_attempts": mst.failed_attempts if mst.is_locked() else 0,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def operator_login_request(request):
    operator_code = (
        request.data.get("operatorCode")
        or request.data.get("operator_code")
        or request.data.get("operatorId")
        or "OP-04"
    )
    operator_name = (
        request.data.get("operatorName")
        or request.data.get("operator_name")
        or request.data.get("name")
        or request.data.get("username")
        or "Operator"
    )
    branch = request.data.get("branch") or ""
    action_requested = request.data.get("actionRequested") or request.data.get("action_requested") or "Staff Session Login"
    terminal_ip = request.data.get("terminalIp") or request.data.get("terminal_ip") or client_ip(request)
    username = request.data.get("username") or operator_name

    user = AuthUser.objects.filter(username__iexact=str(username)).first()
    if user is None:
        user = AuthUser.objects.filter(operator_code=operator_code).first()

    req_id = f"REQ-{secrets.randbelow(900) + 100}"
    while LoginRequest.objects.filter(request_code=req_id).exists():
        req_id = f"REQ-{secrets.randbelow(900) + 100}"

    req = LoginRequest.objects.create(
        request_code=req_id,
        user=user,
        username=getattr(user, "username", str(username))[:150],
        operator_code=str(operator_code)[:20],
        operator_name=str(operator_name)[:160],
        branch=str(branch)[:160],
        terminal_ip=str(terminal_ip)[:64],
        action_requested=str(action_requested)[:255],
        status=LoginRequest.Status.PENDING,
        expires_at=timezone.now() + timedelta(seconds=settings.LOGIN_REQUEST_TTL_SECONDS),
    )
    cache_login_request(req)
    write_audit(
        "Staff Authorization Request Dispatched",
        "Security Gate",
        f"{action_requested} ticket {req_id} awaiting verbal clearance",
        operator_name,
        "operator",
        terminal_ip,
        "notice",
    )
    return Response(
        {
            "success": True,
            "status": "pending",
            "request_id": req_id,
            "requestId": req_id,
            "message": "Your login request has been sent to the admin",
            "request": {
                "id": req_id,
                "operatorCode": req.operator_code,
                "operatorName": req.operator_name,
                "branch": req.branch,
                "terminalIp": req.terminal_ip,
                "actionRequested": req.action_requested,
                "timestamp": timezone.localtime(req.created_at).strftime("%I:%M %p"),
                "status": "pending",
            },
        }
    )


def _get_request_by_id(request_id: str) -> LoginRequest | None:
    if not request_id:
        return None
    return LoginRequest.objects.filter(request_code=request_id).first() or LoginRequest.objects.filter(pk=request_id).first()


@api_view(["GET"])
@permission_classes([AllowAny])
def check_request_status(request):
    request_id = request.query_params.get("requestId") or request.query_params.get("request_id")
    cached = cache.get(f"{LOGIN_CACHE_PREFIX}{request_id}") if request_id else None
    req = _get_request_by_id(request_id)
    if req is None and cached is None:
        return Response({"success": False, "status": "not_found", "error": f"Request {request_id} not found"}, status=404)

    if req and req.status == LoginRequest.Status.APPROVED and req.seconds_remaining() == 0:
        req.status = LoginRequest.Status.EXPIRED
        req.save(update_fields=["status"])
        cache_login_request(req)

    status_value = req.status if req else cached["status"]
    body = {
        "success": True,
        "status": status_value,
        "request": serialize_request(req) if req else cached,
    }
    return Response(body)


@api_view(["GET"])
@permission_classes([AllowAny])
def admin_queue(request):
    rows = LoginRequest.objects.all()[:50]
    queue = [serialize_request(r, include_otp=True) for r in rows]
    return Response({"success": True, "queue": queue})


@api_view(["POST"])
@permission_classes([AllowAny])
def approve_request(request, request_id=None):
    request_id = request_id or request.data.get("requestId") or request.data.get("request_id")
    req = _get_request_by_id(str(request_id or "").strip())
    if not req:
        return Response({"success": False, "error": f"Request {request_id} not found"}, status=404)

    part1 = secrets.randbelow(900) + 100
    part2 = secrets.randbelow(900) + 100
    verbal_otp = f"{part1}-{part2}"
    req.status = LoginRequest.Status.APPROVED
    req.verbal_otp = verbal_otp
    req.otp_hash = make_password(verbal_otp.replace("-", ""))
    req.expires_at = timezone.now() + timedelta(seconds=settings.LOGIN_REQUEST_TTL_SECONDS)
    req.save()
    cache_login_request(req)
    write_audit(
        "Admin Cleared Operator Request",
        "Security Gate",
        f"Generated Verbal OTP for ticket {req.request_code}",
        "Admin",
        "admin",
        client_ip(request),
        "notice",
    )
    return Response(
        {
            "success": True,
            "requestId": req.request_code,
            "request_id": req.request_code,
            "status": "approved",
            "verbalOtp": verbal_otp,
            "verbal_otp": verbal_otp,
            "expiresInSeconds": settings.LOGIN_REQUEST_TTL_SECONDS,
            "message": f"Request {req.request_code} approved. Verbal OTP generated: {verbal_otp}",
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def reject_request(request, request_id=None):
    request_id = request_id or request.data.get("requestId") or request.data.get("request_id")
    req = _get_request_by_id(str(request_id or "").strip())
    if not req:
        return Response({"success": False, "error": f"Request {request_id} not found"}, status=404)
    req.status = LoginRequest.Status.REJECTED
    req.save(update_fields=["status"])
    cache_login_request(req)
    write_audit(
        "Admin Rejected Operator Request",
        "Security Gate",
        f"Ticket {req.request_code} denied",
        "Admin",
        "admin",
        client_ip(request),
        "critical",
    )
    return Response({"success": True, "requestId": req.request_code, "request_id": req.request_code, "status": "rejected"})


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp(request):
    raw_otp = str(request.data.get("otpCode") or request.data.get("otp") or request.data.get("verbal_otp") or "").strip()
    request_id = str(request.data.get("requestId") or request.data.get("request_id") or "").strip()
    cleaned = raw_otp.replace("-", "").replace(" ", "")
    if len(cleaned) < 4:
        return Response({"success": False, "error": "Invalid verbal OTP format. 6 digits expected."}, status=400)

    qs = LoginRequest.objects.filter(status=LoginRequest.Status.APPROVED)
    if request_id:
        qs = qs.filter(request_code=request_id)
    matching = None
    for row in qs.order_by("-created_at"):
        stored = (row.verbal_otp or "").replace("-", "").replace(" ", "")
        if stored == cleaned or (row.otp_hash and check_password(cleaned, row.otp_hash)):
            matching = row
            break
    if matching is None:
        write_audit("Verbal OTP Verification Failed", "Security Gate", "Invalid OTP entered", "Operator", "operator", client_ip(request), "critical")
        return Response({"success": False, "error": "Invalid verbal OTP. Please check the 6-digit code with your administrator."}, status=401)
    if matching.seconds_remaining() <= 0:
        matching.status = LoginRequest.Status.EXPIRED
        matching.save(update_fields=["status"])
        return Response({"success": False, "error": "Verbal OTP token has expired. Request a new token from Admin."}, status=401)

    matching.status = LoginRequest.Status.COMPLETED
    matching.save(update_fields=["status"])
    cache_login_request(matching)

    user = matching.user or AuthUser.objects.filter(role=AuthUser.Role.OPERATOR).first()
    if user is None:
        return Response({"success": False, "error": "Operator account missing"}, status=500)
    token = issue_token(user)
    write_audit("Verbal OTP Validated", "Security Gate", f"Operator cleared with ticket {matching.request_code}", matching.operator_name, "operator", client_ip(request), "notice")
    return Response(
        {
            "success": True,
            "token": token.token,
            "role": "operator",
            "user": {
                "operatorCode": matching.operator_code,
                "name": matching.operator_name,
                "branch": matching.branch,
            },
            "expires_at": token.expires_at.timestamp(),
            "message": "Verbal OTP validated. Operator session active.",
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def pin_reset_request(request):
    email = str(request.data.get("email") or "paresh.patel@ariavagency.com").strip()
    challenge_id = f"CHAL-{secrets.randbelow(90000) + 10000}"
    recovery_code = f"{secrets.randbelow(900000) + 100000}"
    cache.set(f"{PIN_RESET_PREFIX}{challenge_id}", {"email": email, "code": recovery_code}, timeout=600)
    write_audit("Admin PIN Reset Initiated", "Security Gate", f"Dispatched challenge {challenge_id} to {email}", "Admin Recovery", "admin", client_ip(request), "notice")
    return Response(
        {
            "success": True,
            "challengeId": challenge_id,
            "email": email,
            "codePreview": recovery_code,
            "expiresInSeconds": 600,
            "message": f"Recovery OTP dispatched to {email}",
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def pin_reset_confirm(request):
    challenge_id = str(request.data.get("challengeId") or "").strip()
    recovery_code = str(request.data.get("code") or "").strip()
    new_pin = str(request.data.get("newPin") or "").strip()
    if not new_pin.isdigit() or len(new_pin) not in (4, 6):
        return Response({"success": False, "error": "New PIN must be 4 to 6 numeric digits."}, status=400)
    cached = cache.get(f"{PIN_RESET_PREFIX}{challenge_id}") if challenge_id else None
    if cached and cached.get("code") != recovery_code:
        return Response({"success": False, "error": "Invalid verification code entered."}, status=400)
    admin = AuthUser.objects.filter(role=AuthUser.Role.ADMIN).first()
    if admin:
        admin.phone = make_password(new_pin)
        admin.save(update_fields=["phone"])
        UserToken.objects.filter(user=admin).update(revoked=True)
        mst = get_or_create_login_mst(admin)
        mst.failed_attempts = 0
        mst.locked_until = None
        mst.save(update_fields=["failed_attempts", "locked_until"])
    write_audit("Admin Master PIN Updated", "Security Gate", "New master PIN provisioned", "Admin", "admin", client_ip(request), "critical")
    return Response({"success": True, "message": "New Admin PIN provisioned successfully. Please authenticate with your new PIN."})


@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        UserToken.objects.filter(token=header[7:].strip()).update(revoked=True)
    return Response({"success": True, "message": "Session terminated successfully"})


@api_view(["GET"])
@permission_classes([AllowAny])
def audit_trail(request):
    logs = [
        {
            "id": f"AUD-{row.id}",
            "timestamp": timezone.localtime(row.timestamp).strftime("%Y-%m-%d %H:%M:%S"),
            "user": row.user,
            "role": row.role,
            "action": row.action,
            "module": row.module,
            "ip_address": row.ip_address,
            "details": row.details,
            "severity": row.severity,
        }
        for row in AuditLog.objects.all()[:100]
    ]
    return Response({"success": True, "logs": logs})


@api_view(["GET"])
@permission_classes([AllowAny])
def dashboard_summary(request):
    invoice_agg = SalesInvoice.objects.aggregate(total=Sum("net_amount"), gst=Sum("gst_amount"))
    turnover = invoice_agg["total"] or 0
    debtors = (
        AccountMaster.objects.filter(group=AccountMaster.AccountGroup.DEBTORS).aggregate(total=Sum("opening_balance"))["total"]
        or 0
    )
    creditors = (
        AccountMaster.objects.filter(group=AccountMaster.AccountGroup.CREDITORS).aggregate(total=Sum("opening_balance"))["total"]
        or 0
    )
    banks = (
        AccountMaster.objects.filter(group=AccountMaster.AccountGroup.BANKS).aggregate(total=Sum("opening_balance"))["total"]
        or 0
    )
    overdue = list(
        AccountMaster.objects.filter(group=AccountMaster.AccountGroup.DEBTORS).values(
            "name", "city", "broker", "opening_balance", "credit_days"
        )[:8]
    )
    return Response(
        {
            "success": True,
            "metrics": {
                "turnover": str(turnover),
                "debtors": str(debtors),
                "creditors": str(creditors),
                "banks": str(banks),
                "orders": OrderForm.objects.count(),
                "invoices": SalesInvoice.objects.count(),
                "items": ItemMaster.objects.count(),
                "branches": MasterBranch.objects.count(),
            },
            "overdue": overdue,
            "ledger_lines": LedgerLine.objects.count(),
        }
    )
