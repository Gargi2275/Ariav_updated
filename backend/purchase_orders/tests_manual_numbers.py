"""Manual purchase-order numbers. Uses the project's MariaDB test database."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal

from django.db import IntegrityError, connections, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from products.models import Product
from purchase_orders.models import ManualPoNumberSequence, PurchaseOrder
from purchase_orders.numbering import (
    ManualPoNumberError,
    allocate_manual_po_number,
    preview_manual_po_number,
)
from purchase_orders.serializers import create_purchase_order_with_lines


def _branch(code, name):
    return Entity.objects.create(
        short_code=code,
        entity_name=name,
        entity_type=Entity.EntityType.BRANCH,
        city="Ahmedabad",
    )


def _brand(code, name, manual=True):
    return Brand.objects.create(
        brand_code=code,
        brand_name=name,
        order_method=Brand.OrderMethod.MANUAL_POR if manual else Brand.OrderMethod.DIGITAL_PO,
    )


class ManualNumberTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="num-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.aditi = _branch("ADT", "Aditi")
        self.gujarat = _branch("GUJ", "Gujarat")
        self.ocm = _brand("OCM", "OSM India Limited")
        self.donear = _brand("DON", "Donear")
        self.digital = _brand("DIG", "Digital Mills", manual=False)
        self.aditi.brands.add(self.ocm, self.donear, self.digital)
        self.gujarat.brands.add(self.ocm)
        self.customer = Customer.objects.create(customer_code="NUM-1", customer_name="Number Party")
        CustomerEntity.objects.create(customer=self.customer, entity=self.aditi, primary_entity=True)
        CustomerEntity.objects.create(customer=self.customer, entity=self.gujarat, primary_entity=False)
        self.product = Product.objects.create(
            product_code="NUM-SKU",
            product_name="Number Cloth",
            brand=self.digital,
            rate=Decimal("10.00"),
            unit=Product.Unit.METER,
        )
        self.on = date(2026, 10, 23)

    def _manual(self, entity, brand, po_number="CLIENT-1"):
        return self.client.post(
            "/api/purchase-orders/",
            {
                "po_number": po_number,
                "entity_id": entity.id,
                "customer_id": self.customer.id,
                "brand_id": brand.id,
                "po_date": "2026-10-23",
                "lines": [{
                    "product_id": None,
                    "product_description": "Grey",
                    "quantity": "2.00",
                    "rate": "10.00",
                }],
            },
            format="json",
            HTTP_HOST="localhost",
        )

    def test_format_starts_at_01_and_increments_by_prefix(self):
        first = allocate_manual_po_number(self.aditi, self.ocm, self.on)
        second = allocate_manual_po_number(self.aditi, self.ocm, self.on)
        third = allocate_manual_po_number(self.aditi, self.ocm, self.on)
        other_brand = allocate_manual_po_number(self.aditi, self.donear, self.on)
        other_branch = allocate_manual_po_number(self.gujarat, self.ocm, self.on)
        self.assertEqual([first, second, third], ["AO102601", "AO102602", "AO102603"])
        self.assertEqual(other_brand, "AD102601")
        self.assertEqual(other_branch, "GO102601")

    def test_month_and_year_rollover_are_separate_counters(self):
        october = allocate_manual_po_number(self.aditi, self.ocm, date(2026, 10, 31))
        november = allocate_manual_po_number(self.aditi, self.ocm, date(2026, 11, 1))
        next_year = allocate_manual_po_number(self.aditi, self.ocm, date(2027, 10, 1))
        self.assertEqual(october, "AO102601")
        self.assertEqual(november, "AO112601")
        self.assertEqual(next_year, "AO102701")

    def test_name_fallback_and_invalid_codes(self):
        branch = _branch("12", "Surat")
        brand = _brand("9", "Arvind")
        branch.brands.add(brand)
        self.assertEqual(allocate_manual_po_number(branch, brand, self.on), "SA102601")
        empty = _branch("44", "77")
        with self.assertRaises(ManualPoNumberError) as branch_error:
            allocate_manual_po_number(empty, self.ocm, self.on)
        self.assertEqual(branch_error.exception.field, "entity_id")
        nameless = _brand("88", "99")
        with self.assertRaises(ManualPoNumberError) as brand_error:
            allocate_manual_po_number(self.aditi, nameless, self.on)
        self.assertEqual(brand_error.exception.field, "brand_id")

    def test_sequence_stops_at_99(self):
        ManualPoNumberSequence.objects.create(scope="AO1026", last_value=98)
        self.assertEqual(allocate_manual_po_number(self.aditi, self.ocm, self.on), "AO102699")
        with self.assertRaises(ManualPoNumberError) as raised:
            allocate_manual_po_number(self.aditi, self.ocm, self.on)
        self.assertIn("99", raised.exception.message)
        self.assertEqual(ManualPoNumberSequence.objects.get(scope="AO1026").last_value, 99)

    def test_existing_number_is_not_reused_and_delete_does_not_rewind(self):
        PurchaseOrder.objects.create(
            po_number="AO102601",
            order_type=PurchaseOrder.OrderType.MANUAL,
            entity=self.aditi,
            customer=self.customer,
            brand=self.ocm,
            po_date=self.on,
        )
        issued = allocate_manual_po_number(self.aditi, self.ocm, self.on)
        self.assertEqual(issued, "AO102602")
        PurchaseOrder.objects.create(
            po_number=issued,
            order_type=PurchaseOrder.OrderType.MANUAL,
            entity=self.aditi,
            customer=self.customer,
            brand=self.ocm,
            po_date=self.on,
        )
        PurchaseOrder.objects.filter(po_number=issued).delete()
        self.assertEqual(allocate_manual_po_number(self.aditi, self.ocm, self.on), "AO102603")

    def test_rolled_back_allocation_is_not_an_issued_number(self):
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                first = allocate_manual_po_number(self.aditi, self.ocm, self.on)
                self.assertEqual(first, "AO102601")
                raise RuntimeError("create failed")
        self.assertEqual(allocate_manual_po_number(self.aditi, self.ocm, self.on), "AO102601")

    def test_import_keeps_its_number_and_digital_create_is_unchanged(self):
        imported = create_purchase_order_with_lines(
            user=self.admin,
            lines=[{
                "product": None,
                "product_description": "Imported grey",
                "quantity": Decimal("1.00"),
                "rate": Decimal("5.00"),
            }],
            po_number="ATW26R00092",
            entity=self.aditi,
            customer=self.customer,
            brand=self.ocm,
            po_date=self.on,
            order_type=PurchaseOrder.OrderType.MANUAL,
        )
        self.assertEqual(imported.po_number, "ATW26R00092")
        self.assertFalse(ManualPoNumberSequence.objects.exists())
        digital = self.client.post(
            "/api/purchase-orders/",
            {
                "po_number": "DIG-KEEP",
                "entity_id": self.aditi.id,
                "customer_id": self.customer.id,
                "brand_id": self.digital.id,
                "po_date": "2026-10-23",
                "lines": [{"product_id": self.product.id, "quantity": "1.00", "rate": "10.00"}],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(digital.status_code, 201, digital.content)
        self.assertEqual(digital.json()["po_number"], "DIG-KEEP")
        self.assertEqual(digital.json()["order_type"], "Digital")
        self.assertFalse(ManualPoNumberSequence.objects.exists())

    def test_blank_manual_number_is_assigned_by_the_server(self):
        created = self._manual(self.aditi, self.ocm, "")
        self.assertEqual(created.status_code, 201, created.content)
        today = timezone.localdate()
        self.assertEqual(created.json()["po_number"], f"AO{today.month:02d}{today.year % 100:02d}01")
        digital = self.client.post(
            "/api/purchase-orders/",
            {
                "po_number": "",
                "entity_id": self.aditi.id,
                "customer_id": self.customer.id,
                "brand_id": self.digital.id,
                "po_date": "2026-10-23",
                "lines": [{"product_id": self.product.id, "quantity": "1.00", "rate": "10.00"}],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(digital.status_code, 400, digital.content)
        self.assertIn("required", str(digital.json()["po_number"]).lower())

    def test_client_number_cannot_override_manual_create_or_edit(self):
        created = self._manual(self.aditi, self.ocm, "HACKED01")
        self.assertEqual(created.status_code, 201, created.content)
        body = created.json()
        today = timezone.localdate()
        expected = f"AO{today.month:02d}{today.year % 100:02d}01"
        self.assertEqual(body["po_number"], expected)
        self.assertNotEqual(body["po_number"], "HACKED01")
        edited = self.client.put(
            f"/api/purchase-orders/{body['id']}/",
            {
                "po_number": "CHANGED1",
                "entity_id": self.aditi.id,
                "customer_id": self.customer.id,
                "brand_id": self.ocm.id,
                "po_date": "2026-10-23",
                "lines": [{
                    "product_id": None,
                    "product_description": "Grey",
                    "quantity": "2.00",
                    "rate": "10.00",
                }],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(edited.status_code, 200, edited.content)
        self.assertEqual(edited.json()["po_number"], expected)

    def test_unmapped_brand_duplicate_posts_and_preview_do_not_reserve(self):
        stranger = _brand("ZZZ", "Other Mill")
        rejected = self._manual(self.aditi, stranger)
        self.assertEqual(rejected.status_code, 400, rejected.content)
        self.assertIn("not mapped", str(rejected.json()["brand_id"]))
        self.assertEqual(PurchaseOrder.objects.count(), 0)
        preview = self.client.get(
            "/api/purchase-orders/next-number/",
            {"entity_id": self.aditi.id, "brand_id": self.ocm.id},
            HTTP_HOST="localhost",
        )
        again = self.client.get(
            "/api/purchase-orders/next-number/",
            {"entity_id": self.aditi.id, "brand_id": self.ocm.id},
            HTTP_HOST="localhost",
        )
        self.assertEqual(preview.status_code, 200, preview.content)
        self.assertEqual(preview.json()["po_number"], again.json()["po_number"])
        self.assertFalse(ManualPoNumberSequence.objects.exists())
        first = self._manual(self.aditi, self.ocm, "ONE")
        second = self._manual(self.aditi, self.ocm, "ONE")
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 201, second.content)
        self.assertNotEqual(first.json()["po_number"], second.json()["po_number"])
        self.assertEqual(PurchaseOrder.objects.filter(po_number__iexact=first.json()["po_number"]).count(), 1)

    def test_database_unique_constraint_rejects_a_duplicate_number(self):
        PurchaseOrder.objects.create(
            po_number="AO102601",
            entity=self.aditi,
            customer=self.customer,
            brand=self.ocm,
            po_date=self.on,
            order_type=PurchaseOrder.OrderType.MANUAL,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PurchaseOrder.objects.create(
                    po_number="AO102601",
                    entity=self.aditi,
                    customer=self.customer,
                    brand=self.ocm,
                    po_date=self.on,
                    order_type=PurchaseOrder.OrderType.MANUAL,
                )

    def test_anonymous_cannot_preview_or_create(self):
        client = APIClient()
        preview = client.get(
            "/api/purchase-orders/next-number/",
            {"entity_id": self.aditi.id, "brand_id": self.ocm.id},
            HTTP_HOST="localhost",
        )
        created = client.post("/api/purchase-orders/", {}, format="json", HTTP_HOST="localhost")
        self.assertEqual(preview.status_code, 401)
        self.assertEqual(created.status_code, 401)

    def test_preview_rejects_digital_brand_and_exhausted_month(self):
        digital = self.client.get(
            "/api/purchase-orders/next-number/",
            {"entity_id": self.aditi.id, "brand_id": self.digital.id},
            HTTP_HOST="localhost",
        )
        self.assertEqual(digital.status_code, 400)
        self.assertIn("manual", str(digital.json()["brand_id"]).lower())
        ManualPoNumberSequence.objects.create(scope=f"AO{timezone.localdate().month:02d}{timezone.localdate().year % 100:02d}", last_value=99)
        exhausted = self.client.get(
            "/api/purchase-orders/next-number/",
            {"entity_id": self.aditi.id, "brand_id": self.ocm.id},
            HTTP_HOST="localhost",
        )
        self.assertEqual(exhausted.status_code, 400)
        self.assertIn("99", exhausted.json()["po_number"])


class ManualNumberConcurrencyTests(TransactionTestCase):
    def test_concurrent_allocations_are_unique_on_mariadb(self):
        aditi = _branch("ADT", "Aditi")
        ocm = _brand("OCM", "OSM India Limited")
        aditi.brands.add(ocm)
        numbers = []
        errors = []

        def work(_index):
            from django.db import OperationalError

            for _attempt in range(5):
                try:
                    connections.close_all()
                    with transaction.atomic():
                        number = allocate_manual_po_number(aditi, ocm, date(2026, 10, 23))
                    numbers.append(number)
                    return
                except OperationalError as exc:
                    if not (exc.args and exc.args[0] in (1205, 1213)):
                        errors.append(repr(exc))
                        return
                except Exception as exc:  # pragma: no cover - reported by the assertion
                    errors.append(repr(exc))
                    return
                finally:
                    connections.close_all()
            errors.append("lock retry exhausted")

        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(work, range(6)))
        self.assertEqual(errors, [])
        self.assertEqual(len(numbers), 6)
        self.assertEqual(len(set(numbers)), 6)
        self.assertEqual(sorted(numbers), [f"AO1026{value:02d}" for value in range(1, 7)])
        self.assertEqual(ManualPoNumberSequence.objects.get(scope="AO1026").last_value, 6)
        preview = preview_manual_po_number(aditi, ocm, date(2026, 10, 23))
        self.assertEqual(preview, "AO102607")
