"""OCM order-form PDF and line rules. Uses the isolated test database."""

from datetime import date
from decimal import Decimal
from io import BytesIO

import pdfplumber
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuditLog, AuthUser
from brands.models import Brand
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from price_lists.models import BrandQualityPrice, PriceList
from purchase_orders.form_pdf import format_qty
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


class OrderFormPdfTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="form-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
            display_name="Form Admin",
        )
        self.operator = AuthUser.objects.create_user(
            username="form-op",
            password="pass12345",
            role=AuthUser.Role.STAFF,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="ADT",
            entity_name="Aditi",
            entity_type=Entity.EntityType.BRANCH,
            city="Ahmedabad",
        )
        self.customer = Customer.objects.create(
            customer_code="P001",
            customer_name="नमस्ते पार्टी लिमिटेड " + ("Long Party Name " * 8),
            address_line_1="Station Road",
            city="Surat",
            gst_no="24AAAAA0000A1Z5",
        )
        CustomerEntity.objects.create(customer=self.customer, entity=self.entity, primary_entity=True)
        self.ocm = Brand.objects.create(
            brand_code="OCM",
            brand_name="OSM India Limited",
            order_method=Brand.OrderMethod.MANUAL_POR,
            address="Mill Road, Amritsar",
            phone="0183-000000",
            email="orders@example.com",
            gst_no="03AAAAA0000A1Z5",
        )
        self.other = Brand.objects.create(
            brand_code="DIG",
            brand_name="Digital Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        self.entity.brands.add(self.ocm, self.other)
        self.price_list = PriceList.objects.create(
            brand=self.ocm,
            season_label="Winter 2026",
            valid_from=date(2026, 6, 3),
            status=PriceList.Status.ACTIVE,
        )
        BrandQualityPrice.objects.create(
            price_list=self.price_list,
            sr_no=1,
            source_page=1,
            quality_code="AI-1-2-209-0100100",
            quality_prefix="AI",
            seg_a="1",
            seg_b="2",
            seg_c="209",
            quality_number="0100100",
            shades_raw="1,2",
            ex_mill=Decimal("1799.00"),
        )

    def _lines(self, count, shades, prefix="QLT", unit="Pieces", rate="100.00", remarks=""):
        lines = []
        number = 1
        for quality_index in range(count):
            quality = f"{prefix}-{quality_index + 1:02d}"
            if quality_index == 0 and prefix == "QLT":
                quality = "AI-0100100"
            for shade_index, shade in enumerate(shades):
                token = f"{shade}-Q{quality_index + 1:02d}-S{shade_index + 1:02d}"
                lines.append({
                    "product_id": None,
                    "product_description": quality,
                    "shade": token,
                    "quantity": "2.00",
                    "rate": rate,
                    "quantity_unit": unit,
                    "size": "58",
                    "delivery_from": "2026-11-01",
                    "delivery_to": "2026-11-15",
                    "line_remarks": remarks or f"Note row {quality_index + 1}",
                    "form_row_no": quality_index + 1,
                })
                number += 1
        return lines

    def _create(self, **kwargs):
        payload = {
            "po_number": "IND-100",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "brand_id": self.ocm.id,
            "po_date": "2026-10-21",
            "place": "Surat",
            "mode_of_despatch": "Road",
            "destination": "Ahmedabad",
            "documents_through": "Bank",
            "special_instructions": "Handle with care",
            "lines": self._lines(1, ["SHADE-A"]),
        }
        payload.update(kwargs)
        return self.client.post("/api/purchase-orders/", payload, format="json", HTTP_HOST="localhost")

    def _text(self, po_id, **params):
        response = self.client.get(f"/api/purchase-orders/{po_id}/pdf/", params, HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assertTrue(response.content.startswith(b"%PDF"))
        with pdfplumber.open(BytesIO(response.content)) as document:
            return "\n".join(page.extract_text() or "" for page in document.pages), response

    def _assert_lines_once(self, text, lines):
        for line in lines:
            quality = line.product_description
            self.assertEqual(text.count(quality), 1, quality)
            if line.shade:
                self.assertEqual(text.count(line.shade), 1, line.shade)
            token = format_qty(line.quantity, line.unit)
            self.assertIn(token, text)
        stored = list(lines)
        self.assertIn("ASSORTMENT", text)
        self.assertIn("Pcs.", text)

    def test_three_qualities_up_to_seven_shades(self):
        shades = [f"SH-{index}" for index in range(1, 8)]
        created = self._create(po_number="IND-3X7", lines=self._lines(3, shades))
        self.assertEqual(created.status_code, 201, created.content)
        po = PurchaseOrder.objects.get(pk=created.json()["id"])
        text, _response = self._text(po.id, form=1, copy="mill")
        self._assert_lines_once(text, po.lines.all())
        self.assertIn("Sheet 1 of 1", text)
        self.assertIn("AI-1-2-209-0100100", text)
        self.assertIn("Dear Sir(s)", text)
        self.assertIn("MILL'S COPY", text)
        self.assertIn("PARTY CODE", text)
        self.assertIn("OCM Private Limited", text)
        self.assertIn("SAL/F/04", text)

    def test_footer_sits_under_the_lines(self):
        created = self._create(po_number="IND-GAP", lines=self._lines(1, ["A"]))
        self.assertEqual(created.status_code, 201, created.content)
        text, _response = self._text(created.json()["id"], form=1, copy="mill")
        self.assertIn("MODE OF DESPATCH", text)
        self.assertIn("SALES REP. SIGNATURE", text)
        self.assertIn("RETENTION PERIOD 2 YEARS", text)

    def test_twelve_qualities_use_two_sheets(self):
        created = self._create(po_number="IND-12", lines=self._lines(12, ["ONLY"]))
        po = PurchaseOrder.objects.get(pk=created.json()["id"])
        text, _response = self._text(po.id, form=1, copy="buyer")
        self.assertIn("Sheet 1 of 2", text)
        self.assertIn("Sheet 2 of 2", text)
        self._assert_lines_once(text, po.lines.all())
        self.assertIn("BUYER'S COPY", text)

    def test_eight_shades_wrap_and_blank_price_and_unicode(self):
        shades = [f"WRAP-{index}" for index in range(1, 9)]
        lines = self._lines(1, shades, rate=None, remarks="REMARK-START " + ("cloth " * 20))
        lines[0]["product_description"] = "AI-0100100"
        created = self._create(po_number="IND-WRAP", lines=lines)
        self.assertEqual(created.status_code, 201, created.content)
        po = PurchaseOrder.objects.get(pk=created.json()["id"])
        self.assertTrue(po.lines.first().line_remarks.startswith("REMARK-START"))
        text, _response = self._text(po.id, form=1, copy="rep")
        self._assert_lines_once(text, po.lines.all())
        self.assertIn("नमस्ते", text)
        self.assertIn("REMARK-START", text)
        self.assertNotIn("0.00", text)
        self.assertIn("SALES REP'S COPY", text)
        self.assertIn("Goods to be Insured at Buyer's Cost", text)
        self.assertIn("RETENTION PERIOD 2 YEARS", text)

    def test_imported_lines_without_form_row_and_a_single_line(self):
        created = self._create(
            po_number="IND-OLD",
            lines=[{
                "product_id": None,
                "product_description": "CODE1-CODE5-CODE6-TEMPLATE-58",
                "quantity": "4.00",
                "rate": None,
            }],
        )
        self.assertEqual(created.status_code, 201, created.content)
        po = PurchaseOrder.objects.get(pk=created.json()["id"])
        self.assertIsNone(po.lines.first().form_row_no)
        text, _response = self._text(po.id, form=1, copy="mill")
        self.assertEqual(text.count("CODE1-CODE5-CODE6-TEMPLATE-58"), 1)
        self.assertIn("4", text)
        self.assertEqual(AuditLog.objects.filter(action="Purchase Order PDF", details__contains=created.json()["po_number"]).count(), 1)

    def test_other_brand_pdf_is_unchanged(self):
        from categories.models import Category
        from products.models import Product

        root = Category.objects.create(category_code="YRN2", category_name="Yarn")
        product = Product.objects.create(
            product_code="SKU-DIG",
            product_name="Digital Cloth",
            brand=self.other,
            category=root,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )
        created = self._create(
            po_number="DIG-1",
            brand_id=self.other.id,
            lines=[{"product_id": product.id, "quantity": "3.00", "rate": "10.00"}],
        )
        self.assertEqual(created.status_code, 201, created.content)
        po_id = created.json()["id"]
        plain, _response = self._text(po_id)
        formed, _response = self._text(po_id, form=1, copy="mill")
        self.assertIn("PURCHASE ORDER", plain)
        self.assertIn("Digital Cloth", plain)
        self.assertNotIn("Dear Sir(s)", plain)
        self.assertNotIn("Dear Sir(s)", formed)
        self.assertIn("Digital Cloth", formed)

    def test_operator_scope_and_anonymous(self):
        created = self._create(po_number="IND-SCOPE")
        po_id = created.json()["id"]
        self.client.force_authenticate(self.operator)
        hidden = self.client.get(
            f"/api/purchase-orders/{po_id}/pdf/",
            {"form": 1, "copy": "mill"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(hidden.status_code, 404)
        stranger = APIClient()
        denied = stranger.get(f"/api/purchase-orders/{po_id}/pdf/", HTTP_HOST="localhost")
        self.assertEqual(denied.status_code, 401)

    def test_blank_form_has_no_order_data(self):
        created = self._create(po_number="IND-BLANK")
        text, _response = self._text(created.json()["id"], form=1, copy="mill", blank=1)
        self.assertNotIn(created.json()["po_number"], text)
        self.assertNotIn("SHADE-A", text)
        self.assertIn("Dear Sir(s)", text)
        self.assertIn("OCM Private Limited", text)
        self.assertIn("MILL'S COPY", text)

    def test_form_qualities_for_active_price_list(self):
        response = self.client.get(
            "/api/purchase-orders/form-qualities/",
            {"brand_id": self.ocm.id, "q": "AI"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200, response.content)
        rows = response.json()
        match = next(row for row in rows if row["quality_label"] == "AI-0100100")
        self.assertEqual(match["price"], "1799.00")
        exact = self.client.get(
            "/api/purchase-orders/form-qualities/",
            {"brand_id": self.ocm.id, "q": "AI-0100100"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(exact.status_code, 200, exact.content)
        self.assertTrue(any(row["quality_label"] == "AI-0100100" for row in exact.json()))
        BrandQualityPrice.objects.create(
            price_list=self.price_list,
            sr_no=2,
            source_page=1,
            quality_code="AMB-1-1-100-0055104",
            quality_prefix="AMB",
            seg_a="1",
            seg_b="1",
            seg_c="100",
            quality_number="0055104",
            collection_name="Ambassador White",
            ex_mill=Decimal("999.00"),
            wholesale=Decimal("1319.00"),
            retail=Decimal("1888.00"),
        )
        ambassador = self.client.get(
            "/api/purchase-orders/form-qualities/",
            {"brand_id": self.ocm.id, "q": "AMB-0055104"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(ambassador.status_code, 200, ambassador.content)
        chosen = next(row for row in ambassador.json() if row["quality_label"] == "AMB-0055104")
        self.assertEqual(chosen["price"], "1319.00")
        self.assertEqual(chosen["wholesale"], "1319.00")
        self.assertEqual(chosen["ex_mill"], "999.00")
        self.assertEqual(chosen["retail"], "1888.00")

    def test_duplicate_shade_rejected_and_reopen_matches(self):
        lines = self._lines(1, ["RED", "BLUE"])
        created = self._create(po_number="IND-SAVE", lines=lines)
        self.assertEqual(created.status_code, 201, created.content)
        body = created.json()
        self.assertEqual(body["print_profile"], "ocm")
        self.assertEqual(len(body["lines"]), 2)
        again = self._create(
            po_number="IND-DUP",
            lines=lines + [dict(lines[0])],
        )
        self.assertEqual(again.status_code, 400, again.content)
        self.assertIn("shade", str(again.json()).lower())
        edited = body["lines"]
        edited[0]["quantity"] = "5.00"
        saved = self.client.put(
            f"/api/purchase-orders/{body['id']}/",
            {
                "po_number": body["po_number"],
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "brand_id": self.ocm.id,
                "po_date": body["po_date"],
                "place": "Surat",
                "lines": [
                    {
                        "product_id": None,
                        "product_description": row["product_description"],
                        "shade": row["shade"],
                        "quantity": row["quantity"],
                        "rate": row["rate"],
                        "quantity_unit": row["quantity_unit"],
                        "size": row["size"],
                        "delivery_from": row["delivery_from"],
                        "delivery_to": row["delivery_to"],
                        "line_remarks": row["line_remarks"],
                        "form_row_no": row["form_row_no"],
                    }
                    for row in edited
                ],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(saved.status_code, 200, saved.content)
        quantities = sorted(line["quantity"] for line in saved.json()["lines"])
        self.assertEqual(quantities, ["2.00", "5.00"])
