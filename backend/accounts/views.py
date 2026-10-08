import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import throttle
from .models import AuditLog, AuthUser, AuthUserMstLogin, LoginRequest, UserToken
from .permissions import IsAdminRole

TEMP_CACHE_PREFIX = "temp_cred:"
PIN_LENGTH = 6

CRED_IP = throttle.Limit(limit=30, window=600, lock=600)
CRED_PAIR = throttle.Limit(limit=5, window=900, lock=300)
PIN_IP = throttle.Limit(limit=30, window=600, lock=600)
PIN_PAIR = throttle.Limit(limit=settings.PIN_MAX_ATTEMPTS, window=900, lock=settings.PIN_LOCKOUT_SECONDS)
OPERATOR_REQUEST_IP = throttle.Limit(limit=10, window=600, lock=600)
OTP_IP = throttle.Limit(limit=20, window=600, lock=600)
CHANGE_PIN_USER = throttle.Limit(limit=settings.PIN_MAX_ATTEMPTS, window=900, lock=settings.PIN_LOCKOUT_SECONDS)


def client_ip(request) -> str:
    """REMOTE_ADDR, unless the deployment sits behind a proxy it trusts to set X-Forwarded-For."""
    if getattr(settings, "TRUST_X_FORWARDED_FOR", False):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
    return request.META.get("REMOTE_ADDR", "")[:64]


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
        "branch_id": user.branch_id,
        "branch_code": user.branch.code if user.branch_id else "",
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


def _digits(raw) -> str:
    return "".join(ch for ch in str(raw or "") if ch.isdigit())


def pin_matches(user: AuthUser, raw_pin) -> bool:
    """Check a PIN against the stored hash. Six zero-padded digits also match a
    legacy shorter PIN (e.g. 4 digits entered as 00xxxx) until the admin changes it."""
    if not user.phone:
        return False
    digits = _digits(raw_pin)
    if not digits:
        return False
    if check_password(digits, user.phone):
        return True
    legacy = digits.lstrip("0")
    return bool(legacy) and legacy != digits and len(legacy) >= 4 and check_password(legacy, user.phone)


def _too_many(seconds: int, message: str) -> Response:
    return Response(
        {"success": False, "error": message, "locked": True, "lockout_remaining_seconds": seconds},
        status=429,
    )


def serialize_request(req: LoginRequest) -> dict:
    return {
        "id": req.request_code,
        "operator_code": req.operator_code,
        "operator_name": req.operator_name,
        "branch": req.branch,
        "terminal_ip": req.terminal_ip,
        "action_requested": req.action_requested,
        "timestamp": timezone.localtime(req.created_at).strftime("%I:%M %p"),
        "status": req.effective_status(),
        "seconds_remaining": req.seconds_remaining(),
        "created_at": req.created_at.timestamp(),
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "healthy", "service": "Ariav ERP API", "timestamp": timezone.now().isoformat()})


