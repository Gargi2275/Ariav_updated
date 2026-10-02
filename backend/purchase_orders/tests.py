from decimal import Decimal

from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from products.models import Product
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


class PurchaseOrderApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="po-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="po-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="GUJ",
            entity_name="Gujarat",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ashram Road",
            city="Ahmedabad",
            state="Gujarat",
        )
        self.customer = Customer.objects.create(
            customer_code="CUST-01",
            customer_name="Sample Trading",
        )
        CustomerEntity.objects.create(
            customer=self.customer,
            entity=self.entity,
            primary_entity=True,
        )
        self.digital = Brand.objects.create(
            brand_code="DIG",
            brand_name="Digital Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        self.manual = Brand.objects.create(
            brand_code="MAN",
            brand_name="Manual Mills",
            order_method=Brand.OrderMethod.MANUAL_POR,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="SKU-01",
            product_name="60s Cotton",
            brand=self.digital,
            category=sub,
            rate=Decimal("125.50"),
            unit=Product.Unit.METER,
        )
        self.p2 = Product.objects.create(
            product_code="SKU-02",
            product_name="40s Cotton",
            brand=self.digital,
            category=sub,
            rate=Decimal("98.00"),
            unit=Product.Unit.METER,
        )
        self.p_manual = Product.objects.create(
            product_code="SKU-M1",
            product_name="Manual SKU",
            brand=self.manual,
            category=sub,
            rate=Decimal("10.00"),
        )

    def _payload(self, **kwargs):
        payload = {
            "po_number": "PO-2026-001",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "brand_id": self.digital.id,
            "po_date": "2026-09-16",
            "remarks": "Rush order",
            "lines": [
                {"product_id": self.p1.id, "quantity": "10.00", "rate": "125.50"},
                {"product_id": self.p2.id, "quantity": "4.00", "rate": "100.00"},
            ],
        }
        payload.update(kwargs)
        return payload

    def _create(self, **kwargs):
        return self.client.post(
            "/api/purchase-orders/",
            self._payload(**kwargs),
            format="json",
            HTTP_HOST="localhost",
        )

    def test_create_draft_with_two_lines_and_totals(self):
        res = self._create()
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["status"], "Draft")
        self.assertEqual(body["order_type"], "Digital")
        self.assertEqual(body["po_number"], "PO-2026-001")
        self.assertEqual(len(body["lines"]), 2)
        self.assertEqual(body["lines"][0]["line_total"], "1255.00")
        self.assertEqual(body["lines"][1]["line_total"], "400.00")
        self.assertEqual(body["total_quantity"], "14.00")
        self.assertEqual(body["total_amount"], "1655.00")
        self.assertTrue(PurchaseOrderLine.objects.filter(purchase_order_id=body["id"]).count() == 2)

    def test_manual_order_type_with_digital_brand_rejected(self):
        res = self._create(order_type="Manual")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("Manual/POR", str(res.json()))
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_digital_order_type_with_manual_brand_rejected(self):
        res = self._create(
            order_type="Digital",
            brand_id=self.manual.id,
            lines=[{"product_id": self.p_manual.id, "quantity": "1.00", "rate": "10.00"}],
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_duplicate_po_number(self):
        self.assertEqual(self._create().status_code, 201)
        dup = self._create()
        self.assertEqual(dup.status_code, 400, dup.content)
        self.assertTrue(dup.json().get("po_number"))
        self.assertEqual(PurchaseOrder.objects.count(), 1)

    def test_submit_then_line_edits_blocked(self):
        pid = self._create().json()["id"]
        submitted = self.client.post(
            f"/api/purchase-orders/{pid}/submit/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(submitted.status_code, 200, submitted.content)
        self.assertEqual(submitted.json()["status"], "Submitted")

        edited = self.client.put(
            f"/api/purchase-orders/{pid}/",
            self._payload(lines=[
                {"product_id": self.p1.id, "quantity": "99.00", "rate": "1.00"},
            ]),
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(edited.status_code, 400, edited.content)
        po = PurchaseOrder.objects.get(pk=pid)
        self.assertEqual(po.lines.get(product=self.p1).quantity, Decimal("10.00"))

    def test_invalid_status_transition_from_draft(self):
        pid = self._create().json()["id"]
        res = self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Closed"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(PurchaseOrder.objects.get(pk=pid).status, "Draft")

    def test_dispatch_statuses_cannot_be_set_manually_by_admin_or_operator(self):
        pid = self._create().json()["id"]
        self.client.post(f"/api/purchase-orders/{pid}/submit/", HTTP_HOST="localhost")
        self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Sent to Brand"},
            format="json",
            HTTP_HOST="localhost",
        )
        accepted = self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Brand Accepted"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(accepted.status_code, 200, accepted.content)

        message = "This status can only be set automatically when a Dispatch is recorded against this PO — it cannot be set manually."
        admin_attempt = self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Fully Dispatched"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(admin_attempt.status_code, 400, admin_attempt.content)
        self.assertIn(message, str(admin_attempt.json()))

        PurchaseOrder.objects.filter(pk=pid).update(created_by=self.operator)
        self.client.force_authenticate(self.operator)
        operator_attempt = self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Partially Dispatched"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(operator_attempt.status_code, 400, operator_attempt.content)
        self.assertIn(message, str(operator_attempt.json()))
        self.assertEqual(PurchaseOrder.objects.get(pk=pid).status, "Brand Accepted")

    def test_pdf_for_submitted_po(self):
        pid = self._create().json()["id"]
        self.client.post(f"/api/purchase-orders/{pid}/submit/", HTTP_HOST="localhost")
        res = self.client.get(f"/api/purchase-orders/{pid}/pdf/", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200, res.content[:200])
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertTrue(res.content.startswith(b"%PDF"))
        self.assertIn("inline", res["Content-Disposition"])

    def test_operator_can_create_and_submit_not_force_status(self):
        self.client.force_authenticate(self.operator)
        res = self._create(po_number="PO-OP-1")
        self.assertEqual(res.status_code, 201, res.content)
        pid = res.json()["id"]
        submitted = self.client.post(
            f"/api/purchase-orders/{pid}/submit/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(submitted.status_code, 200, submitted.content)
        forced = self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Sent to Brand"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(forced.status_code, 403)
        self.assertEqual(PurchaseOrder.objects.get(pk=pid).status, "Submitted")

    def test_admin_status_to_sent_to_brand_and_terminal_lock(self):
        pid = self._create().json()["id"]
        self.client.post(f"/api/purchase-orders/{pid}/submit/", HTTP_HOST="localhost")
        sent = self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Sent to Brand"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(sent.status_code, 200, sent.content)
        cancelled = self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Cancelled"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        again = self.client.post(
            f"/api/purchase-orders/{pid}/status/",
            {"status": "Submitted"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(again.status_code, 400)
        self.assertEqual(PurchaseOrder.objects.get(pk=pid).status, "Cancelled")

    def test_delete_draft_ok_submitted_blocked(self):
        pid = self._create().json()["id"]
        gone = self.client.delete(f"/api/purchase-orders/{pid}/", HTTP_HOST="localhost")
        self.assertEqual(gone.status_code, 204)
        self.assertFalse(PurchaseOrder.objects.filter(pk=pid).exists())

        pid = self._create(po_number="PO-KEEP").json()["id"]
        self.client.post(f"/api/purchase-orders/{pid}/submit/", HTTP_HOST="localhost")
        blocked = self.client.delete(f"/api/purchase-orders/{pid}/", HTTP_HOST="localhost")
        self.assertEqual(blocked.status_code, 400)
        self.assertTrue(PurchaseOrder.objects.filter(pk=pid).exists())

    def test_filters_search(self):
        self._create()
        listed = self.client.get(
            "/api/purchase-orders/",
            {"status": "Draft", "brand_id": self.digital.id, "search": "PO-2026"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)

    def test_manual_po_mixed_catalogue_and_freetext_lines(self):
        res = self._create(
            po_number="POR-2026-001",
            brand_id=self.manual.id,
            lines=[
                {"product_id": self.p_manual.id, "quantity": "2.00"},
                {
                    "product_id": None,
                    "product_description": "Grey 60s from handy form",
                    "quantity": "12.00",
                    "rate": "80.00",
                },
            ],
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["order_type"], "Manual")
        self.assertEqual(len(body["lines"]), 2)
        self.assertEqual(body["lines"][0]["product_id"], self.p_manual.id)
        self.assertEqual(body["lines"][0]["rate"], "10.00")
        self.assertEqual(body["lines"][0]["line_total"], "20.00")
        self.assertIsNone(body["lines"][1]["product_id"])
        self.assertEqual(body["lines"][1]["product_description"], "Grey 60s from handy form")
        self.assertEqual(body["lines"][1]["product_name"], "Grey 60s from handy form")
        self.assertEqual(body["lines"][1]["line_total"], "960.00")
        self.assertEqual(body["total_amount"], "980.00")

    def test_line_requires_product_or_description(self):
        res = self._create(
            po_number="POR-EMPTY",
            brand_id=self.manual.id,
            lines=[{"product_id": None, "product_description": "", "quantity": "1.00", "rate": "10.00"}],
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_manual_handy_form_upload_and_por_pdf(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings

        upload = SimpleUploadedFile("handy.pdf", b"%PDF-1.4 handy", content_type="application/pdf")
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(MEDIA_ROOT=tmp):
                res = self.client.post(
                    "/api/purchase-orders/",
                    {
                        "po_number": "POR-FILE-1",
                        "entity_id": self.entity.id,
                        "customer_id": self.customer.id,
                        "brand_id": self.manual.id,
                        "po_date": "2026-09-16",
                        "lines": json.dumps(
                            [
                                {
                                    "product_id": None,
                                    "product_description": "Mill leftover lot",
                                    "quantity": "3.00",
                                    "rate": "50.00",
                                }
                            ]
                        ),
                        "handy_form_upload": upload,
                    },
                    format="multipart",
                    HTTP_HOST="localhost",
                )
                self.assertEqual(res.status_code, 201, res.content)
                body = res.json()
                self.assertEqual(body["order_type"], "Manual")
                self.assertTrue(body["handy_form_url"])
                pid = body["id"]
                pdf = self.client.get(f"/api/purchase-orders/{pid}/pdf/", HTTP_HOST="localhost")
                self.assertEqual(pdf.status_code, 200)
                self.assertTrue(pdf.content.startswith(b"%PDF"))
                self.assertIn("POR-", pdf["Content-Disposition"])
                self.assertIn(b"Purchase Order Request", pdf.content)

    def test_order_type_filter(self):
        self._create()
        self._create(
            po_number="POR-2026-002",
            brand_id=self.manual.id,
            lines=[{"product_description": "Open item", "quantity": "1", "rate": "5"}],
        )
        digital = self.client.get("/api/purchase-orders/", {"order_type": "Digital"}, HTTP_HOST="localhost")
        manual = self.client.get("/api/purchase-orders/", {"order_type": "Manual"}, HTTP_HOST="localhost")
        self.assertEqual(len(digital.json()), 1)
        self.assertEqual(len(manual.json()), 1)
        self.assertEqual(manual.json()[0]["order_type"], "Manual")
