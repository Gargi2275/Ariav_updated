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
from invoices.models import Invoice, InvoiceLine
from payments.models import Payment
from products.models import Product
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


class DashboardApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="dash-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="dash-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.guj = Entity.objects.create(
            short_code="GUJ",
            entity_name="Gujarat",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ashram Road",
            city="Ahmedabad",
            state="Gujarat",
        )
        self.adt = Entity.objects.create(
            short_code="ADT",
            entity_name="Aditi",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ring Road",
            city="Surat",
            state="Gujarat",
        )
        self.customer = Customer.objects.create(
            customer_code="DASH-C1",
            customer_name="Dashboard Trading",
            credit_days=15,
        )
        CustomerEntity.objects.create(customer=self.customer, entity=self.guj, primary_entity=True)
        self.brand = Brand.objects.create(
            brand_code="DASHB",
            brand_name="Dashboard Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        self.sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="DASH-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=self.sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )

    def _po(self, entity, number, created_by=None):
        return PurchaseOrder.objects.create(
            po_number=number,
            entity=entity,
            customer=self.customer,
            brand=self.brand,
            po_date=timezone.localdate(),
            status=PurchaseOrder.Status.BRAND_ACCEPTED,
            created_by=created_by,
        )

    def _invoice(self, entity, number, net, due_date, status=Invoice.Status.ISSUED, created_by=None, quantity="4.00"):
        po = self._po(entity, f"PO-{number}")
        line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=self.p1,
            quantity=Decimal("10.00"),
            rate=Decimal("10.00"),
            line_total=Decimal("100.00"),
        )
        invoice = Invoice.objects.create(
            invoice_number=number,
            invoice_date=timezone.localdate(),
            due_date=due_date,
            entity=entity,
            customer=self.customer,
            customer_code=self.customer.customer_code,
            purchase_order=po,
            brand=self.brand,
            status=status,
            net_amount=net,
            created_by=created_by,
        )
        InvoiceLine.objects.create(
            invoice=invoice,
            purchase_order_line=line,
            product=self.p1,
            quantity=Decimal(quantity),
            rate=Decimal("10.00"),
            line_total=Decimal(quantity) * Decimal("10.00"),
        )
        return invoice

    def test_empty_dashboard_is_all_zeros(self):
        res = self.client.get("/api/dashboards/admin/", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200, res.content)
        kpis = res.json()["kpis"]
        self.assertEqual(kpis["total_sales"], "0.00")
        self.assertEqual(kpis["total_invoices"], 0)
        self.assertEqual(kpis["total_collections"], "0.00")
        self.assertEqual(kpis["total_outstanding"], "0.00")
        self.assertEqual(kpis["total_overdue"], "0.00")
        self.assertEqual(kpis["total_advance"], "0.00")
        self.assertEqual(kpis["unadjusted_payments"], "0.00")
        self.assertEqual(kpis["bad_debt"], "0.00")
        self.assertEqual(kpis["total_pos"], 0)
        self.assertEqual(res.json()["debtors"], [])
        self.assertNotIn("commission", str(res.json()).lower())

    def test_admin_kpis_and_debtors_from_real_invoices(self):
        today = timezone.localdate()
        self._invoice(self.guj, "INV-DASH-A", Decimal("40.00"), today - timedelta(days=5))
        self._invoice(self.adt, "INV-DASH-B", Decimal("60.00"), today + timedelta(days=20))
        Payment.objects.create(
            payment_number="PAY-DASH-1",
            payment_date=today,
            entity=self.guj,
            customer=self.customer,
            customer_code=self.customer.customer_code,
            amount=Decimal("25.00"),
            payment_mode=Payment.PaymentMode.NEFT,
            bank_cash_account="HDFC",
            unallocated_amount=Decimal("25.00"),
        )
        res = self.client.get("/api/dashboards/admin/", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200, res.content)
        kpis = res.json()["kpis"]
        self.assertEqual(kpis["total_sales"], "100.00")
        self.assertEqual(kpis["total_invoices"], 2)
        self.assertEqual(kpis["total_collections"], "25.00")
        self.assertEqual(kpis["total_outstanding"], "100.00")
        self.assertEqual(kpis["total_overdue"], "40.00")
        self.assertEqual(kpis["total_advance"], "25.00")
        self.assertEqual(kpis["unadjusted_payments"], "25.00")
        self.assertEqual(kpis["bad_debt"], "0.00")
        self.assertGreaterEqual(kpis["active_entities"], 2)
        debtors = res.json()["debtors"]
        self.assertEqual(len(debtors), 1)
        self.assertEqual(debtors[0]["customer_name"], "Dashboard Trading")
        self.assertEqual(debtors[0]["outstanding"], "100.00")
        self.assertEqual(debtors[0]["credit_days"], 15)
        self.assertEqual(debtors[0]["days_overdue"], 5)
        self.assertEqual(debtors[0]["risk_band"], "Overdue")
        turnover = {row["short_code"]: row for row in res.json()["entity_turnover"]}
        self.assertEqual(turnover["GUJ"]["total_sales"], "40.00")
        self.assertEqual(turnover["ADT"]["total_sales"], "60.00")
        self.assertEqual(turnover["ADT"]["percent"], "60.00")
        self.assertTrue(res.json()["category_share"])
        self.assertEqual(res.json()["category_share"][0]["category_name"], "Yarn")
        self.assertEqual(res.json()["top_products"][0]["product_code"], "DASH-01")

    def test_entity_filter_scopes_kpis(self):
        today = timezone.localdate()
        self._invoice(self.guj, "INV-DASH-G", Decimal("40.00"), today + timedelta(days=10))
        self._invoice(self.adt, "INV-DASH-A", Decimal("60.00"), today + timedelta(days=10))
        all_rows = self.client.get("/api/dashboards/entity/?entity_id=all", HTTP_HOST="localhost")
        self.assertEqual(all_rows.json()["kpis"]["total_sales"], "100.00")
        guj = self.client.get(f"/api/dashboards/entity/?entity_id={self.guj.id}", HTTP_HOST="localhost")
        self.assertEqual(guj.status_code, 200, guj.content)
        self.assertEqual(guj.json()["kpis"]["total_sales"], "40.00")
        self.assertEqual(guj.json()["kpis"]["total_invoices"], 1)
        adt = self.client.get(f"/api/dashboards/entity/?entity_id={self.adt.id}", HTTP_HOST="localhost")
        self.assertEqual(adt.json()["kpis"]["total_sales"], "60.00")
        self.assertEqual(guj.json()["kpis"]["active_customers"], 1)
        self.assertEqual(adt.json()["kpis"]["active_customers"], 0)
        self.assertEqual(guj.json()["kpis"]["active_entities"], 1)
        admin_guj = self.client.get(
            f"/api/dashboards/admin/?entity_id={self.guj.id}",
            HTTP_HOST="localhost",
        )
        self.assertEqual(admin_guj.status_code, 200, admin_guj.content)
        self.assertEqual(admin_guj.json()["kpis"]["total_sales"], "40.00")
        self.assertEqual(admin_guj.json()["kpis"], guj.json()["kpis"])
        self.assertEqual(guj.json()["debtors"][0]["outstanding"], "40.00")
        self.assertEqual(adt.json()["debtors"][0]["outstanding"], "60.00")
        self.assertEqual(guj.json()["top_products"][0]["product_code"], "DASH-01")
        self.assertEqual(adt.json()["top_products"][0]["product_code"], "DASH-01")

    def test_staff_dashboard_only_own_records(self):
        today = timezone.localdate()
        self._invoice(self.guj, "INV-ADMIN", Decimal("40.00"), today, created_by=self.admin)
        self._invoice(self.adt, "INV-OP", Decimal("15.00"), today, created_by=self.operator)
        po = self._po(self.guj, "PO-OP-OWN", created_by=self.operator)
        po.status = PurchaseOrder.Status.SUBMITTED
        po.save(update_fields=["status"])
        Payment.objects.create(
            payment_number="PAY-OP-1",
            payment_date=today,
            entity=self.guj,
            customer=self.customer,
            customer_code=self.customer.customer_code,
            amount=Decimal("10.00"),
            payment_mode=Payment.PaymentMode.CASH,
            bank_cash_account="PETTY",
            unallocated_amount=Decimal("10.00"),
            created_by=self.operator,
        )
        self.client.force_authenticate(self.operator)
        res = self.client.get("/api/dashboards/staff/", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200, res.content)
        kpis = res.json()["kpis"]
        self.assertEqual(kpis["purchase_orders_created"], 1)
        self.assertEqual(kpis["pending_pos_created"], 1)
        self.assertEqual(kpis["pending_invoices_created"], 1)
        self.assertEqual(kpis["payments_recorded"], 1)
        invoice_numbers = [row["invoice_number"] for row in res.json()["pending_invoices"]]
        self.assertEqual(invoice_numbers, ["INV-OP"])
        self.assertEqual(res.json()["recent_payments"][0]["payment_number"], "PAY-OP-1")
        self.assertEqual(res.json()["recent_purchase_orders"][0]["po_number"], "PO-OP-OWN")
        self.assertNotIn("INV-ADMIN", invoice_numbers)

    def test_operator_forbidden_on_admin_and_entity_dashboards(self):
        self.client.force_authenticate(self.operator)
        admin = self.client.get("/api/dashboards/admin/", HTTP_HOST="localhost")
        self.assertEqual(admin.status_code, 403)
        admin_scoped = self.client.get(
            f"/api/dashboards/admin/?entity_id={self.guj.id}",
            HTTP_HOST="localhost",
        )
        self.assertEqual(admin_scoped.status_code, 403)
        entity = self.client.get("/api/dashboards/entity/", HTTP_HOST="localhost")
        self.assertEqual(entity.status_code, 403)
        entity_scoped = self.client.get(
            f"/api/dashboards/entity/?entity_id={self.adt.id}",
            HTTP_HOST="localhost",
        )
        self.assertEqual(entity_scoped.status_code, 403)
        staff = self.client.get("/api/dashboards/staff/", HTTP_HOST="localhost")
        self.assertEqual(staff.status_code, 200, staff.content)

    def test_admin_can_still_call_staff_dashboard(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/dashboards/staff/", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200, res.content)
