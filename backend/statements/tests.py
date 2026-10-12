from datetime import date
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import AuthUser
from customers.models import Customer, CustomerEntity
from entities.models import Entity

from .importer import parse_amount, parse_workbook, validate_statements
from .models import CustomerStatement, StatementEntry


def make_workbook(*, customer_code="700762", tamper=False):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sheet1"
    sheet.append(["FROM  01.04.2025 To 31.05.2026"])
    sheet.append([f"Customer Code : {customer_code}                                                        Ledger Code : 251002"])
    sheet.append(["Customer Name : TEST CUSTOMER                                                        Ledger Description : Civil OTC Fabric"])
    sheet.append(["Address : TEST"])
    sheet.append(["City : TEST - 143105"])
    sheet.append(["State : PUNJAB"])
    sheet.append([""])
    sheet.append(["Post Date", "Doc. Type", "Doc. No.", "Text.", "Debit", "Credit", "Balance", "DR/CR", "Refrence", "TDS Deducted", "Due Date", "Agent Code"])
    sheet.append(["", "", "", "OPENING BALANCE AS ON-01.04.2025", "", "", "100.00", "CR"])
    sheet.append(["01.04.2025", "DG", "D-1", "Credit", "", "25", "125", "CR", "", "1,397.00-", "", "AT"])
    sheet.append(["02.04.2025", "RV", "R-1", "Debit", "50" if not tamper else "60", "", "75", "CR", "", "0", "02.05.2025", "AT"])
    sheet.append(["", "", "", "CLOSING BALANCE AS ON-31.05.2026", "50", "25", "75", "CR"])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


class StatementParserTests(TestCase):
    def test_parser_handles_padding_and_tds(self):
        file = NamedTemporaryFile(suffix=".xlsx", delete=False)
        try:
            file.write(make_workbook())
            file.close()
            parsed = parse_workbook(file.name)
        finally:
            Path(file.name).unlink(missing_ok=True)
        self.assertEqual(len(parsed.statements), 1)
        statement = parsed.statements[0]
        self.assertEqual(statement.customer_code, "700762")
        self.assertEqual(statement.entries[0].tds_amount, Decimal("1397.00"))
        self.assertEqual(validate_statements(parsed.statements), [])

    def test_tampered_amount_is_reconciliation_error(self):
        file = NamedTemporaryFile(suffix=".xlsx", delete=False)
        try:
            file.write(make_workbook(tamper=True))
            file.close()
            parsed = parse_workbook(file.name)
        finally:
            Path(file.name).unlink(missing_ok=True)
        errors = validate_statements(parsed.statements)
        self.assertTrue(any("running balance" in error for error in errors))

    def test_blank_and_trailing_minus_amounts(self):
        self.assertEqual(parse_amount(" ", 1, "amount", []), Decimal("0.00"))
        self.assertEqual(parse_amount("1,397.00-", 1, "amount", []), Decimal("1397.00"))


class StatementLoadTests(TestCase):
    def setUp(self):
        self.entity = Entity.objects.create(short_code="ADT", entity_name="Aditi")
        self.customer = Customer.objects.create(customer_code="700762", customer_name="Test Customer")
        CustomerEntity.objects.create(customer=self.customer, entity=self.entity, primary_entity=True)
        self.client = APIClient()
        self.admin = AuthUser.objects.create_user(username="statement-admin", password="test", role=AuthUser.Role.ADMIN)
        self.operator = AuthUser.objects.create_user(username="statement-operator", password="test", role=AuthUser.Role.OPERATOR)

    def write_file(self, content):
        file = NamedTemporaryFile(suffix=".xlsx", delete=False)
        file.write(content)
        file.close()
        self.addCleanup(lambda: Path(file.name).unlink(missing_ok=True))
        return file.name

    def test_unmatched_customer_blocks_everything(self):
        path = self.write_file(make_workbook(customer_code="MISSING"))
        with self.assertRaises(CommandError):
            call_command("load_party_aditi", path)
        self.assertEqual(CustomerStatement.objects.count(), 0)

    def test_rerun_updates_in_place_without_duplicates(self):
        path = self.write_file(make_workbook())
        call_command("load_party_aditi", path)
        call_command("load_party_aditi", path)
        self.assertEqual(CustomerStatement.objects.count(), 1)
        self.assertEqual(StatementEntry.objects.count(), 2)
        self.assertEqual(CustomerStatement.objects.get().source_file, Path(path).name)

    def test_statement_endpoint_returns_ordered_entries_and_summary(self):
        path = self.write_file(make_workbook())
        call_command("load_party_aditi", path)
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            f"/api/customers/{self.customer.id}/statement/",
            {"entity_id": self.entity.id},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["opening_amount"], "100.00")
        self.assertEqual(body["opening_dc"], "CR")
        self.assertEqual(body["closing_amount"], "75.00")
        self.assertEqual(body["closing_dc"], "CR")
        self.assertEqual([row["doc_no"] for row in body["entries"]], ["D-1", "R-1"])
        summary = self.client.get(
            f"/api/customers/{self.customer.id}/statement-summary/",
            {"entity_id": self.entity.id},
        )
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.json()["closing_dc"], "CR")

    def test_statement_report_returns_one_balance_row(self):
        path = self.write_file(make_workbook())
        call_command("load_party_aditi", path)
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            "/api/customers/statement-report/",
            {"entity_id": self.entity.id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        row = response.json()["rows"][0]
        self.assertEqual(row["opening_credit"], "100.00")
        self.assertEqual(row["period_debit"], "50.00")
        self.assertEqual(row["period_credit"], "25.00")
        self.assertEqual(row["closing_credit"], "75.00")

    def test_missing_statement_and_scope_are_read_only_and_hidden(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.get(
                f"/api/customers/{self.customer.id}/statement/",
                {"entity_id": self.entity.id},
            ).status_code,
            404,
        )
        other_entity = Entity.objects.create(short_code="OTH", entity_name="Other")
        CustomerEntity.objects.create(customer=self.customer, entity=other_entity)
        path = self.write_file(make_workbook())
        call_command("load_party_aditi", path)
        self.assertEqual(
            self.client.get(
                f"/api/customers/{self.customer.id}/statement/",
                {"entity_id": other_entity.id},
            ).status_code,
            404,
        )
        self.client.force_authenticate(self.operator)
        self.assertEqual(
            self.client.get(
                f"/api/customers/{self.customer.id}/statement/",
                {"entity_id": self.entity.id},
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(
                f"/api/customers/{self.customer.id}/statement-summary/",
                {"entity_id": self.entity.id},
            ).status_code,
            404,
        )
