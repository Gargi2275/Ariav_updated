"""Auth lockdown: attack chains, role checks, end-to-end sign-in flows and rate limits.

Assertions compare status codes and selected keys only, so a failure never echoes a
PIN, OTP or session token into the test output.
"""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AuditLog, AuthThrottle, AuthUser, LoginRequest, UserToken
from accounts.views import issue_token

ADMIN_PASSWORD = "lockdown-admin-pass"
OPERATOR_PASSWORD = "lockdown-operator-pass"
ADMIN_PIN = "602418"
OTHER_PIN = "731905"
H = {"HTTP_HOST": "localhost"}


def _wrong_pin(pin: str) -> str:
    return pin[:-1] + str((int(pin[-1]) + 1) % 10)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AuthTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = AuthUser.objects.create_user(
            username="lock-admin",
            password=ADMIN_PASSWORD,
            role=AuthUser.Role.ADMIN,
            display_name="Lock Admin",
            phone=make_password(ADMIN_PIN),
        )
        self.operator = AuthUser.objects.create_user(
            username="lock-operator",
            password=OPERATOR_PASSWORD,
            role=AuthUser.Role.OPERATOR,
            display_name="Lock Operator",
            operator_code="OP-LK",
        )

    # --- helpers -----------------------------------------------------------------

    def client_from(self, ip="10.0.0.1", token=None) -> APIClient:
        client = APIClient(REMOTE_ADDR=ip)
        if token:
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return client

    def check_credentials(self, username, password, ip="10.0.0.1"):
        return self.client_from(ip).post(
            "/api/check-credentials/", {"username": username, "password": password}, format="json", **H
        )

    def temp_token(self, ip="10.0.0.1") -> str:
        res = self.check_credentials(self.admin.username, ADMIN_PASSWORD, ip)
        self.assertEqual(res.status_code, 200)
        return res.json()["temp_token"]

    def admin_login(self, pin, temp_token, ip="10.0.0.1"):
        return self.client_from(ip).post(
            "/api/admin-login/", {"pin": pin, "temp_token": temp_token}, format="json", **H
        )

    def admin_token(self, ip="10.0.0.1") -> str:
        res = self.admin_login(ADMIN_PIN, self.temp_token(ip), ip)
        self.assertEqual(res.status_code, 200)
        return res.json()["token"]

    def operator_request(self, ip="10.0.1.1", username="lock-operator") -> str:
        res = self.client_from(ip).post(
            "/api/login/", {"username": username, "branch": "Surat"}, format="json", **H
        )
        self.assertEqual(res.status_code, 200)
        return res.json()["request_id"]

    def approve(self, request_id, admin_token) -> str:
        res = self.client_from(token=admin_token).post(f"/api/admin/approve/{request_id}/", {}, format="json", **H)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Cache-Control"], "no-store")
        return res.json()["verbalOtp"]

    def verify_otp(self, payload, ip="10.0.1.1"):
        return self.client_from(ip).post("/api/verify-otp/", payload, format="json", **H)


