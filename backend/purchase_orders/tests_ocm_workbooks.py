"""Safe check against converted copies of the OCM order-status and dispatch workbooks.

The original order-status file is .xlsb. This test reads an .xlsx copy that keeps
the title rows and the real rows for two order numbers. It never reads the
Downloads originals and it runs only against the Django test database.
"""

from datetime import date
from decimal import Decimal
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from purchase_orders.models import OfficialOcmOrder, PurchaseOrder, PurchaseOrderLine
from purchase_orders.serializers import create_purchase_order_with_lines

ORDER_FIXTURE = Path("purchase_orders/tests/fixtures/ocm_order_status_excerpt.xlsx")
DISPATCH_FIXTURE = Path("dispatches/tests/fixtures/ocm_dispatch_book1_excerpt.xlsx")
INTERNAL_NUMBER = "HIST-OCM-1"
APPROVED_ORDER = "ATW26RG0030"
OTHER_ORDER = "ATW26RG0002"


def _compose(line) -> str:
    return "-".join([line.code1, line.code5, line.code6, line.template, line.size])


class OcmWorkbookCopyTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="ocm-book-admin", password="pass12345", role=AuthUser.Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.branch = Entity.objects.create(
            short_code="ADT", entity_name="Aditi", entity_type=Entity.EntityType.BRANCH, city="Ahmedabad",
        )
        self.ocm = Brand.objects.create(
            brand_code="OCM", brand_name="OSM India Limited", order_method=Brand.OrderMethod.MANUAL_POR,
        )
        self.branch.brands.add(self.ocm)
        self.party = Customer.objects.create(customer_code="702550", customer_name="Workbook Party")
        self.other_party = Customer.objects.create(customer_code="700731", customer_name="Other Workbook Party")
        CustomerEntity.objects.create(customer=self.party, entity=self.branch, primary_entity=True)
        CustomerEntity.objects.create(customer=self.other_party, entity=self.branch, primary_entity=False)

    def _upload(self, path: Path, url: str):
        self.assertTrue(path.exists(), path)
        self.assertTrue(path.name.endswith(".xlsx"))
        upload = SimpleUploadedFile(
            path.name,
            path.read_bytes(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        return self.client.post(url, {"file": upload}, format="multipart", HTTP_HOST="localhost")

    def test_converted_workbooks_link_dispatch_without_replacing_the_internal_number(self):
        imported = self._upload(ORDER_FIXTURE, "/api/purchase-orders/ocm-official/")
        self.assertEqual(imported.status_code, 201, imported.content)
        numbers = {row["order_number"] for row in imported.json()["orders"]}
        self.assertEqual(numbers, {APPROVED_ORDER, OTHER_ORDER})
        self.assertEqual(PurchaseOrder.objects.count(), 0)

        official = OfficialOcmOrder.objects.get(order_number=APPROVED_ORDER)
        lines = list(official.lines.order_by("row_number"))
        composes = [_compose(line) for line in lines]
        self.assertEqual(len(composes), len(set(composes)))
        self.assertTrue(all(line.code1 and line.code6 and line.template and line.size for line in lines))

        purchase_order = create_purchase_order_with_lines(
            user=self.admin,
            assign_manual_number=False,
            po_number=INTERNAL_NUMBER,
            entity=self.branch,
            customer=self.party,
            brand=self.ocm,
            po_date=date(2026, 10, 26),
            order_type=PurchaseOrder.OrderType.MANUAL,
            lines=[{
                "product": None,
                "product_description": _compose(line),
                "quantity": line.ordered_qty,
                "shade": line.code6,
                "size": line.size,
                "delivery_from": line.delivery_start,
                "delivery_to": line.delivery_end,
                "rate": Decimal("10.00"),
            } for line in lines],
        )
        PurchaseOrder.objects.filter(pk=purchase_order.id).update(status=PurchaseOrder.Status.BRAND_ACCEPTED)

        detail = self.client.get(f"/api/purchase-orders/ocm-official/{official.id}/", HTTP_HOST="localhost")
        self.assertEqual(detail.status_code, 200, detail.content)
        body = detail.json()
        self.assertEqual(body["internal_po_number"], INTERNAL_NUMBER)
        self.assertEqual({line["status"] for line in body["lines"]}, {"Exact Match"})
        self.assertEqual(body["blockers"], [])

        other = OfficialOcmOrder.objects.get(order_number=OTHER_ORDER)
        other_detail = self.client.get(f"/api/purchase-orders/ocm-official/{other.id}/", HTTP_HOST="localhost")
        self.assertNotEqual(other_detail.json()["internal_po_id"], purchase_order.id)

        approved = self.client.post(
            f"/api/purchase-orders/ocm-official/{official.id}/approve/",
            {"reason": ""},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(approved.status_code, 200, approved.content)
        purchase_order.refresh_from_db()
        self.assertEqual(purchase_order.po_number, INTERNAL_NUMBER)
        self.assertEqual(purchase_order.brand_order_code, APPROVED_ORDER)
        self.assertEqual(
            list(purchase_order.lines.order_by("id").values_list("quantity", flat=True)),
            [line.ordered_qty for line in lines],
        )

        blocked = self.client.post(
            f"/api/purchase-orders/ocm-official/{other.id}/approve/",
            {"reason": "different order"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blocked.status_code, 400)

        dispatched = self._upload(DISPATCH_FIXTURE, "/api/dispatches/import/preview/")
        self.assertEqual(dispatched.status_code, 200, dispatched.content)
        preview = dispatched.json()
        linked = [row for row in preview["importable"] if row["order_code"] == APPROVED_ORDER]
        held = [row for row in preview["excluded"] if row["order_code"] == OTHER_ORDER]
        self.assertTrue(linked)
        self.assertTrue(all(row["po_number"] == INTERNAL_NUMBER for row in linked))
        self.assertTrue(held)
        self.assertTrue(all("not approved" in row["reason"] for row in held))

        commit = self.client.post(
            "/api/dispatches/import/commit/",
            {"preview_token": preview["preview_token"], "group_keys": [row["group_key"] for row in linked]},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(commit.status_code, 201, commit.content)
        purchase_order.refresh_from_db()
        self.assertEqual(purchase_order.po_number, INTERNAL_NUMBER)
        self.assertEqual(purchase_order.brand_order_code, APPROVED_ORDER)
        again = self._upload(DISPATCH_FIXTURE, "/api/dispatches/import/preview/")
        self.assertEqual(again.status_code, 200, again.content)
        self.assertFalse(any(row["order_code"] == APPROVED_ORDER for row in again.json()["importable"]))
        self.assertTrue(any("already imported" in row["reason"] for row in again.json()["excluded"]))
