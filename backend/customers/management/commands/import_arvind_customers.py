"""Import the Arvind SAP party master without changing customer ledger data."""

from __future__ import annotations

import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from openpyxl import load_workbook

from customers.models import Customer, CustomerEntity
from entities.models import Entity

GST_RE = re.compile(r"^[0-9]{2}[A-Z0-9]{13}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# External file header: do not rename
HEADERS = (
    "Customer Code", "Account Group Description", "Distribution Channel", "Division",
    "Name 1", "Name 2", "Search Term 1", "Search Term 2", "Street 2", "Street 3",
    "Street 4", "Street 5", "City", "Postal Code", "State Code", "State Description",
    "Country Code", "Transportation Zone", "Telephone", "Mobile Phone", "Email", "GST No",
)


def cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def code(value) -> str:
    raw = cell(value)
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits.zfill(10) if digits else ""


class Command(BaseCommand):
    help = "Import Arvind_Party_Master.xlsx; run with --dry-run before writing."

    def add_arguments(self, parser):
        parser.add_argument("xlsx_path")
        parser.add_argument("--entity", required=True, help="Entity short code.")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        path = Path(options["xlsx_path"]).expanduser().resolve()
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        entities = Entity.objects.filter(short_code__iexact=options["entity"].strip())
        entity = entities.first()
        if entity is None:
            available = ", ".join(f"{e.short_code} ({e.entity_name})" for e in Entity.objects.all())
            raise CommandError(f"Unknown entity {options['entity']!r}. Available entities: {available or '(none)'}")
        rows = self._read(path)
        report = self._validate(rows, entity)
        self._report(path, entity, report, options["dry_run"])
        if report["errors"]:
            raise CommandError("Import blocked by validation errors.")
        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("DRY RUN — no records written."))
            return
        created, updated, unchanged = self._import(rows, entity)
        self.stdout.write(self.style.SUCCESS(
            f"Imported Arvind master: created {created}, updated {updated}, unchanged {unchanged}."
        ))

    def _read(self, path):
        wb = load_workbook(path, read_only=True, data_only=True)
        if "Sheet1" not in wb.sheetnames:
            raise CommandError(f"Sheet 'Sheet1' not found. Sheets: {wb.sheetnames}")
        ws = wb["Sheet1"]
        actual = tuple(cell(v) for v in next(ws.iter_rows(values_only=True)))
        if actual != HEADERS:
            raise CommandError(f"Unexpected headers: {actual!r}")
        rows = []
        for row_number, values in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not any(cell(v) for v in values):
                continue
            values = list(values) + [None] * (len(HEADERS) - len(values))
            rows.append({
                "excel_row": row_number,
                "customer_code": code(values[0]),
                "account_group": cell(values[1]),
                "distribution_channel": cell(values[2]),
                "division": cell(values[3]),
                "customer_name": cell(values[4]),
                "name_2": cell(values[5]),
                "search_term_1": cell(values[6]),
                "search_term_2": cell(values[7]),
                "address_line_1": cell(values[8]),
                "address_line_2": cell(values[9]),
                "address_line_3": cell(values[10]),
                "address_line_4": cell(values[11]),
                "city": cell(values[12]).upper(),
                "pincode": cell(values[13]),
                "state_code": cell(values[14]),
                "state": cell(values[15]),
                "country_code": cell(values[16]),
                "transportation_zone": cell(values[17]),
                "phone": cell(values[18]),
                "mobile": cell(values[19]),
                "email": cell(values[20]),
                "gst_no": cell(values[21]).upper(),
            })
        wb.close()
        return rows

    def _validate(self, rows, entity):
        errors, warnings, name_collisions = [], [], []
        seen = {}
        existing = {c.customer_code: c for c in Customer.objects.all()}
        for row in rows:
            row_errors = []
            code_value = row["customer_code"]
            if not code_value:
                row_errors.append("customer code is required")
            elif len(code_value) != 10:
                row_errors.append("customer code must contain digits")
            if not row["customer_name"]:
                row_errors.append("Name 1 is required")
            if code_value in seen:
                row_errors.append(f"duplicate customer code (also row {seen[code_value]})")
            else:
                seen[code_value] = row["excel_row"]
            for field, limit in (("customer_name", 200), ("name_2", 200), ("city", 80), ("state", 80),
                                 ("pincode", 12), ("gst_no", 20), ("email", 254)):
                if len(row[field]) > limit:
                    row_errors.append(f"{field} exceeds {limit} characters")
            if row["gst_no"] and not GST_RE.fullmatch(row["gst_no"]):
                row_errors.append("GST No must match the 15-character GSTIN pattern")
            if row["email"] and not EMAIL_RE.fullmatch(row["email"]):
                warnings.append((row["excel_row"], "email is not in a valid email format"))
            if row["pincode"] and (len(row["pincode"]) != 6 or not row["pincode"].isdigit()):
                warnings.append((row["excel_row"], "Postal Code is not 6 digits"))
            if row["gst_no"] and Customer.objects.filter(
                gst_no__iexact=row["gst_no"], entities=entity
            ).exclude(customer_code=code_value).exists():
                warnings.append((row["excel_row"], "GST No is already used by another customer in this entity"))
            old = existing.get(code_value)
            same_name = Customer.objects.filter(customer_name__iexact=row["customer_name"]).exclude(
                customer_code=code_value
            ).exists()
            if same_name:
                name_collisions.append((row["excel_row"], code_value, row["customer_name"]))
            if row_errors:
                errors.append((row["excel_row"], code_value, row_errors))
        return {"errors": errors, "warnings": warnings, "name_collisions": name_collisions,
                "created": sum(1 for r in rows if r["customer_code"] not in existing),
                "updated": sum(1 for r in rows if r["customer_code"] in existing),
                "unchanged": 0}

    def _report(self, path, entity, report, dry_run):
        self.stdout.write(f"{'DRY RUN' if dry_run else 'IMPORT'}: {path}")
        self.stdout.write(f"Entity: {entity.short_code} ({entity.entity_name})")
        self.stdout.write(
            f"Rows: {report['created'] + report['updated']}; "
            f"created: {report['created']}; updated: {report['updated']}; unchanged: {report['unchanged']}"
        )
        for row, message in report["warnings"]:
            self.stdout.write(self.style.WARNING(f"Excel row {row}: warning: {message}"))
        for row, code_value, name in report["name_collisions"]:
            self.stdout.write(f"Excel row {row}: same normalized name under another code: {name} ({code_value})")
        for row, code_value, messages in report["errors"]:
            self.stdout.write(self.style.ERROR(f"Excel row {row} [{code_value}]: {'; '.join(messages)}"))

    def _import(self, rows, entity):
        created = updated = unchanged = 0
        fields = (
            "customer_name", "name_2", "search_term_1", "search_term_2", "address_line_1",
            "address_line_2", "address_line_3", "address_line_4", "city", "pincode",
            "state_code", "state", "country_code", "transportation_zone", "phone", "mobile",
            "email", "gst_no", "division", "account_group", "distribution_channel",
        )
        with transaction.atomic():
            for row in rows:
                values = {field: row[field] for field in fields}
                customer, was_created = Customer.objects.get_or_create(
                    customer_code=row["customer_code"],
                    defaults={**values, "customer_type": Customer.CustomerType.COMPANY},
                )
                if was_created:
                    created += 1
                else:
                    changed = any(getattr(customer, field) != value for field, value in values.items())
                    if changed:
                        for field, value in values.items():
                            setattr(customer, field, value)
                        customer.save(update_fields=[*fields, "updated_at"])
                        updated += 1
                    else:
                        unchanged += 1
                CustomerEntity.objects.update_or_create(
                    customer=customer, entity=entity, defaults={"primary_entity": True}
                )
        return created, updated, unchanged