class AttackChainTests(AuthTestBase):
    def test_a_anonymous_approve_reject_and_queue_are_refused(self):
        request_id = self.operator_request()
        anon = self.client_from()
        for method, url in (
            ("post", f"/api/admin/approve/{request_id}/"),
            ("post", f"/api/admin/approve/{request_id}"),
            ("post", f"/api/auth/admin/approve/{request_id}/"),
            ("post", f"/api/admin/reject/{request_id}/"),
            ("get", "/api/auth/admin/queue"),
        ):
            res = getattr(anon, method)(url, {}, format="json", **H)
            self.assertIn(res.status_code, (401, 403), url)
        req = LoginRequest.objects.get(request_code=request_id)
        self.assertEqual(req.status, LoginRequest.Status.PENDING)
        self.assertEqual(req.otp_hash, "")

    def test_b_verify_otp_requires_request_id(self):
        request_id = self.operator_request()
        otp = self.approve(request_id, self.admin_token())
        res = self.verify_otp({"otpCode": otp})
        self.assertEqual(res.status_code, 400)
        self.assertNotIn("token", res.json())

    def test_b_verify_otp_refuses_unapproved_request(self):
        request_id = self.operator_request()
        res = self.verify_otp({"request_id": request_id, "otpCode": "123456"})
        self.assertEqual(res.status_code, 401)
        self.assertNotIn("token", res.json())

    def test_b_verify_otp_refuses_wrong_code_and_burns_ticket_after_five(self):
        request_id = self.operator_request()
        otp = self.approve(request_id, self.admin_token())
        digits = otp.replace("-", "")
        wrong = digits[:-1] + str((int(digits[-1]) + 1) % 10)
        for _ in range(5):
            res = self.verify_otp({"request_id": request_id, "otpCode": wrong})
            self.assertEqual(res.status_code, 401)
        req = LoginRequest.objects.get(request_code=request_id)
        self.assertEqual(req.status, LoginRequest.Status.EXPIRED)
        self.assertEqual(req.otp_hash, "")
        res = self.verify_otp({"request_id": request_id, "otpCode": otp})
        self.assertEqual(res.status_code, 401)
        self.assertNotIn("token", res.json())

    def test_b_verify_otp_refuses_expired_ticket(self):
        request_id = self.operator_request()
        otp = self.approve(request_id, self.admin_token())
        LoginRequest.objects.filter(request_code=request_id).update(expires_at=timezone.now() - timedelta(seconds=1))
        res = self.verify_otp({"request_id": request_id, "otpCode": otp})
        self.assertEqual(res.status_code, 401)

    def test_b_verify_otp_is_rate_limited_per_ip(self):
        for _ in range(20):
            self.assertEqual(self.verify_otp({"request_id": "REQ-000", "otpCode": "111111"}, ip="10.9.9.9").status_code, 401)
        self.assertEqual(self.verify_otp({"request_id": "REQ-000", "otpCode": "111111"}, ip="10.9.9.9").status_code, 429)
        self.assertEqual(self.verify_otp({"request_id": "REQ-000", "otpCode": "111111"}, ip="10.9.9.8").status_code, 401)

    def test_b_verify_otp_never_falls_back_to_another_operator(self):
        orphan = LoginRequest.objects.create(
            request_code="REQ-ORF",
            user=None,
            username="nobody",
            status=LoginRequest.Status.APPROVED,
            otp_hash=make_password("246810"),
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        res = self.verify_otp({"request_id": orphan.request_code, "otpCode": "246810"})
        self.assertEqual(res.status_code, 401)
        self.assertFalse(UserToken.objects.filter(user=self.operator).exists())

    def test_c_admin_login_with_pin_only_is_refused(self):
        client = self.client_from()
        for payload in (
            {"pin": ADMIN_PIN},
            {"pin": ADMIN_PIN, "username": self.admin.username},
            {"pin": ADMIN_PIN, "temp_token": "tmp_forged"},
        ):
            res = client.post("/api/admin-login/", payload, format="json", **H)
            self.assertEqual(res.status_code, 401)
            self.assertNotIn("token", res.json())
        self.assertFalse(UserToken.objects.filter(user=self.admin).exists())

    def test_c_temp_token_is_single_use(self):
        temp = self.temp_token()
        self.assertEqual(self.admin_login(ADMIN_PIN, temp).status_code, 200)
        self.assertEqual(self.admin_login(ADMIN_PIN, temp).status_code, 401)

    def test_c_operator_temp_token_does_not_exist(self):
        res = self.check_credentials(self.operator.username, OPERATOR_PASSWORD)
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("temp_token", res.json())

    def test_d_old_pin_reset_and_status_routes_are_gone(self):
        client = self.client_from()
        for url in (
            "/api/auth/admin/pin-reset/request",
            "/api/auth/admin/pin-reset/confirm",
            "/api/admin/pin-status",
            "/api/auth/admin/pin-status",
        ):
            self.assertEqual(client.post(url, {}, format="json", **H).status_code, 404, url)
            self.assertEqual(client.get(url, **H).status_code, 404, url)

    def test_d_change_pin_with_wrong_current_pin_is_refused(self):
        token = self.admin_token()
        res = self.client_from(token=token).post(
            "/api/auth/admin/change-pin",
            {"current_pin": _wrong_pin(ADMIN_PIN), "new_pin": OTHER_PIN},
            format="json",
            **H,
        )
        self.assertEqual(res.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(check_password(ADMIN_PIN, self.admin.phone))

    def test_d_change_pin_wrong_current_pin_locks_after_five(self):
        client = self.client_from(token=self.admin_token())
        body = {"current_pin": _wrong_pin(ADMIN_PIN), "new_pin": OTHER_PIN}
        codes = [client.post("/api/auth/admin/change-pin", body, format="json", **H).status_code for _ in range(5)]
        self.assertEqual(codes, [400, 400, 400, 400, 429])
        res = client.post(
            "/api/auth/admin/change-pin", {"current_pin": ADMIN_PIN, "new_pin": OTHER_PIN}, format="json", **H
        )
        self.assertEqual(res.status_code, 429)

    def test_d_change_pin_anonymous_is_refused(self):
        res = self.client_from().post(
            "/api/auth/admin/change-pin", {"current_pin": ADMIN_PIN, "new_pin": OTHER_PIN}, format="json", **H
        )
        self.assertIn(res.status_code, (401, 403))


class OperatorRoleTests(AuthTestBase):
    def test_operator_token_is_refused_on_admin_routes(self):
        request_id = self.operator_request()
        token = issue_token(self.operator).token
        client = self.client_from(token=token)
        for method, url in (
            ("post", f"/api/admin/approve/{request_id}/"),
            ("post", f"/api/admin/reject/{request_id}/"),
            ("get", "/api/auth/admin/queue"),
            ("get", "/api/auth/audit-trail"),
            ("post", "/api/auth/admin/change-pin"),
        ):
            res = getattr(client, method)(url, {}, format="json", **H)
            self.assertEqual(res.status_code, 403, url)
        self.assertEqual(LoginRequest.objects.get(request_code=request_id).status, LoginRequest.Status.PENDING)

    def test_admin_can_read_audit_trail(self):
        res = self.client_from(token=self.admin_token()).get("/api/auth/audit-trail", **H)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["success"])


class EndToEndFlowTests(AuthTestBase):
    def test_admin_flow_password_then_pin_then_session(self):
        res = self.check_credentials(self.admin.username, ADMIN_PASSWORD)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["role"], "admin")
        res = self.admin_login(ADMIN_PIN, res.json()["temp_token"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["role"], "admin")
        me = self.client_from(token=res.json()["token"]).get("/api/auth/me/", **H)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["role"], "admin")

    def test_operator_flow_request_approve_otp_session(self):
        res = self.check_credentials(self.operator.username, OPERATOR_PASSWORD, ip="10.0.1.1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["role"], "operator")
        request_id = self.operator_request(username=res.json()["username"])

        status = self.client_from("10.0.1.1").get(f"/api/check-request-status/?request_id={request_id}", **H)
        self.assertEqual(status.json(), {"success": True, "status": "pending"})

        admin_client = self.client_from(token=self.admin_token())
        queue = admin_client.get("/api/auth/admin/queue", **H)
        self.assertEqual(queue.status_code, 200)
        row = next(r for r in queue.json()["queue"] if r["id"] == request_id)
        self.assertNotIn("verbal_otp", row)
        self.assertNotIn("verbalOtp", row)

        otp = self.approve(request_id, admin_client._credentials["HTTP_AUTHORIZATION"][7:])
        req = LoginRequest.objects.get(request_code=request_id)
        self.assertEqual(req.verbal_otp, "")
        self.assertNotEqual(req.otp_hash, "")
        queue = admin_client.get("/api/auth/admin/queue", **H)
        row = next(r for r in queue.json()["queue"] if r["id"] == request_id)
        self.assertEqual(row["status"], "approved")
        self.assertNotIn("verbal_otp", row)

        res = self.verify_otp({"request_id": request_id, "otpCode": otp})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["role"], "operator")
        me = self.client_from(token=res.json()["token"]).get("/api/auth/me/", **H)
        self.assertEqual(me.json()["role"], "operator")
        self.assertEqual(me.json()["user"]["id"], str(self.operator.id))

        req.refresh_from_db()
        self.assertEqual(req.status, LoginRequest.Status.COMPLETED)
        self.assertEqual(req.otp_hash, "")
        self.assertEqual(self.verify_otp({"request_id": request_id, "otpCode": otp}).status_code, 401)

    def test_approved_request_cannot_be_approved_again(self):
        request_id = self.operator_request()
        token = self.admin_token()
        self.approve(request_id, token)
        res = self.client_from(token=token).post(f"/api/admin/approve/{request_id}/", {}, format="json", **H)
        self.assertEqual(res.status_code, 400)
        self.assertNotIn("verbalOtp", res.json())

    def test_request_for_admin_username_cannot_yield_admin_session(self):
        request_id = self.operator_request(username=self.admin.username)
        otp = self.approve(request_id, self.admin_token())
        res = self.verify_otp({"request_id": request_id, "otpCode": otp})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(UserToken.objects.filter(user=self.admin).count(), 1)

    def test_reject_clears_ticket(self):
        request_id = self.operator_request()
        token = self.admin_token()
        res = self.client_from(token=token).post(f"/api/admin/reject/{request_id}/", {}, format="json", **H)
        self.assertEqual(res.status_code, 200)
        status = self.client_from().get(f"/api/check-request-status/?request_id={request_id}", **H)
        self.assertEqual(status.json()["status"], "rejected")

    def test_change_pin_then_login_with_new_pin(self):
        first = self.admin_token(ip="10.0.0.1")
        second = self.admin_token(ip="10.0.0.2")
        res = self.client_from(token=first).post(
            "/api/auth/admin/change-pin", {"current_pin": ADMIN_PIN, "new_pin": OTHER_PIN}, format="json", **H
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client_from(token=first).get("/api/auth/me/", **H).status_code, 200)
        self.assertIn(self.client_from(token=second).get("/api/auth/me/", **H).status_code, (401, 403))
        self.assertEqual(self.admin_login(ADMIN_PIN, self.temp_token()).status_code, 401)
        self.assertEqual(self.admin_login(OTHER_PIN, self.temp_token()).status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action="Admin Master PIN Changed").exists())

    def test_change_pin_rejects_non_six_digit_pin(self):
        client = self.client_from(token=self.admin_token())
        for new_pin in ("1234", "12345a", "1234567"):
            res = client.post(
                "/api/auth/admin/change-pin", {"current_pin": ADMIN_PIN, "new_pin": new_pin}, format="json", **H
            )
            self.assertEqual(res.status_code, 400)


