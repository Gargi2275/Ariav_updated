from django.core.management.base import BaseCommand

from notifications.services import generate_due_reminders, upcoming_due_days


class Command(BaseCommand):
    help = (
        "Create Upcoming Due / Due Today / Overdue invoice notifications. "
        "Idempotent: safe to run repeatedly (throttled per invoice)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--upcoming-days",
            type=int,
            default=None,
            help=(
                "Days ahead to treat as Upcoming Due "
                f"(default: settings.NOTIFICATION_UPCOMING_DUE_DAYS, currently {upcoming_due_days()})."
            ),
        )

    def handle(self, *args, **options):
        stats = generate_due_reminders(upcoming_days=options["upcoming_days"])
        self.stdout.write(
            self.style.SUCCESS(
                "Reminders created — "
                f"upcoming_due={stats['upcoming_due']} "
                f"due_today={stats['due_today']} "
                f"overdue={stats['overdue']}"
            )
        )
