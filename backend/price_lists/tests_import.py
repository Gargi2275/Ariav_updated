from datetime import date
from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from products.models import Product

from .models import PriceList, PriceListEntry


class PriceListImportApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = AuthUser.objects.create_user(username="price-import-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        self.brand = Brand.objects.create(brand_code="BR-1", brand_name="Brand One", order_method="Digital PO")
        self.other_brand = Brand.objects.create(brand_code="BR-2", brand_name="Brand Two", order_method="Digital PO")
        parent = Category.objects.create(category_code="CAT", category_name="Fabric")
        category = Category.objects.create(category_code="SUB", category_name="Cotton", parent_category=parent)
        self.product = Product.objects.create(product_code="SKU-1", product_name="Blue", brand=self.brand, category=category, rate=Decimal("40"))
        self.other_product = Product.objects.create(product_code="SKU-2", product_name="Red", brand=self.other_brand, category=category, rate=Decimal("41"))
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def workbook(self, rows):
        book = Workbook()
        sheet = book.active
        sheet.title = "Price List"
        sheet.append(["Brand Code", "Product Code", "Product Name", "Taka Length (meters)", "Price Basis", "Price", "Taka Qty", "Season Label", "Valid From", "Valid To"])
        for row in rows:
            sheet.append(row)
        output = BytesIO()
        book.save(output)
        return output.getvalue()

    def preview(self, rows):
        return self.client.post("/api/price-lists/import/preview/", {"file": BytesIO(self.workbook(rows))}, format="multipart")

    def valid_row(self, **overrides):
        row = ["BR-1", "SKU-1", "Reference", 25, "Per Taka", 1250, 10, "Winter", date(2026, 10, 1), date(2027, 3, 31)]
        fields = ["brand", "product", "name", "length", "basis", "price", "qty", "season", "from", "to"]
        data = dict(zip(fields, row))
        data.update(overrides)
        return [data[key] for key in fields]

    def test_preview_matches_and_calculates_without_writing(self):
        response = self.preview([self.valid_row()])
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(len(body["importable"]), 1)
        self.assertEqual(body["importable"][0]["entries"][0]["price_per_meter"], "50.00")
        self.assertEqual(body["excluded"], [])
        self.assertEqual(PriceList.objects.count(), 0)

    def test_missing_column_error_reports_headers_and_normalizes_matching(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Price List"
        sheet.append([" Brand_Code ", "PRODUCT CODE", "Product Name", "Taka Length (meters)", "Price Basis", " Price_Value ", "Season Label", "Valid From", "Valid To"])
        output = BytesIO()
        workbook.save(output)
        response = self.client.post("/api/price-lists/import/preview/", {"file": BytesIO(output.getvalue())}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Price List"
        sheet.append(["brand_code", "product_code"])
        output = BytesIO()
        workbook.save(output)
        response = self.client.post("/api/price-lists/import/preview/", {"file": BytesIO(output.getvalue())}, format="multipart")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["detected_headers"], ["brand_code", "product_code"])
        self.assertIn("price_value", response.json()["file"])

    def test_preview_specific_exclusions_and_duplicate(self):
        rows = [
            self.valid_row(),
            self.valid_row(),
            self.valid_row(brand="UNKNOWN"),
            self.valid_row(product="SKU-2"),
            self.valid_row(basis="Per Yard"),
        ]
        response = self.preview(rows)
        self.assertEqual(response.status_code, 200, response.content)
        reasons = [row["reason"] for row in response.json()["excluded"]]
        self.assertIn("Duplicate product code within this price list", reasons)
        self.assertIn("Brand code UNKNOWN not found", reasons)
        self.assertTrue(any("exists under Brand Brand Two, not Brand Brand One" in reason for reason in reasons))
        self.assertTrue(any("Invalid Price Basis" in reason for reason in reasons))

    def test_commit_creates_draft_and_rerun_excludes_existing(self):
        preview = self.preview([self.valid_row()]).json()
        commit = self.client.post("/api/price-lists/import/commit/", {"preview_token": preview["preview_token"], "group_keys": [preview["importable"][0]["import_key"]]}, format="json")
        self.assertEqual(commit.status_code, 201, commit.content)
        self.assertEqual(PriceList.objects.count(), 1)
        self.assertEqual(PriceList.objects.first().status, PriceList.Status.DRAFT)
        self.assertEqual(PriceListEntry.objects.count(), 1)
        rerun = self.preview([self.valid_row()]).json()
        self.assertEqual(rerun["importable"], [])
        self.assertEqual(rerun["excluded"][0]["reason"], "Already exists as an active price list entry")