class RateLimitTests(AuthTestBase):
    def test_admin_pin_lockout_is_per_ip_and_account(self):
        for attempt in range(5):
            res = self.admin_login(_wrong_pin(ADMIN_PIN), self.temp_token("10.1.0.1"), "10.1.0.1")
            self.assertEqual(res.status_code, 429 if attempt == 4 else 401)
        self.assertEqual(self.admin_login(ADMIN_PIN, self.temp_token("10.1.0.1"), "10.1.0.1").status_code, 429)
        self.assertEqual(self.admin_login(ADMIN_PIN, self.temp_token("10.1.0.2"), "10.1.0.2").status_code, 200)

    def test_lockout_burns_the_temp_token(self):
        temp = self.temp_token("10.1.1.1")
        for _ in range(4):
            self.assertEqual(self.admin_login(_wrong_pin(ADMIN_PIN), temp, "10.1.1.1").status_code, 401)
        self.assertEqual(self.admin_login(_wrong_pin(ADMIN_PIN), temp, "10.1.1.1").status_code, 429)
        AuthThrottle.objects.all().delete()
        self.assertEqual(self.admin_login(ADMIN_PIN, temp, "10.1.1.1").status_code, 401)

    def test_anonymous_callers_cannot_lock_the_admin(self):
        for _ in range(40):
            self.client_from("10.2.0.1").post(
                "/api/admin-login/", {"pin": _wrong_pin(ADMIN_PIN), "username": self.admin.username}, format="json", **H
            )
        for _ in range(10):
            self.check_credentials(self.admin.username, "wrong-password", ip="10.2.0.1")
        self.assertEqual(self.admin_login(ADMIN_PIN, self.temp_token("10.2.0.2"), "10.2.0.2").status_code, 200)

    def test_admin_login_is_rate_limited_per_ip(self):
        client = self.client_from("10.2.1.1")
        codes = [client.post("/api/admin-login/", {"pin": "000000"}, format="json", **H).status_code for _ in range(31)]
        self.assertEqual(codes[:30], [401] * 30)
        self.assertEqual(codes[30], 429)

    def test_check_credentials_locks_ip_and_username_pair(self):
        for attempt in range(5):
            res = self.check_credentials(self.admin.username, "wrong-password", ip="10.3.0.1")
            self.assertEqual(res.status_code, 429 if attempt == 4 else 401)
        self.assertEqual(self.check_credentials(self.admin.username, ADMIN_PASSWORD, ip="10.3.0.1").status_code, 429)
        self.assertEqual(self.check_credentials(self.admin.username, ADMIN_PASSWORD, ip="10.3.0.2").status_code, 200)
        self.assertEqual(self.check_credentials(self.operator.username, OPERATOR_PASSWORD, ip="10.3.0.1").status_code, 200)

    def test_check_credentials_is_rate_limited_per_ip(self):
        codes = [self.check_credentials(f"nobody-{i}", "x", ip="10.3.1.1").status_code for i in range(31)]
        self.assertEqual(codes[:30], [401] * 30)
        self.assertEqual(codes[30], 429)

    def test_operator_request_is_rate_limited_per_ip(self):
        client = self.client_from("10.4.0.1")
        codes = [client.post("/api/login/", {"username": "lock-operator"}, format="json", **H).status_code for _ in range(11)]
        self.assertEqual(codes[:10], [200] * 10)
        self.assertEqual(codes[10], 429)
        self.assertEqual(LoginRequest.objects.count(), 10)

    def test_throttle_keys_do_not_store_ip_or_username_in_clear(self):
        self.check_credentials(self.admin.username, "wrong-password", ip="10.5.0.1")
        for row in AuthThrottle.objects.all():
            self.assertNotIn("10.5.0.1", row.key)
            self.assertNotIn(self.admin.username, row.key)
            self.assertEqual(len(row.key), 64)


