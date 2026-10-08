from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from customers.models import Customer, CustomerEntity
from entities.models import Entity

from statements.importer import parse_workbook, validate_statements
from statements.models import CustomerStatement, StatementEntry


class Command(BaseCommand):
    help = "Load party_aditi.xlsx into separate customer statement tables. Use --dry-run first."

    def add_arguments(self, parser):
        parser.add_argument("xlsx_path")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        path = Path(options["xlsx_path"]).expanduser().resolve()
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        entity = Entity.objects.filter(entity_name__iexact="Aditi").first() or Entity.objects.filter(short_code__iexact="ADT").first()
        if entity is None:
            raise CommandError("Aditi entity not found.")

        parsed = parse_workbook(path)
        errors = list(parsed.errors) + validate_statements(parsed.statements)
        customers = {customer.customer_code.upper(): customer for customer in Customer.objects.all()}
        matched: dict[str, Customer] = {}
        for statement in parsed.statements:
            customer = customers.get(statement.customer_code.upper())
            if customer is None:
                errors.append(f"Customer {statement.customer_code or '<missing>'}, Excel row {statement.start_row}: customer not found.")
                continue
            if not CustomerEntity.objects.filter(customer=customer, entity=entity).exists():
                errors.append(f"Customer {statement.customer_code}, Excel row {statement.start_row}: not linked to Aditi entity.")
                continue
            matched[statement.customer_code.upper()] = customer

        self._print_report(path, entity, parsed.statements, matched, errors)
        if errors:
            raise CommandError(f"Load blocked with {len(errors)} error(s).")
        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("DRY RUN — no records written."))
            return

        with transaction.atomic():
            for statement in parsed.statements:
                customer = matched[statement.customer_code.upper()]
                stored, _ = CustomerStatement.objects.update_or_create(
                    entity=entity,
                    customer=customer,
                    period_from=statement.period_from,
                    period_to=statement.period_to,
                    defaults={
                        "customer_code": statement.customer_code,
                        "ledger_code": statement.ledger_code,
                        "ledger_description": statement.ledger_description,
                        "opening_amount": statement.opening_amount,
                        "opening_dc": statement.opening_dc,
                        "total_debit": statement.total_debit,
                        "total_credit": statement.total_credit,
                        "closing_amount": statement.closing_amount,
                        "closing_dc": statement.closing_dc,
                        "source_file": path.name,
                    },
                )
                stored.entries.all().delete()
                StatementEntry.objects.bulk_create(
                    [
                        StatementEntry(
                            statement=stored,
                            line_no=entry.line_no,
                            post_date=entry.post_date,
                            doc_type=entry.doc_type,
                            doc_no=entry.doc_no,
                            text=entry.text,
                            debit=entry.debit,
                            credit=entry.credit,
                            balance_amount=entry.balance_amount,
                            balance_dc=entry.balance_dc,
                            reference=entry.reference,
                            tds_amount=entry.tds_amount,
                            due_date=entry.due_date,
                            agent_code=entry.agent_code,
                        )
                        for entry in statement.entries
                    ]
                )
        self.stdout.write(self.style.SUCCESS(f"Loaded {len(parsed.statements)} customer statements and {sum(len(s.entries) for s in parsed.statements)} entries."))

    def _print_report(self, path, entity, statements, matched, errors):
        entries = sum(len(statement.entries) for statement in statements)
        no_activity = sum(not statement.entries for statement in statements)
        debit = sum((statement.total_debit for statement in statements), 0)
        credit = sum((statement.total_credit for statement in statements), 0)
        opening_dr = sum((statement.opening_amount for statement in statements if statement.opening_dc == "DR"), 0)
        opening_cr = sum((statement.opening_amount for statement in statements if statement.opening_dc == "CR"), 0)
        closing_dr = sum((statement.closing_amount for statement in statements if statement.closing_dc == "DR"), 0)
        closing_cr = sum((statement.closing_amount for statement in statements if statement.closing_dc == "CR"), 0)
        opening_dr_count = sum(statement.opening_dc == "DR" for statement in statements)
        closing_dr_count = sum(statement.closing_dc == "DR" for statement in statements)
        self.stdout.write(f"File: {path.name}")
        self.stdout.write(f"Entity: {entity.entity_name}")
        self.stdout.write(f"Period: {statements[0].period_from if statements else '-'} to {statements[0].period_to if statements else '-'}")
        self.stdout.write(f"Customers found: {len(statements)}; matched: {len(matched)}; entries found: {entries}; customers with no activity: {no_activity}")
        self.stdout.write(
            f"DR openings: {opening_dr_count}; DR closings: {closing_dr_count}; "
            f"Control totals: debit {debit}; credit {credit}; "
            f"signed opening {opening_dr - opening_cr}; signed closing {closing_dr - closing_cr}"
        )
        reference = next((statement for statement in statements if statement.customer_code.upper() == "700762"), None)
        if reference:
            self.stdout.write(
                f"Customer 700762: opening {reference.opening_amount} {reference.opening_dc}; "
                f"closing {reference.closing_amount} {reference.closing_dc}"
            )
        self.stdout.write(f"Errors: {len(errors)}")
        for error in errors:
            self.stdout.write(self.style.ERROR(error))
