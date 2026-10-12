from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from openpyxl import load_workbook

from customers.models import Customer, CustomerEntity
from entities.models import Entity


FIXTURE = Path(__file__).parent / "tests" / "fixtures" / "Arvind_Party_Master.xlsx"


class ArvindCustomerMasterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.entity = Entity.objects.create(short_code="AVD", entity_name="Arvind")

    def run_import(self, *extra, path=FIXTURE):
        output = StringIO()
        call_command(
            "import_arvind_customers", str(path), "--entity", "AVD", *extra,
            stdout=output,
        )
        return output.getvalue()

    def test_dry_run_validates_fixture_and_real_import_is_idempotent(self):
        output = self.run_import("--dry-run")
        self.assertIn("Rows: 98; created: 98", output)
        self.assertEqual(Customer.objects.count(), 0)
        self.run_import()
        self.assertEqual(Customer.objects.count(), 98)
        self.assertEqual(Customer.objects.filter(customer_code="0004054783", city="AHMEDABAD").count(), 1)
        self.assertEqual(CustomerEntity.objects.filter(entity=self.entity, primary_entity=True).count(), 98)
        self.run_import()
        self.assertEqual(Customer.objects.count(), 98)

    def test_duplicate_code_and_bad_gst_block_before_writes(self):
        workbook = load_workbook(FIXTURE)
        sheet = workbook["Sheet1"]
        sheet["A3"] = sheet["A2"].value
        sheet["V2"] = "BAD"
        altered = FIXTURE.with_name("Arvind_Party_Master_test_invalid.xlsx")
        workbook.save(altered)
        try:
            with self.assertRaises(CommandError):
                self.run_import("--dry-run", path=altered)
            self.assertEqual(Customer.objects.count(), 0)
        finally:
            altered.unlink(missing_ok=True)
