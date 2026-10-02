from decimal import Decimal

from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from payments.models import Payment
from products.models import Product


class PaymentApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="pay-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="pay-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="GUJ",
            entity_name="Gujarat Payments",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ashram Road",
            city="Ahmedabad",
            state="Gujarat",
        )
        self.customer = Customer.objects.create(
            customer_code="PAY-C1",
            customer_name="Payment Trading",
            credit_days=15,
        )
        CustomerEntity.objects.create(
            customer=self.customer,
            entity=self.entity,
            primary_entity=True,
        )
        self.other = Customer.objects.create(
            customer_code="PAY-C2",
            customer_name="Other Trading",
        )
        CustomerEntity.objects.create(
            customer=self.other,
            entity=self.entity,
            primary_entity=True,
        )
        self.brand = Brand.objects.create(
            brand_code="PAYB",
            brand_name="Payment Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="PAY-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )

    def _create_po(self, **kwargs):
        payload = {
            "po_number": "PO-PAY-001",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "brand_id": self.brand.id,
            "po_date": "2026-09-16",
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
                "dispatch_date": "2026-09-16",
                "lr_number": "LR-PAY-1",
                "transporter": "VRL",
                "challan_reference": "CH-PAY",
                "lines": [
                    {"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "10.00"},
                ],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(dsp.status_code, 201, dsp.content)
        return self.client.get(f"/api/purchase-orders/{po['id']}/", HTTP_HOST="localhost").json()

    def _issue_invoice(self, po, invoice_number, quantity):
        res = self.client.post(
            "/api/invoices/",
            {
                "invoice_number": invoice_number,
                "invoice_date": "2026-09-16",
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

    def _post_payment(self, payload):
        return self.client.post("/api/payments/", payload, format="json", HTTP_HOST="localhost")

    def _payment_payload(self, **kwargs):
        payload = {
            "payment_number": "PAY-2026-001",
            "payment_date": "2026-09-16",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "amount": "40.00",
            "payment_mode": "NEFT",
            "bank_cash_account": "HDFC-001",
            "transaction_reference": "UTR123",
        }
        payload.update(kwargs)
        return payload

    def test_full_allocation_marks_invoice_paid(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-PAY-001", "4.00")
        self.assertEqual(invoice["net_amount"], "40.00")
        res = self._post_payment(
            self._payment_payload(
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "40.00"}],
            )
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["unallocated_amount"], "0.00")
        inv = self.client.get(f"/api/invoices/{invoice['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(inv["status"], "Paid")
        self.assertEqual(inv["total_paid"], "40.00")
        self.assertEqual(inv["remaining_balance"], "0.00")

    def test_partial_allocation_marks_partially_paid(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-PAY-002", "4.00")
        res = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-002",
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "15.00"}],
            )
        )
        self.assertEqual(res.status_code, 201, res.content)
        inv = self.client.get(f"/api/invoices/{invoice['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(inv["status"], "Partially Paid")
        self.assertEqual(inv["total_paid"], "15.00")
        self.assertEqual(inv["remaining_balance"], "25.00")

    def test_split_allocation_across_two_invoices(self):
        po = self._accept_and_dispatch()
        first = self._issue_invoice(po, "INV-PAY-A", "4.00")
        second = self._issue_invoice(po, "INV-PAY-B", "6.00")
        res = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-003",
                amount="100.00",
                allocations=[
                    {"invoice_id": first["id"], "allocated_amount": "40.00"},
                    {"invoice_id": second["id"], "allocated_amount": "60.00"},
                ],
            )
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["unallocated_amount"], "0.00")
        a = self.client.get(f"/api/invoices/{first['id']}/", HTTP_HOST="localhost").json()
        b = self.client.get(f"/api/invoices/{second['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(a["status"], "Paid")
        self.assertEqual(b["status"], "Paid")

    def test_overpayment_sets_advance_balance(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-PAY-ADV", "4.00")
        res = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-004",
                amount="100.00",
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "40.00"}],
            )
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["unallocated_amount"], "60.00")
        advance = self.client.get(
            f"/api/customers/{self.customer.id}/advance-balance/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(advance.status_code, 200, advance.content)
        self.assertEqual(advance.json()["advance_balance"], "60.00")
        return res.json(), invoice

    def test_allocate_advance_to_later_invoice(self):
        payment, first = self.test_overpayment_sets_advance_balance()
        po = self.client.get(f"/api/purchase-orders/{first['purchase_order_id']}/", HTTP_HOST="localhost").json()
        second = self._issue_invoice(po, "INV-PAY-LATER", "6.00")
        allocated = self.client.post(
            f"/api/payments/{payment['id']}/allocate/",
            {
                "invoice_id": second["id"],
                "allocated_amount": "60.00",
                "reason": "Applied advance to new invoice",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(allocated.status_code, 200, allocated.content)
        self.assertEqual(allocated.json()["unallocated_amount"], "0.00")
        inv = self.client.get(f"/api/invoices/{second['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(inv["status"], "Paid")
        advance = self.client.get(
            f"/api/customers/{self.customer.id}/advance-balance/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(advance.json()["advance_balance"], "0.00")

        later_alloc = next(
            row for row in allocated.json()["allocations"] if row["invoice_id"] == second["id"]
        )
        adjustments = allocated.json()["adjustments"]
        self.assertEqual(len(adjustments), 1)
        adj = adjustments[0]
        self.assertEqual(adj["status"], "Approved")
        self.assertEqual(adj["amount"], "60.00")
        self.assertEqual(adj["reason"], "Applied advance to new invoice")
        self.assertEqual(adj["payment_id"], payment["id"])
        self.assertEqual(adj["invoice_id"], second["id"])
        self.assertEqual(adj["payment_allocation_id"], later_alloc["id"])
        self.assertEqual(adj["created_by"], self.admin.id)
        self.assertEqual(adj["approved_by"], self.admin.id)
        self.assertIsNotNone(adj["approved_at"])

        listed = self.client.get(
            f"/api/payment-adjustments/?payment_id={payment['id']}",
            HTTP_HOST="localhost",
        )
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["id"], adj["id"])

    def test_allocate_more_than_remaining_blocked(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-PAY-CAP", "4.00")
        res = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-006",
                amount="5000.00",
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "5000.00"}],
            )
        )
        self.assertEqual(res.status_code, 400, res.content)
        message = str(res.json())
        self.assertIn("Cannot allocate ₹5000", message)
        self.assertIn("only ₹40 remaining on invoice INV-PAY-CAP", message)

    def test_allocate_draft_or_cancelled_blocked(self):
        po = self._accept_and_dispatch()
        draft = self.client.post(
            "/api/invoices/",
            {
                "invoice_number": "INV-PAY-DRAFT",
                "invoice_date": "2026-09-16",
                "purchase_order_id": po["id"],
                "lines": [{"purchase_order_line_id": po["lines"][0]["id"], "quantity": "4.00"}],
            },
            format="json",
            HTTP_HOST="localhost",
        ).json()
        blocked_draft = self._post_payment(
            self._payment_payload(
                payment_number="PAY-DRAFT",
                allocations=[{"invoice_id": draft["id"], "allocated_amount": "10.00"}],
            )
        )
        self.assertEqual(blocked_draft.status_code, 400, blocked_draft.content)
        self.assertIn("Draft", str(blocked_draft.json()))

        issued = self._issue_invoice(po, "INV-PAY-CAN", "4.00")
        self.client.post(
            f"/api/invoices/{issued['id']}/status/",
            {"status": "Cancelled"},
            format="json",
            HTTP_HOST="localhost",
        )
        blocked_can = self._post_payment(
            self._payment_payload(
                payment_number="PAY-CAN",
                allocations=[{"invoice_id": issued["id"], "allocated_amount": "10.00"}],
            )
        )
        self.assertEqual(blocked_can.status_code, 400, blocked_can.content)
        self.assertIn("Cancelled", str(blocked_can.json()))

    def test_delete_allocation_reverts_invoice_status(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-PAY-DEL", "4.00")
        created = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-008",
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "40.00"}],
            )
        )
        self.assertEqual(created.status_code, 201, created.content)
        allocation_id = created.json()["allocations"][0]["id"]
        paid = self.client.get(f"/api/invoices/{invoice['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(paid["status"], "Paid")

        removed = self.client.delete(
            f"/api/payments/{created.json()['id']}/allocations/{allocation_id}/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(removed.status_code, 200, removed.content)
        reverted = self.client.get(f"/api/invoices/{invoice['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(reverted["status"], "Issued")
        self.assertEqual(reverted["remaining_balance"], "40.00")

        partial = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-008B",
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "10.00"}],
            )
        )
        self.assertEqual(partial.json()["allocations"][0]["allocated_amount"], "10.00")
        mid = self.client.get(f"/api/invoices/{invoice['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(mid["status"], "Partially Paid")
        alloc_id = partial.json()["allocations"][0]["id"]
        self.client.delete(
            f"/api/payments/{partial.json()['id']}/allocations/{alloc_id}/",
            HTTP_HOST="localhost",
        )
        back = self.client.get(f"/api/invoices/{invoice['id']}/", HTTP_HOST="localhost").json()
        self.assertEqual(back["status"], "Issued")

    def test_delete_payment_with_allocations_conflict(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-PAY-409", "4.00")
        created = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-009",
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "20.00"}],
            )
        )
        blocked = self.client.delete(f"/api/payments/{created.json()['id']}/", HTTP_HOST="localhost")
        self.assertEqual(blocked.status_code, 409, blocked.content)
        self.assertIn("INV-PAY-409", str(blocked.json()))

        empty = self._post_payment(self._payment_payload(payment_number="PAY-2026-010", amount="25.00"))
        self.assertEqual(empty.status_code, 201, empty.content)
        deleted = self.client.delete(f"/api/payments/{empty.json()['id']}/", HTTP_HOST="localhost")
        self.assertEqual(deleted.status_code, 204)

    def test_operator_can_create_not_delete(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-PAY-OP", "4.00")
        self.client.force_authenticate(self.operator)
        created = self._post_payment(
            self._payment_payload(
                payment_number="PAY-OP-1",
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "10.00"}],
            )
        )
        self.assertEqual(created.status_code, 201, created.content)
        denied = self.client.delete(
            f"/api/payments/{created.json()['id']}/allocations/{created.json()['allocations'][0]['id']}/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(denied.status_code, 403)

    def test_allocate_without_reason_blocked(self):
        payment, first = self.test_overpayment_sets_advance_balance()
        po = self.client.get(f"/api/purchase-orders/{first['purchase_order_id']}/", HTTP_HOST="localhost").json()
        second = self._issue_invoice(po, "INV-PAY-NOREASON", "6.00")
        missing = self.client.post(
            f"/api/payments/{payment['id']}/allocate/",
            {"invoice_id": second["id"], "allocated_amount": "10.00"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(missing.status_code, 400, missing.content)
        self.assertIn("reason", str(missing.json()).lower())

        blank = self.client.post(
            f"/api/payments/{payment['id']}/allocate/",
            {"invoice_id": second["id"], "allocated_amount": "10.00", "reason": "   "},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blank.status_code, 400, blank.content)
        self.assertEqual(
            self.client.get(f"/api/payment-adjustments/?payment_id={payment['id']}", HTTP_HOST="localhost").json(),
            [],
        )

    def test_initial_payment_allocations_do_not_create_adjustments(self):
        po = self._accept_and_dispatch()
        invoice = self._issue_invoice(po, "INV-PAY-INIT", "4.00")
        created = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-INIT",
                allocations=[{"invoice_id": invoice["id"], "allocated_amount": "40.00"}],
            )
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["adjustments"], [])
        listed = self.client.get("/api/payment-adjustments/", HTTP_HOST="localhost")
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertEqual(listed.json(), [])

    def test_payment_adjustments_list_filters_and_read_only(self):
        first_payment, first_invoice = self.test_overpayment_sets_advance_balance()
        po = self.client.get(
            f"/api/purchase-orders/{first_invoice['purchase_order_id']}/",
            HTTP_HOST="localhost",
        ).json()
        later = self._issue_invoice(po, "INV-PAY-ADJ-A", "6.00")
        first_adj = self.client.post(
            f"/api/payments/{first_payment['id']}/allocate/",
            {
                "invoice_id": later["id"],
                "allocated_amount": "60.00",
                "reason": "Applied advance to new invoice",
                "reference": "ADV-1",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(first_adj.status_code, 200, first_adj.content)

        other_po = self._create_po(po_number="PO-PAY-OTHER", customer_id=self.other.id)
        other_po = self._accept_and_dispatch(other_po)
        other_inv = self._issue_invoice(other_po, "INV-PAY-ADJ-B", "4.00")
        other_pay = self._post_payment(
            self._payment_payload(
                payment_number="PAY-2026-OTHER",
                customer_id=self.other.id,
                amount="40.00",
            )
        )
        self.assertEqual(other_pay.status_code, 201, other_pay.content)
        second_adj = self.client.post(
            f"/api/payments/{other_pay.json()['id']}/allocate/",
            {
                "invoice_id": other_inv["id"],
                "allocated_amount": "40.00",
                "reason": "Correction",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(second_adj.status_code, 200, second_adj.content)

        all_rows = self.client.get("/api/payment-adjustments/", HTTP_HOST="localhost")
        self.assertEqual(all_rows.status_code, 200, all_rows.content)
        self.assertEqual(len(all_rows.json()), 2)

        by_customer = self.client.get(
            f"/api/payment-adjustments/?customer_id={self.customer.id}",
            HTTP_HOST="localhost",
        )
        self.assertEqual(len(by_customer.json()), 1)
        self.assertEqual(by_customer.json()[0]["payment_id"], first_payment["id"])

        by_payment = self.client.get(
            f"/api/payment-adjustments/?payment_id={other_pay.json()['id']}",
            HTTP_HOST="localhost",
        )
        self.assertEqual(len(by_payment.json()), 1)
        self.assertEqual(by_payment.json()[0]["reason"], "Correction")
        self.assertEqual(by_payment.json()[0]["invoice_id"], other_inv["id"])

        by_search = self.client.get(
            "/api/payment-adjustments/?search=ADV-1",
            HTTP_HOST="localhost",
        )
        self.assertEqual(len(by_search.json()), 1)
        self.assertEqual(by_search.json()[0]["payment_id"], first_payment["id"])

        adj_id = first_adj.json()["adjustments"][0]["id"]
        retrieved = self.client.get(f"/api/payment-adjustments/{adj_id}/", HTTP_HOST="localhost")
        self.assertEqual(retrieved.status_code, 200, retrieved.content)
        self.assertEqual(retrieved.json()["reason"], "Applied advance to new invoice")

        blocked_post = self.client.post("/api/payment-adjustments/", {}, format="json", HTTP_HOST="localhost")
        self.assertEqual(blocked_post.status_code, 405)
        blocked_put = self.client.put(
            f"/api/payment-adjustments/{adj_id}/",
            {},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blocked_put.status_code, 405)
        blocked_del = self.client.delete(f"/api/payment-adjustments/{adj_id}/", HTTP_HOST="localhost")
        self.assertEqual(blocked_del.status_code, 405)

    def test_operator_can_read_payment_adjustments(self):
        payment, first = self.test_overpayment_sets_advance_balance()
        po = self.client.get(f"/api/purchase-orders/{first['purchase_order_id']}/", HTTP_HOST="localhost").json()
        second = self._issue_invoice(po, "INV-PAY-OP-ADJ", "6.00")
        allocated = self.client.post(
            f"/api/payments/{payment['id']}/allocate/",
            {
                "invoice_id": second["id"],
                "allocated_amount": "60.00",
                "reason": "Settlement of unallocated balance",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(allocated.status_code, 200, allocated.content)
        self.client.force_authenticate(self.operator)
        unrelated = self.client.get("/api/payment-adjustments/", HTTP_HOST="localhost")
        self.assertEqual(unrelated.status_code, 200, unrelated.content)
        self.assertEqual(unrelated.json(), [])
        Payment.objects.filter(pk=payment["id"]).update(created_by=self.operator)
        listed = self.client.get("/api/payment-adjustments/", HTTP_HOST="localhost")
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertEqual(len(listed.json()), 1)
