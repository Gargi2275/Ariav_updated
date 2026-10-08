from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from products.models import Product


class PriceListApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(username="price-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        self.operator = AuthUser.objects.create_user(username="price-op", password="pass12345", role=AuthUser.Role.OPERATOR)
        self.brand = Brand.objects.create(brand_code="BR-1", brand_name="Brand One", order_method="Digital PO")
        self.other_brand = Brand.objects.create(brand_code="BR-2", brand_name="Brand Two", order_method="Digital PO")
        self.parent = Category.objects.create(category_code="CAT", category_name="Fabric")
        self.category = Category.objects.create(category_code="SUB", category_name="Cotton", parent_category=self.parent)
        self.product = Product.objects.create(product_code="SKU-1", product_name="Blue", brand=self.brand, category=self.category, rate=Decimal("42.00"))
        self.other_product = Product.objects.create(product_code="SKU-2", product_name="Red", brand=self.other_brand, category=self.category, rate=Decimal("43.00"))
        self.client = APIClient()

    def auth(self, user):
        self.client.force_authenticate(user)

    def list_payload(self, **overrides):
        payload = {"brand_id": self.brand.id, "season_label": "Summer 2026", "valid_from": "2026-10-01", "valid_to": "2027-03-31", "status": "Draft"}
        payload.update(overrides)
        return payload

    def entry_payload(self, **overrides):
        payload = {"product_id": self.product.id, "taka_length_meters": "25", "price_basis": "Per Taka", "price_value": "1250", "status": "Active"}
        payload.update(overrides)
        return payload

    def create_list(self, **overrides):
        return self.client.post("/api/price-lists/", self.list_payload(**overrides), format="json")

    def test_formula_and_product_scope_and_duplicate(self):
        self.auth(self.admin)
        price_list = self.create_list().json()
        response = self.client.post(f"/api/price-lists/{price_list['id']}/entries/", self.entry_payload(), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["price_per_meter"], "50.00")
        self.assertEqual(response.json()["price_per_taka"], "1250.00")
        duplicate = self.client.post(f"/api/price-lists/{price_list['id']}/entries/", self.entry_payload(), format="json")
        self.assertEqual(duplicate.status_code, 400)
        wrong_brand = self.client.post(f"/api/price-lists/{price_list['id']}/entries/", self.entry_payload(product_id=self.other_product.id), format="json")
        self.assertEqual(wrong_brand.status_code, 400)

    def test_per_meter_formula_and_date_validation(self):
        self.auth(self.admin)
        invalid = self.create_list(valid_from="2026-09-30", valid_to="2026-04-01")
        self.assertEqual(invalid.status_code, 400)
        price_list = self.create_list().json()
        response = self.client.post(f"/api/price-lists/{price_list['id']}/entries/", self.entry_payload(price_basis="Per Meter", price_value="50"), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["price_per_meter"], "50.00")
        self.assertEqual(response.json()["price_per_taka"], "1250.00")

    def test_current_price_and_product_fallback(self):
        self.auth(self.admin)
        price_list = self.create_list(status="Active").json()
        self.client.post(f"/api/price-lists/{price_list['id']}/entries/", self.entry_payload(), format="json")
        current = self.client.get(f"/api/products/{self.product.id}/current-price/?date=2026-11-01")
        self.assertEqual(current.status_code, 200)
        self.assertEqual(current.json()["price"], "50.00")
        fallback = self.client.get(f"/api/products/{self.product.id}/current-price/?date=2028-06-01")
        self.assertEqual(fallback.json()["price"], "42.00")
        self.assertEqual(fallback.json()["source"], "Product")

    def test_operator_read_only_and_active_overlap_warning(self):
        self.auth(self.admin)
        first = self.create_list(status="Active").json()
        self.client.post(f"/api/price-lists/{first['id']}/entries/", self.entry_payload(), format="json")
        second = self.create_list(season_label="Early Winter", status="Active").json()
        self.client.post(f"/api/price-lists/{second['id']}/entries/", self.entry_payload(price_value="1300"), format="json")
        overlap = self.client.put(f"/api/price-lists/{second['id']}/", self.list_payload(status="Active", season_label="Early Winter"), format="json")
        self.assertEqual(overlap.status_code, 200)
        self.assertIn("overlaps", overlap.json()["warning"])
        self.auth(self.operator)
        self.assertEqual(self.client.get("/api/price-lists/").status_code, 200)
        self.assertEqual(self.create_list().status_code, 403)
