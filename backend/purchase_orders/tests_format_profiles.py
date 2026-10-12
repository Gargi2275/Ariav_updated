from pathlib import Path

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from purchase_orders.models import PurchaseOrder


FIXTURE = Path(__file__).parent / "tests" / "fixtures" / "DARV240260930005_ND_TAILOR_30-09-2026.xlsx"


class ArvindImportProfileTests(TestCase):
    def setUp(self):
        self.user = AuthUser.objects.create_user(
            username="arvind-import-admin",
            password="test-password",
            role=AuthUser.Role.ADMIN,
        )
        self.entity = Entity.objects.create(
            short_code="ARV",
            entity_name="Arvind Entity",
            entity_type=Entity.EntityType.HEAD_OFFICE,
            address_line_1="Test Road",
            city="Ahmedabad",
            state="Gujarat",
        )
        self.brand = Brand.objects.create(
            brand_code="AVD",
            brand_name="Arvind",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        customer = Customer.objects.create(customer_code="0004054783", customer_name="ND TAILOR")
        CustomerEntity.objects.create(customer=customer, entity=self.entity, primary_entity=True)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_arvind_fixture_preview_and_commit(self):
        with FIXTURE.open("rb") as source:
            response = self.client.post(
                "/api/purchase-orders/import/preview/",
                {"entity_id": self.entity.id, "brand_id": self.brand.id, "file": source},
                format="multipart",
                HTTP_HOST="localhost",
            )
        self.assertEqual(response.status_code, 200, response.content)
        preview = response.json()
        self.assertEqual(preview["format_id"], "arvind_digital_po")
        self.assertEqual(len(preview["importable"]), 1)
        row = preview["importable"][0]
        self.assertEqual(row["po_date"], "2026-09-30")
        self.assertEqual([line["quantity"] for line in row["lines"]], ["1.00"] * 4)
        self.assertEqual([line["rate"] for line in row["lines"]], ["399.00", "399.00", "399.00", "599.00"])
        self.assertEqual(row["lines"][3]["customer_delivery_date"], "2026-12-10")

        committed = self.client.post(
            "/api/purchase-orders/import/commit/",
            {
                "preview_token": preview["preview_token"],
                "entity_id": self.entity.id,
                "brand_id": self.brand.id,
                "order_nos": [row["order_no"]],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(committed.status_code, 201, committed.content)
        po = PurchaseOrder.objects.get()
        self.assertEqual(po.source_format, "arvind_digital_po")
        self.assertEqual(po.po_date.isoformat(), "2026-09-30")
        self.assertEqual(po.remarks, "urgent dispatch")
        self.assertEqual(po.extra_data["kam_name"], "Arvind Rawal")
        self.assertEqual(po.extra_data["division"], "36")
        self.assertEqual(list(po.lines.values_list("customer_delivery_date", flat=True))[-1].isoformat(), "2026-12-10")

    def test_arvind_file_is_rejected_for_ocm_brand(self):
        ocm = Brand.objects.create(
            brand_code="OCM",
            brand_name="OCM",
            order_method=Brand.OrderMethod.MANUAL_POR,
        )
        with FIXTURE.open("rb") as source:
            response = self.client.post(
                "/api/purchase-orders/import/preview/",
                {"entity_id": self.entity.id, "brand_id": ocm.id, "file": source},
                format="multipart",
                HTTP_HOST="localhost",
            )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("Arvind", str(response.json()))
