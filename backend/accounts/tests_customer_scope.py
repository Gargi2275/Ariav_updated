from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.access import customers_visible_to
from accounts.models import AuthUser
from accounts.views import issue_token
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from dispatches.models import Dispatch
from entities.models import Entity
from invoices.management.commands.check_traceability import run_checks
from invoices.models import Invoice
from payments.models import Payment, PaymentAllocation
from products.models import Product

H = {"HTTP_HOST": "localhost"}
YEAR = "?from=2026-01-01&to=2026-12-31"

DISPATCH_IMPORT_HEADERS = [
    "CompanyCd", "Agent", "Order Code", "Invoice No", "Invoice Date", "Customer Code",
    "Customer Name", "Customer City", "State", "Code1", "Code5", "Code6", "Template",
    "Size", "Qty", "Transport Name", "LR No", "LR Date",
]


def _ids(response):
    assert response.status_code == 200, response.content
    return sorted(row["id"] for row in response.json())


class CustomerScopeTests(TestCase):
    """Operators only reach Purchase Orders, Dispatches, Invoices and Payments of
    customers_visible_to them; admins see everything."""

    def setUp(self):
        cache.clear()
        self.admin = AuthUser.objects.create_user(
            username="scope-admin", password="pass12345", role=AuthUser.Role.ADMIN, display_name="Scope Admin"
        )
        self.op_a = AuthUser.objects.create_user(
            username="scope-op-a", password="pass12345", role=AuthUser.Role.OPERATOR, display_name="Operator A"
        )
        self.op_b = AuthUser.objects.create_user(
            username="scope-op-b", password="pass12345", role=AuthUser.Role.OPERATOR, display_name="Operator B"
        )
        self.op_new = AuthUser.objects.create_user(
            username="scope-op-new", password="pass12345", role=AuthUser.Role.OPERATOR, display_name="Operator New"
        )
        self.entity = Entity.objects.create(
            short_code="SCP",
            entity_name="Surat Agency",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ring Road",
            city="Surat",
            state="Gujarat",
        )
        self.x = Customer.objects.create(customer_code="CUS-SC-X", customer_name="Kiran Fabrics", credit_days=30)
        self.y = Customer.objects.create(customer_code="CUS-SC-Y", customer_name="Mehta Silks", credit_days=30)
        for customer in (self.x, self.y):
            CustomerEntity.objects.create(customer=customer, entity=self.entity, primary_entity=True)
        self.brand = Brand.objects.create(
            brand_code="BRSC", brand_name="Raymond", order_method=Brand.OrderMethod.DIGITAL_PO
        )
        root = Category.objects.create(category_code="SCF", category_name="Fabric")
        sub = Category.objects.create(category_code="SCS", category_name="Suiting", parent_category=root)
        self.product = Product.objects.create(
            product_code="SC-01",
            product_name="Wool Suiting",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )

        self.admin_c = self._client(self.admin)
        self.a = self._client(self.op_a)
        self.b = self._client(self.op_b)
        self.new = self._client(self.op_new)

        self.cx = self._chain(self.a, self.x, "X")
        self.cy = self._chain(self.b, self.y, "Y")

    # ------------------------------------------------------------------ helpers

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def _ok(self, response, code=200):
        self.assertEqual(response.status_code, code, response.content)
        return response.json()

    def _create_po(self, client, customer, number):
        return self._ok(
            client.post(
                "/api/purchase-orders/",
                {
                    "po_number": number,
                    "entity_id": self.entity.id,
                    "customer_id": customer.id,
                    "brand_id": self.brand.id,
                    "po_date": "2026-09-01",
                    "lines": [{"product_id": self.product.id, "quantity": "10.00", "rate": "10.00"}],
                },
                format="json",
                **H,
            ),
            201,
        )

    def _chain(self, client, customer, tag):
        """Operator creates PO → (admin accepts) → dispatch → invoice → payment → adjustment."""
        po = self._create_po(client, customer, f"PO-SC-{tag}")
        self._ok(client.post(f"/api/purchase-orders/{po['id']}/submit/", **H))
        for target in ("Sent to Brand", "Brand Accepted"):
            self._ok(self.admin_c.post(f"/api/purchase-orders/{po['id']}/status/", {"status": target}, format="json", **H))
        dispatch = self._ok(
            client.post(
                "/api/dispatches/",
                {
                    "purchase_order_id": po["id"],
                    "dispatch_date": "2026-09-03",
                    "lr_number": f"LR-SC-{tag}",
                    "transporter": "VRL",
                    "challan_reference": f"CH-SC-{tag}",
                    "lines": [{"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "6.00"}],
                },
                format="json",
                **H,
            ),
            201,
        )
        draft = self._ok(
            client.post(
                "/api/invoices/",
                {
                    "invoice_number": f"INV-SC-{tag}",
                    "invoice_date": "2026-09-05",
                    "purchase_order_id": po["id"],
                    "lines": [{"purchase_order_line_id": po["lines"][0]["id"], "quantity": "4.00"}],
                },
                format="json",
                **H,
            ),
            201,
        )
        invoice = self._ok(client.post(f"/api/invoices/{draft['id']}/issue/", **H))
        payment = self._ok(
            client.post(
                "/api/payments/",
                {
                    "payment_number": f"PAY-SC-{tag}",
                    "payment_date": "2026-09-10",
                    "entity_id": self.entity.id,
                    "customer_id": customer.id,
                    "amount": "30.00",
                    "payment_mode": "NEFT",
                    "bank_cash_account": "HDFC-001",
                    "allocations": [{"invoice_id": invoice["id"], "allocated_amount": "20.00"}],
                },
                format="json",
                **H,
            ),
            201,
        )
        self._ok(
            client.post(
                f"/api/payments/{payment['id']}/allocate/",
                {"invoice_id": invoice["id"], "allocated_amount": "10.00", "reason": "Balance applied"},
                format="json",
                **H,
            )
        )
        adjustment = self._ok(self.admin_c.get(f"/api/payment-adjustments/?payment_id={payment['id']}", **H))[0]
        return {
            "customer": customer,
            "po": po,
            "dispatch": dispatch,
            "invoice": invoice,
            "payment": payment,
            "adjustment": adjustment,
        }

    def _xlsx(self, rows):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(DISPATCH_IMPORT_HEADERS)
        for row in rows:
            sheet.append(row)
        buffer = BytesIO()
        workbook.save(buffer)
        return SimpleUploadedFile(
            "dispatch.xlsx",
            buffer.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    LISTS = {
        "po": "/api/purchase-orders/",
        "dispatch": "/api/dispatches/",
        "invoice": "/api/invoices/",
        "payment": "/api/payments/",
        "adjustment": "/api/payment-adjustments/",
    }

    # -------------------------------------------------------------------- tests

    def test_each_operator_sees_only_own_customer_records_and_trace(self):
        for client, own, other in ((self.a, self.cx, self.cy), (self.b, self.cy, self.cx)):
            for key, path in self.LISTS.items():
                self.assertEqual(_ids(client.get(path, **H)), [own[key]["id"]], path)
                self._ok(client.get(f"{path}{own[key]['id']}/", **H))

            trace = self._ok(client.get(f"/api/invoices/{own['invoice']['id']}/trace/", **H))
            self.assertEqual(trace["purchase_order"]["po_number"], own["po"]["po_number"])
            self.assertEqual([d["id"] for d in trace["dispatches"]], [own["dispatch"]["id"]])
            self.assertEqual(
                {row["payment_number"] for row in trace["payments"]["allocations"]},
                {own["payment"]["payment_number"]},
            )
            self.assertEqual(
                _ids(client.get("/api/customers/?scope=visible", **H)), [own["customer"].id]
            )
            self.assertEqual(
                self._ok(client.get(f"/api/customers/{own['customer'].id}/advance-balance/", **H))["customer_id"],
                own["customer"].id,
            )

    def test_out_of_scope_ids_return_404_everywhere(self):
        y = self.cy
        missing = 999999
        cases = [
            ("get", "/api/purchase-orders/{}/", "po"),
            ("get", "/api/purchase-orders/{}/pdf/", "po"),
            ("post", "/api/purchase-orders/{}/submit/", "po"),
            ("patch", "/api/purchase-orders/{}/", "po"),
            ("put", "/api/purchase-orders/{}/", "po"),
            ("delete", "/api/purchase-orders/{}/", "po"),
            ("get", "/api/dispatches/{}/", "dispatch"),
            ("patch", "/api/dispatches/{}/", "dispatch"),
            ("put", "/api/dispatches/{}/", "dispatch"),
            ("delete", "/api/dispatches/{}/", "dispatch"),
            ("get", "/api/invoices/{}/", "invoice"),
            ("get", "/api/invoices/{}/trace/", "invoice"),
            ("get", "/api/invoices/{}/pdf/", "invoice"),
            ("post", "/api/invoices/{}/issue/", "invoice"),
            ("patch", "/api/invoices/{}/", "invoice"),
            ("delete", "/api/invoices/{}/", "invoice"),
            ("get", "/api/payments/{}/", "payment"),
            ("post", "/api/payments/{}/allocate/", "payment"),
            ("get", "/api/payment-adjustments/{}/", "adjustment"),
        ]
        for method, template, key in cases:
            for target in (y[key]["id"], missing):
                res = getattr(self.a, method)(template.format(target), {}, format="json", **H)
                self.assertEqual(res.status_code, 404, f"{method.upper()} {template.format(target)}: {res.content}")
        self.assertEqual(self.a.get(f"/api/customers/{self.y.id}/advance-balance/", **H).status_code, 404)

        # Admin-only actions are refused by role before any lookup, so in-scope and
        # out-of-scope ids get the same 403 (no existence signal).
        for template, key, payload in (
            ("/api/purchase-orders/{}/status/", "po", {"status": "On Hold"}),
            ("/api/invoices/{}/status/", "invoice", {"status": "Cancelled"}),
        ):
            for target in (self.cx[key]["id"], y[key]["id"], missing):
                self.assertEqual(self.a.post(template.format(target), payload, format="json", **H).status_code, 403)
        for target in (self.cx["payment"]["id"], y["payment"]["id"], missing):
            self.assertEqual(self.a.delete(f"/api/payments/{target}/", **H).status_code, 403)

        self.assertTrue(Dispatch.objects.filter(pk=y["dispatch"]["id"]).exists())
        self.assertTrue(Invoice.objects.filter(pk=y["invoice"]["id"]).exists())
        self.assertTrue(Payment.objects.filter(pk=y["payment"]["id"]).exists())

    def test_writes_cannot_reference_out_of_scope_records(self):
        y = self.cy
        dispatches_before = Dispatch.objects.count()
        bad_dispatch = self.a.post(
            "/api/dispatches/",
            {
                "purchase_order_id": y["po"]["id"],
                "dispatch_date": "2026-09-04",
                "lr_number": "LR-SC-BAD",
                "transporter": "VRL",
                "challan_reference": "CH-SC-BAD",
                "lines": [{"purchase_order_line_id": y["po"]["lines"][0]["id"], "dispatched_quantity": "1.00"}],
            },
            format="json",
            **H,
        )
        self.assertEqual(bad_dispatch.status_code, 400, bad_dispatch.content)
        self.assertEqual(list(bad_dispatch.json()), ["purchase_order_id"])
        self.assertEqual(Dispatch.objects.count(), dispatches_before)

        bad_invoice = self.a.post(
            "/api/invoices/",
            {
                "invoice_number": "INV-SC-BAD",
                "invoice_date": "2026-09-06",
                "purchase_order_id": y["po"]["id"],
                "lines": [{"purchase_order_line_id": y["po"]["lines"][0]["id"], "quantity": "1.00"}],
            },
            format="json",
            **H,
        )
        self.assertEqual(bad_invoice.status_code, 400, bad_invoice.content)
        self.assertIn("purchase_order_id", bad_invoice.json())

        bad_payment = self.a.post(
            "/api/payments/",
            {
                "payment_number": "PAY-SC-BAD",
                "payment_date": "2026-09-11",
                "entity_id": self.entity.id,
                "customer_id": self.x.id,
                "amount": "5.00",
                "payment_mode": "NEFT",
                "bank_cash_account": "HDFC-001",
                "allocations": [{"invoice_id": y["invoice"]["id"], "allocated_amount": "5.00"}],
            },
            format="json",
            **H,
        )
        self.assertEqual(bad_payment.status_code, 400, bad_payment.content)
        self.assertIn("Invoice not found.", bad_payment.content.decode())
        self.assertNotIn("INV-SC-Y", bad_payment.content.decode())
        self.assertFalse(Payment.objects.filter(payment_number="PAY-SC-BAD").exists())

        bad_allocate = self.a.post(
            f"/api/payments/{self.cx['payment']['id']}/allocate/",
            {"invoice_id": y["invoice"]["id"], "allocated_amount": "1.00", "reason": "Try"},
            format="json",
            **H,
        )
        self.assertEqual(bad_allocate.status_code, 400, bad_allocate.content)
        self.assertEqual(bad_allocate.json(), {"invoice_id": ["Invoice not found."]})
        self.assertNotIn("INV-SC-Y", bad_allocate.content.decode())

    def test_dispatch_import_hides_out_of_scope_purchase_orders(self):
        row = [
            "SCP", "AG1", "PO-SC-Y", "BILL-1", "2026-09-17", "CUS-SC-X", "Kiran Fabrics", "Surat",
            "Gujarat", "A", "B", "C", "T", "S", 1, "VRL", "LR-IMP-1", "2026-09-17",
        ]
        res = self.a.post(
            "/api/dispatches/import/preview/", {"file": self._xlsx([row])}, format="multipart", **H
        )
        body = self._ok(res)
        self.assertEqual(body["importable"], [])
        self.assertEqual(len(body["excluded"]), 1)
        self.assertIn("No matching Purchase Order found for Order Code PO-SC-Y", body["excluded"][0]["reason"])
        text = res.content.decode()
        for secret in ("CUS-SC-Y", "Mehta Silks", "Brand Accepted", "Partially Dispatched"):
            self.assertNotIn(secret, text)

    def test_counts_search_and_filters_only_contain_in_scope_records(self):
        a = self.a
        self.assertEqual(_ids(a.get("/api/purchase-orders/?search=PO-SC", **H)), [self.cx["po"]["id"]])
        self.assertEqual(_ids(a.get("/api/purchase-orders/?search=PO-SC-Y", **H)), [])
        self.assertEqual(_ids(a.get(f"/api/purchase-orders/?customer_id={self.y.id}", **H)), [])
        self.assertEqual(_ids(a.get("/api/invoices/?search=INV-SC", **H)), [self.cx["invoice"]["id"]])
        self.assertEqual(_ids(a.get("/api/invoices/?search=Mehta", **H)), [])
        self.assertEqual(_ids(a.get(f"/api/invoices/?customer_id={self.y.id}", **H)), [])
        self.assertEqual(_ids(a.get(f"/api/invoices/?purchase_order_id={self.cy['po']['id']}", **H)), [])
        self.assertEqual(_ids(a.get("/api/payments/?search=PAY-SC", **H)), [self.cx["payment"]["id"]])
        self.assertEqual(_ids(a.get(f"/api/payments/?invoice_id={self.cy['invoice']['id']}", **H)), [])
        self.assertEqual(_ids(a.get("/api/payment-adjustments/?search=PAY-SC", **H)), [self.cx["adjustment"]["id"]])
        self.assertEqual(_ids(a.get(f"/api/payment-adjustments/?customer_id={self.y.id}", **H)), [])
        self.assertEqual(_ids(a.get("/api/dispatches/?search=LR-SC", **H)), [self.cx["dispatch"]["id"]])
        self.assertEqual(_ids(a.get("/api/customers/?scope=visible&search=Mehta", **H)), [])

        notes = self._ok(a.get("/api/notifications/", **H))
        self.assertTrue(notes)
        self.assertEqual({n["customer_id"] for n in notes}, {self.x.id})
        unread = [n for n in notes if n["status"] == "Unread"]
        self.assertEqual(self._ok(a.get("/api/notifications/unread-count/", **H))["unread_count"], len(unread))
        self.assertEqual(self._ok(a.get(f"/api/notifications/?customer_id={self.y.id}", **H)), [])

        perf = self._ok(a.get(f"/api/reports/customer-performance/{YEAR}", **H))["rows"]
        self.assertEqual({r["customer_id"] for r in perf}, {self.x.id})
        outstanding = self._ok(a.get("/api/reports/outstanding-report/", **H))["rows"]
        self.assertEqual({r["customer_name"] for r in outstanding}, {"Kiran Fabrics"})
        brand = self._ok(a.get(f"/api/reports/brand-performance/{YEAR}", **H))["rows"]
        self.assertEqual(sum(r["total_pos"] for r in brand), 1)
        entity = self._ok(a.get(f"/api/reports/entity-performance/{YEAR}", **H))["rows"]
        self.assertEqual(sum(r["total_orders"] for r in entity), 1)
        trend = self._ok(a.get(f"/api/reports/purchase-sales-trend/{YEAR}", **H))["rows"]
        self.assertEqual(sum(Decimal(r["po_value"]) for r in trend), Decimal("100.00"))
        payments = self._ok(a.get(f"/api/reports/payment-trend/{YEAR}", **H))["rows"]
        self.assertEqual(sum(Decimal(r["payment_value"]) for r in payments), Decimal("30.00"))

    def test_admin_sees_everything_unchanged(self):
        admin = self.admin_c
        for key, path in self.LISTS.items():
            self.assertEqual(_ids(admin.get(path, **H)), sorted([self.cx[key]["id"], self.cy[key]["id"]]), path)
        for chain in (self.cx, self.cy):
            trace = self._ok(admin.get(f"/api/invoices/{chain['invoice']['id']}/trace/", **H))
            self.assertEqual(trace["purchase_order"]["po_number"], chain["po"]["po_number"])
            self._ok(admin.get(f"/api/customers/{chain['customer'].id}/advance-balance/", **H))
        self.assertEqual(
            set(_ids(admin.get("/api/customers/?scope=visible", **H))), {self.x.id, self.y.id}
        )
        self.assertEqual(set(_ids(admin.get("/api/customers/", **H))), {self.x.id, self.y.id})
        notes = self._ok(admin.get("/api/notifications/", **H))
        self.assertEqual({n["customer_id"] for n in notes}, {self.x.id, self.y.id})
        brand = self._ok(admin.get(f"/api/reports/brand-performance/{YEAR}", **H))["rows"]
        self.assertEqual(sum(r["total_pos"] for r in brand), 2)
        self.assertEqual(customers_visible_to(self.admin).count(), Customer.objects.count())

    def test_operator_without_transactions_sees_nothing_and_can_start_via_entity_picker(self):
        new = self.new
        for path in self.LISTS.values():
            self.assertEqual(_ids(new.get(path, **H)), [], path)
        self.assertEqual(self._ok(new.get("/api/notifications/", **H)), [])
        self.assertEqual(self._ok(new.get("/api/notifications/unread-count/", **H))["unread_count"], 0)
        self.assertEqual(_ids(new.get("/api/customers/?scope=visible", **H)), [])
        self.assertEqual(self._ok(new.get(f"/api/reports/customer-performance/{YEAR}", **H))["rows"], [])
        self.assertEqual(self._ok(new.get("/api/reports/outstanding-report/", **H))["rows"], [])

        picker = _ids(new.get(f"/api/customers/?entity_id={self.entity.id}", **H))
        self.assertEqual(set(picker), {self.x.id, self.y.id})

        po = self._create_po(new, self.x, "PO-SC-NEW")
        self._ok(new.get(f"/api/purchase-orders/{po['id']}/", **H))
        self.assertEqual(_ids(new.get("/api/customers/?scope=visible", **H)), [self.x.id])
        self.assertEqual(
            set(_ids(new.get("/api/purchase-orders/", **H))), {po["id"], self.cx["po"]["id"]}
        )
        self.assertEqual(new.get(f"/api/purchase-orders/{self.cy['po']['id']}/", **H).status_code, 404)

        advance = self._ok(
            new.post(
                "/api/payments/",
                {
                    "payment_number": "PAY-SC-NEW",
                    "payment_date": "2026-09-12",
                    "entity_id": self.entity.id,
                    "customer_id": self.y.id,
                    "amount": "15.00",
                    "payment_mode": "NEFT",
                    "bank_cash_account": "HDFC-001",
                    "allocations": [],
                },
                format="json",
                **H,
            ),
            201,
        )
        self._ok(new.get(f"/api/payments/{advance['id']}/", **H))
        self._ok(new.get(f"/api/customers/{self.y.id}/advance-balance/", **H))
        self.assertEqual(set(_ids(new.get("/api/customers/?scope=visible", **H))), {self.x.id, self.y.id})

    def test_notifications_and_unread_counts_are_scoped_per_operator(self):
        for client, own, other in ((self.a, self.x, self.y), (self.b, self.y, self.x)):
            notes = self._ok(client.get("/api/notifications/", **H))
            self.assertTrue(notes)
            self.assertEqual({n["customer_id"] for n in notes}, {own.id})
            count = self._ok(client.get("/api/notifications/unread-count/", **H))["unread_count"]
            self.assertEqual(count, len([n for n in notes if n["status"] == "Unread"]))

        b_notes = self._ok(self.b.get("/api/notifications/", **H))
        b_before = self._ok(self.b.get("/api/notifications/unread-count/", **H))["unread_count"]
        self.assertGreater(b_before, 0)
        self.assertEqual(self.a.post(f"/api/notifications/{b_notes[0]['id']}/mark-read/", **H).status_code, 404)
        self.assertEqual(self.a.post(f"/api/notifications/{b_notes[0]['id']}/dismiss/", **H).status_code, 404)

        self._ok(self.a.post("/api/notifications/mark-all-read/", **H))
        self.assertEqual(self._ok(self.a.get("/api/notifications/unread-count/", **H))["unread_count"], 0)
        self.assertEqual(self._ok(self.b.get("/api/notifications/unread-count/", **H))["unread_count"], b_before)

    def test_customer_360_and_ledger_regression(self):
        for suffix in ("360/", "ledger/"):
            admin_x = self._ok(self.admin_c.get(f"/api/customers/{self.x.id}/{suffix}", **H))
            admin_y = self._ok(self.admin_c.get(f"/api/customers/{self.y.id}/{suffix}", **H))
            self.assertEqual(self._ok(self.a.get(f"/api/customers/{self.x.id}/{suffix}", **H)), admin_x)
            self.assertEqual(self._ok(self.b.get(f"/api/customers/{self.y.id}/{suffix}", **H)), admin_y)
            for client, customer in ((self.a, self.y), (self.b, self.x), (self.new, self.x)):
                refused = client.get(f"/api/customers/{customer.id}/{suffix}", **H)
                self.assertEqual(refused.status_code, 403, refused.content)
                self.assertIn("you created", refused.json()["detail"])
        self.assertEqual(self.a.get(f"/api/customers/{self.x.id}/ledger/pdf/", **H).status_code, 200)
        self.assertEqual(self.a.get(f"/api/customers/{self.y.id}/ledger/pdf/", **H).status_code, 403)

    def test_dispatch_only_relationship_counts_toward_visibility(self):
        Dispatch.objects.filter(pk=self.cy["dispatch"]["id"]).update(created_by=self.op_new)
        self.assertEqual(set(customers_visible_to(self.op_new).values_list("id", flat=True)), {self.y.id})
        self._ok(self.new.get(f"/api/customers/{self.y.id}/360/", **H))
        self.assertEqual(_ids(self.new.get("/api/invoices/", **H)), [self.cy["invoice"]["id"]])

    def test_trace_query_count_stays_bounded_for_operator(self):
        path = f"/api/invoices/{self.cx['invoice']['id']}/trace/"
        with CaptureQueriesContext(connection) as admin_ctx:
            self._ok(self.admin_c.get(path, **H))
        with CaptureQueriesContext(connection) as op_ctx:
            self._ok(self.a.get(path, **H))
        admin_count, op_count = len(admin_ctx), len(op_ctx)
        self.assertLess(op_count, 25, [q["sql"] for q in op_ctx])
        self.assertLessEqual(op_count, admin_count + 2)

        po = self.cx["po"]
        self._ok(
            self.a.post(
                "/api/dispatches/",
                {
                    "purchase_order_id": po["id"],
                    "dispatch_date": "2026-09-06",
                    "lr_number": "LR-SC-X2",
                    "transporter": "VRL",
                    "challan_reference": "CH-SC-X2",
                    "lines": [{"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "1.00"}],
                },
                format="json",
                **H,
            ),
            201,
        )
        with CaptureQueriesContext(connection) as grown:
            self._ok(self.a.get(path, **H))
        self.assertEqual(len(grown), op_count)

    def test_trace_withholds_linked_records_of_other_customers(self):
        x_inv = self.cx["invoice"]["id"]
        Invoice.objects.filter(pk=x_inv).update(purchase_order_id=self.cy["po"]["id"])
        PaymentAllocation.objects.filter(payment_id=self.cy["payment"]["id"]).update(invoice_id=x_inv)

        body = self._ok(self.a.get(f"/api/invoices/{x_inv}/trace/", **H))
        self.assertIsNone(body["purchase_order"])
        self.assertEqual(body["dispatches"], [])
        self.assertTrue(all(line["ordered_quantity"] is None for line in body["lines"]))
        self.assertEqual({r["payment_number"] for r in body["payments"]["allocations"]}, {"PAY-SC-X"})
        self.assertEqual(
            {r["payment_number"] for r in body["payments"]["adjustments"]} - {"PAY-SC-X"}, set()
        )
        text = str(body)
        for secret in ("PO-SC-Y", "PAY-SC-Y", "LR-SC-Y", "Operator B"):
            self.assertNotIn(secret, text)

        admin_body = self._ok(self.admin_c.get(f"/api/invoices/{x_inv}/trace/", **H))
        self.assertEqual(admin_body["purchase_order"]["po_number"], "PO-SC-Y")
        self.assertIn("PAY-SC-Y", {r["payment_number"] for r in admin_body["payments"]["allocations"]})

        results = dict(run_checks())
        self.assertIn(x_inv, results["Invoices: Customer differs from the PO's Customer"])
        self.assertTrue(results["Payment allocations: payment Customer differs from invoice Customer"])

    def test_deactivated_revoked_and_expired_sessions_are_refused(self):
        paths = [
            "/api/purchase-orders/",
            f"/api/invoices/{self.cx['invoice']['id']}/",
            f"/api/invoices/{self.cx['invoice']['id']}/trace/",
            "/api/notifications/unread-count/",
        ]

        def bearer(token):
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.token}")
            return client

        token = issue_token(self.op_a)
        live = bearer(token)
        for path in paths:
            self.assertEqual(live.get(path, **H).status_code, 200, path)

        token.expires_at = timezone.now() - timedelta(minutes=1)
        token.save(update_fields=["expires_at"])
        for path in paths:
            self.assertIn(live.get(path, **H).status_code, (401, 403), path)

        revoked = issue_token(self.op_a)
        revoked.revoked = True
        revoked.save(update_fields=["revoked"])
        for path in paths:
            self.assertIn(bearer(revoked).get(path, **H).status_code, (401, 403), path)

        fresh = bearer(issue_token(self.op_a))
        self.op_a.is_active = False
        self.op_a.save(update_fields=["is_active"])
        for path in paths:
            self.assertIn(fresh.get(path, **H).status_code, (401, 403), path)
