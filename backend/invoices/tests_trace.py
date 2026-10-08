from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import AuthUser
from accounts.views import issue_token
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from invoices.management.commands.check_traceability import run_checks
from invoices.models import Invoice
from products.models import Product
from purchase_orders.models import PurchaseOrder, PurchaseOrderStatusChange

H = {"HTTP_HOST": "localhost"}


class InvoiceTraceTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="trace-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
            display_name="Trace Admin",
        )
        self.operator = AuthUser.objects.create_user(
            username="trace-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
            display_name="Trace Operator",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="SRT",
            entity_name="Surat Branch",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ring Road",
            city="Surat",
            state="Gujarat",
        )
        self.customer = Customer.objects.create(
            customer_code="CUS-TR1",
            customer_name="Shree Textiles",
            customer_type=Customer.CustomerType.COMPANY,
            credit_days=30,
        )
        CustomerEntity.objects.create(customer=self.customer, entity=self.entity, primary_entity=True)
        self.brand = Brand.objects.create(
            brand_code="BRTR",
            brand_name="Arvind Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="FAB", category_name="Fabric")
        sub = Category.objects.create(category_code="DNM", category_name="Denim", parent_category=root)
        self.p1 = Product.objects.create(
            product_code="DNM-01",
            product_name="Indigo Denim",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )
        self.p2 = Product.objects.create(
            product_code="DNM-02",
            product_name="Black Denim",
            brand=self.brand,
            category=sub,
            rate=Decimal("8.00"),
            unit=Product.Unit.METER,
        )

    def _accepted_po(self):
        res = self.client.post(
            "/api/purchase-orders/",
            {
                "po_number": "PO-TR-001",
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "brand_id": self.brand.id,
                "po_date": "2026-09-01",
                "lines": [
                    {"product_id": self.p1.id, "quantity": "10.00", "rate": "10.00"},
                    {"product_id": self.p2.id, "quantity": "5.00", "rate": "8.00"},
                ],
            },
            format="json",
            **H,
        )
        self.assertEqual(res.status_code, 201, res.content)
        po = res.json()
        self.client.post(f"/api/purchase-orders/{po['id']}/submit/", **H)
        for target in ("Sent to Brand", "Brand Accepted"):
            moved = self.client.post(f"/api/purchase-orders/{po['id']}/status/", {"status": target}, format="json", **H)
            self.assertEqual(moved.status_code, 200, moved.content)
        return po

    def _dispatch(self, po, quantities, lr):
        res = self.client.post(
            "/api/dispatches/",
            {
                "purchase_order_id": po["id"],
                "dispatch_date": "2026-09-03",
                "lr_number": lr,
                "transporter": "VRL",
                "challan_reference": f"CH-{lr}",
                "lines": [
                    {"purchase_order_line_id": po["lines"][idx]["id"], "dispatched_quantity": qty}
                    for idx, qty in quantities
                ],
            },
            format="json",
            **H,
        )
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def _invoice(self, po, number, quantities):
        res = self.client.post(
            "/api/invoices/",
            {
                "invoice_number": number,
                "invoice_date": "2026-09-05",
                "purchase_order_id": po["id"],
                "lines": [
                    {"purchase_order_line_id": po["lines"][idx]["id"], "quantity": qty} for idx, qty in quantities
                ],
            },
            format="json",
            **H,
        )
        self.assertEqual(res.status_code, 201, res.content)
        issued = self.client.post(f"/api/invoices/{res.json()['id']}/issue/", **H)
        self.assertEqual(issued.status_code, 200, issued.content)
        return issued.json()

    def _pay(self, invoice, number, amount):
        res = self.client.post(
            "/api/payments/",
            {
                "payment_number": number,
                "payment_date": "2026-09-10",
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "amount": amount,
                "payment_mode": "NEFT",
                "bank_cash_account": "HDFC-001",
                "allocations": [{"invoice_id": invoice["id"], "allocated_amount": amount}],
            },
            format="json",
            **H,
        )
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def _trace(self, invoice_id):
        return self.client.get(f"/api/invoices/{invoice_id}/trace/", **H)

    def _chain(self):
        po = self._accepted_po()
        first_dispatch = self._dispatch(po, [(0, "6.00"), (1, "5.00")], "LR-TR-1")
        second_dispatch = self._dispatch(po, [(0, "2.00")], "LR-TR-2")
        inv_a = self._invoice(po, "INV-TR-A", [(0, "5.00")])
        inv_b = self._invoice(po, "INV-TR-B", [(0, "3.00"), (1, "5.00")])
        payment = self._pay(inv_a, "PAY-TR-1", "20.00")
        return po, first_dispatch, second_dispatch, inv_a, inv_b, payment

    def test_full_chain_per_line_figures_and_query_bound(self):
        po, d1, d2, inv_a, inv_b, payment = self._chain()

        with CaptureQueriesContext(connection) as ctx:
            res = self._trace(inv_a["id"])
        self.assertEqual(res.status_code, 200, res.content)
        baseline = len(ctx)
        self.assertLess(baseline, 25, [q["sql"] for q in ctx])
        body = res.json()

        self.assertEqual(body["invoice"]["invoice_number"], "INV-TR-A")
        self.assertEqual(body["invoice"]["status"], Invoice.Status.PARTIALLY_PAID)
        self.assertEqual(body["invoice"]["created_by"]["name"], "Trace Admin")
        self.assertEqual(body["invoice"]["issued_by"]["name"], "Trace Admin")
        self.assertIsNotNone(body["invoice"]["issued_at"])
        self.assertIsNone(body["invoice"]["cancelled_by"])
        self.assertEqual(body["customer"]["customer_code"], "CUS-TR1")
        self.assertEqual(body["entity"]["short_code"], "SRT")
        self.assertEqual(body["brand"]["brand_code"], "BRTR")
        self.assertEqual(body["purchase_order"]["po_number"], "PO-TR-001")
        self.assertEqual(body["purchase_order"]["status"], PurchaseOrder.Status.PARTIALLY_DISPATCHED)

        self.assertEqual(len(body["lines"]), 1)
        line = body["lines"][0]
        self.assertEqual(line["ordered_quantity"], "10.00")
        self.assertEqual(line["dispatched_on_po_line"], "8.00")
        self.assertEqual(line["quantity_on_this_invoice"], "5.00")
        self.assertEqual(line["invoiced_across_invoices"], "8.00")
        self.assertEqual(line["remaining_undispatched"], "2.00")
        self.assertEqual(line["remaining_uninvoiced"], "2.00")
        self.assertEqual(line["dispatched_not_invoiced"], "0.00")

        self.assertEqual([d["lr_number"] for d in body["dispatches"]], ["LR-TR-1", "LR-TR-2"])
        self.assertEqual(body["dispatches"][0]["total_quantity"], "11.00")
        self.assertEqual(body["dispatches"][0]["created_by"]["name"], "Trace Admin")

        allocations = body["payments"]["allocations"]
        self.assertEqual(len(allocations), 1)
        self.assertEqual(allocations[0]["payment_number"], "PAY-TR-1")
        self.assertEqual(allocations[0]["allocated_amount"], "20.00")
        self.assertEqual(allocations[0]["payment_mode"], "NEFT")
        self.assertEqual(body["financials"], {"net_amount": "50.00", "total_paid": "20.00", "outstanding_balance": "30.00"})
        self.assertEqual(body["adjustments"], [])
        self.assertEqual(body["adjustments_note"], "Invoice Adjustment not yet available")

        kinds = [event["kind"] for event in body["timeline"]]
        self.assertEqual(kinds[0], "po_created")
        for kind in ("po_status", "dispatch", "invoice_created", "invoice_issued", "payment"):
            self.assertIn(kind, kinds)
        stamps = [event["at"] for event in body["timeline"]]
        self.assertEqual(stamps, sorted(stamps))
        payment_event = next(e for e in body["timeline"] if e["kind"] == "payment")
        self.assertEqual(payment_event["link"], {"type": "payment", "id": payment["id"]})

        self._dispatch(po, [(0, "1.00")], "LR-TR-3")
        self._pay(inv_a, "PAY-TR-2", "5.00")
        with CaptureQueriesContext(connection) as grown:
            self.assertEqual(self._trace(inv_a["id"]).status_code, 200)
        self.assertEqual(len(grown), baseline, "trace query count must not grow with dispatches/payments")

    def test_cancelled_invoice_excluded_and_cancelled_by_shown(self):
        _, _, _, inv_a, inv_b, _ = self._chain()
        cancelled = self.client.post(f"/api/invoices/{inv_b['id']}/status/", {"status": "Cancelled"}, format="json", **H)
        self.assertEqual(cancelled.status_code, 200, cancelled.content)

        line = self._trace(inv_a["id"]).json()["lines"][0]
        self.assertEqual(line["invoiced_across_invoices"], "5.00")
        self.assertEqual(line["remaining_uninvoiced"], "5.00")
        self.assertEqual(line["dispatched_not_invoiced"], "3.00")

        body = self._trace(inv_b["id"]).json()
        self.assertEqual(body["invoice"]["status"], Invoice.Status.CANCELLED)
        self.assertEqual(body["invoice"]["cancelled_by"]["name"], "Trace Admin")
        self.assertIsNotNone(body["invoice"]["cancelled_at"])
        event = next(e for e in body["timeline"] if e["kind"] == "invoice_cancelled")
        self.assertEqual(event["actor"]["name"], "Trace Admin")

    def test_dispatch_auto_status_change_recorded_with_recording_user(self):
        po = self._accepted_po()
        PurchaseOrder.objects.filter(pk=po["id"]).update(created_by=self.operator)
        self.client.force_authenticate(self.operator)
        self._dispatch(po, [(0, "10.00"), (1, "5.00")], "LR-TR-FULL")

        change = PurchaseOrderStatusChange.objects.filter(purchase_order_id=po["id"]).last()
        self.assertEqual(change.to_status, PurchaseOrder.Status.FULLY_DISPATCHED)
        self.assertEqual(change.from_status, PurchaseOrder.Status.BRAND_ACCEPTED)
        self.assertEqual(change.source, PurchaseOrderStatusChange.Source.DISPATCH_AUTO)
        self.assertEqual(change.changed_by, self.operator)

        manual = PurchaseOrderStatusChange.objects.filter(
            purchase_order_id=po["id"], to_status=PurchaseOrder.Status.BRAND_ACCEPTED
        ).get()
        self.assertEqual(manual.source, PurchaseOrderStatusChange.Source.MANUAL)
        self.assertEqual(manual.changed_by, self.admin)

        invoice = self._invoice(po, "INV-TR-FULL", [(0, "10.00")])
        history = self._trace(invoice["id"]).json()["purchase_order"]["status_history"]
        self.assertEqual(history[-1]["source"], "dispatch_auto")
        self.assertEqual(history[-1]["to_status"], PurchaseOrder.Status.FULLY_DISPATCHED)
        self.assertEqual(history[-1]["changed_by"]["name"], "Trace Operator")

    def test_legacy_invoice_without_issuer_returns_null(self):
        _, _, _, inv_a, _, _ = self._chain()
        Invoice.objects.filter(pk=inv_a["id"]).update(issued_by=None, issued_at=None)

        body = self._trace(inv_a["id"]).json()
        self.assertIsNone(body["invoice"]["issued_by"])
        self.assertIsNone(body["invoice"]["issued_at"])
        issued = next(e for e in body["timeline"] if e["kind"] == "invoice_issued")
        self.assertIsNone(issued["at"])
        self.assertIsNone(issued["actor"])
        self.assertEqual(body["timeline"][-1]["kind"], "invoice_issued")

    def test_trace_access_matches_invoice_detail(self):
        _, _, _, inv_a, _, _ = self._chain()
        detail = f"/api/invoices/{inv_a['id']}/"
        trace = f"/api/invoices/{inv_a['id']}/trace/"

        anonymous = APIClient()
        anon_detail = anonymous.get(detail, **H).status_code
        self.assertIn(anon_detail, (401, 403))
        self.assertEqual(anonymous.get(trace, **H).status_code, anon_detail)

        token = issue_token(self.operator)
        bearer = APIClient()
        bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {token.token}")
        self.assertEqual(bearer.get(detail, **H).status_code, 404)
        self.assertEqual(bearer.get(trace, **H).status_code, 404)

        PurchaseOrder.objects.filter(pk=inv_a["purchase_order_id"]).update(created_by=self.operator)
        self.assertEqual(bearer.get(detail, **H).status_code, 200)
        self.assertEqual(bearer.get(trace, **H).status_code, 200)

        self.operator.is_active = False
        self.operator.save(update_fields=["is_active"])
        refused_detail = bearer.get(detail, **H)
        refused_trace = bearer.get(trace, **H)
        self.assertIn(refused_detail.status_code, (401, 403))
        self.assertEqual(refused_trace.status_code, refused_detail.status_code)
        self.assertNotIn("invoice", refused_trace.json())

        self.assertEqual(self.client.get("/api/invoices/999999/", **H).status_code, 404)
        self.assertEqual(self.client.get("/api/invoices/999999/trace/", **H).status_code, 404)

    def test_check_traceability_flags_corrupted_rows(self):
        _, _, _, inv_a, inv_b, _ = self._chain()
        self.assertTrue(all(not ids for _, ids in run_checks()))

        Invoice.objects.filter(pk=inv_a["id"]).update(net_amount=Decimal("999.00"))
        Invoice.objects.filter(pk=inv_b["id"]).update(status=Invoice.Status.PAID)
        results = dict(run_checks())
        self.assertEqual(results["Invoices: net amount != subtotal - discount + tax + other charges"], [inv_a["id"]])
        self.assertEqual(results["Invoices: status Paid but total paid < net amount"], [inv_b["id"]])

        before = Invoice.objects.get(pk=inv_a["id"]).updated_at
        out = StringIO()
        call_command("check_traceability", stdout=out)
        self.assertIn(f"[1] Invoices: net amount != subtotal - discount + tax + other charges: {inv_a['id']}", out.getvalue())
        self.assertEqual(Invoice.objects.get(pk=inv_a["id"]).updated_at, before)