class PublicRouteResponseTests(AuthTestBase):
    def test_health_returns_status_only(self):
        res = self.client_from().get("/api/auth/health", **H)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(set(res.json()), {"status", "service", "timestamp"})

    def test_check_request_status_returns_status_only_and_has_no_side_effects(self):
        request_id = self.operator_request()
        LoginRequest.objects.filter(request_code=request_id).update(expires_at=timezone.now() - timedelta(seconds=1))
        audit_before = AuditLog.objects.count()
        res = self.client_from().get(f"/api/check-request-status/?request_id={request_id}", **H)
        self.assertEqual(res.json(), {"success": True, "status": "expired"})
        self.assertEqual(LoginRequest.objects.get(request_code=request_id).status, LoginRequest.Status.PENDING)
        self.assertEqual(AuditLog.objects.count(), audit_before)

    def test_check_request_status_unknown_id(self):
        res = self.client_from().get("/api/check-request-status/?request_id=REQ-NOPE", **H)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json(), {"success": False, "status": "not_found"})

    def test_public_gets_write_nothing(self):
        self.operator_request()
        counts = (AuditLog.objects.count(), LoginRequest.objects.count(), UserToken.objects.count(), AuthThrottle.objects.count())
        client = self.client_from()
        for url in ("/api/auth/health", "/api/auth/health/", "/api/check-request-status/?request_id=REQ-NOPE"):
            client.get(url, **H)
        self.assertEqual(
            counts,
            (AuditLog.objects.count(), LoginRequest.objects.count(), UserToken.objects.count(), AuthThrottle.objects.count()),
        )

    def test_removed_legacy_routes_return_404(self):
        client = self.client_from(token=self.admin_token())
        for url in (
            "/api/dashboard/summary/",
            "/api/transactions/orders/",
            "/api/transactions/invoices/",
            "/api/ledger/trial-balance/",
            "/api/masters/parties/",
            "/api/admin/pin-status",
        ):
            self.assertEqual(client.get(url, **H).status_code, 404, url)


