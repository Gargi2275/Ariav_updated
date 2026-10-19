from datetime import date
from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from categories.models import Category
from entities.models import Entity
from customers.models import Customer
from dispatches.models import Dispatch, DispatchLine
from invoices.serializers import InvoiceSerializer
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine
from products.models import Product

from .models import PriceList, PriceListEntry
from .serializers import CurrentPriceSerializer
from .services import get_current_price


class PriceListCompatibilitySnapshotTests(TestCase):
    def setUp(self):
        self.maxDiff = None
        cache.clear()
        self.user = AuthUser.objects.create_user(
            username="price-compatibility-admin",
            password="password",
            role=AuthUser.Role.ADMIN,
        )
        self.brand = Brand.objects.create(
            brand_code="COMPAT",
            brand_name="Compatibility Brand",
            order_method="Digital PO",
        )
        parent = Category.objects.create(category_code="COMPAT-P", category_name="Fabric")
        category = Category.objects.create(
            category_code="COMPAT-C",
            category_name="Cotton",
            parent_category=parent,
        )
        self.product = Product.objects.create(
            product_code="COMPAT-001",
            product_name="Compatibility Product",
            brand=self.brand,
            category=category,
            rate=Decimal("40.00"),
        )
        self.branch = Entity.objects.create(
            short_code="COMPAT-BR",
            entity_name="Compatibility Branch",
            entity_type="Branch",
            status="Active",
        )
        self.branch.brands.add(self.brand)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def workbook(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Price List"
        sheet.append(
            [
                "Brand Code",
                "Product Code",
                "Product Name",
                "Taka Length (meters)",
                "Price Basis",
                "Price",
                "Taka Qty",
                "Season Label",
                "Valid From",
                "Valid To",
            ]
        )
        sheet.append(
            [
                "COMPAT",
                "COMPAT-001",
                "Compatibility Product",
                25,
                "Per Taka",
                1250,
                10,
                "Winter 2026",
                date(2026, 7, 1),
                date(2026, 12, 31),
            ]
        )
        sheet.append(
            [
                "MISSING",
                "UNKNOWN",
                "",
                25,
                "Per Taka",
                1250,
                10,
                "Winter 2026",
                date(2026, 7, 1),
                date(2026, 12, 31),
            ]
        )
        sheet.append(
            [
                "COMPAT",
                "COMPAT-001",
                "",
                25,
                "Per Yard",
                1250,
                10,
                "Winter 2026",
                date(2026, 7, 1),
                date(2026, 12, 31),
            ]
        )
        sheet.append(
            [
                "COMPAT",
                "COMPAT-001",
                "",
                25,
                "Per Taka",
                1250,
                10,
                "Summer 2026",
                date(2026, 1, 1),
                date(2026, 6, 30),
            ]
        )
        output = BytesIO()
        workbook.save(output)
        return output.getvalue()

    def test_legacy_import_preview_snapshot(self):
        response = self.client.post(
            "/api/price-lists/import/preview/",
            {
                "file": BytesIO(self.workbook()),
                "year": 2026,
                "season": "Winter",
                "branch_id": self.branch.id,
                "brand_id": self.brand.id,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        body.pop("preview_token", None)
        self.assertEqual(
            body,
            {
                "year": 2026,
                "season": "Winter",
                "season_label": "Winter 2026",
                "valid_from": "2026-07-01",
                "valid_to": "2026-12-31",
                "importable": [
                    {
                        "import_key": "compat||Winter 2026||2026-07-01||2026-12-31",
                        "brand_code": "COMPAT",
                        "season_label": "Winter 2026",
                        "valid_from": "2026-07-01",
                        "valid_to": "2026-12-31",
                        "brand_id": self.brand.id,
                        "brand_name": "Compatibility Brand",
                        "entries": [
                            {
                                "source_row": 2,
                                "product_code": "COMPAT-001",
                                "product_name": "Compatibility Product",
                                "product_id": self.product.id,
                                "taka_length_meters": "25",
                                "price_basis": "Per Taka",
                                "price_value": "1250",
                                "price_per_meter": "50.00",
                                "price_per_taka": "1250",
                                "taka_quantity": "10",
                                "status": "Active",
                            }
                        ],
                    }
                ],
                "excluded": [
                    {
                        "source_row": 3,
                        "brand_code": "MISSING",
                        "product_code": "UNKNOWN",
                        "reason": "Brand code MISSING not found",
                    },
                    {
                        "source_row": 4,
                        "brand_code": "COMPAT",
                        "product_code": "COMPAT-001",
                        "reason": "Invalid Price Basis 'Per Yard'. Expected Per Meter or Per Taka.",
                    },
                    {
                        "source_row": 5,
                        "brand_code": "COMPAT",
                        "product_code": "COMPAT-001",
                        "reason": "File says season Summer 2026, you selected Winter 2026",
                    },
                ],
                "warnings": [],
            },
        )

    def test_legacy_import_commit_snapshot(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Price List"
        sheet.append(
            [
                "Brand Code",
                "Product Code",
                "Product Name",
                "Taka Length (meters)",
                "Price Basis",
                "Price",
                "Taka Qty",
            ]
        )
        sheet.append(["COMPAT", "COMPAT-001", "Compatibility Product", 25, "Per Taka", 1250, 10])
        output = BytesIO()
        workbook.save(output)
        preview = self.client.post(
            "/api/price-lists/import/preview/",
            {
                "file": BytesIO(output.getvalue()),
                "year": 2026,
                "season": "Winter",
                "branch_id": self.branch.id,
                "brand_id": self.brand.id,
            },
            format="multipart",
        ).json()
        response = self.client.post(
            "/api/price-lists/import/commit/",
            {
                "preview_token": preview["preview_token"],
                "group_keys": [preview["importable"][0]["import_key"]],
                "year": 2026,
                "season": "Winter",
                "branch_id": self.branch.id,
                "brand_id": self.brand.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        body["created"][0]["id"] = 0
        self.assertEqual(
            body,
            {
                "created": [
                    {"id": 0, "season_label": "Winter 2026", "entry_count": 1}
                ],
                "created_count": 1,
                "entry_count": 1,
                "excluded_count": 0,
            },
        )

    def test_current_price_snapshot(self):
        price_list = PriceList.objects.create(
            brand=self.brand,
            season_label="Winter 2026",
            valid_from=date(2026, 7, 1),
            valid_to=date(2026, 12, 31),
            status=PriceList.Status.ACTIVE,
        )
        PriceListEntry.objects.create(
            price_list=price_list,
            product=self.product,
            taka_length_meters=Decimal("25"),
            price_basis=PriceListEntry.PriceBasis.PER_TAKA,
            price_value=Decimal("1250"),
        )
        entry = get_current_price(self.product.id, date(2026, 10, 14))
        self.assertEqual(
            CurrentPriceSerializer(
                entry,
                product=self.product,
                lookup_date=date(2026, 10, 14),
            ).data,
            {
                "product_id": self.product.id,
                "date": "2026-10-14",
                "price": "50.00",
                "price_per_meter": "50.00",
                "price_per_taka": "1250.00",
                "source": "Price List",
                "season_label": "Winter 2026",
                "price_list_id": price_list.id,
            },
        )

    def test_invoice_rate_fallback_snapshot(self):
        customer = Customer.objects.create(customer_code="COMPAT-CUST", customer_name="Compatibility Customer")
        purchase_order = PurchaseOrder.objects.create(
            po_number="COMPAT-PO",
            entity=self.branch,
            customer=customer,
            brand=self.brand,
            po_date=date(2026, 10, 1),
        )
        po_line = PurchaseOrderLine.objects.create(
            purchase_order=purchase_order,
            product=self.product,
            product_description=self.product.product_name,
            quantity=Decimal("10"),
            rate=None,
        )
        dispatch = Dispatch.objects.create(
            purchase_order=purchase_order,
            dispatch_date=date(2026, 10, 2),
            lr_number="COMPAT-LR",
            transporter="Compatibility Transport",
            challan_reference="COMPAT-CH",
        )
        DispatchLine.objects.create(dispatch=dispatch, purchase_order_line=po_line, dispatched_quantity=Decimal("10"))
        price_list = PriceList.objects.create(
            brand=self.brand,
            season_label="Winter 2026",
            valid_from=date(2026, 7, 1),
            valid_to=date(2026, 12, 31),
            status=PriceList.Status.ACTIVE,
        )
        PriceListEntry.objects.create(
            price_list=price_list,
            product=self.product,
            taka_length_meters=Decimal("25"),
            price_basis=PriceListEntry.PriceBasis.PER_TAKA,
            price_value=Decimal("1250"),
        )
        attrs = {
            "purchase_order": purchase_order,
            "invoice_date": date(2026, 10, 14),
            "lines": [{"purchase_order_line": po_line, "quantity": Decimal("2"), "rate": None}],
        }
        validated = InvoiceSerializer().validate(attrs)
        self.assertEqual(validated["lines"][0]["rate"], Decimal("50.00"))
