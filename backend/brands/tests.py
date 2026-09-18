from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from brands.models import Brand


class BrandMasterApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="brand-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="brand-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()

    def _auth(self, user):
        self.client.force_authenticate(user)

    def _create(self, **kwargs):
        payload = {
            "brand_code": "BRN-01",
            "brand_name": "Sample Mills",
            "order_method": "Digital PO",
            "status": "Active",
            "commission_rate": "2.50",
            "commission_basis": "% of invoice value",
            "credit_days": 30,
        }
        payload.update(kwargs)
        return self.client.post("/api/brands/", payload, format="json", HTTP_HOST="localhost")

    def test_unauthenticated_list_denied(self):
        res = self.client.get("/api/brands/", HTTP_HOST="localhost")
        self.assertIn(res.status_code, (401, 403))

    def test_operator_can_read_not_write(self):
        self._auth(self.operator)
        res = self.client.get("/api/brands/", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200)
        res = self._create()
        self.assertEqual(res.status_code, 403)

    def test_admin_create_list_search_status_and_soft_delete(self):
        self._auth(self.admin)
        res = self._create()
        self.assertEqual(res.status_code, 201, res.content)
        brand_id = res.json()["id"]
        self.assertEqual(res.json()["brand_code"], "BRN-01")

        dup = self._create()
        self.assertEqual(dup.status_code, 400)

        listed = self.client.get("/api/brands/", HTTP_HOST="localhost")
        self.assertEqual(len(listed.json()), 1)

        search = self.client.get("/api/brands/", {"search": "sample"}, HTTP_HOST="localhost")
        self.assertEqual(len(search.json()), 1)

        inactive = self.client.get("/api/brands/", {"status": "Inactive"}, HTTP_HOST="localhost")
        self.assertEqual(inactive.json(), [])

        deleted = self.client.delete(f"/api/brands/{brand_id}/", HTTP_HOST="localhost")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["status"], "Inactive")
        self.assertTrue(Brand.objects.filter(pk=brand_id).exists())

        still = self.client.get("/api/brands/", {"status": "Inactive"}, HTTP_HOST="localhost")
        self.assertEqual(len(still.json()), 1)

    def test_duplicate_code_three_times_creates_zero_extra_rows(self):
        self._auth(self.admin)
        first = self._create(brand_code="XYZ", brand_name="Original Mill")
        self.assertEqual(first.status_code, 201, first.content)
        before = Brand.objects.count()
        for _ in range(3):
            res = self._create(brand_code="XYZ", brand_name="Clone Mill")
            self.assertEqual(res.status_code, 400, res.content)
            body = res.json()
            self.assertTrue(body.get("brand_code"), body)
            self.assertIn("already in use", " ".join(body["brand_code"]).lower())
        self.assertEqual(Brand.objects.count(), before)
        self.assertEqual(Brand.objects.filter(brand_name="Clone Mill").count(), 0)
        self.assertEqual(Brand.objects.filter(brand_code="XYZ").count(), 1)

    def test_permanent_delete_rejected_on_active(self):
        self._auth(self.admin)
        brand_id = self._create().json()["id"]
        res = self.client.delete(
            f"/api/brands/{brand_id}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("inactive", res.json()["detail"].lower())
        self.assertTrue(Brand.objects.filter(pk=brand_id, status="Active").exists())

    def test_permanent_delete_after_deactivate_removes_row(self):
        self._auth(self.admin)
        brand_id = self._create().json()["id"]
        soft = self.client.delete(f"/api/brands/{brand_id}/", HTTP_HOST="localhost")
        self.assertEqual(soft.status_code, 200)
        hard = self.client.delete(
            f"/api/brands/{brand_id}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(hard.status_code, 204, hard.content)
        self.assertFalse(Brand.objects.filter(pk=brand_id).exists())

    def test_operator_cannot_permanent_delete(self):
        self._auth(self.admin)
        brand_id = self._create().json()["id"]
        self.client.delete(f"/api/brands/{brand_id}/", HTTP_HOST="localhost")
        self._auth(self.operator)
        res = self.client.delete(
            f"/api/brands/{brand_id}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Brand.objects.filter(pk=brand_id).exists())

    def test_reactivate_via_patch(self):
        self._auth(self.admin)
        brand_id = self._create().json()["id"]
        self.client.delete(f"/api/brands/{brand_id}/", HTTP_HOST="localhost")
        res = self.client.patch(
            f"/api/brands/{brand_id}/",
            {"status": "Active"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["status"], "Active")

    def test_permanent_delete_blocked_when_active_products_exist(self):
        from categories.models import Category
        from products.models import Product

        self._auth(self.admin)
        brand_id = self._create().json()["id"]
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        Product.objects.create(
            product_code="SKU-BRN",
            product_name="Linked SKU",
            brand_id=brand_id,
            category=sub,
        )
        Brand.objects.filter(pk=brand_id).update(status=Brand.Status.INACTIVE)
        hard = self.client.delete(
            f"/api/brands/{brand_id}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(hard.status_code, 409, hard.content)
        self.assertIn("product", hard.json()["detail"].lower())
        self.assertTrue(Brand.objects.filter(pk=brand_id).exists())
