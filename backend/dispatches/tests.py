from decimal import Decimal

from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from dispatches.models import Dispatch, DispatchLine
from entities.models import Entity
from products.models import Product
from purchase_orders.models import PurchaseOrder


class DispatchApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="dsp-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="dsp-op",
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
            customer_code="DSP-C1",
            customer_name="Dispatch Trading",
        )
        CustomerEntity.objects.create(
            customer=self.customer,
            entity=self.entity,
            primary_entity=True,
        )
        self.brand = Brand.objects.create(
            brand_code="DSPB",
            brand_name="Dispatch Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="DSP-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )
        self.p2 = Product.objects.create(
            product_code="DSP-02",
            product_name="40s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("20.00"),
            unit=Product.Unit.METER,
        )

    def _create_po(self, **kwargs):
        payload = {
            "po_number": "PO-DSP-001",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "brand_id": self.brand.id,
            "po_date": "2026-09-16",
            "lines": [
                {"product_id": self.p1.id, "quantity": "10.00", "rate": "10.00"},
                {"product_id": self.p2.id, "quantity": "4.00", "rate": "20.00"},
            ],
        }
        payload.update(kwargs)
        res = self.client.post(
            "/api/purchase-orders/",
            payload,
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def _accept_po(self, po_id):
        self.client.post(f"/api/purchase-orders/{po_id}/submit/", HTTP_HOST="localhost")
        self.client.post(
            f"/api/purchase-orders/{po_id}/status/",
            {"status": "Sent to Brand"},
            format="json",
            HTTP_HOST="localhost",
        )
        res = self.client.post(
            f"/api/purchase-orders/{po_id}/status/",
            {"status": "Brand Accepted"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def _dispatch_payload(self, po, **kwargs):
        lines = po["lines"]
        payload = {
            "purchase_order_id": po["id"],
            "dispatch_date": "2026-09-16",
            "lr_number": "LR-1001",
            "transporter": "VRL Logistics",
            "challan_reference": "CH-55",
            "lines": [
                {"purchase_order_line_id": lines[0]["id"], "dispatched_quantity": "10.00"},
                {"purchase_order_line_id": lines[1]["id"], "dispatched_quantity": "1.00"},
            ],
        }
        payload.update(kwargs)
        return payload

    def _post_dispatch(self, payload):
        return self.client.post(
            "/api/dispatches/",
            payload,
            format="json",
            HTTP_HOST="localhost",
        )

    def test_dispatch_against_draft_blocked(self):
        po = self._create_po()
        res = self._post_dispatch(self._dispatch_payload(po))
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("Draft", str(res.json()))
        self.assertEqual(Dispatch.objects.count(), 0)

    def test_partial_then_complete_dispatch_updates_po_status(self):
        po = self._accept_po(self._create_po()["id"])
        first = self._post_dispatch(self._dispatch_payload(po))
        self.assertEqual(first.status_code, 201, first.content)
        body = first.json()
        self.assertEqual(body["purchase_order_status"], "Partially Dispatched")
        self.assertEqual(len(body["lines"]), 2)

        refreshed = self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(refreshed["status"], "Partially Dispatched")
        self.assertEqual(refreshed["dispatch_progress"], "Partial")
        self.assertEqual(refreshed["lines"][0]["total_dispatched"], "10.00")
        self.assertEqual(refreshed["lines"][0]["pending_quantity"], "0.00")
        self.assertEqual(refreshed["lines"][1]["total_dispatched"], "1.00")
        self.assertEqual(refreshed["lines"][1]["pending_quantity"], "3.00")

        second = self._post_dispatch(
            self._dispatch_payload(
                po,
                lr_number="LR-1002",
                challan_reference="CH-56",
                lines=[{"purchase_order_line_id": po["lines"][1]["id"], "dispatched_quantity": "3.00"}],
            )
        )
        self.assertEqual(second.status_code, 201, second.content)
        self.assertEqual(second.json()["purchase_order_status"], "Fully Dispatched")
        done = self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(done["status"], "Fully Dispatched")
        self.assertEqual(done["dispatch_progress"], "Complete")
        self.assertEqual(done["lines"][1]["pending_quantity"], "0.00")
        self.assertEqual(Dispatch.objects.filter(purchase_order_id=po["id"]).count(), 2)

    def test_over_dispatch_blocked_with_pending_message(self):
        po = self._accept_po(self._create_po()["id"])
        res = self._post_dispatch(
            self._dispatch_payload(
                po,
                lines=[{"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "50.00"}],
            )
        )
        self.assertEqual(res.status_code, 400, res.content)
        message = str(res.json())
        self.assertIn("Cannot dispatch 50 units", message)
        self.assertIn("only 10 units pending", message)
        self.assertEqual(Dispatch.objects.count(), 0)

    def test_delete_dispatch_reverts_status_and_pending(self):
        po = self._accept_po(self._create_po()["id"])
        created = self._post_dispatch(self._dispatch_payload(po)).json()
        gone = self.client.delete(f"/api/dispatches/{created['id']}/", HTTP_HOST="localhost")
        self.assertEqual(gone.status_code, 204)
        self.assertEqual(Dispatch.objects.count(), 0)
        self.assertEqual(DispatchLine.objects.count(), 0)
        refreshed = self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(refreshed["status"], "Brand Accepted")
        self.assertEqual(refreshed["dispatch_progress"], "Not Started")
        self.assertEqual(refreshed["lines"][0]["pending_quantity"], "10.00")
        self.assertEqual(refreshed["lines"][1]["pending_quantity"], "4.00")

    def test_line_from_other_po_rejected(self):
        po1 = self._accept_po(self._create_po()["id"])
        po2 = self._accept_po(self._create_po(po_number="PO-DSP-002")["id"])
        res = self._post_dispatch(
            self._dispatch_payload(
                po1,
                lines=[{"purchase_order_line_id": po2["lines"][0]["id"], "dispatched_quantity": "1.00"}],
            )
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(Dispatch.objects.count(), 0)

    def test_put_updates_header_not_lines(self):
        po = self._accept_po(self._create_po()["id"])
        created = self._post_dispatch(self._dispatch_payload(po)).json()
        res = self.client.put(
            f"/api/dispatches/{created['id']}/",
            {
                "dispatch_date": "2026-09-17",
                "lr_number": "LR-UPDATED",
                "transporter": "Gati",
                "challan_reference": "CH-99",
                "lines": [{"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "1.00"}],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["lr_number"], "LR-UPDATED")
        self.assertEqual(body["transporter"], "Gati")
        self.assertEqual(len(body["lines"]), 2)
        self.assertEqual(body["lines"][0]["dispatched_quantity"], "10.00")
        po_body = self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(po_body["status"], "Partially Dispatched")

    def test_filters_search_and_operator_can_create(self):
        po = self._accept_po(self._create_po()["id"])
        self._post_dispatch(self._dispatch_payload(po))
        listed = self.client.get(
            "/api/dispatches/",
            {"purchase_order_id": po["id"], "search": "LR-1001"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        ranged = self.client.get(
            "/api/dispatches/",
            {"date_from": "2026-09-16", "date_to": "2026-09-16"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(len(ranged.json()), 1)

        self.client.force_authenticate(self.operator)
        op_po_id = self._create_po(po_number="PO-DSP-OP")["id"]
        self.client.force_authenticate(self.admin)
        op_po = self._accept_po(op_po_id)
        self.client.force_authenticate(self.operator)
        created = self._post_dispatch(
            self._dispatch_payload(op_po, lr_number="LR-OP-1", challan_reference="CH-OP")
        )
        self.assertEqual(created.status_code, 201, created.content)
