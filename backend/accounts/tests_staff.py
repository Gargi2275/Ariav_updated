from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from dispatches.permissions import DispatchPermission
from invoices.permissions import InvoicePermission
from purchase_orders.permissions import PurchaseOrderPermission

from .models import AuthUser, UserToken
from .views import issue_token

H = {"HTTP_HOST": "localhost"}
PASSWORD = "Staff-pass-123"


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {issue_token(user).token}", **H}


class View:
    def __init__(self, action):
        self.action = action


class StaffManagementTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="staff-admin",
            password=PASSWORD,
            role=AuthUser.Role.ADMIN,
            display_name="Staff Admin",
        )
        self.staff = AuthUser.objects.create_user(
            username="plain.staff",
            password=PASSWORD,
            role=AuthUser.Role.STAFF,
            display_name="Plain Staff",
        )
        self.client = APIClient()

    def test_staff_directory_is_admin_only(self):
        anon = self.client.get("/api/staff/", **H)
        self.assertIn(anon.status_code, (401, 403))
        denied = self.client.get("/api/staff/", **bearer(self.staff))
        self.assertEqual(denied.status_code, 403)
        allowed = self.client.get("/api/staff/", **bearer(self.admin))
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual([row["username"] for row in allowed.json()], ["plain.staff"])

    def test_create_staff_cannot_become_admin_and_hides_secrets(self):
        res = self.client.post(
            "/api/staff/",
            {
                "username": "rita.staff",
                "display_name": "Rita Staff",
                "password": PASSWORD,
                "role": "admin",
                "is_superuser": True,
                "is_staff": True,
                "phone": "123456",
                "login_bypass": False,
                "can_edit": True,
                "can_delete": True,
            },
            format="json",
            **bearer(self.admin),
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertNotIn("password", body)
        self.assertNotIn("phone", body)
        self.assertFalse(body["login_bypass"])
        self.assertNotIn("can_edit", body)
        self.assertNotIn("can_delete", body)
        created = AuthUser.objects.get(username="rita.staff")
        self.assertFalse(created.can_edit)
        self.assertFalse(created.can_delete)
        self.assertEqual(created.role, AuthUser.Role.STAFF)
        self.assertFalse(created.is_superuser)
        self.assertFalse(created.is_staff)
        self.assertEqual(created.phone, "")
        self.assertTrue(created.check_password(PASSWORD))

    def test_login_bypass_is_server_side_only(self):
        denied = self.client.post(
            "/api/check-credentials/",
            {"username": "plain.staff", "password": PASSWORD, "login_bypass": True},
            format="json",
            **H,
        )
        self.assertEqual(denied.status_code, 200)
        self.assertFalse(denied.json()["login_bypass"])
        self.assertNotIn("token", denied.json())

        self.staff.login_bypass = True
        self.staff.save(update_fields=["login_bypass"])
        allowed = self.client.post(
            "/api/check-credentials/",
            {"username": "plain.staff", "password": PASSWORD},
            format="json",
            **H,
        )
        self.assertEqual(allowed.status_code, 200, allowed.content)
        self.assertTrue(allowed.json()["login_bypass"])
        token = allowed.json()["token"]
        me = self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {token}", **H)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["role"], "staff")
        self.assertFalse(me.json()["user"]["can_edit"])
        self.assertFalse(me.json()["user"]["can_delete"])

    def test_deactivate_revokes_the_session(self):
        token = issue_token(self.staff).token
        res = self.client.post(f"/api/staff/{self.staff.id}/deactivate/", {}, format="json", **bearer(self.admin))
        self.assertEqual(res.status_code, 200)
        self.staff.refresh_from_db()
        self.assertFalse(self.staff.is_active)
        self.assertFalse(UserToken.objects.get(token=token).is_valid())
        blocked = self.client.post(
            "/api/check-credentials/",
            {"username": "plain.staff", "password": PASSWORD},
            format="json",
            **H,
        )
        self.assertEqual(blocked.status_code, 401)

    def test_password_change_revokes_existing_tokens(self):
        token = issue_token(self.staff).token
        res = self.client.put(
            f"/api/staff/{self.staff.id}/",
            {
                "username": "plain.staff",
                "display_name": "Plain Staff",
                "password": "Another-pass-456",
                "is_active": True,
                "login_bypass": False,
                "can_edit": False,
                "can_delete": False,
            },
            format="json",
            **bearer(self.admin),
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(UserToken.objects.get(token=token).is_valid())
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password("Another-pass-456"))

    def test_edit_and_delete_are_off_until_granted(self):
        factory = RequestFactory()
        edit = factory.put("/api/purchase-orders/1/")
        edit.user = self.staff
        delete = factory.delete("/api/purchase-orders/1/")
        delete.user = self.staff
        create = factory.post("/api/purchase-orders/")
        create.user = self.staff
        for permission in (PurchaseOrderPermission, InvoicePermission, DispatchPermission):
            self.assertFalse(permission().has_permission(edit, View("update")))
            self.assertFalse(permission().has_permission(delete, View("destroy")))
            self.assertTrue(permission().has_permission(create, View("create")))
        self.staff.can_edit = True
        self.staff.can_delete = True
        for permission in (PurchaseOrderPermission, InvoicePermission, DispatchPermission):
            self.assertTrue(permission().has_permission(edit, View("update")))
            self.assertTrue(permission().has_permission(delete, View("destroy")))
