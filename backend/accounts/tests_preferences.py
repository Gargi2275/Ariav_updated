from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import AuthUser, UserPreference

H = {"HTTP_HOST": "localhost"}


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class PreferenceTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(username="pref-admin", password="x", role=AuthUser.Role.ADMIN)
        self.staff = AuthUser.objects.create_user(username="pref-staff", password="x", role=AuthUser.Role.STAFF)
        self.client = APIClient()

    def test_anonymous_cannot_read_preferences(self):
        response = self.client.get("/api/auth/preferences/", **H)
        self.assertIn(response.status_code, (401, 403))

    def test_defaults_partial_update_and_ownership(self):
        self.client.force_authenticate(self.admin)
        first = self.client.get("/api/auth/preferences/", **H)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["preferences"]["theme"], "dark")
        self.assertFalse(first.data["saved"])

        saved = self.client.patch("/api/auth/preferences/", {"theme": "light", "page_size": 50}, format="json", **H)
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data["preferences"]["theme"], "light")
        self.assertEqual(saved.data["preferences"]["page_size"], 50)
        self.assertEqual(saved.data["preferences"]["density"], "comfortable")

        self.client.force_authenticate(self.staff)
        other = self.client.get("/api/auth/preferences/", **H)
        self.assertEqual(other.data["preferences"]["theme"], "dark")
        self.assertEqual(UserPreference.objects.get(user=self.admin).data["theme"], "light")

    def test_invalid_value_is_rejected_and_does_not_stick(self):
        self.client.force_authenticate(self.admin)
        self.client.patch("/api/auth/preferences/", {"theme": "dark"}, format="json", **H)
        rejected = self.client.patch("/api/auth/preferences/", {"theme": "neon"}, format="json", **H)
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(UserPreference.objects.get(user=self.admin).data["theme"], "dark")

    def test_staff_cannot_choose_an_admin_landing_page(self):
        self.client.force_authenticate(self.staff)
        rejected = self.client.patch("/api/auth/preferences/", {"landing_screen_id": 7}, format="json", **H)
        self.assertEqual(rejected.status_code, 400)
        allowed = self.client.patch("/api/auth/preferences/", {"landing_screen_id": 40}, format="json", **H)
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.data["preferences"]["landing_screen_id"], 40)

    def test_reset_clears_only_personal_preferences(self):
        self.client.force_authenticate(self.admin)
        self.client.patch("/api/auth/preferences/", {"theme": "light", "modules": {"39": {"page_size": 100}}}, format="json", **H)
        reset = self.client.post("/api/auth/preferences/reset/", {}, format="json", **H)
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(reset.data["preferences"]["theme"], "dark")
        self.assertEqual(reset.data["preferences"]["modules"], {})
        self.assertTrue(AuthUser.objects.filter(pk=self.admin.pk, role=AuthUser.Role.ADMIN).exists())
