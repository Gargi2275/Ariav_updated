from decimal import Decimal
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from entities.models import Entity
from price_lists.models import BrandQualityPrice, PriceList
from price_lists.osm_pdf_import import parse_osm_pdf
from products.models import Product

FIXTURES = Path(__file__).resolve().parent / "tests" / "fixtures"
SUMMER = FIXTURES / "OSM_Summer_2026_Regular_Revised.pdf"
WINTER = FIXTURES / "OSM_Winter_2025_Revised.pdf"
WINTER_2026 = FIXTURES / "OSM_Winter_2026_Regular.pdf"


class OsmPdfParseTests(TestCase):
    def test_summer_rows_keep_printed_prices_and_blank_retail(self):
        parsed = parse_osm_pdf(SUMMER.read_bytes())
        self.assertEqual(parsed["season"], "Summer")
        self.assertEqual(parsed["year"], 2026)
        self.assertEqual(parsed["valid_from"], "2026-04-10")
        self.assertIsNone(parsed["valid_to"])
        self.assertEqual(parsed["unit_text"], "INR Per Mtr.*")
        self.assertEqual(parsed["declared_page_count"], 14)
        self.assertEqual(len(parsed["entries"]), 544)
        first = parsed["entries"][0]
        self.assertEqual(first["sr_no"], 1)
        self.assertEqual(first["quality_code"], "AI -1-2-209-0100100-")
        self.assertEqual(first["quality_number"], "0100100")
        self.assertEqual(first["ex_mill"], Decimal("1799"))
        self.assertEqual(first["wholesale"], Decimal("2375"))
        self.assertIsNone(first["retail"])
        self.assertEqual(first["discount_percent"], Decimal("0"))
        self.assertIsNone(first["discount_min_meters"])
        odd = next(item for item in parsed["entries"] if item["quality_code"] == "CAM -1-1-TR -0323534-")
        self.assertEqual(odd["ex_mill"], Decimal("495"))
        self.assertEqual(odd["retail"], Decimal("936"))
        self.assertIn("*Above Ex-mill & W/S are exclusive of GST", parsed["tax_note"])
        self.assertIn("*Above Retail is inclusive of GST", parsed["tax_note"])

    def test_winter_discount_notes_follow_the_printed_sections(self):
        parsed = parse_osm_pdf(WINTER.read_bytes())
        self.assertEqual(len(parsed["entries"]), 247)
        self.assertEqual(parsed["season"], "Winter")
        self.assertEqual(parsed["year"], 2025)
        by_serial = {item["sr_no"]: item for item in parsed["entries"]}
        self.assertEqual(by_serial[1]["discount_percent"], Decimal("5"))
        self.assertEqual(by_serial[1]["discount_min_meters"], Decimal("8.00"))
        self.assertEqual(by_serial[1]["discount_note"], "5% Discount will be given on than of 8.00 mts & above")
        self.assertEqual(by_serial[59]["discount_percent"], Decimal("5"))
        self.assertEqual(by_serial[60]["discount_percent"], Decimal("10"))
        self.assertEqual(by_serial[105]["discount_percent"], Decimal("5"))
        self.assertEqual(by_serial[122]["discount_percent"], Decimal("10"))
        self.assertEqual(by_serial[151]["discount_percent"], Decimal("5"))
        self.assertIn("supplied in than packing without any additional packing", parsed["packing_note"])

    def test_winter_2026_keeps_collections_shades_delivery_and_split_prices(self):
        parsed = parse_osm_pdf(WINTER_2026.read_bytes())
        self.assertEqual(parsed["title"], "Regular Price List-Winter'2026")
        self.assertEqual(parsed["season"], "Winter")
        self.assertEqual(parsed["year"], 2026)
        self.assertEqual(parsed["valid_from"], "2026-06-03")
        self.assertIsNone(parsed["valid_to"])
        self.assertEqual(len(parsed["entries"]), 864)
        first = parsed["entries"][0]
        self.assertEqual(first["collection_name"], "Woolrite")
        self.assertEqual(first["collection_code"], "AI")
        self.assertEqual(first["quality_code"], "AI-1-2-209-0100100")
        self.assertEqual(first["ex_mill"], Decimal("1799"))
        self.assertEqual(first["wholesale"], Decimal("2375"))
        self.assertIsNone(first["retail"])
        self.assertEqual(first["delivery_raw"], "June")
        self.assertEqual(first["shades_raw"], "1,2,3,4,5,6,7,9,10,11,12,13,14,15,16")
        self.assertEqual(first["discount_percent"], Decimal("0"))
        aristo = next(item for item in parsed["entries"] if item["quality_code"] == "ARO-1-1-105-0041000")
        self.assertEqual(aristo["ex_mill"], Decimal("1299"))
        self.assertEqual(aristo["wholesale"], Decimal("1728"))
        self.assertIsNone(aristo["retail"])
        self.assertTrue(aristo["shades_raw"].startswith("1,2,3,4,5,7,11,12,14,16,17,18,19,20,21,22,23,24,26,27,29,"))
        self.assertTrue(aristo["shades_raw"].endswith("83,84,85,86,87,88,89,90,91,"))
        bellini = next(item for item in parsed["entries"] if item["collection_name"] == "Bellini")
        self.assertEqual(bellini["discount_percent"], Decimal("10"))
        self.assertEqual(bellini["discount_min_meters"], Decimal("8.00"))
        self.assertEqual(bellini["discount_note"], "10% Discount will be given on than of 8.00 mts & above")
        self.assertIn("each blend.", parsed["packing_note"])
        self.assertIn("*Above Ex-mill & W/S are exclusive of GST", parsed["tax_note"])
        car = next(item for item in parsed["entries"] if item["quality_code"] == "CAR-1-1-PVL-9090121")
        self.assertEqual(car["collection_name"], "CAR")
        self.assertEqual(car["collection_code"], "CAR")
        speciality = next(item for item in parsed["entries"] if item["collection_name"] == "Speciality")
        self.assertEqual(speciality["collection_code"], "")


class OsmPdfImportApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(username="osm-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        self.brand = Brand.objects.create(brand_code="OCM", brand_name="OSM India Limited", order_method="Digital PO")
        self.other = Brand.objects.create(brand_code="DON", brand_name="Donear", order_method="Digital PO")
        self.branch = Entity.objects.create(short_code="ADT", entity_name="Aditi OSM")
        self.branch.brands.add(self.brand, self.other)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_commit_stores_every_summer_row_on_the_selected_brand(self):
        upload = SimpleUploadedFile("summer.pdf", SUMMER.read_bytes(), content_type="application/pdf")
        preview = self.client.post("/api/price-lists/import/preview/", {
            "file": upload, "year": "2026", "season": "Summer",
            "branch_id": self.branch.id, "brand_id": self.brand.id, "format_id": "osm_pdf_pricelist",
        }, format="multipart")
        self.assertEqual(preview.status_code, 200, preview.content)
        body = preview.json()
        self.assertEqual(body["row_count"], 544)
        self.assertIsNone(body["valid_to"])
        commit = self.client.post("/api/price-lists/import/commit/", {
            "preview_token": body["preview_token"], "year": 2026, "season": "Summer",
            "branch_id": self.branch.id, "brand_id": self.brand.id, "format_id": "osm_pdf_pricelist",
        }, format="json")
        self.assertEqual(commit.status_code, 201, commit.content)
        self.assertEqual(commit.json()["products_created"], 544)
        product = Product.objects.get(product_code="AI -1-2-209-0100100-")
        self.assertEqual(product.brand_id, self.brand.id)
        self.assertEqual(product.category.category_name, "AI")
        self.assertEqual(product.category.parent_category.category_name, "Quality")
        self.assertEqual(product.rate, Decimal("1799.00"))
        self.assertEqual(product.frate, Decimal("2375.00"))
        self.assertIsNone(product.trate)
        self.assertEqual(product.client_item_code, "0100100")
        self.assertEqual(product.quality, "AI")
        self.assertEqual(product.group, "1-2-209")
        self.assertEqual(product.unit, "Meter")
        self.assertIn("INR Per Mtr.*", product.description)
        price = BrandQualityPrice.objects.get(quality_code="AI -1-2-209-0100100-")
        self.assertEqual(price.product_id, product.id)
        self.assertIsNone(price.retail)
        self.assertEqual(price.raw_line, "1 AI -1-2-209-0100100- 1799 2375 -")
        stored = PriceList.objects.get(pk=commit.json()["price_list_id"])
        self.assertIsNone(stored.valid_to)
        self.assertEqual(stored.valid_from.isoformat(), "2026-04-10")
        self.assertEqual(Product.objects.filter(brand=self.brand).count(), 544)

    def test_excel_and_wrong_brand_and_wrong_season_are_rejected(self):
        excel = SimpleUploadedFile("list.xlsx", b"PK\x03\x04not-a-pdf", content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        rejected = self.client.post("/api/price-lists/import/preview/", {
            "file": excel, "year": "2026", "season": "Summer",
            "branch_id": self.branch.id, "brand_id": self.brand.id, "format_id": "osm_pdf_pricelist",
        }, format="multipart")
        self.assertEqual(rejected.status_code, 400)
        pdf = SimpleUploadedFile("summer.pdf", SUMMER.read_bytes(), content_type="application/pdf")
        wrong_brand = self.client.post("/api/price-lists/import/preview/", {
            "file": pdf, "year": "2026", "season": "Summer",
            "branch_id": self.branch.id, "brand_id": self.other.id, "format_id": "osm_pdf_pricelist",
        }, format="multipart")
        self.assertEqual(wrong_brand.status_code, 400)
        pdf2 = SimpleUploadedFile("summer.pdf", SUMMER.read_bytes(), content_type="application/pdf")
        wrong_season = self.client.post("/api/price-lists/import/preview/", {
            "file": pdf2, "year": "2026", "season": "Winter",
            "branch_id": self.branch.id, "brand_id": self.brand.id, "format_id": "osm_pdf_pricelist",
        }, format="multipart")
        self.assertEqual(wrong_season.status_code, 400)

    def test_winter_2026_stores_collection_name_and_short_code(self):
        upload = SimpleUploadedFile("winter-2026.pdf", WINTER_2026.read_bytes(), content_type="application/pdf")
        preview = self.client.post("/api/price-lists/import/preview/", {
            "file": upload, "year": "2026", "season": "Winter",
            "branch_id": self.branch.id, "brand_id": self.brand.id, "format_id": "osm_pdf_pricelist",
        }, format="multipart")
        self.assertEqual(preview.status_code, 200, preview.content)
        body = preview.json()
        commit = self.client.post("/api/price-lists/import/commit/", {
            "preview_token": body["preview_token"], "year": 2026, "season": "Winter",
            "branch_id": self.branch.id, "brand_id": self.brand.id, "format_id": "osm_pdf_pricelist",
        }, format="json")
        self.assertEqual(commit.status_code, 201, commit.content)
        self.assertEqual(commit.json()["rows_imported"], 864)
        woolrite = Product.objects.get(product_code="AI")
        self.assertEqual(woolrite.product_name, "Woolrite")
        self.assertEqual(woolrite.brand_id, self.brand.id)
        self.assertEqual(woolrite.rate, Decimal("1799.00"))
        self.assertEqual(woolrite.frate, Decimal("2375.00"))
        self.assertIsNone(woolrite.trate)
        self.assertEqual(woolrite.collection, "Woolrite (AI)")
        prices = BrandQualityPrice.objects.filter(product=woolrite)
        self.assertEqual(prices.count(), 6)
        self.assertEqual(prices.filter(quality_code="AI-1-2-209-0100100").count(), 1)
        self.assertFalse(Product.objects.filter(product_code="AI-1-2-209-0100100").exists())
        self.assertEqual(Product.objects.get(product_code="CAR").product_name, "CAR")
        self.assertEqual(Product.objects.get(product_code="Speciality").product_name, "Speciality")
        self.assertEqual(Product.objects.get(product_code="CT").product_name, "Crystal")
        self.assertEqual(Product.objects.get(product_code="CT-Crystal-Nx").product_name, "Crystal-Nx")
        self.assertEqual(BrandQualityPrice.objects.count(), 864)
