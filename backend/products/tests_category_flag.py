from datetime import date
from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase, override_settings
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from price_lists.tests_osm_pdf import SUMMER
from products.models import Product


class ProductCategoryFlagTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(username="cat-flag-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.brand = Brand.objects.create(brand_code="FLG", brand_name="Flag Mills", order_method="Digital PO")
        self.other = Brand.objects.create(brand_code="OTH", brand_name="Other Mills", order_method="Digital PO")
        self.entity = Entity.objects.create(short_code="FLG", entity_name="Flag Branch", entity_type="Branch", status="Active")
        self.entity.brands.add(self.brand)
        self.root = Category.objects.create(category_code="YRN", category_name="Yarn")
        self.sub = Category.objects.create(category_code="CTN", category_name="Cotton", parent_category=self.root)
        self.customer = Customer.objects.create(customer_code="FLG-C", customer_name="Flag Trading")
        CustomerEntity.objects.create(customer=self.customer, entity=self.entity, primary_entity=True)

    def test_product_and_purchase_order_without_category(self):
        before = Category.objects.count()
        created = self.client.post("/api/products/", {
            "product_code": "PLAIN-1",
            "product_name": "Plain Weave",
            "brand_id": self.brand.id,
            "quality": "AI",
            "client_item_code": "0100100",
            "collection": "Woolrite",
            "unit": "Meter",
            "rate": "1799.00",
        }, format="json", HTTP_HOST="localhost")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertIsNone(created.json()["category_id"])
        self.assertEqual(created.json()["category_name"], "")
        self.assertEqual(Category.objects.count(), before)
        product = Product.objects.get(product_code="PLAIN-1")
        self.assertIsNone(product.category_id)
        order = self.client.post("/api/purchase-orders/", {
            "po_number": "PO-NO-CAT",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "brand_id": self.brand.id,
            "po_date": "2026-10-16",
            "lines": [{"product_id": product.id, "quantity": "2.00", "rate": "1799.00"}],
        }, format="json", HTTP_HOST="localhost")
        self.assertEqual(order.status_code, 201, order.content)
        self.assertEqual(order.json()["lines"][0]["product_id"], product.id)

    def test_sending_a_category_is_still_stored(self):
        created = self.client.post("/api/products/", {
            "product_code": "WITH-CAT",
            "product_name": "Kept Category",
            "brand_id": self.brand.id,
            "category_id": self.sub.id,
            "unit": "Meter",
            "rate": "10.00",
        }, format="json", HTTP_HOST="localhost")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["category_id"], self.sub.id)
        self.assertEqual(created.json()["parent_category_name"], "Yarn")
        self.assertEqual(Product.objects.get(product_code="WITH-CAT").category_id, self.sub.id)

    @override_settings(PRODUCT_CATEGORY_ENABLED=True)
    def test_flag_on_requires_a_subcategory_again(self):
        missing = self.client.post("/api/products/", {
            "product_code": "NEED-CAT",
            "product_name": "Needs Category",
            "brand_id": self.brand.id,
            "unit": "Meter",
            "rate": "10.00",
        }, format="json", HTTP_HOST="localhost")
        self.assertEqual(missing.status_code, 400, missing.content)
        self.assertIn("category_id", missing.json())
        top = self.client.post("/api/products/", {
            "product_code": "TOP-CAT",
            "product_name": "Top Category",
            "brand_id": self.brand.id,
            "category_id": self.root.id,
            "unit": "Meter",
            "rate": "10.00",
        }, format="json", HTTP_HOST="localhost")
        self.assertEqual(top.status_code, 400, top.content)

    def test_product_search_filters_brand_and_pages(self):
        Product.objects.create(
            product_code="AI", product_name="Woolrite", brand=self.brand,
            quality="AI", client_item_code="0100100", collection="Woolrite", rate=Decimal("1799"),
        )
        Product.objects.create(
            product_code="AMB", product_name="Ambassador White", brand=self.brand,
            quality="AMB", collection="Ambassador", rate=Decimal("999"),
        )
        Product.objects.create(product_code="OTHER", product_name="Woolrite", brand=self.other, rate=Decimal("1"))
        for index in range(50):
            Product.objects.create(product_code=f"P{index:02d}", product_name=f"Bulk {index}", brand=self.brand, rate=Decimal("1"))
        by_code = self.client.get("/api/products/search/", {"brand_id": self.brand.id, "q": "AI"}, HTTP_HOST="localhost")
        self.assertEqual(by_code.status_code, 200, by_code.content)
        self.assertEqual([row["product_code"] for row in by_code.json()["results"]], ["AI"])
        by_name = self.client.get("/api/products/search/", {"brand_id": self.brand.id, "q": "ambassador"}, HTTP_HOST="localhost")
        self.assertEqual(by_name.json()["results"][0]["product_code"], "AMB")
        by_quality = self.client.get("/api/products/search/", {"brand_id": self.brand.id, "q": "0100100"}, HTTP_HOST="localhost")
        self.assertEqual(by_quality.json()["results"][0]["product_code"], "AI")
        by_collection = self.client.get("/api/products/search/", {"brand_id": self.brand.id, "q": "Woolrite"}, HTTP_HOST="localhost")
        self.assertEqual({row["product_code"] for row in by_collection.json()["results"]}, {"AI"})
        first = self.client.get("/api/products/search/", {"brand_id": self.brand.id, "page": 1}, HTTP_HOST="localhost")
        self.assertEqual(len(first.json()["results"]), 50)
        self.assertTrue(first.json()["has_more"])
        second = self.client.get("/api/products/search/", {"brand_id": self.brand.id, "page": 2}, HTTP_HOST="localhost")
        self.assertEqual(len(second.json()["results"]), 2)
        self.assertFalse(second.json()["has_more"])
        wrong_branch = self.client.get(
            "/api/products/search/",
            {"brand_id": self.other.id, "entity_id": self.entity.id, "q": "OTHER"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(wrong_branch.status_code, 400)

    def test_standard_price_list_matches_a_product_without_a_category(self):
        Product.objects.create(product_code="SKU-OPEN", product_name="Open SKU", brand=self.brand, rate=Decimal("40"))
        before = Category.objects.count()
        book = Workbook()
        sheet = book.active
        sheet.title = "Price List"
        sheet.append(["Brand Code", "Product Code", "Product Name", "Taka Length (meters)", "Price Basis", "Price", "Taka Qty", "Season Label", "Valid From", "Valid To"])
        sheet.append(["FLG", "SKU-OPEN", "Open SKU", 25, "Per Taka", 1250, 10, "Winter 2026", date(2026, 7, 1), date(2026, 12, 31)])
        output = BytesIO()
        book.save(output)
        response = self.client.post("/api/price-lists/import/preview/", {
            "file": BytesIO(output.getvalue()), "year": 2026, "season": "Winter",
            "branch_id": self.entity.id, "brand_id": self.brand.id,
        }, format="multipart", HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["excluded"], [])
        self.assertEqual(response.json()["importable"][0]["entries"][0]["product_code"], "SKU-OPEN")
        self.assertEqual(Category.objects.count(), before)

    def test_osm_pdf_creates_products_without_categories(self):
        osm = Brand.objects.create(brand_code="OCM", brand_name="OSM India Limited", order_method="Digital PO")
        self.entity.brands.add(osm)
        before = Category.objects.count()
        upload = SimpleUploadedFile("summer.pdf", SUMMER.read_bytes(), content_type="application/pdf")
        preview = self.client.post("/api/price-lists/import/preview/", {
            "file": upload, "year": "2026", "season": "Summer",
            "branch_id": self.entity.id, "brand_id": osm.id, "format_id": "osm_pdf_pricelist",
        }, format="multipart", HTTP_HOST="localhost")
        self.assertEqual(preview.status_code, 200, preview.content)
        commit = self.client.post("/api/price-lists/import/commit/", {
            "preview_token": preview.json()["preview_token"], "year": 2026, "season": "Summer",
            "branch_id": self.entity.id, "brand_id": osm.id, "format_id": "osm_pdf_pricelist",
        }, format="json", HTTP_HOST="localhost")
        self.assertEqual(commit.status_code, 201, commit.content)
        product = Product.objects.get(product_code="AI -1-2-209-0100100-")
        self.assertIsNone(product.category_id)
        self.assertEqual(product.product_name, "AI -1-2-209-0100100-")
        self.assertEqual(Category.objects.count(), before)

    def test_category_column_is_nullable_and_existing_values_remain(self):
        kept = Product.objects.create(
            product_code="KEPT", product_name="Kept", brand=self.brand, category=self.sub, rate=Decimal("1"),
        )
        with connection.cursor() as cursor:
            columns = connection.introspection.get_table_description(cursor, "products_product")
        category_column = next(column for column in columns if column.name == "category_id")
        self.assertTrue(category_column.null_ok)
        kept.refresh_from_db()
        self.assertEqual(kept.category_id, self.sub.id)
        self.assertEqual(Category.objects.filter(pk=self.sub.id).count(), 1)

    def test_session_reports_the_flag(self):
        me = self.client.get("/api/auth/me/", HTTP_HOST="localhost")
        self.assertEqual(me.status_code, 200, me.content)
        self.assertIs(me.json()["features"]["productCategory"], False)
