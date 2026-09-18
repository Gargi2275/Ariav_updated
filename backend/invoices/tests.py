from datetime import timedelta
from decimal import Decimal

from rest_framework.test import APIClient

from django.test import TestCase
from django.utils import timezone

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from invoices.models import Invoice
from products.models import Product


class InvoiceApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="inv-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="inv-op",
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
            customer_code="INV-C1",
            customer_name="Invoice Trading",
            credit_days=15,
        )
        CustomerEntity.objects.create(
            customer=self.customer,
            entity=self.entity,
            primary_entity=True,
        )
        self.brand = Brand.objects.create(
            brand_code="INVB",
            brand_name="Invoice Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="INV-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )
        self.p2 = Product.objects.create(
            product_code="INV-02",
            product_name="40s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("20.00"),
            unit=Product.Unit.METER,
        )

    def _create_po(self, **kwargs):
        payload = {
            "po_number": "PO-INV-001",
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
        res = self.client.post("/api/purchase-orders/", payload, format="json", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def _accept_and_dispatch(self, po=None, dispatch_lines=None):
        po = po or self._create_po()
        self.client.post(f"/api/purchase-orders/{po['id']}/submit/", HTTP_HOST="localhost")
        self.client.post(
            f"/api/purchase-orders/{po['id']}/status/",
            {"status": "Sent to Brand"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.client.post(
            f"/api/purchase-orders/{po['id']}/status/",
            {"status": "Brand Accepted"},
            format="json",
            HTTP_HOST="localhost",
        )
        lines = dispatch_lines or [
            {"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "10.00"},
            {"purchase_order_line_id": po["lines"][1]["id"], "dispatched_quantity": "4.00"},
        ]
        dsp = self.client.post(
            "/api/dispatches/",
            {
                "purchase_order_id": po["id"],
                "dispatch_date": "2026-09-16",
                "lr_number": "LR-INV-1",
                "transporter": "VRL",
                "challan_reference": "CH-INV",
                "lines": lines,
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(dsp.status_code, 201, dsp.content)
        po = self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()
        return po

    def _invoice_payload(self, po, **kwargs):
        payload = {
            "invoice_number": "INV-2026-001",
            "invoice_date": "2026-09-16",
            "purchase_order_id": po["id"],
            "lines": [
                {"purchase_order_line_id": po["lines"][0]["id"], "quantity": "4.00"},
            ],
        }
        payload.update(kwargs)
        return payload

    def _post_invoice(self, payload):
        return self.client.post("/api/invoices/", payload, format="json", HTTP_HOST="localhost")

    def test_invoice_without_dispatch_blocked(self):
        po = self._create_po()
        res = self._post_invoice(self._invoice_payload(po))
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("no dispatched quantity", str(res.json()).lower())
        self.assertEqual(Invoice.objects.count(), 0)

    def test_partial_invoice_then_remaining_cap(self):
        po = self._accept_and_dispatch()
        first = self._post_invoice(self._invoice_payload(po))
        self.assertEqual(first.status_code, 201, first.content)
        body = first.json()
        self.assertEqual(body["status"], "Draft")
        self.assertEqual(body["customer_code"], "INV-C1")
        self.assertEqual(body["due_date"], "2026-10-01")
        self.assertEqual(body["subtotal"], "40.00")
        self.assertEqual(body["lines"][0]["line_total"], "40.00")

        po_body = self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(po_body["lines"][0]["invoiceable_quantity"], "6.00")

        over = self._post_invoice(
            self._invoice_payload(
                po,
                invoice_number="INV-2026-002",
                lines=[{"purchase_order_line_id": po["lines"][0]["id"], "quantity": "50.00"}],
            )
        )
        self.assertEqual(over.status_code, 400, over.content)
        message = str(over.json())
        self.assertIn("Cannot invoice 50 units", message)
        self.assertIn("only 6 units dispatched and not yet invoiced", message)

    def test_discount_and_tax_net_amount(self):
        po = self._accept_and_dispatch()
        res = self._post_invoice(
            self._invoice_payload(
                po,
                discount_percent="10.00",
                tax_percent="5.00",
                other_charges="2.00",
                lines=[{"purchase_order_line_id": po["lines"][0]["id"], "quantity": "10.00"}],
            )
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        # subtotal 100, discount 10, tax 5% of 90 = 4.50, + 2 other = 96.50
        self.assertEqual(body["subtotal"], "100.00")
        self.assertEqual(body["discount_amount"], "10.00")
        self.assertEqual(body["tax_amount"], "4.50")
        self.assertEqual(body["net_amount"], "96.50")

    def test_issue_locks_lines_and_pdf(self):
        po = self._accept_and_dispatch()
        created = self._post_invoice(self._invoice_payload(po)).json()
        issued = self.client.post(f"/api/invoices/{created['id']}/issue/", HTTP_HOST="localhost")
        self.assertEqual(issued.status_code, 200, issued.content)
        self.assertEqual(issued.json()["status"], "Issued")
        blocked = self.client.put(
            f"/api/invoices/{created['id']}/",
            self._invoice_payload(po, invoice_number="INV-2026-001"),
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blocked.status_code, 400, blocked.content)
        pdf = self.client.get(f"/api/invoices/{created['id']}/pdf/", HTTP_HOST="localhost")
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        self.assertIn(b"Invoice", pdf.content)

    def test_overdue_is_computed_not_stored(self):
        po = self._accept_and_dispatch()
        today = timezone.localdate()
        created = self._post_invoice(
            self._invoice_payload(
                po,
                invoice_date=(today - timedelta(days=10)).isoformat(),
                due_date=(today - timedelta(days=1)).isoformat(),
            )
        ).json()
        self.client.post(f"/api/invoices/{created['id']}/issue/", HTTP_HOST="localhost")
        body = self.client.get(f"/api/invoices/{created['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(body["status"], "Issued")
        self.assertTrue(body["is_overdue"])
        self.assertEqual(body["display_status"], "Overdue")
        listed = self.client.get("/api/invoices/", {"status": "Overdue"}, HTTP_HOST="localhost")
        self.assertEqual(len(listed.json()), 1)

    def test_cancel_draft_ok_paid_blocked(self):
        po = self._accept_and_dispatch()
        draft = self._post_invoice(self._invoice_payload(po)).json()
        cancelled = self.client.post(
            f"/api/invoices/{draft['id']}/status/",
            {"status": "Cancelled"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.content)

        second = self._post_invoice(self._invoice_payload(po, invoice_number="INV-2026-009")).json()
        self.client.post(f"/api/invoices/{second['id']}/issue/", HTTP_HOST="localhost")
        self.client.post(
            f"/api/invoices/{second['id']}/status/",
            {"status": "Paid"},
            format="json",
            HTTP_HOST="localhost",
        )
        blocked = self.client.post(
            f"/api/invoices/{second['id']}/status/",
            {"status": "Cancelled"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blocked.status_code, 400, blocked.content)
        self.assertIn("Paid", str(blocked.json()))

    def test_operator_can_create_and_issue_not_cancel(self):
        po = self._accept_and_dispatch()
        self.client.force_authenticate(self.operator)
        created = self._post_invoice(self._invoice_payload(po, invoice_number="INV-OP-1"))
        self.assertEqual(created.status_code, 201, created.content)
        issued = self.client.post(f"/api/invoices/{created.json()['id']}/issue/", HTTP_HOST="localhost")
        self.assertEqual(issued.status_code, 200, issued.content)
        denied = self.client.post(
            f"/api/invoices/{created.json()['id']}/status/",
            {"status": "Cancelled"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(denied.status_code, 403)

    def test_overdue_cannot_be_set_manually(self):
        po = self._accept_and_dispatch()
        created = self._post_invoice(self._invoice_payload(po)).json()
        res = self.client.post(
            f"/api/invoices/{created['id']}/status/",
            {"status": "Overdue"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 400, res.content)

    def test_cancel_issued_invoice_frees_invoiceable_quantity(self):
        po = self._create_po(
            po_number="PO-INV-100",
            lines=[{"product_id": self.p1.id, "quantity": "100.00", "rate": "10.00"}],
        )
        po = self._accept_and_dispatch(
            po,
            dispatch_lines=[
                {"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "100.00"},
            ],
        )
        line_id = po["lines"][0]["id"]
        self.assertEqual(po["lines"][0]["invoiceable_quantity"], "100.00")

        created = self._post_invoice(
            self._invoice_payload(
                po,
                invoice_number="INV-CANCEL-60",
                lines=[{"purchase_order_line_id": line_id, "quantity": "60.00"}],
            )
        )
        self.assertEqual(created.status_code, 201, created.content)
        invoice_id = created.json()["id"]
        issued = self.client.post(f"/api/invoices/{invoice_id}/issue/", HTTP_HOST="localhost")
        self.assertEqual(issued.status_code, 200, issued.content)
        self.assertEqual(issued.json()["status"], "Issued")

        after_issue = self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(after_issue["lines"][0]["invoiceable_quantity"], "40.00")
        self.assertEqual(after_issue["lines"][0]["total_invoiced"], "60.00")

        cancelled = self.client.post(
            f"/api/invoices/{invoice_id}/status/",
            {"status": "Cancelled"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        self.assertEqual(cancelled.json()["status"], "Cancelled")

        after_cancel = self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(after_cancel["lines"][0]["invoiceable_quantity"], "100.00")
        self.assertEqual(after_cancel["lines"][0]["total_invoiced"], "0.00")

        replacement = self._post_invoice(
            self._invoice_payload(
                po,
                invoice_number="INV-REISSUE-100",
                lines=[{"purchase_order_line_id": line_id, "quantity": "100.00"}],
            )
        )
        self.assertEqual(replacement.status_code, 201, replacement.content)
        self.assertEqual(replacement.json()["lines"][0]["quantity"], "100.00")