@api_view(["POST"])
@permission_classes([AllowAny])
def check_credentials(request):
    ip = client_ip(request)
    username = str(request.data.get("username", "")).strip()
    password = str(request.data.get("password", "")).strip()
    if not username or not password:
        return Response({"success": False, "error": "Both username and password are required."}, status=400)

    locked = throttle.locked_seconds("cred-ip", ip) or throttle.locked_seconds("cred-pair", ip, username)
    if locked:
        return _too_many(locked, f"Too many sign-in attempts. Try again in {locked} seconds.")
    throttle.bump("cred-ip", ip, rule=CRED_IP)

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
            ip,
            "critical",
        )
        _, lock = throttle.bump("cred-pair", ip, username, rule=CRED_PAIR)
        if lock:
            return _too_many(lock, f"Too many sign-in attempts. Try again in {lock} seconds.")
        return Response({"success": False, "error": "Invalid username or password"}, status=401)

    throttle.reset("cred-pair", ip, username)

    if user.is_admin_role:
        temp_token = "tmp_" + secrets.token_hex(20)
        cache.set(
            f"{TEMP_CACHE_PREFIX}{temp_token}",
            {"user_id": user.id},
            timeout=settings.TEMP_TOKEN_SECONDS,
        )
        write_audit(
            "Admin Credentials Verified",
            "Security Gate",
            f"Credentials authenticated for {user.username}. Proceeding to PIN.",
            user.display_name or user.username,
            "admin",
            ip,
        )
        pin_lock = throttle.locked_seconds("pin-pair", ip, user.id)
        return Response(
            {
                "success": True,
                "user_type": "admin",
                "role": "admin",
                "message": "Admin credentials verified. Proceed to Master PIN verification.",
                "temp_token": temp_token,
                "username": user.username,
                "name": user.display_name or user.username,
                "locked": bool(pin_lock),
                "lockout_remaining_seconds": pin_lock,
            }
        )

    write_audit(
        "Staff Credentials Verified",
        "Security Gate",
        f"Staff credentials verified for {user.username}.",
        user.display_name or user.username,
        "operator",
        ip,
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
    """Second step of admin sign-in. Only a temp_token from check-credentials identifies the account."""
    ip = client_ip(request)
    temp_token = str(request.data.get("temp_token", "")).strip()
    raw_pin = str(request.data.get("pin", "")).strip()

    ip_lock = throttle.locked_seconds("pin-ip", ip)
    if ip_lock:
        return _too_many(ip_lock, f"Too many PIN attempts. Try again in {ip_lock} seconds.")
    throttle.bump("pin-ip", ip, rule=PIN_IP)

    cached = cache.get(f"{TEMP_CACHE_PREFIX}{temp_token}") if temp_token else None
    user = AuthUser.objects.filter(pk=cached.get("user_id"), is_active=True).first() if cached else None
    if user is None or not user.is_admin_role:
        return Response(
            {"success": False, "error": "Your sign-in step has expired. Enter your username and password again."},
            status=401,
        )
    if not raw_pin:
        return Response({"success": False, "error": "Master PIN is required."}, status=400)

    pair_lock = throttle.locked_seconds("pin-pair", ip, user.id)
    if pair_lock:
        cache.delete(f"{TEMP_CACHE_PREFIX}{temp_token}")
        return _too_many(
            pair_lock,
            f"Security Lockout Active: Too many failed attempts. Verification locked for {pair_lock} more seconds.",
        )

    name = user.display_name or user.username
    mst, _ = AuthUserMstLogin.objects.get_or_create(user=user)
    now = timezone.now()
    if not pin_matches(user, raw_pin):
        hits, lock = throttle.bump("pin-pair", ip, user.id, rule=PIN_PAIR, subject=str(user.id))
        mst.last_attempt_at = now
        mst.save(update_fields=["last_attempt_at"])
        write_audit(
            "Admin Security Lockout Triggered" if lock else "Failed Admin PIN Verification",
            "Security Gate",
            "Incorrect PIN" + (" (locked for this terminal)" if lock else f" (attempt {hits}/{PIN_PAIR.limit})"),
            name,
            "admin",
            ip,
            "critical",
        )
        if lock:
            cache.delete(f"{TEMP_CACHE_PREFIX}{temp_token}")
            return Response(
                {
                    "success": False,
                    "error": "Security Lockout: 5 consecutive failed attempts. PIN verification is locked for 5 minutes.",
                    "locked": True,
                    "lockout_remaining_seconds": lock,
                    "failed_attempts": PIN_PAIR.limit,
                    "remaining_attempts": 0,
                },
                status=429,
            )
        remaining_attempts = PIN_PAIR.limit - hits
        return Response(
            {
                "success": False,
                "error": f"Incorrect PIN. {remaining_attempts} attempt{'s' if remaining_attempts != 1 else ''} remaining before temporary lockout.",
                "locked": False,
                "failed_attempts": hits,
                "remaining_attempts": remaining_attempts,
            },
            status=401,
        )

    throttle.reset("pin-pair", ip, user.id)
    cache.delete(f"{TEMP_CACHE_PREFIX}{temp_token}")
    mst.failed_attempts = 0
    mst.locked_until = None
    mst.last_attempt_at = now
    mst.last_login_at = now
    mst.last_login_ip = ip or None
    mst.first_login = False
    mst.save()

    token = issue_token(user)
    write_audit(
        "Admin Control Plane Unlocked",
        "Security Gate",
        "Two-step verification completed (credentials + PIN)",
        name,
        "admin",
        ip,
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


@api_view(["POST"])
@permission_classes([IsAdminRole])
def change_pin(request):
    """Authenticated admin changes their own PIN; requires the current PIN."""
    user = request.user
    ip = client_ip(request)
    locked = throttle.locked_seconds("change-pin", user.id)
    if locked:
        return _too_many(locked, f"Too many incorrect PINs. Try again in {locked} seconds.")

    current_pin = str(request.data.get("current_pin", "")).strip()
    new_pin = _digits(request.data.get("new_pin", ""))
    if len(new_pin) != PIN_LENGTH or new_pin != str(request.data.get("new_pin", "")).strip():
        return Response({"success": False, "error": f"New PIN must be exactly {PIN_LENGTH} digits."}, status=400)

    name = user.display_name or user.username
    if not pin_matches(user, current_pin):
        _, lock = throttle.bump("change-pin", user.id, rule=CHANGE_PIN_USER, subject=str(user.id))
        write_audit("Admin PIN Change Refused", "Security Gate", "Current PIN incorrect", name, "admin", ip, "critical")
        if lock:
            return _too_many(lock, f"Too many incorrect PINs. Try again in {lock} seconds.")
        return Response({"success": False, "error": "Current PIN is incorrect."}, status=400)
    if pin_matches(user, new_pin):
        return Response({"success": False, "error": "New PIN must be different from the current PIN."}, status=400)

    throttle.reset("change-pin", user.id)
    user.phone = make_password(new_pin)
    user.save(update_fields=["phone"])
    current_token = getattr(request.auth, "pk", None)
    UserToken.objects.filter(user=user, revoked=False).exclude(pk=current_token).update(revoked=True)
    write_audit("Admin Master PIN Changed", "Security Gate", "PIN changed; other sessions signed out", name, "admin", ip, "critical")
    return Response({"success": True, "message": "Master PIN changed. Your other sessions have been signed out."})


@api_view(["POST"])
@permission_classes([AllowAny])
def operator_login_request(request):
    ip = client_ip(request)
    locked = throttle.locked_seconds("operator-request", ip)
    if locked:
        return _too_many(locked, f"Too many login requests from this terminal. Try again in {locked} seconds.")
    throttle.bump("operator-request", ip, rule=OPERATOR_REQUEST_IP)

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
    username = request.data.get("username") or operator_name

    operators = AuthUser.objects.filter(role=AuthUser.Role.OPERATOR, is_active=True, is_superuser=False)
    user = operators.filter(username__iexact=str(username)).first() or operators.filter(operator_code=operator_code).first()
    if user is not None:
        operator_name = user.display_name or user.username

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
        terminal_ip=ip,
        action_requested=str(action_requested)[:255],
        status=LoginRequest.Status.PENDING,
        expires_at=timezone.now() + timedelta(seconds=settings.LOGIN_REQUEST_TTL_SECONDS),
    )
    write_audit(
        "Staff Authorization Request Dispatched",
        "Security Gate",
        f"{action_requested} ticket {req_id} awaiting verbal clearance",
        operator_name,
        "operator",
        ip,
        "notice",
    )
    timestamp = timezone.localtime(req.created_at).strftime("%I:%M %p")
    return Response(
        {
            "success": True,
            "status": "pending",
            "request_id": req_id,
            "requestId": req_id,
            "message": "Your login request has been sent to the admin",
            "request": {"id": req_id, "timestamp": timestamp, "status": "pending"},
        }
    )


def _get_request_by_code(request_id) -> LoginRequest | None:
    request_id = str(request_id or "").strip()
    if not request_id:
        return None
    return LoginRequest.objects.filter(request_code=request_id).first()


@api_view(["GET"])
@permission_classes([AllowAny])
def check_request_status(request):
    """Read-only status poll for the operator waiting screen."""
    request_id = request.query_params.get("requestId") or request.query_params.get("request_id")
    req = _get_request_by_code(request_id)
    if req is None:
        return Response({"success": False, "status": "not_found"}, status=404)
    return Response({"success": True, "status": req.effective_status()})


@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_queue(request):
    rows = LoginRequest.objects.all()[:50]
    return Response({"success": True, "queue": [serialize_request(r) for r in rows]})


@api_view(["POST"])
@permission_classes([IsAdminRole])
def approve_request(request, request_id=None):
    """The verbal OTP is returned here, once, to the approving admin. Only its hash is stored."""
    request_id = request_id or request.data.get("requestId") or request.data.get("request_id")
    req = _get_request_by_code(request_id)
    if not req:
        return Response({"success": False, "error": f"Request {request_id} not found"}, status=404)
    if req.status != LoginRequest.Status.PENDING:
        return Response({"success": False, "error": f"Request {req.request_code} is no longer pending."}, status=400)

    part1 = secrets.randbelow(900) + 100
    part2 = secrets.randbelow(900) + 100
    verbal_otp = f"{part1}-{part2}"
    req.status = LoginRequest.Status.APPROVED
    req.verbal_otp = ""
    req.otp_hash = make_password(f"{part1}{part2}")
    req.otp_failed_attempts = 0
    req.expires_at = timezone.now() + timedelta(seconds=settings.LOGIN_REQUEST_TTL_SECONDS)
    req.save()
    admin = request.user
    write_audit(
        "Admin Cleared Operator Request",
        "Security Gate",
        f"Generated Verbal OTP for ticket {req.request_code}",
        admin.display_name or admin.username,
        "admin",
        client_ip(request),
        "notice",
    )
    response = Response(
        {
            "success": True,
            "requestId": req.request_code,
            "request_id": req.request_code,
            "status": "approved",
            "verbalOtp": verbal_otp,
            "verbal_otp": verbal_otp,
            "expiresInSeconds": settings.LOGIN_REQUEST_TTL_SECONDS,
            "message": f"Request {req.request_code} approved.",
        }
    )
    response["Cache-Control"] = "no-store"
    return response


@api_view(["POST"])
@permission_classes([IsAdminRole])
def reject_request(request, request_id=None):
    request_id = request_id or request.data.get("requestId") or request.data.get("request_id")
    req = _get_request_by_code(request_id)
    if not req:
        return Response({"success": False, "error": f"Request {request_id} not found"}, status=404)
    if req.status not in (LoginRequest.Status.PENDING, LoginRequest.Status.APPROVED):
        return Response({"success": False, "error": f"Request {req.request_code} is already closed."}, status=400)
    req.status = LoginRequest.Status.REJECTED
    req.otp_hash = ""
    req.save(update_fields=["status", "otp_hash"])
    admin = request.user
    write_audit(
        "Admin Rejected Operator Request",
        "Security Gate",
        f"Ticket {req.request_code} denied",
        admin.display_name or admin.username,
        "admin",
        client_ip(request),
        "critical",
    )
    return Response({"success": True, "requestId": req.request_code, "request_id": req.request_code, "status": "rejected"})


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp(request):
    ip = client_ip(request)
    locked = throttle.locked_seconds("otp-ip", ip)
    if locked:
        return _too_many(locked, f"Too many verification attempts. Try again in {locked} seconds.")
    throttle.bump("otp-ip", ip, rule=OTP_IP)

    request_id = str(request.data.get("requestId") or request.data.get("request_id") or "").strip()
    cleaned = _digits(request.data.get("otpCode") or request.data.get("otp") or request.data.get("verbal_otp"))
    if not request_id:
        return Response({"success": False, "error": "Login request ID is required."}, status=400)
    if len(cleaned) != 6:
        return Response({"success": False, "error": "Invalid verbal OTP format. 6 digits expected."}, status=400)

    refused = Response(
        {"success": False, "error": "Invalid or expired verbal OTP. Ask your administrator to approve a new request."},
        status=401,
    )
    req = _get_request_by_code(request_id)
    if req is None or req.status != LoginRequest.Status.APPROVED or not req.otp_hash:
        write_audit("Verbal OTP Verification Failed", "Security Gate", "No approved request for this ticket", "Operator", "operator", ip, "critical")
        return refused
    if req.seconds_remaining() <= 0:
        req.status = LoginRequest.Status.EXPIRED
        req.otp_hash = ""
        req.save(update_fields=["status", "otp_hash"])
        return Response(
            {"success": False, "error": "Verbal OTP token has expired. Request a new token from Admin."}, status=401
        )
    if not check_password(cleaned, req.otp_hash):
        req.otp_failed_attempts += 1
        exhausted = req.otp_failed_attempts >= settings.OTP_MAX_ATTEMPTS
        if exhausted:
            req.status = LoginRequest.Status.EXPIRED
            req.otp_hash = ""
        req.save(update_fields=["otp_failed_attempts", "status", "otp_hash"])
        write_audit(
            "Verbal OTP Verification Failed",
            "Security Gate",
            f"Wrong OTP for ticket {req.request_code}" + (" — ticket invalidated" if exhausted else ""),
            req.operator_name or "Operator",
            "operator",
            ip,
            "critical",
        )
        if exhausted:
            return Response(
                {"success": False, "error": "Too many wrong codes. Ask your administrator to approve a new request."},
                status=401,
            )
        remaining = settings.OTP_MAX_ATTEMPTS - req.otp_failed_attempts
        return Response(
            {"success": False, "error": f"Invalid verbal OTP. {remaining} attempt{'s' if remaining != 1 else ''} left."},
            status=401,
        )

    user = req.user
    if user is None or not user.is_active or user.is_admin_role:
        req.status = LoginRequest.Status.EXPIRED
        req.otp_hash = ""
        req.save(update_fields=["status", "otp_hash"])
        return Response({"success": False, "error": "No active operator account is linked to this request."}, status=401)

    req.status = LoginRequest.Status.COMPLETED
    req.otp_hash = ""
    req.save(update_fields=["status", "otp_hash"])
    token = issue_token(user)
    write_audit("Verbal OTP Validated", "Security Gate", f"Operator cleared with ticket {req.request_code}", req.operator_name, "operator", ip, "notice")
    return Response(
        {
            "success": True,
            "token": token.token,
            "role": "operator",
            "user": {
                "operatorCode": req.operator_code,
                "name": req.operator_name,
                "branch": req.branch,
            },
            "expires_at": token.expires_at.timestamp(),
            "message": "Verbal OTP validated. Operator session active.",
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def session_me(request):
    user = request.user
    if not isinstance(user, AuthUser):
        return Response({"success": False, "error": "Not authenticated"}, status=401)
    role = "admin" if user.is_admin_role else "operator"
    if user.branch_id:
        user = AuthUser.objects.select_related("branch").get(pk=user.pk)
    return Response({"success": True, "role": role, "user": public_user(user)})


@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        UserToken.objects.filter(token=header[7:].strip()).update(revoked=True)
    return Response({"success": True, "message": "Session terminated successfully"})


@api_view(["GET"])
@permission_classes([IsAdminRole])
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
