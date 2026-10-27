import time

from django.conf import settings
from django.core.management.base import BaseCommand

from purchase_orders.mail import load_settings, process_outbox, sweep_unknown
from purchase_orders.models import EmailOutbox


class Command(BaseCommand):
    help = "Send queued purchase-order emails in batches of 10. Rows already claimed are left alone."

    def handle(self, *args, **options):
        sweep_unknown()
        if settings.EMAIL_MODE == "off":
            self.stdout.write("Email sending is off. Queued rows were left queued.")
            return
        if settings.EMAIL_MODE == "live" and not load_settings().enabled:
            self.stdout.write("Live email is switched off. Queued rows were left queued.")
            return
        batches = 0
        while True:
            ids = list(
                EmailOutbox.objects.filter(status=EmailOutbox.Status.QUEUED)
                .order_by("id")
                .values_list("id", flat=True)[:10]
            )
            if not ids:
                break
            sent = process_outbox(ids)
            batches += 1
            self.stdout.write(f"Batch {batches}: claimed {len(ids)}, sent {sent}.")
            if EmailOutbox.objects.filter(status=EmailOutbox.Status.QUEUED).exists():
                time.sleep(1)
        self.stdout.write(self.style.SUCCESS("Queued purchase-order email pass finished."))
