from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from customers.models import Customer
from dispatches.models import Dispatch, DispatchLine
from dispatches.reconciliation import (
    EXCESS,
    FULL,
    LATE,
    NEEDS_REVIEW,
    NOT_DISPATCHED,
    NOT_YET_DUE,
    ON_TIME,
    OVERDUE,
    PARTIAL,
    UNMATCHED,
)
from entities.models import Entity
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


class ReconciliationTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(username="recon-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        self.staff = AuthUser.objects.create_user(username="recon-staff", password="pass12345", role=AuthUser.Role.STAFF)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="GUJ", entity_name="Gujarat", entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ashram Road", city="Ahmedabad", state="Gujarat",
        )
        self.party = Customer.objects.create(customer_code="0004054783", customer_name="ND TAILOR")
        self.other = Customer.objects.create(customer_code="0004099999", customer_name="ND TAILORS")
        self.brand = Brand.objects.create(brand_code="AVD", brand_name="Arvind", order_method=Brand.OrderMethod.DIGITAL_PO)
        self.today = timezone.localdate()

    def _po(self, number, party=None, order_code="DARV240260930005"):
        return PurchaseOrder.objects.create(
            po_number=number,
            brand_order_code=order_code,
            entity=self.entity,
            customer=party or self.party,
            brand=self.brand,
            po_date=date(2026, 9, 30),
            status=PurchaseOrder.Status.BRAND_ACCEPTED,
            extra_data={"kam_name": "Arvind Rawal"},
        )

    def _line(self, po, code, quantity, rate="399.00", due=None):
        return PurchaseOrderLine.objects.create(
            purchase_order=po,
            product_description=code,
            quantity=Decimal(quantity),
            rate=Decimal(rate) if rate is not None else None,
            customer_delivery_date=due,
            extra_data={"dtr_trade_name": "ZEBEL"},
        )

    def _ship(self, po, line, invoice, quantity, when, rate="399.00", net="399.00", meters="16.000"):
        dispatch = Dispatch.objects.create(
            purchase_order=po,
            dispatch_date=when,
            lr_number="LR-1",
            transporter="Road",
            challan_reference=invoice,
        )
        DispatchLine.objects.create(
            dispatch=dispatch,
            purchase_order_line=line,
            dispatched_quantity=Decimal(quantity),
            dispatched_meters=Decimal(meters) if meters is not None else None,
            source_rate=Decimal(rate) if rate is not None else None,
            net_rate=Decimal(net) if net is not None else None,
        )
        return dispatch

    def _rows(self, **params):
        response = self.client.get("/api/dispatches/reconciliation/", params, HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_partial_then_full_and_rate_match_ignores_net_rate(self):
        po = self._po("PO-1")
        line = self._line(po, "ZEBE13375-20", "2.00", due=self.today)
        self._ship(po, line, "R1", "1.00", self.today, net="350.00")
        body = self._rows(brand_id=self.brand.id)
        row = body["rows"][0]
        self.assertEqual(row["status"], PARTIAL)
        self.assertEqual(row["dispatched_quantity"], "1.00")
        self.assertEqual(row["balance_quantity"], "1.00")
        self.assertEqual(row["excess_quantity"], "0.00")
        self.assertFalse(row["rate_mismatch"])
        self.assertIn("Net rate per metre", row["rate_note"])
        self.assertEqual(row["shipments"][0]["meters"], "16.000")
        self._ship(po, line, "R2", "1.00", self.today)
        row = self._rows(brand_id=self.brand.id)["rows"][0]
        self.assertEqual(row["status"], FULL)
        self.assertEqual(row["delivery_status"], ON_TIME)
        self.assertEqual(body["summary"]["total"], 1)

    def test_excess_does_not_hide_inside_a_negative_balance(self):
        po = self._po("PO-2", order_code="DARV240260711003")
        line = self._line(po, "TLYON53034-1", "1.00", due=self.today + timedelta(days=5))
        self._ship(po, line, "R142621449", "2.00", self.today)
        row = self._rows()["rows"][0]
        self.assertEqual(row["status"], EXCESS)
        self.assertEqual(row["balance_quantity"], "0.00")
        self.assertEqual(row["excess_quantity"], "1.00")
        self.assertEqual(row["delivery_status"], ON_TIME)

    def test_duplicate_invoice_is_counted_once(self):
        po = self._po("PO-3", order_code="DPRE201260911001")
        line = self._line(po, "BLA10484-33", "2.00", due=self.today)
        self._ship(po, line, "R142621467", "1.00", self.today)
        self._ship(po, line, "R142621467", "1.00", self.today)
        row = self._rows()["rows"][0]
        self.assertEqual(row["status"], NEEDS_REVIEW)
        self.assertEqual(row["dispatched_quantity"], "1.00")
        self.assertTrue(any("already counted" in reason for reason in row["reasons"]))

    def test_rate_mismatch_and_missing_rate(self):
        po = self._po("PO-4", order_code="DARV-RATE")
        mismatch = self._line(po, "ZEBE13375-19", "1.00", rate="399.00", due=self.today)
        blank = self._line(po, "ZEBE13375-21", "1.00", due=self.today)
        self._ship(po, mismatch, "RM", "1.00", self.today, rate="410.00", net="410.00")
        self._ship(po, blank, "RB", "1.00", self.today, rate=None, net=None)
        rows = {row["product_code"]: row for row in self._rows()["rows"]}
        self.assertTrue(rows["ZEBE13375-19"]["rate_mismatch"])
        self.assertEqual(rows["ZEBE13375-19"]["status"], FULL)
        self.assertFalse(rows["ZEBE13375-21"]["rate_mismatch"])
        self.assertIn("not recorded", rows["ZEBE13375-21"]["rate_note"])

    def test_delivery_outcomes(self):
        po = self._po("PO-5", order_code="DARV-DATE")
        overdue = self._line(po, "OLD-1", "1.00", due=self.today - timedelta(days=1))
        waiting = self._line(po, "NEW-1", "1.00", due=self.today + timedelta(days=2))
        late = self._line(po, "LATE-1", "1.00", due=self.today - timedelta(days=3))
        self._ship(po, late, "RL", "1.00", self.today)
        rows = {row["product_code"]: row for row in self._rows()["rows"]}
        self.assertEqual(rows["OLD-1"]["status"], NOT_DISPATCHED)
        self.assertEqual(rows["OLD-1"]["delivery_status"], OVERDUE)
        self.assertEqual(rows["NEW-1"]["delivery_status"], NOT_YET_DUE)
        self.assertEqual(rows["LATE-1"]["delivery_status"], LATE)

    def test_same_product_code_needs_review_and_blank_code_is_unmatched(self):
        po = self._po("PO-6", order_code="DARV-AMB")
        self._line(po, "ZEBE13375-20", "1.00", due=self.today)
        self._line(po, "ZEBE13375-20", "1.00", due=self.today)
        self._line(po, "", "1.00", due=self.today)
        rows = self._rows()["rows"]
        self.assertEqual(sum(1 for row in rows if row["status"] == NEEDS_REVIEW), 2)
        self.assertEqual(sum(1 for row in rows if row["status"] == UNMATCHED), 1)

    def test_similar_party_name_is_not_included(self):
        po = self._po("PO-7", party=self.other, order_code="DARV-OTHER")
        self._line(po, "ZEBE13375-20", "1.00", due=self.today)
        body = self._rows(customer_id=self.party.id)
        self.assertEqual(body["rows"], [])

    def test_kam_filter_uses_the_person_not_the_brand(self):
        po = self._po("PO-8", order_code="DARV-KAM")
        self._line(po, "ZEBE13375-20", "1.00", due=self.today)
        self.assertEqual(self._rows(kam="Arvind")["summary"]["total"], 0)
        self.assertEqual(self._rows(kam="Arvind Rawal")["summary"]["total"], 1)

    def test_staff_only_sees_parties_they_created_and_anonymous_is_rejected(self):
        po = self._po("PO-9", order_code="DARV-SCOPE")
        self._line(po, "ZEBE13375-20", "1.00", due=self.today)
        staff = APIClient()
        staff.force_authenticate(self.staff)
        hidden = staff.get("/api/dispatches/reconciliation/", HTTP_HOST="localhost")
        self.assertEqual(hidden.status_code, 200)
        self.assertEqual(hidden.json()["rows"], [])
        po.created_by = self.staff
        po.save(update_fields=["created_by"])
        visible = staff.get("/api/dispatches/reconciliation/", HTTP_HOST="localhost")
        self.assertEqual(len(visible.json()["rows"]), 1)
        anonymous = APIClient()
        denied = anonymous.get("/api/dispatches/reconciliation/", HTTP_HOST="localhost")
        self.assertEqual(denied.status_code, 403)