class MastersPermissionTests(AuthTestBase):
    RESOURCES = ("groups", "items", "parameters", "chart-accounts", "tax-slabs", "brokers", "branches")

    def test_anonymous_cannot_read_masters(self):
        client = self.client_from()
        for name in self.RESOURCES:
            self.assertIn(client.get(f"/api/masters/{name}/", **H).status_code, (401, 403), name)

    def test_operator_reads_but_cannot_write_masters(self):
        client = self.client_from(token=issue_token(self.operator).token)
        for name in self.RESOURCES:
            self.assertEqual(client.get(f"/api/masters/{name}/", **H).status_code, 200, name)
            self.assertEqual(client.post(f"/api/masters/{name}/", {}, format="json", **H).status_code, 403, name)
            self.assertEqual(client.delete(f"/api/masters/{name}/1/", **H).status_code, 403, name)

    def test_admin_write_reaches_validation(self):
        client = self.client_from(token=issue_token(self.admin).token)
        for name in self.RESOURCES:
            self.assertEqual(client.post(f"/api/masters/{name}/", {}, format="json", **H).status_code, 400, name)


class ResetAdminPinCommandTests(AuthTestBase):
    def run_command(self, *answers, username="lock-admin"):
        out = StringIO()
        with patch("accounts.management.commands.reset_admin_pin.getpass", side_effect=list(answers)):
            call_command("reset_admin_pin", username, stdout=out)
        return out.getvalue()

    def test_resets_pin_revokes_sessions_and_audits(self):
        token = self.admin_token()
        output = self.run_command(OTHER_PIN, OTHER_PIN)
        self.assertNotIn(OTHER_PIN, output)
        self.admin.refresh_from_db()
        self.assertTrue(check_password(OTHER_PIN, self.admin.phone))
        self.assertFalse(UserToken.objects.filter(user=self.admin, revoked=False).exists())
        self.assertIn(self.client_from(token=token).get("/api/auth/me/", **H).status_code, (401, 403))
        self.assertTrue(AuditLog.objects.filter(action="Admin Master PIN Reset (server shell)").exists())

    def test_clears_pin_lockout(self):
        for _ in range(5):
            self.admin_login(_wrong_pin(ADMIN_PIN), self.temp_token("10.6.0.1"), "10.6.0.1")
        self.run_command(OTHER_PIN, OTHER_PIN)
        self.assertEqual(self.admin_login(OTHER_PIN, self.temp_token("10.6.0.1"), "10.6.0.1").status_code, 200)

    def test_refuses_mismatch_bad_format_and_operators(self):
        for answers in ((OTHER_PIN, ADMIN_PIN), ("12345", "12345")):
            with self.assertRaises(CommandError):
                self.run_command(*answers)
        with self.assertRaises(CommandError):
            self.run_command(OTHER_PIN, OTHER_PIN, username="lock-operator")
        self.admin.refresh_from_db()
        self.assertTrue(check_password(ADMIN_PIN, self.admin.phone))

    def test_pin_is_not_a_command_argument(self):
        with self.assertRaises(CommandError):
            call_command("reset_admin_pin", "lock-admin", OTHER_PIN, stdout=StringIO())
