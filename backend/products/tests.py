from decimal import Decimal

from rest_framework.test import APIClient

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer
from entities.models import Entity
from products.models import Product
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


class ProductCatalogueApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="prd-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="prd-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.brand = Brand.objects.create(
            brand_code="BRN",
            brand_name="Sample Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        self.root = Category.objects.create(category_code="YARN", category_name="Yarn")
        self.sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=self.root,
        )

    def _product(self, **kwargs):
        payload = {
            "product_code": "SKU-01",
            "product_name": "60s Cotton",
            "brand_id": self.brand.id,
            "category_id": self.sub.id,
            "unit": "Meter",
            "rate": "125.50",
            "availability": "In Stock",
            "status": "Active",
        }
        payload.update(kwargs)
        return self.client.post("/api/products/", payload, format="json", HTTP_HOST="localhost")

    def test_rejects_top_level_category(self):
        res = self._product(category_id=self.root.id)
        self.assertEqual(res.status_code, 400)

    def test_create_filter_soft_delete_and_brand_category_409(self):
        res = self._product()
        self.assertEqual(res.status_code, 201, res.content)
        pid = res.json()["id"]
        self.assertEqual(res.json()["parent_category_name"], "Yarn")

        listed = self.client.get(
            "/api/products/",
            {"brand_id": self.brand.id, "category_id": self.sub.id, "search": "60s"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(len(listed.json()), 1)

        blocked_brand = self.client.delete(f"/api/brands/{self.brand.id}/", HTTP_HOST="localhost")
        self.assertEqual(blocked_brand.status_code, 409)
        blocked_cat = self.client.delete(f"/api/categories/{self.sub.id}/", HTTP_HOST="localhost")
        self.assertEqual(blocked_cat.status_code, 409)
        blocked_root = self.client.delete(f"/api/categories/{self.root.id}/", HTTP_HOST="localhost")
        self.assertEqual(blocked_root.status_code, 409)

        gone = self.client.delete(f"/api/products/{pid}/", HTTP_HOST="localhost")
        self.assertEqual(gone.status_code, 200)
        self.assertEqual(gone.json()["status"], "Inactive")
        self.assertTrue(Product.objects.filter(pk=pid).exists())

        brand_ok = self.client.delete(f"/api/brands/{self.brand.id}/", HTTP_HOST="localhost")
        self.assertEqual(brand_ok.status_code, 200)
        self.assertEqual(brand_ok.json()["status"], "Inactive")

        cat_ok = self.client.delete(f"/api/categories/{self.sub.id}/", HTTP_HOST="localhost")
        self.assertEqual(cat_ok.status_code, 200)

    def test_operator_read_only(self):
        self.client.force_authenticate(self.operator)
        res = self.client.get("/api/products/", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200)
        res = self._product()
        self.assertEqual(res.status_code, 403)

    def test_with_usage_counts_po_lines_excluding_cancelled_and_rejected(self):
        used = Product.objects.get(pk=self._product().json()["id"])
        unused = Product.objects.get(pk=self._product(product_code="SKU-02", product_name="40s Cotton").json()["id"])
        entity = Entity.objects.create(
            short_code="PRD",
            entity_name="Surat Agency",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ring Road",
            city="Surat",
            state="Gujarat",
        )
        customer = Customer.objects.create(customer_code="CUS-PRD", customer_name="Kiran Fabrics", credit_days=30)
        for number, status in (
            ("PO-U1", PurchaseOrder.Status.DRAFT),
            ("PO-U2", PurchaseOrder.Status.BRAND_ACCEPTED),
            ("PO-U3", PurchaseOrder.Status.CANCELLED),
            ("PO-U4", PurchaseOrder.Status.REJECTED),
        ):
            po = PurchaseOrder.objects.create(
                po_number=number, entity=entity, customer=customer, brand=self.brand, status=status
            )
            PurchaseOrderLine.objects.create(
                purchase_order=po, product=used, quantity=Decimal("1.00"), rate=Decimal("1.00"), line_total=Decimal("1.00")
            )

        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get("/api/products/", {"brand_id": self.brand.id, "with_usage": 1}, HTTP_HOST="localhost")
        query_count = len(ctx.captured_queries)
        self.assertEqual(res.status_code, 200)
        counts = {row["id"]: row["usage_count"] for row in res.json()}
        self.assertEqual(counts, {used.id: 2, unused.id: 0})
        self.assertLessEqual(query_count, 3)

        plain = self.client.get("/api/products/", {"brand_id": self.brand.id}, HTTP_HOST="localhost")
        self.assertTrue(all(row["usage_count"] is None for row in plain.json()))

    def test_optional_legacy_fields_round_trip(self):
        res = self._product(
            print_name="60s Cotton Invoice",
            description="Fine count for shirting.",
            product_type="Yarn",
            group="Export",
            frate="110.25",
            trate="130.00",
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["print_name"], "60s Cotton Invoice")
        self.assertEqual(body["description"], "Fine count for shirting.")
        self.assertEqual(body["product_type"], "Yarn")
        self.assertEqual(body["group"], "Export")
        self.assertEqual(body["frate"], "110.25")
        self.assertEqual(body["trate"], "130.00")
        self.assertEqual(body["rate"], "125.50")
        pid = body["id"]

        empty = self.client.put(
            f"/api/products/{pid}/",
            {
                "product_code": "SKU-01",
                "product_name": "60s Cotton",
                "brand_id": self.brand.id,
                "category_id": self.sub.id,
                "unit": "Meter",
                "rate": "125.50",
                "print_name": "",
                "description": "",
                "product_type": "",
                "group": "",
                "frate": "",
                "trate": "",
                "availability": "In Stock",
                "status": "Active",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(empty.status_code, 200, empty.content)
        again = empty.json()
        self.assertEqual(again["print_name"], "")
        self.assertEqual(again["description"], "")
        self.assertEqual(again["product_type"], "")
        self.assertEqual(again["group"], "")
        self.assertIsNone(again["frate"])
        self.assertIsNone(again["trate"])
        self.assertEqual(again["rate"], "125.50")
