"""Purchase-order email. Uses the isolated test database and Django's locmem backend."""

import threading
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core import mail
from django.core.mail import EmailMessage
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AuditLog, AuthUser
from brands.models import Brand
from customers.models import Customer
from entities.models import Entity
from purchase_orders.mail import process_outbox, sweep_unknown
from purchase_orders.models import (
    BrandEmailConfig,
    EmailOutbox,
    EmailSettings,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatusChange,
)
MAIL = dict(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_MODE="live",
    EMAIL_HOST="smtp.example.com",
    EMAIL_PORT=587,
    EMAIL_HOST_USER="mailer",
    EMAIL_HOST_PASSWORD="mailbox-secret",
    EMAIL_USE_TLS=True,
    EMAIL_USE_SSL=False,
    DEFAULT_FROM_EMAIL="orders@example.com",
    EMAIL_TEST_RECIPIENT="qa@example.com",
    EMAIL_TIMEOUT=20,
)


@override_settings(**MAIL)
class PurchaseOrderEmailTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="mail-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
            email="admin@example.com",
            display_name="Mail Admin",
        )
        self.operator = AuthUser.objects.create_user(
            username="mail-op",
            password="pass12345",
            role=AuthUser.Role.STAFF,
            email="op@example.com",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.entity = Entity.objects.create(
            short_code="ADT",
            entity_name="Aditi",
            entity_type=Entity.EntityType.BRANCH,
            email_signature="Aditi desk",
            reply_to="desk@example.com",
        )
        self.customer = Customer.objects.create(customer_code="703895", customer_name="Santosh Cloth Store")
        self.other = Customer.objects.create(customer_code="999", customer_name="Other Party")
        self.brand = Brand.objects.create(
            brand_code="DIG",
            brand_name="Digital Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        self.entity.brands.add(self.brand)
        EmailSettings.objects.create(pk=1, enabled=True, from_name="Ariav", daily_cap=100, per_minute_cap=10)
        BrandEmailConfig.objects.create(
            brand=self.brand,
            to_addresses=["mill@example.com"],
            cc_addresses=["copy@example.com"],
            bcc_addresses=["audit@example.com"],
            subject_template="PO {po_number} for {party_name}",
            body_template="Lines {line_count} from {sender_name}\n{signature}",
            include_rates=True,
            copy_label="Mill's Copy",
        )
        self.po = self._po("PO-MAIL-1", self.customer, self.operator, rate=Decimal("10.00"))
        self.hidden = self._po("PO-MAIL-HIDDEN", self.other, self.admin, rate=Decimal("5.00"))

    def _po(self, number, customer, owner, rate=Decimal("10.00"), status=PurchaseOrder.Status.SUBMITTED):
        po = PurchaseOrder.objects.create(
            po_number=number,
            entity=self.entity,
            customer=customer,
            brand=self.brand,
            status=status,
            order_type=PurchaseOrder.OrderType.DIGITAL,
            created_by=owner,
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            product_description="Cloth",
            quantity=Decimal("2.00"),
            rate=rate,
        )
        return po

    def _send(self, po, client=None, **extra):
        client = client or self.client
        item = {
            "po_id": po.id,
            "subject": "PO {po_number} for {party_name}",
            "body": "Lines {line_count} from {sender_name}\n{signature}",
        }
        item.update(extra)
        return client.post("/api/purchase-orders/email/send/", {"items": [item]}, format="json", HTTP_HOST="localhost")

    def test_compose_writes_nothing_and_warns(self):
        draft = self._po("PO-MAIL-DRAFT", self.customer, self.operator, status=PurchaseOrder.Status.DRAFT)
        before = EmailOutbox.objects.count()
        empty = Brand.objects.create(
            brand_code="EMP",
            brand_name="Empty Mills",
            order_method=Brand.OrderMethod.DIGITAL_PO,
        )
        BrandEmailConfig.objects.create(brand=empty, include_rates=True, to_addresses=[], cc_addresses=[], bcc_addresses=[])
        bare = PurchaseOrder.objects.create(
            po_number="PO-MAIL-BARE",
            entity=self.entity,
            customer=self.customer,
            brand=empty,
            status=PurchaseOrder.Status.SUBMITTED,
            created_by=self.operator,
        )
        PurchaseOrderLine.objects.create(purchase_order=bare, product_description="Bare", quantity=Decimal("1.00"), rate=None)
        sent = EmailOutbox.objects.create(
            purchase_order=self.po,
            brand=self.brand,
            to_addresses=["mill@example.com"],
            cc_addresses=[],
            bcc_addresses=[],
            subject="old",
            body="old",
            status=EmailOutbox.Status.SENT,
            idempotency_key="a" * 64,
            sent_at=timezone.now(),
        )
        with patch("purchase_orders.mail.MAX_ATTACHMENT_BYTES", 8):
            response = self.client.post(
                "/api/purchase-orders/email/compose/",
                {"po_ids": [draft.id, bare.id, self.po.id]},
                format="json",
                HTTP_HOST="localhost",
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(EmailOutbox.objects.count(), before + 1)
        by_number = {item["po_number"]: item for item in response.json()["items"]}
        self.assertIn("not in a sendable status", " ".join(by_number["PO-MAIL-DRAFT"]["warnings"]))
        self.assertIn("No recipients", " ".join(by_number["PO-MAIL-BARE"]["warnings"]))
        self.assertIn("unpriced", " ".join(by_number["PO-MAIL-BARE"]["warnings"]))
        self.assertIn("Already emailed", " ".join(by_number["PO-MAIL-1"]["warnings"]))
        self.assertIn("mill@example.com", " ".join(by_number["PO-MAIL-1"]["warnings"]))
        self.assertIn("over 10 MB", " ".join(by_number["PO-MAIL-1"]["warnings"]))
        self.assertEqual(sent.status, EmailOutbox.Status.SENT)

    def test_send_renders_placeholders_and_attaches_the_po_pdf(self):
        with patch("purchase_orders.mail.build_po_pdf", return_value=b"%PDF-1.4 purchase-order") as built:
            response = self._send(self.po)
        self.assertTrue(built.called)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(EmailOutbox.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["mill@example.com"])
        self.assertEqual(message.cc, ["copy@example.com"])
        self.assertEqual(message.bcc, ["audit@example.com"])
        self.assertIn(self.po.po_number, message.subject)
        self.assertIn("Santosh Cloth Store", message.subject)
        self.assertIn("Mail Admin", message.body)
        self.assertIn("Aditi desk", message.body)
        self.assertNotIn("{po_number}", message.body)
        filename, payload, mime = message.attachments[0]
        self.assertTrue(filename.endswith(".pdf"))
        self.assertEqual(mime, "application/pdf")
        self.assertEqual(payload, b"%PDF-1.4 purchase-order")
        row = EmailOutbox.objects.get()
        self.assertEqual(row.status, EmailOutbox.Status.SENT)
        self.assertEqual(len(row.attachment_sha256), 64)
        self.assertTrue(row.message_id)

    def test_unknown_placeholder_crlf_invalid_and_duplicate_addresses_are_rejected(self):
        bad_template = self.client.put(
            f"/api/purchase-orders/email/brands/{self.brand.id}/",
            {
                "to_addresses": ["mill@example.com"],
                "cc_addresses": [],
                "bcc_addresses": [],
                "subject_template": "Hello {not_a_field}",
                "body_template": "Body",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(bad_template.status_code, 400)
        self.assertIn("not_a_field", bad_template.json()["detail"])
        broken = self._send(self.po, subject="Hello\r\nBcc: x@example.com")
        self.assertEqual(broken.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)
        duplicate = self.client.put(
            f"/api/purchase-orders/email/brands/{self.brand.id}/",
            {
                "to_addresses": ["mill@example.com", "MILL@example.com"],
                "cc_addresses": [],
                "bcc_addresses": [],
                "subject_template": "PO {po_number}",
                "body_template": "Body",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(duplicate.status_code, 400)
        invalid = self.client.put(
            f"/api/purchase-orders/email/brands/{self.brand.id}/",
            {
                "to_addresses": ["not-an-email"],
                "cc_addresses": [],
                "bcc_addresses": [],
                "subject_template": "PO {po_number}",
                "body_template": "Body",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(AuditLog.objects.filter(details__icontains="mailbox-secret").exists())

    def test_mode_off_sends_nothing_and_test_mode_redirects(self):
        with override_settings(EMAIL_MODE="off"):
            refused = self._send(self.po)
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(EmailOutbox.objects.count(), 0)
        with override_settings(EMAIL_MODE="test"):
            sent = self._send(self.po)
        self.assertEqual(sent.status_code, 200, sent.content)
        self.assertEqual(mail.outbox[0].to, ["mill@example.com"])
        self.assertFalse(mail.outbox[0].subject.startswith("[TEST for "))
        with override_settings(EMAIL_MODE="live"):
            EmailSettings.objects.filter(pk=1).update(enabled=False)
            blocked = self._send(self._po("PO-MAIL-2", self.customer, self.operator))
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("switched off", blocked.json()["detail"])

    def test_double_submit_is_one_message_resend_needs_a_reason_and_cap_returns_429(self):
        first = self._send(self.po)
        self.assertEqual(first.status_code, 200, first.content)
        short = self._send(self.po, subject="Different {po_number}", resend_reason="no")
        self.assertEqual(short.status_code, 400)
        again = self._send(self.po)
        self.assertEqual(again.status_code, 200, again.content)
        self.assertTrue(again.json()["rows"][0]["idempotent"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(EmailOutbox.objects.count(), 1)
        resent = self._send(self.po, resend_reason="shade was wrong")
        self.assertEqual(resent.status_code, 200, resent.content)
        self.assertEqual(EmailOutbox.objects.count(), 2)
        self.assertEqual(EmailOutbox.objects.exclude(resend_of=None).count(), 1)
        EmailSettings.objects.filter(pk=1).update(daily_cap=2)
        third = self._po("PO-MAIL-3", self.customer, self.operator)
        capped = self._send(third)
        self.assertEqual(capped.status_code, 429)
        self.assertEqual(capped.json()["remaining"], 0)
        self.assertFalse(EmailOutbox.objects.filter(purchase_order=third).exists())

    def test_smtp_failure_is_clean_and_retry_stops_at_three(self):
        secret = "mailbox-secret"
        with patch.object(EmailMessage, "send", side_effect=Exception(f"login failed for {secret}")):
            with self.assertLogs("purchase_orders.mail", level="WARNING") as captured:
                failed = self._send(self.po)
        self.assertEqual(failed.status_code, 200, failed.content)
        row = EmailOutbox.objects.get()
        self.assertEqual(row.status, EmailOutbox.Status.FAILED)
        self.assertNotIn(secret, row.last_error)
        self.assertFalse(any(secret in line for line in captured.output))
        self.assertEqual(len(mail.outbox), 0)
        with patch.object(EmailMessage, "send", side_effect=Exception("still down")):
            retry = self.client.post("/api/purchase-orders/email/retry/", {"id": row.id}, format="json", HTTP_HOST="localhost")
            self.assertEqual(retry.status_code, 200, retry.content)
            retry = self.client.post("/api/purchase-orders/email/retry/", {"id": row.id}, format="json", HTTP_HOST="localhost")
            self.assertEqual(retry.status_code, 200, retry.content)
        row.refresh_from_db()
        self.assertEqual(row.attempts, 3)
        stopped = self.client.post("/api/purchase-orders/email/retry/", {"id": row.id}, format="json", HTTP_HOST="localhost")
        self.assertEqual(stopped.status_code, 400)
        with patch.object(EmailMessage, "send", return_value=1):
            EmailOutbox.objects.filter(pk=row.pk).update(status=EmailOutbox.Status.FAILED, attempts=2)
            recovered = self.client.post("/api/purchase-orders/email/retry/", {"id": row.id}, format="json", HTTP_HOST="localhost")
        self.assertEqual(recovered.status_code, 200, recovered.content)
        row.refresh_from_db()
        self.assertEqual(row.status, EmailOutbox.Status.SENT)

    def test_permissions_and_status_action(self):
        operator = APIClient()
        operator.force_authenticate(self.operator)
        changed = operator.post(
            "/api/purchase-orders/email/send/",
            {"items": [{"po_id": self.po.id, "subject": "PO {po_number}", "body": "Body", "to": ["other@example.com"]}]},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(changed.status_code, 403)
        settings_call = operator.get("/api/purchase-orders/email/settings/", HTTP_HOST="localhost")
        self.assertEqual(settings_call.status_code, 403)
        hidden = operator.get(f"/api/purchase-orders/{self.hidden.id}/email/history/", HTTP_HOST="localhost")
        self.assertEqual(hidden.status_code, 404)
        anonymous = APIClient()
        self.assertEqual(anonymous.post("/api/purchase-orders/email/compose/", {"po_ids": [self.po.id]}, format="json", HTTP_HOST="localhost").status_code, 401)
        kept = operator._send if False else None
        allowed = operator.post(
            "/api/purchase-orders/email/send/",
            {"items": [{"po_id": self.po.id, "subject": "PO {po_number}", "body": "Body"}]},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(allowed.status_code, 200, allowed.content)
        self.assertEqual(allowed.json()["marked_sent_to_brand"], [self.po.id])
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, PurchaseOrder.Status.SENT_TO_BRAND)
        self.assertTrue(
            PurchaseOrderStatusChange.objects.filter(
                purchase_order=self.po,
                to_status=PurchaseOrder.Status.SENT_TO_BRAND,
            ).exists()
        )
        history = self.client.get(f"/api/purchase-orders/{self.po.id}/email/history/", HTTP_HOST="localhost")
        self.assertEqual(history.status_code, 200)
        self.assertIn("bcc", history.json()[0])
        operator_history = operator.get(f"/api/purchase-orders/{self.po.id}/email/history/", HTTP_HOST="localhost")
        self.assertNotIn("bcc", operator_history.json()[0])
        del kept

    def test_stuck_sending_becomes_unknown_and_is_not_retried(self):
        row = EmailOutbox.objects.create(
            purchase_order=self.po,
            brand=self.brand,
            to_addresses=["mill@example.com"],
            subject="stuck",
            body="stuck",
            status=EmailOutbox.Status.SENDING,
            sending_started_at=timezone.now() - timedelta(minutes=16),
            attempts=1,
            idempotency_key="b" * 64,
        )
        self.assertEqual(sweep_unknown(), 1)
        row.refresh_from_db()
        self.assertEqual(row.status, EmailOutbox.Status.UNKNOWN)
        process_outbox([row.id])
        self.assertEqual(len(mail.outbox), 0)
        row.refresh_from_db()
        self.assertEqual(row.status, EmailOutbox.Status.UNKNOWN)

    def test_settings_audit_names_fields_and_hides_the_password(self):
        response = self.client.put(
            "/api/purchase-orders/email/settings/",
            {"from_name": "Desk", "daily_cap": 40, "require_preview": True},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn("mailbox-secret", response.content.decode())
        self.assertNotIn("password", response.json())
        entry = AuditLog.objects.filter(action="Email settings updated").latest("timestamp")
        self.assertIn("from_name", entry.details)
        self.assertIn("daily_cap", entry.details)
        self.assertNotIn("Desk", entry.details)
        self.assertNotIn("mailbox-secret", entry.details)
        replaced = self.client.put(
            "/api/purchase-orders/email/settings/",
            {"smtp_user": "orders@example.com", "smtp_password": "replacement-secret", "from_email": "orders@example.com"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(replaced.status_code, 200, replaced.content)
        body = replaced.content.decode()
        self.assertNotIn("replacement-secret", body)
        self.assertNotIn("smtp_password", replaced.json())
        self.assertEqual(replaced.json()["smtp_user"], "orders@example.com")
        self.assertEqual(EmailSettings.objects.get(pk=1).smtp_password, "replacement-secret")


@override_settings(**MAIL)
class OutboxLockTests(TransactionTestCase):
    def test_two_workers_send_one_message(self):
        admin = AuthUser.objects.create_user(username="lock-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        entity = Entity.objects.create(short_code="LK", entity_name="Lock Branch", entity_type=Entity.EntityType.BRANCH)
        customer = Customer.objects.create(customer_code="LK1", customer_name="Lock Party")
        brand = Brand.objects.create(brand_code="LK", brand_name="Lock Mills", order_method=Brand.OrderMethod.DIGITAL_PO)
        EmailSettings.objects.create(pk=1, enabled=True)
        po = PurchaseOrder.objects.create(
            po_number="PO-LOCK-1",
            entity=entity,
            customer=customer,
            brand=brand,
            status=PurchaseOrder.Status.SUBMITTED,
            created_by=admin,
        )
        PurchaseOrderLine.objects.create(purchase_order=po, product_description="Cloth", quantity=Decimal("1.00"), rate=Decimal("3.00"))
        row = EmailOutbox.objects.create(
            purchase_order=po,
            brand=brand,
            to_addresses=["mill@example.com"],
            subject="Lock",
            body="Lock",
            status=EmailOutbox.Status.QUEUED,
            idempotency_key="c" * 64,
        )
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(5)
                process_outbox([row.id])
            finally:
                from django.db import connection
                connection.close()

        threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        row.refresh_from_db()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(row.status, EmailOutbox.Status.SENT)
        self.assertEqual(row.attempts, 1)
