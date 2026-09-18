from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from brands.models import Brand
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


HEADERS = [
    "Agent Code",
    "Customer Code",
    "Customer Name",
    "Order No",
    "Code1",
    "Code5",
    "Code6",
    "Template",
    "Size",
    "Ord.Qty",
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
        "OCM_PO.xlsx",
        buffer.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


class PurchaseOrderImportApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = AuthUser.objects.create_user(
            username="po-imp-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="po-imp-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

        self.aditi = Entity.objects.create(
            short_code="ADT",
            entity_name="Aditi",
            entity_type=Entity.EntityType.HEAD_OFFICE,
            address_line_1="Aditi Road",
            city="Surat",
            state="Gujarat",
        )
        self.gujarat = Entity.objects.create(
            short_code="GUJ",
            entity_name="Gujarat",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ashram Road",
            city="Ahmedabad",
            state="Gujarat",
        )
        self.manual = Brand.objects.create(
            brand_code="OCM",
            brand_name="OCM",
            order_method=Brand.OrderMethod.MANUAL_POR,
        )
        self.digital = Brand.objects.create(
            brand_code="DIG",
            brand_name="Digital Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )

        self.aditi_customers = []
        for code, name in (
            ("700001", "Aditi Customer One"),
            ("700002", "Aditi Customer Two"),
            ("700003", "Aditi Customer Three"),
            ("700004", "Aditi Customer Four"),
        ):
            customer = Customer.objects.create(customer_code=code, customer_name=name)
            CustomerEntity.objects.create(
                customer=customer, entity=self.aditi, primary_entity=True
            )
            self.aditi_customers.append(customer)

        # Same customer code as 700001 also trades with Gujarat — different split.
        CustomerEntity.objects.create(
            customer=self.aditi_customers[0],
            entity=self.gujarat,
            primary_entity=False,
        )
        self.gujarat_only = Customer.objects.create(
            customer_code="800001",
            customer_name="Gujarat Only Mills",
        )
        CustomerEntity.objects.create(
            customer=self.gujarat_only,
            entity=self.gujarat,
            primary_entity=True,
        )

        # 10 order numbers: 7 under Aditi-linked codes, 3 unknown codes.
        self.rows = [
            ["A1", "700001", "Aditi Customer One", "O1", "C1", "X", "Y", "T1", "M", 10],
            ["A1", "700001", "Aditi Customer One", "O1", "C1", "X", "Y", "T1", "L", 4],
            ["A1", "700001", "Aditi Customer One", "O2", "C2", "X", "Y", "T2", "M", 8],
            ["A1", "700002", "Aditi Customer Two", "O3", "C3", "X", "Y", "T3", "S", 6],
            ["A1", "700002", "Aditi Customer Two", "O4", "C4", "X", "Y", "T4", "M", 2],
            ["A1", "700003", "Aditi Customer Three", "O5", "C5", "X", "Y", "T5", "M", 12],
            ["A1", "700003", "Aditi Customer Three", "O6", "C6", "X", "Y", "T6", "L", 3],
            ["A1", "700004", "Aditi Customer Four", "O7", "C7", "X", "Y", "T7", "M", 9],
            ["A1", "799001", "Missing One", "O8", "C8", "X", "Y", "T8", "M", 5],
            ["A1", "799002", "Missing Two", "O9", "C9", "X", "Y", "T9", "M", 7],
            ["A1", "799003", "Missing Three", "O10", "C10", "X", "Y", "T10", "M", 1],
        ]

    def _preview(self, entity, brand=None, rows=None):
        upload = _xlsx(rows if rows is not None else self.rows)
        return self.client.post(
            "/api/purchase-orders/import/preview/",
            {
                "entity_id": entity.id,
                "brand_id": (brand or self.manual).id,
                "file": upload,
            },
            format="multipart",
            HTTP_HOST="localhost",
        )

    def _commit(self, entity, preview, order_nos=None, brand=None):
        approved = order_nos
        if approved is None:
            approved = [row["order_no"] for row in preview["importable"]]
        return self.client.post(
            "/api/purchase-orders/import/commit/",
            {
                "preview_token": preview.get("preview_token", ""),
                "entity_id": entity.id,
                "brand_id": (brand or self.manual).id,
                "order_nos": approved,
            },
            format="json",
            HTTP_HOST="localhost",
        )

    def test_preview_aditi_splits_matched_and_unmatched(self):
        before = PurchaseOrder.objects.count()
        res = self._preview(self.aditi)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(PurchaseOrder.objects.count(), before)
        self.assertEqual(PurchaseOrderLine.objects.count(), 0)

        importable_nos = [row["order_no"] for row in body["importable"]]
        excluded_nos = [row["order_no"] for row in body["excluded"]]
        self.assertEqual(importable_nos, ["O1", "O2", "O3", "O4", "O5", "O6", "O7"])
        self.assertEqual(excluded_nos, ["O8", "O9", "O10"])
        self.assertEqual(body["importable"][0]["line_count"], 2)
        self.assertEqual(
            body["importable"][0]["lines"][0]["description"],
            "C1-X-Y-T1-M",
        )
        self.assertIsNone(body["importable"][0]["lines"][0]["rate"])
        self.assertEqual(
            body["importable"][0]["matched_customer_id"],
            self.aditi_customers[0].id,
        )
        reasons = {row["order_no"]: row["reason"] for row in body["excluded"]}
        self.assertEqual(
            reasons["O8"],
            "Customer code 799001 not found under Aditi",
        )
        self.assertTrue(
            any("Rate is not present in the source file" in item for item in body["warnings"])
        )

    def test_commit_creates_only_approved_importable_in_one_transaction(self):
        preview = self._preview(self.aditi).json()
        res = self._commit(self.aditi, preview)
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["created_count"], 7)
        self.assertEqual(body["excluded_count"], 3)
        self.assertEqual(PurchaseOrder.objects.count(), 7)
        self.assertEqual(
            set(PurchaseOrder.objects.values_list("po_number", flat=True)),
            {"O1", "O2", "O3", "O4", "O5", "O6", "O7"},
        )
        self.assertFalse(PurchaseOrder.objects.filter(po_number__in=["O8", "O9", "O10"]).exists())
        po = PurchaseOrder.objects.get(po_number="O1")
        self.assertEqual(po.order_type, PurchaseOrder.OrderType.MANUAL)
        self.assertEqual(po.status, PurchaseOrder.Status.DRAFT)
        self.assertEqual(po.entity_id, self.aditi.id)
        self.assertEqual(po.brand_id, self.manual.id)
        self.assertEqual(po.customer_id, self.aditi_customers[0].id)
        self.assertEqual(po.lines.count(), 2)
        for line in po.lines.all():
            self.assertIsNone(line.rate)
            self.assertIsNone(line.product_id)
            self.assertEqual(line.line_total, Decimal("0.00"))

    def test_submit_imported_draft_blocked_until_rate_set(self):
        preview = self._preview(self.aditi).json()
        created = self._commit(self.aditi, preview, order_nos=["O1"]).json()["created"][0]
        blocked = self.client.post(
            f"/api/purchase-orders/{created['id']}/submit/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blocked.status_code, 400, blocked.content)
        self.assertIn("rate", blocked.json()["detail"].lower())
        self.assertEqual(
            PurchaseOrder.objects.get(pk=created["id"]).status,
            PurchaseOrder.Status.DRAFT,
        )

        line = PurchaseOrderLine.objects.get(purchase_order_id=created["id"], product_description="C1-X-Y-T1-M")
        other = PurchaseOrderLine.objects.get(purchase_order_id=created["id"], product_description="C1-X-Y-T1-L")
        update = self.client.put(
            f"/api/purchase-orders/{created['id']}/",
            {
                "po_number": "O1",
                "entity_id": self.aditi.id,
                "customer_id": self.aditi_customers[0].id,
                "brand_id": self.manual.id,
                "po_date": "2026-09-16",
                "lines": [
                    {
                        "product_id": None,
                        "product_description": line.product_description,
                        "quantity": str(line.quantity),
                        "rate": "12.50",
                    },
                    {
                        "product_id": None,
                        "product_description": other.product_description,
                        "quantity": str(other.quantity),
                        "rate": "8.00",
                    },
                ],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(update.status_code, 200, update.content)
        submitted = self.client.post(
            f"/api/purchase-orders/{created['id']}/submit/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(submitted.status_code, 200, submitted.content)
        self.assertEqual(submitted.json()["status"], "Submitted")

    def test_repreview_after_commit_flags_existing_po_numbers(self):
        preview = self._preview(self.aditi).json()
        self.assertEqual(self._commit(self.aditi, preview).status_code, 201)
        again = self._preview(self.aditi)
        self.assertEqual(again.status_code, 200, again.content)
        body = again.json()
        self.assertEqual(body["importable"], [])
        reasons = {row["order_no"]: row["reason"] for row in body["excluded"]}
        for order_no in ("O1", "O2", "O3", "O4", "O5", "O6", "O7"):
            self.assertIn("already exists as an existing po_number", reasons[order_no])
        self.assertEqual(reasons["O8"], "Customer code 799001 not found under Aditi")
        collision_warnings = [
            item for item in body["warnings"] if "already exists as an existing po_number" in item
        ]
        self.assertEqual(len(collision_warnings), 7)
        refused = self._commit(self.aditi, body, order_nos=["O1"])
        self.assertEqual(refused.status_code, 201, refused.content)
        self.assertEqual(refused.json()["created_count"], 0)
        self.assertEqual(PurchaseOrder.objects.count(), 7)

    def test_preview_gujarat_resolves_only_that_entity_customers(self):
        res = self._preview(self.gujarat)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        importable_nos = [row["order_no"] for row in body["importable"]]
        self.assertEqual(importable_nos, ["O1", "O2"])
        self.assertEqual(
            body["importable"][0]["matched_customer_id"],
            self.aditi_customers[0].id,
        )
        excluded = {row["order_no"]: row["reason"] for row in body["excluded"]}
        self.assertEqual(excluded["O3"], "Customer code 700002 not found under Gujarat")
        self.assertEqual(excluded["O8"], "Customer code 799001 not found under Gujarat")
        self.assertNotEqual(len(body["importable"]), 7)

    def test_commit_without_preview_rejected(self):
        res = self.client.post(
            "/api/purchase-orders/import/commit/",
            {
                "entity_id": self.aditi.id,
                "brand_id": self.manual.id,
                "order_nos": ["O1"],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertTrue(res.json().get("preview_token"))
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_commit_skips_excluded_even_if_customer_becomes_resolvable(self):
        preview = self._preview(self.aditi).json()
        Customer.objects.create(customer_code="799001", customer_name="Late Add")
        late = Customer.objects.get(customer_code="799001")
        CustomerEntity.objects.create(customer=late, entity=self.aditi, primary_entity=True)
        res = self._commit(
            self.aditi,
            preview,
            order_nos=[row["order_no"] for row in preview["importable"]] + ["O8"],
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertFalse(PurchaseOrder.objects.filter(po_number="O8").exists())
        self.assertIn("O8", res.json()["skipped_excluded_order_nos"])

    def test_stale_customer_unlink_rejects_whole_batch(self):
        preview = self._preview(self.aditi).json()
        CustomerEntity.objects.filter(
            customer=self.aditi_customers[0], entity=self.aditi
        ).delete()
        res = self._commit(self.aditi, preview)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(PurchaseOrder.objects.count(), 0)
        self.assertIn("changed since preview", res.json()["detail"].lower() + " " + str(res.json()))

    def test_digital_brand_rejected_and_operator_can_import(self):
        digital = self._preview(self.aditi, brand=self.digital)
        self.assertEqual(digital.status_code, 400, digital.content)
        self.assertEqual(PurchaseOrder.objects.count(), 0)

        self.client.force_authenticate(self.operator)
        preview = self._preview(self.aditi)
        self.assertEqual(preview.status_code, 200, preview.content)
        committed = self._commit(self.aditi, preview.json(), order_nos=["O7"])
        self.assertEqual(committed.status_code, 201, committed.content)
        po = PurchaseOrder.objects.get(po_number="O7")
        self.assertEqual(po.created_by_id, self.operator.id)

    def test_preview_requires_entity_and_brand(self):
        upload = _xlsx(self.rows)
        missing_entity = self.client.post(
            "/api/purchase-orders/import/preview/",
            {"brand_id": self.manual.id, "file": upload},
            format="multipart",
            HTTP_HOST="localhost",
        )
        self.assertEqual(missing_entity.status_code, 400)
        self.assertTrue(missing_entity.json().get("entity_id"))
        upload = _xlsx(self.rows)
        missing_brand = self.client.post(
            "/api/purchase-orders/import/preview/",
            {"entity_id": self.aditi.id, "file": upload},
            format="multipart",
            HTTP_HOST="localhost",
        )
        self.assertEqual(missing_brand.status_code, 400)
        self.assertTrue(missing_brand.json().get("brand_id"))
