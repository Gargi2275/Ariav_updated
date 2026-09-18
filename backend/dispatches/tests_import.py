from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from dispatches.models import Dispatch
from entities.models import Entity
from products.models import Product
from purchase_orders.models import PurchaseOrder


HEADERS = [
    "CompanyCd",
    "Agent",
    "Order Code",
    "Invoice No",
    "Invoice Date",
    "Customer Code",
    "Customer Name",
    "Customer City",
    "State",
    "Code1",
    "Code5",
    "Code6",
    "Template",
    "Size",
    "Qty",
    "Transport Name",
    "LR No",
    "LR Date",
]


def _xlsx(rows: list[list]) -> SimpleUploadedFile:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADERS)
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return SimpleUploadedFile(
        "aditi_and_shriva_dispatch_ocm.xlsx",
        buffer.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _row(
    order_code,
    invoice_no,
    customer_code="DSP-C1",
    customer_name="Dispatch Trading",
    qty=4,
    code1="A",
    code5="B",
    code6="C",
    template="T",
    size="S",
    lr_no="LR-1",
    lr_date="2026-09-17",
    transport="VRL Logistics",
    invoice_date="2026-09-17",
):
    return [
        "ADT",
        "AG1",
        order_code,
        invoice_no,
        invoice_date,
        customer_code,
        customer_name,
        "Surat",
        "Gujarat",
        code1,
        code5,
        code6,
        template,
        size,
        qty,
        transport,
        lr_no,
        lr_date,
    ]


class DispatchImportApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = AuthUser.objects.create_user(
            username="dsp-imp-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="dsp-imp-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="ADT",
            entity_name="Aditi",
            entity_type=Entity.EntityType.HEAD_OFFICE,
            address_line_1="Aditi Road",
            city="Surat",
            state="Gujarat",
        )
        self.customer = Customer.objects.create(
            customer_code="DSP-C1",
            customer_name="Dispatch Trading",
        )
        self.other = Customer.objects.create(
            customer_code="DSP-C2",
            customer_name="Other House",
        )
        CustomerEntity.objects.create(
            customer=self.customer,
            entity=self.entity,
            primary_entity=True,
        )
        self.brand = Brand.objects.create(
            brand_code="OCM",
            brand_name="OCM",
            order_method=Brand.OrderMethod.MANUAL_POR,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.product = Product.objects.create(
            product_code="DSP-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )

    def _create_po(self, po_number="ATN24R00001", status="Draft", qty="10.00", description="A-B-C-T-S"):
        res = self.client.post(
            "/api/purchase-orders/",
            {
                "po_number": po_number,
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "brand_id": self.brand.id,
                "po_date": "2026-09-16",
                "lines": [
                    {
                        "product_id": None,
                        "product_description": description,
                        "quantity": qty,
                        "rate": "10.00",
                    }
                ],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 201, res.content)
        po_id = res.json()["id"]
        if status != "Draft":
            self.client.post(f"/api/purchase-orders/{po_id}/submit/", HTTP_HOST="localhost")
            path = [
                "Submitted",
                "Sent to Brand",
                "Brand Accepted",
                "Partially Dispatched",
                "Fully Dispatched",
            ]
            current = "Submitted"
            for nxt in path[1:]:
                if current == status:
                    break
                step = self.client.post(
                    f"/api/purchase-orders/{po_id}/status/",
                    {"status": nxt},
                    format="json",
                    HTTP_HOST="localhost",
                )
                self.assertEqual(step.status_code, 200, step.content)
                current = nxt
                if current == status:
                    break
        return res.json()["id"]

    def _preview(self, rows, auth=None):
        if auth:
            self.client.force_authenticate(auth)
        upload = _xlsx(rows)
        res = self.client.post(
            "/api/dispatches/import/preview/",
            {"file": upload},
            format="multipart",
            HTTP_HOST="localhost",
        )
        return res

    def test_preview_no_matching_po_excludes_all(self):
        res = self._preview([_row("MISSING-PO", "INV-1")])
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["importable"], [])
        self.assertEqual(len(body["excluded"]), 1)
        self.assertIn("No matching Purchase Order found for Order Code MISSING-PO", body["excluded"][0]["reason"])
        self.assertEqual(Dispatch.objects.count(), 0)

    def test_preview_draft_po_excluded_not_brand_accepted(self):
        self._create_po("ATN-DRAFT", status="Draft")
        res = self._preview([_row("ATN-DRAFT", "INV-1")])
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["importable"], [])
        reason = body["excluded"][0]["reason"]
        self.assertIn("not yet Brand Accepted", reason)
        self.assertIn("Draft", reason)
        self.assertNotIn("No matching Purchase Order", reason)

    def test_preview_customer_mismatch_excluded(self):
        self._create_po("ATN-OK", status="Brand Accepted")
        res = self._preview([_row("ATN-OK", "INV-1", customer_code="DSP-C2", customer_name="Other House")])
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["importable"], [])
        reason = body["excluded"][0]["reason"]
        self.assertIn("Customer mismatch", reason)
        self.assertIn("DSP-C2", reason)
        self.assertIn("DSP-C1", reason)

    def test_preview_invoice_spanning_two_order_codes_splits(self):
        self._create_po("ATN-A", status="Brand Accepted")
        self._create_po("ATN-B", status="Brand Accepted")
        res = self._preview(
            [
                _row("ATN-A", "INV-SHARED", qty=3),
                _row("ATN-B", "INV-SHARED", qty=2),
            ]
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(len(body["importable"]), 2)
        keys = {row["group_key"] for row in body["importable"]}
        self.assertEqual(keys, {"ATN-A||INV-SHARED", "ATN-B||INV-SHARED"})
        self.assertEqual(body["excluded"], [])

    def test_preview_over_dispatch_uses_pending_message(self):
        self._create_po("ATN-QTY", status="Brand Accepted", qty="4.00")
        res = self._preview([_row("ATN-QTY", "INV-1", qty=10)])
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["importable"], [])
        reason = body["excluded"][0]["reason"]
        self.assertIn("Cannot dispatch 10 units", reason)
        self.assertIn("only 4 units pending", reason)

    def test_commit_creates_dispatches_and_updates_po_status(self):
        po_id = self._create_po("ATN-FULL", status="Brand Accepted", qty="10.00")
        preview = self._preview(
            [
                _row("ATN-FULL", "INV-1", qty=4, lr_no="LR-A"),
                _row("ATN-FULL", "INV-2", qty=6, lr_no="LR-B"),
            ]
        )
        self.assertEqual(preview.status_code, 200, preview.content)
        token = preview.json()["preview_token"]
        keys = [row["group_key"] for row in preview.json()["importable"]]
        self.assertEqual(len(keys), 2)
        commit = self.client.post(
            "/api/dispatches/import/commit/",
            {"preview_token": token, "group_keys": keys},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(commit.status_code, 201, commit.content)
        body = commit.json()
        self.assertEqual(body["created_count"], 2)
        self.assertEqual(Dispatch.objects.count(), 2)
        po = PurchaseOrder.objects.get(pk=po_id)
        self.assertEqual(po.status, PurchaseOrder.Status.FULLY_DISPATCHED)
        statuses = {row["po_status"] for row in body["created"]}
        self.assertIn(PurchaseOrder.Status.FULLY_DISPATCHED, statuses)

    def test_commit_requires_preview_and_does_not_write_on_preview(self):
        self._create_po("ATN-PREV", status="Brand Accepted")
        preview = self._preview([_row("ATN-PREV", "INV-1", qty=2)])
        self.assertEqual(preview.status_code, 200, preview.content)
        self.assertEqual(Dispatch.objects.count(), 0)
        denied = self.client.post(
            "/api/dispatches/import/commit/",
            {"group_keys": ["ATN-PREV||INV-1"]},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(denied.status_code, 400)
        self.assertEqual(Dispatch.objects.count(), 0)

    def test_operator_can_preview_and_commit(self):
        self._create_po("ATN-OP", status="Brand Accepted", qty="5.00")
        preview = self._preview([_row("ATN-OP", "INV-1", qty=5)], auth=self.operator)
        self.assertEqual(preview.status_code, 200, preview.content)
        token = preview.json()["preview_token"]
        keys = [row["group_key"] for row in preview.json()["importable"]]
        commit = self.client.post(
            "/api/dispatches/import/commit/",
            {"preview_token": token, "group_keys": keys},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(commit.status_code, 201, commit.content)
        po = PurchaseOrder.objects.get(po_number="ATN-OP")
        self.assertEqual(po.status, PurchaseOrder.Status.FULLY_DISPATCHED)
