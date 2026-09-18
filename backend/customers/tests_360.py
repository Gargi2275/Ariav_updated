from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from ledger.customer import customer_ledger_summary
from products.models import Product


class Customer360ApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="c360-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="c360-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="GUJ",
            entity_name="Gujarat 360",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ashram Road",
            city="Ahmedabad",
            state="Gujarat",
        )
        self.customer = Customer.objects.create(
            customer_code="C360-1",
            customer_name="360 Trading",
            customer_type=Customer.CustomerType.COMPANY,
            credit_days=15,
            credit_limit=Decimal("50000.00"),
            contact_person="Ravi Mehta",
            city="Surat",
        )
        CustomerEntity.objects.create(
            customer=self.customer,
            entity=self.entity,
            primary_entity=True,
        )
        self.empty = Customer.objects.create(
            customer_code="C360-EMPTY",
            customer_name="360 Empty",
            customer_type=Customer.CustomerType.COMPANY,
        )
        CustomerEntity.objects.create(
            customer=self.empty,
            entity=self.entity,
            primary_entity=True,
        )
        self.brand = Brand.objects.create(
            brand_code="C360B",
            brand_name="360 Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="C360-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )
        self.p2 = Product.objects.create(
            product_code="C360-02",
            product_name="40s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("8.00"),
            unit=Product.Unit.METER,
        )

    def _create_po(self, **kwargs):
        payload = {
            "po_number": "PO-C360-001",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "brand_id": self.brand.id,
            "po_date": "2026-09-01",
            "lines": [
                {"product_id": self.p1.id, "quantity": "10.00", "rate": "10.00"},
                {"product_id": self.p2.id, "quantity": "5.00", "rate": "8.00"},
            ],
        }
        payload.update(kwargs)
        res = self.client.post("/api/purchase-orders/", payload, format="json", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def _accept_and_dispatch(self, po=None, lr="LR-C360-1"):
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
                "dispatch_date": po.get("po_date") or "2026-09-01",
                "lr_number": lr,
                "transporter": "VRL",
                "challan_reference": "CH-C360",
                "lines": [
                    {"purchase_order_line_id": line["id"], "dispatched_quantity": line["quantity"]}
                    for line in po["lines"]
                ],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(dsp.status_code, 201, dsp.content)
        return self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()

    def _issue_invoice(self, po, invoice_number, line_index, quantity, invoice_date="2026-09-01", due_date=None):
        payload = {
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "purchase_order_id": po["id"],
            "lines": [{"purchase_order_line_id": po["lines"][line_index]["id"], "quantity": quantity}],
        }
        if due_date:
            payload["due_date"] = due_date
        res = self.client.post("/api/invoices/", payload, format="json", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 201, res.content)
        issued = self.client.post(f"/api/invoices/{res.json()['id']}/issue/", HTTP_HOST="localhost")
        self.assertEqual(issued.status_code, 200, issued.content)
        return issued.json()

    def _pay(self, invoice, payment_number, amount, payment_date):
        paid = self.client.post(
            "/api/payments/",
            {
                "payment_number": payment_number,
                "payment_date": payment_date,
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "amount": amount,
                "payment_mode": "NEFT",
                "bank_cash_account": "HDFC-001",
                "allocations": [{"invoice_id": invoice["id"], "allocated_amount": amount}],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(paid.status_code, 201, paid.content)
        return paid.json()

    def _seed_full_history(self):
        po = self._accept_and_dispatch()
        first = self._issue_invoice(po, "INV-C360-A", 0, "10.00", "2026-09-01", due_date="2026-09-10")
        second = self._issue_invoice(po, "INV-C360-B", 1, "5.00", "2026-09-02", due_date="2026-09-10")
        self._pay(first, "PAY-C360-A", str(first["net_amount"]), "2026-09-05")
        self._pay(second, "PAY-C360-B", str(second["net_amount"]), "2026-09-20")
        later = self._create_po(po_number="PO-C360-OCT", po_date="2026-10-15")
        later = self._accept_and_dispatch(later, lr="LR-C360-OCT")
        october = self._issue_invoice(later, "INV-C360-OCT", 0, "10.00", "2026-10-15")
        return {"po": po, "first": first, "second": second, "october": october}

    def _360(self, customer_id=None, **params):
        customer_id = customer_id or self.customer.id
        return self.client.get(
            f"/api/customers/{customer_id}/360/",
            params,
            HTTP_HOST="localhost",
        )

    def test_empty_customer_has_empty_sections(self):
        res = self._360(self.empty.id)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["basic_info"]["customer_code"], "C360-EMPTY")
        self.assertEqual(body["outstanding"], "0.00")
        self.assertEqual(body["advance"], "0.00")
        self.assertEqual(body["overdue"], "0.00")
        self.assertEqual(body["purchase_history"]["rows"], [])
        self.assertEqual(body["dispatch_history"]["rows"], [])
        self.assertEqual(body["invoice_history"]["rows"], [])
        self.assertEqual(body["payment_history"]["rows"], [])
        self.assertEqual(body["ledger_preview"], [])
        self.assertEqual(body["product_purchase_trends"], [])
        self.assertIsNone(body["payment_behaviour"]["average_days_to_pay"])
        self.assertIsNone(body["payment_behaviour"]["on_time_payment_rate"])
        self.assertEqual(body["payment_behaviour"]["total_payment_count"], 0)

    def test_full_history_aggregates_and_matches_ledger(self):
        fx = self._seed_full_history()
        with CaptureQueriesContext(connection) as ctx:
            res = self._360()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertLess(len(ctx), 40, [q["sql"] for q in ctx])
        body = res.json()

        self.assertEqual(body["basic_info"]["customer_code"], "C360-1")
        self.assertEqual(body["basic_info"]["credit_days"], 15)
        self.assertEqual(body["basic_info"]["entities"][0]["primary_entity"], True)
        self.assertEqual(body["purchase_history"]["total_count"], 2)
        self.assertEqual(body["dispatch_history"]["total_count"], 2)
        self.assertEqual(len(body["invoice_history"]["rows"]), 3)
        self.assertEqual(len(body["payment_history"]["rows"]), 2)
        self.assertTrue(any(row["display_status"] for row in body["invoice_history"]["rows"]))

        ledger = self.client.get(
            f"/api/customers/{self.customer.id}/ledger/",
            HTTP_HOST="localhost",
        ).json()
        summary = customer_ledger_summary(self.customer)
        self.assertEqual(body["outstanding"], ledger["summary"]["outstanding_balance"])
        self.assertEqual(body["advance"], ledger["summary"]["advance_credit_balance"])
        self.assertEqual(body["overdue"], ledger["summary"]["overdue_amount"])
        self.assertEqual(body["summary"], summary)
        self.assertEqual(body["ledger_preview"], ledger["entries"][-10:])
        self.assertEqual(fx["october"]["net_amount"], "100.00")

        trends = body["product_purchase_trends"]
        self.assertGreaterEqual(len(trends), 2)
        self.assertEqual(trends[0]["product_code"], "C360-01")
        self.assertEqual(trends[0]["total_value"], "200.00")
        self.assertEqual(trends[1]["product_code"], "C360-02")
        self.assertEqual(trends[1]["total_value"], "40.00")

        behaviour = body["payment_behaviour"]
        self.assertEqual(behaviour["average_days_to_pay"], "2.50")
        self.assertEqual(behaviour["on_time_payment_rate"], "50.00")
        self.assertEqual(behaviour["total_payment_count"], 2)
        self.assertEqual(behaviour["paid_invoice_count"], 2)

    def test_date_range_scopes_history_not_current_kpis(self):
        self._seed_full_history()
        full = self._360().json()
        scoped = self._360(**{"from": "2026-09-01", "to": "2026-09-30"}).json()

        self.assertEqual(scoped["outstanding"], full["outstanding"])
        self.assertEqual(scoped["advance"], full["advance"])
        self.assertEqual(scoped["overdue"], full["overdue"])
        self.assertEqual(scoped["purchase_history"]["total_count"], 1)
        self.assertEqual(scoped["dispatch_history"]["total_count"], 1)
        self.assertEqual(len(scoped["invoice_history"]["rows"]), 2)
        self.assertFalse(any(row["invoice_number"] == "INV-C360-OCT" for row in scoped["invoice_history"]["rows"]))
        self.assertEqual(len(scoped["product_purchase_trends"]), 2)
        self.assertEqual(scoped["product_purchase_trends"][0]["total_value"], "100.00")
        self.assertEqual(scoped["payment_behaviour"]["total_payment_count"], 2)

    def test_invalid_date_range_is_400(self):
        res = self._360(**{"from": "2026-10-01", "to": "2026-09-01"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("from date", res.json()["detail"].lower())

    def test_operator_360_forbidden_for_unrelated_customer(self):
        self.client.force_authenticate(self.operator)
        blocked = self._360(self.empty.id)
        self.assertEqual(blocked.status_code, 403)
        self._create_po()
        allowed = self._360(self.customer.id)
        self.assertEqual(allowed.status_code, 200, allowed.content)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self._360(self.empty.id).status_code, 200)
