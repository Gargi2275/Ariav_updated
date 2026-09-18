from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APIClient

from django.test import TestCase
from django.utils import timezone

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from dispatches.models import Dispatch, DispatchLine
from entities.models import Entity
from invoices.models import Invoice, InvoiceLine
from ledger.customer import customer_ledger_summary
from payments.models import Payment, PaymentAllocation
from products.models import Product
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


class ReportApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="rpt-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="rpt-op",
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
            customer_code="RPT-C1",
            customer_name="Riverside Trading",
            credit_days=15,
        )
        CustomerEntity.objects.create(customer=self.customer, entity=self.guj, primary_entity=True)
        self.brand = Brand.objects.create(
            brand_code="RPTB",
            brand_name="Riverside Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="RPTR", category_name="Yarn")
        self.sub = Category.objects.create(
            category_code="RPTS",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="RPT-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=self.sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
            season="Summer",
        )
        self.p2 = Product.objects.create(
            product_code="RPT-02",
            product_name="40s Cotton",
            brand=self.brand,
            category=self.sub,
            rate=Decimal("20.00"),
            unit=Product.Unit.METER,
            season="Winter",
        )

    def _get(self, path):
        return self.client.get(path, HTTP_HOST="localhost")

    def _po(self, entity, number, po_date, product=None, qty="10.00", rate="10.00", created_by=None):
        product = product or self.p1
        po = PurchaseOrder.objects.create(
            po_number=number,
            entity=entity,
            customer=self.customer,
            brand=self.brand,
            po_date=po_date,
            status=PurchaseOrder.Status.BRAND_ACCEPTED,
            created_by=created_by,
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=product,
            quantity=Decimal(qty),
            rate=Decimal(rate),
            line_total=Decimal(qty) * Decimal(rate),
        )
        return po

    def _invoice(self, po, number, invoice_date, due_date, product=None, qty="4.00", rate="10.00", status=Invoice.Status.ISSUED, created_by=None):
        product = product or self.p1
        line = po.lines.get(product=product)
        net = Decimal(qty) * Decimal(rate)
        invoice = Invoice.objects.create(
            invoice_number=number,
            invoice_date=invoice_date,
            due_date=due_date,
            entity=po.entity,
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
            product=product,
            quantity=Decimal(qty),
            rate=Decimal(rate),
            line_total=net,
        )
        return invoice

    def test_empty_reports_are_zeros_not_errors(self):
        for path in (
            "/api/reports/purchase-sales-trend/",
            "/api/reports/payment-trend/",
            "/api/reports/product-trend/",
            "/api/reports/seasonal-trend/",
            "/api/reports/bad-debt-trend/",
            "/api/reports/outstanding-report/",
            "/api/reports/customer-performance/",
            "/api/reports/brand-performance/",
            "/api/reports/entity-performance/",
        ):
            res = self._get(path)
            self.assertEqual(res.status_code, 200, path)
        empty = self._get("/api/reports/purchase-sales-trend/?from=2026-01-01&to=2026-03-31")
        rows = empty.json()["rows"]
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(r["po_value"] == "0.00" and r["sales_value"] == "0.00" for r in rows))
        self.assertEqual(self._get("/api/reports/product-trend/").json()["rows"], [])
        self.assertEqual(self._get("/api/reports/seasonal-trend/").json()["rows"], [])
        self.assertEqual(self._get("/api/reports/outstanding-report/").json()["rows"], [])
        bad = self._get("/api/reports/bad-debt-trend/").json()
        self.assertIn("Not tracked yet", bad["note"])
        self.assertTrue(all(r["bad_debt"] == "0.00" for r in bad["rows"]))
        self.assertNotIn("commission", str(self._get("/api/reports/brand-performance/").json()).lower())
        self.assertNotIn("on_time", str(self._get("/api/reports/brand-performance/").json()).lower())

    def test_purchase_sales_monthly_aggregation(self):
        jan = date(2026, 1, 15)
        feb = date(2026, 2, 10)
        po_jan = self._po(self.guj, "RPT-PO-JAN", jan, qty="10.00", rate="10.00")
        self._po(self.adt, "RPT-PO-FEB", feb, qty="5.00", rate="20.00")
        self._invoice(po_jan, "RPT-INV-FEB", feb, feb + timedelta(days=15), qty="4.00", rate="10.00")
        res = self._get("/api/reports/purchase-sales-trend/?from=2026-01-01&to=2026-02-28")
        self.assertEqual(res.status_code, 200, res.content)
        by_month = {row["month"]: row for row in res.json()["rows"]}
        self.assertEqual(by_month["2026-01"]["po_value"], "100.00")
        self.assertEqual(by_month["2026-01"]["sales_value"], "0.00")
        self.assertEqual(by_month["2026-02"]["po_value"], "100.00")
        self.assertEqual(by_month["2026-02"]["sales_value"], "40.00")
        guj = self._get(
            "/api/reports/purchase-sales-trend/?from=2026-01-01&to=2026-02-28&entity_id="
            + str(self.guj.id)
        )
        gmap = {row["month"]: row for row in guj.json()["rows"]}
        self.assertEqual(gmap["2026-01"]["po_value"], "100.00")
        self.assertEqual(gmap["2026-02"]["po_value"], "0.00")
        self.assertEqual(gmap["2026-02"]["sales_value"], "40.00")

    def test_product_trend_ranks_top_by_value(self):
        day = date(2026, 3, 5)
        po = self._po(self.guj, "RPT-PO-PR", day, product=self.p1, qty="20.00", rate="10.00")
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=self.p2,
            quantity=Decimal("10.00"),
            rate=Decimal("20.00"),
            line_total=Decimal("200.00"),
        )
        inv = Invoice.objects.create(
            invoice_number="RPT-INV-PR",
            invoice_date=day,
            due_date=day + timedelta(days=10),
            entity=self.guj,
            customer=self.customer,
            customer_code=self.customer.customer_code,
            purchase_order=po,
            brand=self.brand,
            status=Invoice.Status.ISSUED,
            net_amount=Decimal("240.00"),
        )
        InvoiceLine.objects.create(
            invoice=inv,
            purchase_order_line=po.lines.get(product=self.p1),
            product=self.p1,
            quantity=Decimal("4.00"),
            rate=Decimal("10.00"),
            line_total=Decimal("40.00"),
        )
        InvoiceLine.objects.create(
            invoice=inv,
            purchase_order_line=po.lines.get(product=self.p2),
            product=self.p2,
            quantity=Decimal("10.00"),
            rate=Decimal("20.00"),
            line_total=Decimal("200.00"),
        )
        res = self._get("/api/reports/product-trend/?from=2026-03-01&to=2026-03-31")
        rows = res.json()["rows"]
        self.assertEqual(rows[0]["product_code"], "RPT-02")
        self.assertEqual(rows[0]["total_value"], "200.00")
        march = {m["month"]: m for m in rows[0]["monthly"]}["2026-03"]
        self.assertEqual(march["quantity"], "10.00")
        self.assertEqual(march["value"], "200.00")
        self.assertEqual(rows[1]["product_code"], "RPT-01")
        self.assertEqual(rows[1]["total_value"], "40.00")
        seasons = {row["season"]: row["total_value"] for row in self._get(
            "/api/reports/seasonal-trend/?from=2026-03-01&to=2026-03-31"
        ).json()["rows"]}
        self.assertEqual(seasons["Winter"], "200.00")
        self.assertEqual(seasons["Summer"], "40.00")

    def test_outstanding_matches_ledger(self):
        today = timezone.localdate()
        po = self._po(self.guj, "RPT-PO-OS", today)
        self._invoice(po, "RPT-INV-OS", today - timedelta(days=20), today - timedelta(days=5), qty="8.00")
        res = self._get("/api/reports/outstanding-report/")
        self.assertEqual(res.status_code, 200, res.content)
        rows = res.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["customer_name"], "Riverside Trading")
        self.assertEqual(rows[0]["outstanding_balance"], "80.00")
        self.assertEqual(rows[0]["overdue_amount"], "80.00")
        self.assertEqual(rows[0]["oldest_overdue_days"], 5)
        self.assertEqual(rows[0]["entity_short_code"], "GUJ")
        ledger = customer_ledger_summary(self.customer)
        self.assertEqual(ledger["outstanding_balance"], rows[0]["outstanding_balance"])
        self.assertEqual(ledger["overdue_amount"], rows[0]["overdue_amount"])

    def test_entity_performance_side_by_side(self):
        jan = date(2026, 1, 8)
        po_g = self._po(self.guj, "RPT-PO-G", jan, qty="10.00", rate="10.00")
        po_a = self._po(self.adt, "RPT-PO-A", jan, qty="5.00", rate="20.00")
        self._invoice(po_g, "RPT-INV-G", jan, jan + timedelta(days=10), qty="4.00")
        self._invoice(po_a, "RPT-INV-A", jan, jan + timedelta(days=10), qty="5.00", rate="20.00")
        res = self._get("/api/reports/entity-performance/?from=2026-01-01&to=2026-01-31")
        by_code = {row["short_code"]: row for row in res.json()["rows"]}
        self.assertEqual(by_code["GUJ"]["total_sales"], "40.00")
        self.assertEqual(by_code["GUJ"]["total_orders"], 1)
        self.assertEqual(by_code["ADT"]["total_sales"], "100.00")
        self.assertEqual(by_code["ADT"]["total_orders"], 1)
        self.assertEqual(by_code["GUJ"]["total_customers"], 1)
        self.assertEqual(by_code["ADT"]["total_customers"], 0)

    def test_payment_and_customer_performance_and_filters(self):
        jan = date(2026, 1, 2)
        feb = date(2026, 2, 12)
        po = self._po(self.guj, "RPT-PO-PAY", jan)
        invoice = self._invoice(
            po, "RPT-INV-PAY", jan, jan + timedelta(days=10),
            qty="4.00", status=Invoice.Status.PAID,
        )
        payment = Payment.objects.create(
            payment_number="RPT-PAY-1",
            payment_date=feb,
            entity=self.guj,
            customer=self.customer,
            customer_code=self.customer.customer_code,
            amount=Decimal("40.00"),
            payment_mode=Payment.PaymentMode.NEFT,
            bank_cash_account="HDFC",
            unallocated_amount=Decimal("0.00"),
        )
        PaymentAllocation.objects.create(
            payment=payment,
            invoice=invoice,
            allocated_amount=Decimal("40.00"),
        )
        pay = self._get("/api/reports/payment-trend/?from=2026-01-01&to=2026-02-28")
        by_month = {row["month"]: row for row in pay.json()["rows"]}
        self.assertEqual(by_month["2026-01"]["payment_value"], "0.00")
        self.assertEqual(by_month["2026-02"]["payment_value"], "40.00")
        cust = self._get("/api/reports/customer-performance/?from=2026-01-01&to=2026-02-28")
        row = cust.json()["rows"][0]
        self.assertEqual(row["total_orders"], 1)
        self.assertEqual(row["total_invoiced"], "40.00")
        self.assertEqual(row["total_paid"], "40.00")
        self.assertEqual(row["average_days_to_pay"], "41.0")
        brand = self._get("/api/reports/brand-performance/?from=2026-01-01&to=2026-02-28")
        self.assertEqual(brand.json()["rows"][0]["total_pos"], 1)
        self.assertEqual(brand.json()["rows"][0]["total_invoiced_value"], "40.00")
        dsp = Dispatch.objects.create(
            purchase_order=po,
            dispatch_date=jan,
            lr_number="RPT-LR-1",
            transporter="VRL",
            challan_reference="RPT-CH",
        )
        DispatchLine.objects.create(
            dispatch=dsp,
            purchase_order_line=po.lines.first(),
            dispatched_quantity=Decimal("10.00"),
        )
        brand2 = self._get("/api/reports/brand-performance/?from=2026-01-01&to=2026-02-28")
        self.assertEqual(brand2.json()["rows"][0]["total_dispatched_value"], "100.00")
        outside = self._get("/api/reports/payment-trend/?from=2025-01-01&to=2025-12-31")
        self.assertTrue(all(r["payment_value"] == "0.00" for r in outside.json()["rows"]))

    def test_operator_reports_scoped_to_own_created_records(self):
        jan = date(2026, 1, 15)
        feb = date(2026, 2, 10)
        self._po(self.guj, "RPT-PO-ADM", jan, qty="10.00", rate="10.00", created_by=self.admin)
        po_op = self._po(self.adt, "RPT-PO-OP", feb, qty="5.00", rate="20.00", created_by=self.operator)
        self._invoice(
            po_op, "RPT-INV-OP", feb, feb + timedelta(days=15), qty="5.00", rate="20.00", created_by=self.operator
        )
        self.client.force_authenticate(self.operator)
        res = self._get("/api/reports/purchase-sales-trend/?from=2026-01-01&to=2026-02-28")
        self.assertEqual(res.status_code, 200, res.content)
        by_month = {row["month"]: row for row in res.json()["rows"]}
        self.assertEqual(by_month["2026-01"]["po_value"], "0.00")
        self.assertEqual(by_month["2026-01"]["sales_value"], "0.00")
        self.assertEqual(by_month["2026-02"]["po_value"], "100.00")
        self.assertEqual(by_month["2026-02"]["sales_value"], "100.00")
        admin_view = self.client
        admin_view.force_authenticate(self.admin)
        admin_rows = {row["month"]: row for row in self._get(
            "/api/reports/purchase-sales-trend/?from=2026-01-01&to=2026-02-28"
        ).json()["rows"]}
        self.assertEqual(admin_rows["2026-01"]["po_value"], "100.00")
        self.assertEqual(admin_rows["2026-02"]["po_value"], "100.00")
        self.assertEqual(admin_rows["2026-02"]["sales_value"], "100.00")
