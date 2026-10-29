"""Ex-Mill is the only order price. Uses the isolated test database."""

import re
from datetime import date
from decimal import Decimal
from io import StringIO
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from price_lists.models import BrandQualityPrice, PriceList
from price_lists.order_price import PO_PRICE_TIER, quote_for_quality, resolve_invoice_rate
from products.models import Product
from purchase_orders.import_service import commit_import, store_preview
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine


def _quality(price_list, number, ex_mill, wholesale, retail, prefix="BOV"):
    return BrandQualityPrice.objects.create(
        price_list=price_list,
        sr_no=1,
        source_page=1,
        quality_code=f"{prefix}-1-2-101-{number}",
        quality_prefix=prefix,
        seg_a="1",
        seg_b="2",
        seg_c="101",
        quality_number=number,
        ex_mill=ex_mill,
        wholesale=wholesale,
        retail=retail,
    )


class ExMillLookupTests(TestCase):
    def setUp(self):
        self.brand = Brand.objects.create(
            brand_code="OCM",
            brand_name="OCM India Limited",
            order_method=Brand.OrderMethod.MANUAL_POR,
        )
        self.active = PriceList.objects.create(
            brand=self.brand,
            season_label="OCM Winter 2025",
            valid_from=date(2026, 4, 10),
            status=PriceList.Status.ACTIVE,
        )
        _quality(self.active, "0365132", Decimal("825.00"), Decimal("1081.00"), Decimal("1455.00"))

    def test_default_quote_is_ex_mill_and_does_not_fall_back(self):
        quote = quote_for_quality(self.brand.id, "BOV-0365132", date(2026, 10, 26))
        self.assertEqual(PO_PRICE_TIER, "ex_mill")
        self.assertEqual(quote["price"], Decimal("825.00"))
        self.assertEqual(quote["rate_source"], "Ex-mill, OCM Winter 2025, w.e.f 10.04.2026")

        blank = BrandQualityPrice.objects.get(quality_number="0365132")
        blank.ex_mill = None
        blank.save(update_fields=["ex_mill"])
        self.assertIsNone(quote_for_quality(self.brand.id, "BOV-0365132", date(2026, 10, 26)))

        blank.ex_mill = Decimal("825.00")
        blank.save(update_fields=["ex_mill"])
        self.active.status = PriceList.Status.DRAFT
        self.active.save(update_fields=["status"])
        self.assertIsNone(quote_for_quality(self.brand.id, "BOV-0365132", date(2026, 10, 26)))

    def test_draft_catalogue_still_lists_qualities_and_shades_without_a_price(self):
        self.active.status = PriceList.Status.DRAFT
        self.active.save(update_fields=["status"])
        row = BrandQualityPrice.objects.get(quality_number="0365132")
        row.shades_raw = "4, 6, 10"
        row.save(update_fields=["shades_raw"])
        user = AuthUser.objects.create_user(username="shade-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        client = APIClient()
        client.force_authenticate(user)
        response = client.get(
            "/api/purchase-orders/form-qualities/",
            {"brand_id": self.brand.id, "q": "BOV", "date": "2026-10-29"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200, response.content)
        chosen = next(item for item in response.json() if item["quality_label"] == "BOV-0365132")
        self.assertEqual(chosen["shades"], ["4", "6", "10"])
        self.assertIsNone(chosen["price"])
        self.assertEqual(chosen["price_reason"], "No Ex-mill price in an Active list")
        self.assertNotIn("wholesale", chosen)

    def test_missing_or_ambiguous_list_returns_none(self):
        self.assertIsNone(quote_for_quality(self.brand.id, "NO-SUCH-QUALITY", date(2026, 10, 26)))
        second = PriceList.objects.create(
            brand=self.brand,
            season_label="OCM Summer 2026",
            valid_from=date(2026, 1, 1),
            status=PriceList.Status.ACTIVE,
        )
        _quality(second, "0365132", Decimal("879.00"), Decimal("1151.00"), Decimal("1551.00"))
        self.assertIsNone(quote_for_quality(self.brand.id, "BOV-0365132", date(2026, 10, 26)))

    def test_config_endpoint_returns_the_tier(self):
        user = AuthUser.objects.create_user(username="price-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        client = APIClient()
        denied = client.get("/api/price-lists/order-price/", HTTP_HOST="localhost")
        self.assertIn(denied.status_code, (401, 403))
        client.force_authenticate(user)
        response = client.get(
            "/api/price-lists/order-price/",
            {"brand_id": self.brand.id, "quality": "BOV-0365132", "date": "2026-10-26"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["po_price_tier"], "ex_mill")
        self.assertEqual(response.json()["price"], "825.00")
        self.assertNotIn("wholesale", response.json())

    def test_invoice_prefill_uses_po_rate_then_ex_mill_then_blank(self):
        entity = Entity.objects.create(short_code="ADT", entity_name="Aditi", entity_type=Entity.EntityType.BRANCH)
        customer = Customer.objects.create(customer_code="P100", customer_name="Party")
        product = Product.objects.create(
            brand=self.brand,
            product_code="BOV-0365132",
            product_name="Bov",
            rate=Decimal("1.00"),
            frate=Decimal("1081.00"),
            trate=Decimal("1455.00"),
        )
        po = PurchaseOrder.objects.create(
            po_number="INV-BASIS",
            entity=entity,
            customer=customer,
            brand=self.brand,
            po_date=date(2026, 10, 26),
        )
        priced = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=product,
            product_description="BOV-0365132",
            quantity=Decimal("1.00"),
            rate=Decimal("900.00"),
        )
        open_line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=product,
            product_description="BOV-0365132",
            quantity=Decimal("1.00"),
            rate=None,
        )
        self.assertEqual(resolve_invoice_rate(priced, date(2026, 10, 26), None), Decimal("900.00"))
        self.assertEqual(resolve_invoice_rate(priced, date(2026, 10, 26), Decimal("50.00")), Decimal("50.00"))
        self.assertEqual(resolve_invoice_rate(open_line, date(2026, 10, 26), None), Decimal("825.00"))
        open_line.product_description = "MISSING"
        open_line.product = None
        self.assertIsNone(resolve_invoice_rate(open_line, date(2026, 10, 26), None))
        self.assertNotEqual(resolve_invoice_rate(PurchaseOrderLine.objects.get(pk=open_line.pk), date(2026, 10, 26), None), Decimal("1081.00"))

    def test_import_without_a_tier_selector_fills_ex_mill_and_rate_source(self):
        user = AuthUser.objects.create_user(username="imp-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        entity = Entity.objects.create(short_code="ADT", entity_name="Aditi", entity_type=Entity.EntityType.BRANCH)
        entity.brands.add(self.brand)
        customer = Customer.objects.create(customer_code="700001", customer_name="Party")
        CustomerEntity.objects.create(customer=customer, entity=entity, primary_entity=True)
        token = store_preview(user.id, {
            "entity_id": entity.id,
            "brand_id": self.brand.id,
            "format_id": "test",
            "importable": [{
                "order_no": "PO-EX-1",
                "customer_code": "700001",
                "po_date": date(2026, 10, 26),
                "remarks": "",
                "extra_data": {},
                "lines": [{
                    "description": "BOV-0365132",
                    "quantity": "2.00",
                    "rate": "1081.00",
                    "expected_delivery_period": "",
                    "customer_delivery_date": None,
                    "extra_data": {},
                }],
            }],
            "unmatched_rows": {},
            "excluded": [],
        })
        result = commit_import(
            user=user,
            token=token,
            entity_id=entity.id,
            brand_id=self.brand.id,
            order_nos=["PO-EX-1"],
            decisions={},
        )
        self.assertEqual(result["created_count"], 1)
        line = PurchaseOrderLine.objects.get(purchase_order__po_number="PO-EX-1")
        self.assertEqual(line.rate, Decimal("825.00"))
        self.assertEqual(line.rate_source, "Ex-mill, OCM Winter 2025, w.e.f 10.04.2026")

    def test_po_entry_sources_do_not_name_wholesale_or_retail(self):
        root = Path(settings.BASE_DIR).parent
        names = [
            "frontend/src/screens/core/OrderFormView.tsx",
            "frontend/src/screens/core/PurchaseOrderLineItems.tsx",
            "frontend/src/screens/core/PurchaseOrderImportModal.tsx",
            "frontend/src/screens/core/PurchaseOrderScreen.tsx",
            "frontend/src/services/orderForm.ts",
        ]
        pattern = re.compile(r"\b(?:Wholesale|Retail)\b")
        for name in names:
            text = (root / name).read_text(encoding="utf-8")
            self.assertIsNone(pattern.search(text), name)

    def test_check_command_flags_a_wholesale_rate_and_changes_nothing(self):
        entity = Entity.objects.create(short_code="ADT", entity_name="Aditi", entity_type=Entity.EntityType.BRANCH)
        customer = Customer.objects.create(customer_code="P200", customer_name="Party")
        po = PurchaseOrder.objects.create(
            po_number="WS-FLAG",
            entity=entity,
            customer=customer,
            brand=self.brand,
            po_date=date(2026, 10, 26),
            status=PurchaseOrder.Status.SUBMITTED,
        )
        line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product_description="BOV-0365132",
            quantity=Decimal("1.00"),
            rate=Decimal("1081.00"),
            shade="4",
        )
        before = list(PurchaseOrderLine.objects.values_list("id", "rate"))
        output = StringIO()
        call_command("check_po_price_basis", stdout=output)
        text = output.getvalue()
        self.assertIn("WS-FLAG", text)
        self.assertIn("wholesale", text)
        self.assertIn("Lines whose rate equals Wholesale or Retail but not Ex-Mill: 1", text)
        line.refresh_from_db()
        self.assertEqual(line.rate, Decimal("1081.00"))
        self.assertEqual(before, list(PurchaseOrderLine.objects.values_list("id", "rate")))
