from datetime import timedelta
from decimal import Decimal
from io import StringIO

from rest_framework.test import APIClient

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from invoices.models import Invoice
from notifications.models import Notification
from products.models import Product
from purchase_orders.models import PurchaseOrder


class NotificationApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="note-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="note-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="GUJ",
            entity_name="Gujarat Notes",
            entity_type=Entity.EntityType.BRANCH,
            address_line_1="Ashram Road",
            city="Ahmedabad",
            state="Gujarat",
        )
        self.customer = Customer.objects.create(
            customer_code="NOTE-C1",
            customer_name="Notify Trading",
            credit_days=15,
        )
        CustomerEntity.objects.create(
            customer=self.customer,
            entity=self.entity,
            primary_entity=True,
        )
        self.brand = Brand.objects.create(
            brand_code="NOTEB",
            brand_name="Notify Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        root = Category.objects.create(category_code="YRN", category_name="Yarn")
        sub = Category.objects.create(
            category_code="CTN",
            category_name="Cotton",
            parent_category=root,
        )
        self.p1 = Product.objects.create(
            product_code="NOTE-01",
            product_name="60s Cotton",
            brand=self.brand,
            category=sub,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )
        today = timezone.localdate()
        self.po = PurchaseOrder.objects.create(
            po_number="PO-NOTE-001",
            entity=self.entity,
            customer=self.customer,
            brand=self.brand,
            po_date=today,
            status=PurchaseOrder.Status.BRAND_ACCEPTED,
        )

    def _invoice(self, number, due_date, status=Invoice.Status.ISSUED):
        return Invoice.objects.create(
            invoice_number=number,
            invoice_date=timezone.localdate(),
            due_date=due_date,
            entity=self.entity,
            customer=self.customer,
            customer_code=self.customer.customer_code,
            purchase_order=self.po,
            brand=self.brand,
            status=status,
            net_amount=Decimal("40.00"),
        )

    def _create_po_api(self, **kwargs):
        payload = {
            "po_number": "PO-NOTE-API",
            "entity_id": self.entity.id,
            "customer_id": self.customer.id,
            "brand_id": self.brand.id,
            "po_date": timezone.localdate().isoformat(),
            "lines": [{"product_id": self.p1.id, "quantity": "10.00", "rate": "10.00"}],
        }
        payload.update(kwargs)
        res = self.client.post("/api/purchase-orders/", payload, format="json", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def test_upcoming_due_reminder_is_idempotent(self):
        today = timezone.localdate()
        invoice = self._invoice("INV-NOTE-UP", today + timedelta(days=3))
        self._invoice("INV-NOTE-DRAFT", today + timedelta(days=3), status=Invoice.Status.DRAFT)
        out = StringIO()
        call_command("generate_reminders", stdout=out)
        rows = Notification.objects.filter(
            notification_type=Notification.NotificationType.UPCOMING_DUE,
            reference_id=invoice.id,
        )
        self.assertEqual(rows.count(), 1)
        self.assertIn("upcoming_due=1", out.getvalue())
        call_command("generate_reminders", stdout=StringIO())
        self.assertEqual(rows.count(), 1)
        listed = self.client.get(
            "/api/notifications/?notification_type=Upcoming Due",
            HTTP_HOST="localhost",
        )
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["reference_id"], invoice.id)
        self.assertEqual(listed.json()[0]["channel"], "In-App")
        self.assertEqual(listed.json()[0]["delivery_status"], "Sent")

    def test_overdue_reminder_throttled_to_once_per_day(self):
        invoice = self._invoice("INV-NOTE-OD", timezone.localdate() - timedelta(days=2))
        call_command("generate_reminders", stdout=StringIO())
        call_command("generate_reminders", stdout=StringIO())
        rows = Notification.objects.filter(
            notification_type=Notification.NotificationType.OVERDUE,
            reference_id=invoice.id,
        )
        self.assertEqual(rows.count(), 1)
        self.assertIn("overdue", rows.get().title.lower())

    def test_due_today_reminder(self):
        invoice = self._invoice("INV-NOTE-TODAY", timezone.localdate())
        call_command("generate_reminders", stdout=StringIO())
        self.assertEqual(
            Notification.objects.filter(
                notification_type=Notification.NotificationType.DUE_TODAY,
                reference_id=invoice.id,
            ).count(),
            1,
        )

    def test_payment_confirmation_fires_immediately(self):
        before = Notification.objects.filter(
            notification_type=Notification.NotificationType.PAYMENT_CONFIRMATION,
        ).count()
        res = self.client.post(
            "/api/payments/",
            {
                "payment_number": "PAY-NOTE-1",
                "payment_date": timezone.localdate().isoformat(),
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "amount": "25.00",
                "payment_mode": "NEFT",
                "bank_cash_account": "HDFC-001",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 201, res.content)
        rows = Notification.objects.filter(
            notification_type=Notification.NotificationType.PAYMENT_CONFIRMATION,
            reference_id=res.json()["id"],
        )
        self.assertEqual(rows.count(), 1)
        self.assertEqual(
            Notification.objects.filter(
                notification_type=Notification.NotificationType.PAYMENT_CONFIRMATION,
            ).count(),
            before + 1,
        )
        self.assertIn("PAY-NOTE-1", rows.get().title)

    def test_po_status_change_fires_immediately(self):
        po = self._create_po_api()
        before = Notification.objects.filter(
            notification_type=Notification.NotificationType.PO_NOTIFICATION,
            reference_id=po["id"],
        ).count()
        submitted = self.client.post(
            f"/api/purchase-orders/{po['id']}/submit/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(submitted.status_code, 200, submitted.content)
        after_submit = Notification.objects.filter(
            notification_type=Notification.NotificationType.PO_NOTIFICATION,
            reference_id=po["id"],
        )
        self.assertEqual(after_submit.count(), before + 1)
        self.assertIn("Submitted", after_submit.order_by("-id").first().title)

        changed = self.client.post(
            f"/api/purchase-orders/{po['id']}/status/",
            {"status": "Sent to Brand"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(
            Notification.objects.filter(
                notification_type=Notification.NotificationType.PO_NOTIFICATION,
                reference_id=po["id"],
            ).count(),
            before + 2,
        )

    def test_dispatch_notification_fires_immediately(self):
        po = self._create_po_api(po_number="PO-NOTE-DSP")
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
                "dispatch_date": timezone.localdate().isoformat(),
                "lr_number": "LR-NOTE-1",
                "transporter": "VRL",
                "challan_reference": "CH-NOTE",
                "lines": [
                    {"purchase_order_line_id": po["lines"][0]["id"], "dispatched_quantity": "10.00"},
                ],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(dsp.status_code, 201, dsp.content)
        rows = Notification.objects.filter(
            notification_type=Notification.NotificationType.DISPATCH_NOTIFICATION,
            reference_id=dsp.json()["id"],
        )
        self.assertEqual(rows.count(), 1)
        self.assertIn("LR-NOTE-1", rows.get().message)
        self.assertIn(po["po_number"], rows.get().title)

    def test_mark_read_decreases_unread_count(self):
        self.client.post(
            "/api/payments/",
            {
                "payment_number": "PAY-NOTE-READ",
                "payment_date": timezone.localdate().isoformat(),
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "amount": "10.00",
                "payment_mode": "UPI",
                "bank_cash_account": "CASH",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        count = self.client.get("/api/notifications/unread-count/", HTTP_HOST="localhost")
        self.assertEqual(count.status_code, 200, count.content)
        unread = count.json()["unread_count"]
        self.assertGreaterEqual(unread, 1)
        listed = self.client.get("/api/notifications/?unread_only=true", HTTP_HOST="localhost")
        note_id = listed.json()[0]["id"]
        marked = self.client.post(
            f"/api/notifications/{note_id}/mark-read/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(marked.status_code, 200, marked.content)
        self.assertEqual(marked.json()["status"], "Read")
        self.assertIsNotNone(marked.json()["read_at"])
        after = self.client.get("/api/notifications/unread-count/", HTTP_HOST="localhost")
        self.assertEqual(after.json()["unread_count"], unread - 1)

        dismissed = self.client.post(
            f"/api/notifications/{note_id}/dismiss/",
            HTTP_HOST="localhost",
        )
        self.assertEqual(dismissed.json()["status"], "Dismissed")

        all_read = self.client.post("/api/notifications/mark-all-read/", HTTP_HOST="localhost")
        self.assertEqual(all_read.status_code, 200, all_read.content)
        self.assertEqual(
            self.client.get("/api/notifications/unread-count/", HTTP_HOST="localhost").json()["unread_count"],
            0,
        )

    def test_operator_notifications_are_scoped_to_own_records(self):
        admin_pay = self.client.post(
            "/api/payments/",
            {
                "payment_number": "PAY-NOTE-ADMIN",
                "payment_date": timezone.localdate().isoformat(),
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "amount": "12.00",
                "payment_mode": "Cash",
                "bank_cash_account": "PETTY",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(admin_pay.status_code, 201, admin_pay.content)
        self.client.force_authenticate(self.operator)
        listed = self.client.get("/api/notifications/", HTTP_HOST="localhost")
        self.assertEqual(listed.status_code, 200, listed.content)
        admin_ids = [row["reference_id"] for row in listed.json()]
        self.assertNotIn(admin_pay.json()["id"], admin_ids)

        op_pay = self.client.post(
            "/api/payments/",
            {
                "payment_number": "PAY-NOTE-OP",
                "payment_date": timezone.localdate().isoformat(),
                "entity_id": self.entity.id,
                "customer_id": self.customer.id,
                "amount": "8.00",
                "payment_mode": "Cash",
                "bank_cash_account": "PETTY",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(op_pay.status_code, 201, op_pay.content)
        listed = self.client.get("/api/notifications/", HTTP_HOST="localhost")
        op_ids = [row["reference_id"] for row in listed.json()]
        self.assertIn(op_pay.json()["id"], op_ids)
        self.assertNotIn(admin_pay.json()["id"], op_ids)
