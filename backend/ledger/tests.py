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
from products.models import Product


class CustomerLedgerApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="led-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="led-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="GUJ",
            entity_name="Gujarat Ledger",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ashram Road",
            city="Ahmedabad",
            state="Gujarat",
        )
        self.customer = Customer.objects.create(
            customer_code="LED-C1",
            customer_name="Ledger Trading",
            credit_days=15,
        )
        CustomerEntity.objects.create(
            customer=self.customer,
            entity=self.entity,
            primary_entity=True,
        )
        self.empty = Customer.objects.create(
            customer_code="LED-EMPTY",
            customer_name="Empty Trading",
        )
        CustomerEntity.objects.create(
            customer=self.empty,
            entity=self.entity,
            primary_entity=True,
        )
        self.brand = Brand.objects.create(
            brand_code="LEDB",
            brand_name="Ledger Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="LED-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )

    def _create_po(self, **kwargs):
        payload = {
            "po_number": "PO-LED-001",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "brand_id": self.brand.id,
            "po_date": "2026-09-01",
            "lines": [{"product_id": self.p1.id, "quantity": "10.00", "rate": "10.00"}],
        }
        payload.update(kwargs)
        res = self.client.post("/api/purchase-orders/", payload, format="json", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def _accept_and_dispatch(self, po=None):
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
        dsp = self.client.post(
            "/api/dispatches/",
            {
                "purchase_order_id": po["id"],
                "dispatch_date": "2026-09-01",
                "lr_number": "LR-LED-1",
                "transporter": "VRL",
                "challan_reference": "CH-LED",
                "lines": [
                    {"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "10.00"},
                ],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(dsp.status_code, 201, dsp.content)
        return self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()

    def _issue_invoice(self, po, invoice_number, quantity, invoice_date="2026-09-01"):
        res = self.client.post(
            "/api/invoices/",
            {
                "invoice_number": invoice_number,
                "invoice_date": invoice_date,
                "purchase_order_id": po["id"],
                "lines": [{"purchase_order_line_id": po["lines"][0]["id"], "quantity": quantity}],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 201, res.content)
        issued = self.client.post(f"/api/invoices/{res.json()['id']}/issue/", HTTP_HOST="localhost")
        self.assertEqual(issued.status_code, 200, issued.content)
        return issued.json()

    def _ledger(self, customer_id=None, **params):
        customer_id = customer_id or self.customer.id
        return self.client.get(
            f"/api/customers/{customer_id}/ledger/",
            params,
            HTTP_HOST="localhost",
        )

    def test_two_invoices_partial_payment_running_balance(self):
        po = self._accept_and_dispatch()
        first = self._issue_invoice(po, "INV-LED-A", "4.00", "2026-09-01")
        second = self._issue_invoice(po, "INV-LED-B", "6.00", "2026-09-02")
        paid = self.client.post(
            "/api/payments/",
            {
                "payment_number": "PAY-LED-1",
                "payment_date": "2026-09-03",
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "amount": "20.00",
                "payment_mode": "NEFT",
                "bank_cash_account": "HDFC-001",
                "allocations": [{"invoice_id": first["id"], "allocated_amount": "20.00"}],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(paid.status_code, 201, paid.content)

        res = self._ledger()
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["customer_code"], "LED-C1")
        types = [row["type"] for row in body["entries"]]
        self.assertEqual(types, ["Invoice", "Invoice", "Payment"])
        self.assertEqual(len([r for r in body["entries"] if r["type"] == "Invoice"]), 2)
        self.assertEqual(len([r for r in body["entries"] if r["type"] == "Payment"]), 1)
        self.assertEqual(len([r for r in body["entries"] if r["type"] == "Adjustment"]), 0)
        self.assertEqual(body["entries"][0]["running_balance"], "40.00")
        self.assertEqual(body["entries"][1]["running_balance"], "100.00")
        self.assertEqual(body["entries"][2]["running_balance"], "80.00")
        self.assertEqual(body["entries"][2]["credit_amount"], "20.00")
        self.assertNotEqual(body["entries"][-1]["running_balance"], "0.00")
        self.assertEqual(body["summary"]["total_invoiced"], "100.00")
        self.assertEqual(body["summary"]["total_paid"], "20.00")
        self.assertEqual(body["summary"]["outstanding_balance"], "80.00")
        self.assertEqual(second["net_amount"], "60.00")

    def test_overpayment_credit_is_full_payment_amount(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-LED-ADV", "4.00")
        paid = self.client.post(
            "/api/payments/",
            {
                "payment_number": "PAY-LED-ADV",
                "payment_date": "2026-09-04",
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "amount": "100.00",
                "payment_mode": "NEFT",
                "bank_cash_account": "HDFC-001",
                "allocations": [{"invoice_id": invoice["id"], "allocated_amount": "40.00"}],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(paid.status_code, 201, paid.content)
        body = self._ledger().json()
        credit = [row for row in body["entries"] if row["type"] == "Payment"][0]
        self.assertEqual(credit["credit_amount"], "100.00")
        self.assertEqual(body["summary"]["advance_credit_balance"], "60.00")
        self.assertEqual(body["summary"]["outstanding_balance"], "0.00")
        self.assertEqual(body["summary"]["total_paid"], "100.00")

    def test_date_range_carries_opening_balance(self):
        po = self._accept_and_dispatch()
        self._issue_invoice(po, "INV-LED-OLD", "4.00", "2026-09-01")
        self._issue_invoice(po, "INV-LED-NEW", "6.00", "2026-09-20")
        res = self._ledger(**{"from": "2026-09-10", "to": "2026-09-30"})
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["opening_balance"], "40.00")
        self.assertEqual(len(body["entries"]), 1)
        self.assertEqual(body["entries"][0]["reference"], "INV-LED-NEW")
        self.assertEqual(body["entries"][0]["running_balance"], "100.00")

    def test_empty_customer_zero_summary(self):
        res = self._ledger(self.empty.id)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["entries"], [])
        self.assertEqual(body["opening_balance"], "0.00")
        self.assertEqual(body["summary"]["total_invoiced"], "0.00")
        self.assertEqual(body["summary"]["total_paid"], "0.00")
        self.assertEqual(body["summary"]["outstanding_balance"], "0.00")
        self.assertEqual(body["summary"]["advance_credit_balance"], "0.00")
        self.assertEqual(body["summary"]["overdue_amount"], "0.00")

    def test_cancelled_invoice_excluded(self):
        po = self._accept_and_dispatch()
        kept = self._issue_invoice(po, "INV-LED-KEEP", "4.00")
        cancelled = self._issue_invoice(po, "INV-LED-CAN", "6.00")
        self.client.post(
            f"/api/invoices/{cancelled['id']}/status/",
            {"status": "Cancelled"},
            format="json",
            HTTP_HOST="localhost",
        )
        body = self._ledger().json()
        refs = [row["reference"] for row in body["entries"]]
        self.assertIn("INV-LED-KEEP", refs)
        self.assertNotIn("INV-LED-CAN", refs)
        self.assertEqual(body["summary"]["total_invoiced"], kept["net_amount"])

    def test_ledger_pdf(self):
        po = self._accept_and_dispatch()
        self._issue_invoice(po, "INV-LED-PDF", "4.00")
        pdf = self.client.get(
            f"/api/customers/{self.customer.id}/ledger/pdf/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(pdf.status_code, 200, pdf.content[:200])
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        self.assertIn(b"Ledger", pdf.content)

    def test_overdue_amount_uses_remaining_balance(self):
        po = self._accept_and_dispatch()
        today = timezone.localdate()
        past = (today - timedelta(days=20)).isoformat()
        invoice = self._issue_invoice(po, "INV-LED-OD", "4.00", past)
        issued = self.client.get(f"/api/invoices/{invoice['id']}/", HTTP_HOST="localhost").json()
        self.assertTrue(issued["is_overdue"], issued)
        body = self._ledger().json()
        self.assertEqual(body["summary"]["overdue_amount"], "40.00")

    def test_operator_ledger_forbidden_for_unrelated_customer(self):
        self.client.force_authenticate(self.operator)
        blocked = self._ledger(self.empty.id)
        self.assertEqual(blocked.status_code, 403)
        pdf = self.client.get(
            f"/api/customers/{self.empty.id}/ledger/pdf/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(pdf.status_code, 403)
        self._create_po()
        allowed = self._ledger(self.customer.id)
        self.assertEqual(allowed.status_code, 200, allowed.content)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self._ledger(self.empty.id).status_code, 200)
