"""Official OCM order review and the dispatch link that follows approval."""

import struct
import zipfile
from datetime import date
from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import AuthUser
from brands.models import Brand
from customers.models import Customer, CustomerEntity
from dispatches.import_service import _po_by_number, evaluate_group
from dispatches.models import Dispatch, DispatchLine, OcmDispatchSource
from entities.models import Entity
from products.models import Product
from purchase_orders.models import OfficialOcmImport, OfficialOcmOrder, PurchaseOrder, PurchaseOrderLine


def _sheet(rows):
    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


HEADERS = [
    "Customer Code", "Customer Name", "Order No", "Season",
    "Code1", "Code2", "Code3", "Code4", "Code5", "Code6",
    "Template", "Size", "Ord.Qty", "Disp. Qty", "Packed Qty",
    "Aloc Qty", "Pending Order Qty", "Dwlivery Start", "Delivery End",
]
# The Order Status export spells these two headings this way, including the spaces.
OCM_HEADERS = [
    "Agent Code", "Customer Code", "Customer Name", "Order No", "Season",
    "Code1", "Code2", "Code3", "Code4", "Code5", "Code6",
    "Template", "Size", "Ord.Qty", "Disp. Qty", " Packed Qty",
    "Aloc Qty", "Pending Order Qty", "Dwlivery  Start", "Delivery End",
]


def _excel_serial(value: date) -> int:
    return (value - date(1899, 12, 30)).days


def _biff_record(record_id: int, payload: bytes = b"") -> bytes:
    if record_id < 0x80:
        ident = bytes([record_id])
    else:
        low = record_id & 0xFF
        high = (record_id >> 8) & 0xFF
        if not (low & 0x80) or high & 0x80:
            raise ValueError(hex(record_id))
        ident = bytes([low, high])
    if len(payload) < 0x80:
        length = bytes([len(payload)])
    else:
        length = bytes([(len(payload) & 0x7F) | 0x80, len(payload) >> 7])
    return ident + length + payload


def _biff_string(text: str) -> bytes:
    return struct.pack("<I", len(text)) + text.encode("utf-16-le")


def _xlsb_sheet(rows, strings: dict[str, int]) -> bytes:
    def intern(text: str) -> int:
        if text not in strings:
            strings[text] = len(strings)
        return strings[text]

    last_row = max(len(rows) - 1, 0)
    last_col = max((len(row) - 1 for row in rows), default=0)
    parts = [
        _biff_record(0x0181),
        _biff_record(0x0194, struct.pack("<IIII", 0, last_row, 0, last_col)),
        _biff_record(0x0191),
    ]
    for row_index, row in enumerate(rows):
        parts.append(_biff_record(0x0000, struct.pack("<I", row_index)))
        for column, value in enumerate(row):
            if value is None or value == "":
                continue
            if isinstance(value, str):
                parts.append(_biff_record(0x0007, struct.pack("<III", column, 0, intern(value))))
            elif isinstance(value, float) and not value.is_integer():
                parts.append(_biff_record(0x0005, struct.pack("<II", column, 0) + struct.pack("<d", value)))
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                number = int(value)
                parts.append(_biff_record(0x0002, struct.pack("<IIi", column, 0, (number << 2) | 0x02)))
            else:
                parts.append(_biff_record(0x0007, struct.pack("<III", column, 0, intern(str(value)))))
    parts.append(_biff_record(0x0192))
    parts.append(_biff_record(0x0182))
    return b"".join(parts)


def _xlsb(sheets: list[tuple[str, list]]) -> bytes:
    """A small real BIFF12 workbook, the same package shape Excel uses for .xlsb."""
    strings: dict[str, int] = {}
    sheet_bins = [_xlsb_sheet(rows, strings) for _name, rows in sheets]
    shared = [_biff_record(0x019F, struct.pack("<II", len(strings), len(strings)))]
    for text, _index in sorted(strings.items(), key=lambda item: item[1]):
        shared.append(_biff_record(0x0013, b"\x00" + _biff_string(text)))
    shared.append(_biff_record(0x01A0))
    workbook = [_biff_record(0x0183), _biff_record(0x018F)]
    relationships = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ]
    for index, (name, _rows) in enumerate(sheets, start=1):
        workbook.append(_biff_record(
            0x019C,
            b"\x00\x00\x00\x00" + struct.pack("<I", index) + _biff_string(f"rId{index}") + _biff_string(name),
        ))
        relationships.append(
            f'<Relationship Id="rId{index}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{index}.bin"/>'
        )
    workbook.extend([_biff_record(0x0190), _biff_record(0x0184)])
    relationships.append("</Relationships>")
    root = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.bin"/>
</Relationships>"""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        archive.writestr("_rels/.rels", root)
        archive.writestr("xl/workbook.bin", b"".join(workbook))
        archive.writestr("xl/_rels/workbook.bin.rels", "".join(relationships))
        archive.writestr("xl/sharedStrings.bin", b"".join(shared))
        for index, sheet in enumerate(sheet_bins, start=1):
            archive.writestr(f"xl/worksheets/sheet{index}.bin", sheet)
    return buffer.getvalue()


class OfficialOcmTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(username="ocm-admin", password="pass12345", role=AuthUser.Role.ADMIN)
        self.staff = AuthUser.objects.create_user(
            username="ocm-staff", password="pass12345", role=AuthUser.Role.STAFF, can_edit=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.branch = Entity.objects.create(
            short_code="ADT", entity_name="Aditi", entity_type=Entity.EntityType.BRANCH, city="Ahmedabad",
        )
        self.ocm = Brand.objects.create(
            brand_code="OCM", brand_name="OSM India Limited", order_method=Brand.OrderMethod.MANUAL_POR,
        )
        self.donear = Brand.objects.create(
            brand_code="DON", brand_name="Donear", order_method=Brand.OrderMethod.MANUAL_POR,
        )
        self.branch.brands.add(self.ocm, self.donear)
        self.customer = Customer.objects.create(customer_code="790731", customer_name="OCM Party")
        CustomerEntity.objects.create(customer=self.customer, entity=self.branch, primary_entity=True)
        self.other = Customer.objects.create(customer_code="111111", customer_name="Other Party")
        CustomerEntity.objects.create(customer=self.other, entity=self.branch, primary_entity=False)
        self.product = Product.objects.create(
            product_code="OCM-1", product_name="OCM Cloth", brand=self.ocm, rate=Decimal("10.00"), unit=Product.Unit.METER,
        )

    def _po(self, number="AO102601", brand=None, customer=None, description="C1-C5-C6-TMP-SZ", quantity="10.00", shade="1"):
        po = PurchaseOrder.objects.create(
            po_number=number,
            entity=self.branch,
            customer=customer or self.customer,
            brand=brand or self.ocm,
            po_date=date(2026, 10, 26),
            status=PurchaseOrder.Status.BRAND_ACCEPTED,
            order_type=PurchaseOrder.OrderType.MANUAL,
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=self.product,
            product_description=description,
            quantity=Decimal(quantity),
            shade=shade,
            size="SZ",
            delivery_from=date(2026, 11, 1),
            delivery_to=date(2026, 11, 30),
        )
        return po

    def _file(self, order_no="OCM-100", customer="790731", qty=10, extra_row=None, code1="C1", delivery_end="2026-11-30"):
        row = [customer, "OCM Party", order_no, "W26", code1, "C2", "C3", "C4", "C5", "C6", "TMP", "SZ", qty, 1, 0, 0, 9, "2026-11-01", delivery_end]
        rows = [HEADERS, row]
        if extra_row:
            rows.append(extra_row)
        return _sheet(rows)

    def _import(self, content, name="official.xlsx", client=None):
        upload = SimpleUploadedFile(name, content, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        return (client or self.client).post("/api/purchase-orders/ocm-official/", {"file": upload}, format="multipart", HTTP_HOST="localhost")

    def test_import_is_ocm_only_and_stores_the_official_number_separately(self):
        donear = self._po(number="DON-1", brand=self.donear, description="OTHER")
        response = self._import(self._file())
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["orders"][0]["order_number"], "OCM-100")
        donear.refresh_from_db()
        self.assertIsNone(donear.brand_order_code)
        self.assertEqual(OfficialOcmOrder.objects.get().brand, self.ocm)
        self.assertNotEqual(donear.po_number, "OCM-100")

    def test_valid_import_keeps_quantity_buckets_separate(self):
        response = self._import(self._file())
        line = OfficialOcmOrder.objects.get().lines.get()
        self.assertEqual(line.ordered_qty, Decimal("10.00"))
        self.assertEqual(line.dispatched_qty, Decimal("1.00"))
        self.assertEqual(line.pending_qty, Decimal("9.00"))

    def test_missing_required_column_is_rejected(self):
        response = self._import(_sheet([["Customer Code", "Order No"], ["790731", "OCM-100"]]))
        self.assertEqual(response.status_code, 400)
        self.assertIn("Ord.Qty", str(response.json()))

    def test_xlsx_header_below_titles_reads_excel_serial_dates(self):
        start = date(2026, 11, 1)
        end = date(2026, 11, 30)
        row = ["790731", "OCM Party", "OCM-XLSX", "W26", "C1", "C2", "C3", "C4", "C5", "006", "TMP", "SZ", 10, 1, 0, 0, 9, _excel_serial(start), _excel_serial(end)]
        content = _sheet([
            ["OCM PRIVATE LIMITED,AMRITSAR"],
            ["Order Status"],
            ["As On"],
            [],
            [],
            HEADERS,
            row,
        ])
        response = self._import(content)
        self.assertEqual(response.status_code, 201, response.content)
        line = OfficialOcmOrder.objects.get(order_number="OCM-XLSX").lines.get()
        self.assertEqual(line.code6, "006")
        self.assertEqual(line.delivery_start, start)
        self.assertEqual(line.delivery_end, end)
        self.assertEqual(line.ordered_qty, Decimal("10.00"))
        self.assertNotEqual(OfficialOcmOrder.objects.get().status, "Approved")

    def _xlsb_file(self, order_no="XLSB-100", customer="790731", qty=10, code1="NEO-CM", extra=None):
        start = date(2026, 11, 1)
        end = date(2026, 11, 30)
        row = [
            "AT", customer, "OCM Party", order_no, "REGW26",
            code1, "A-1", "2", "101", "0365132", "004",
            "P01", "CF4", qty, 1, 0, 0, 9,
            _excel_serial(start), _excel_serial(end),
        ]
        rows = [
            ["OCM PRIVATE LIMITED,AMRITSAR"],
            ["Order Status"],
            ["As On", None, None, None, None, 46387],
            [],
            [],
            OCM_HEADERS,
            row,
        ]
        if extra:
            rows.append(extra)
        return _xlsb([("Cover", [["Cover page"]]), ("OrderStatusSales", rows)])

    def test_xlsb_import_reads_the_order_sheet_below_the_title_rows(self):
        products = Product.objects.count()
        po = self._po(description="NEO-CM-0365132-004-P01-CF4", quantity="10.00")
        po.lines.update(size="CF4", delivery_from=date(2026, 11, 1), delivery_to=date(2026, 11, 30))
        response = self._import(self._xlsb_file(), name="status.xlsb")
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertFalse(body["duplicate_file"])
        self.assertEqual(body["orders"][0]["order_number"], "XLSB-100")
        self.assertNotEqual(body["orders"][0]["status"], "Approved")
        order = OfficialOcmOrder.objects.get(order_number="XLSB-100")
        line = order.lines.get()
        self.assertEqual(line.code1, "NEO-CM")
        self.assertEqual(line.code2, "A-1")
        self.assertEqual(line.code5, "0365132")
        self.assertEqual(line.code6, "004")
        self.assertEqual(line.ordered_qty, Decimal("10.00"))
        self.assertEqual(line.dispatched_qty, Decimal("1.00"))
        self.assertEqual(line.pending_qty, Decimal("9.00"))
        self.assertEqual(line.delivery_start, date(2026, 11, 1))
        self.assertEqual(line.delivery_end, date(2026, 11, 30))
        self.assertEqual(line.row_number, 7)
        self.assertEqual(Product.objects.count(), products)
        po.refresh_from_db()
        self.assertEqual(po.po_number, "AO102601")
        self.assertFalse(po.brand_order_code)
        detail = self.client.get(f"/api/purchase-orders/ocm-official/{order.id}/", HTTP_HOST="localhost").json()
        self.assertEqual(detail["lines"][0]["status"], "Exact Match")

    def test_xlsb_missing_required_column_is_rejected(self):
        headers = [name for name in OCM_HEADERS if name not in {"Ord.Qty", "Code1"}]
        content = _xlsb([("OrderStatusSales", [headers, ["790731", "OCM Party", "XLSB-100"]])])
        response = self._import(content, name="missing.xlsb")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Ord.Qty", str(response.json()))
        self.assertIn("Code1", str(response.json()))
        self.assertEqual(OfficialOcmOrder.objects.count(), 0)

    def test_corrupt_renamed_and_legacy_workbooks_are_rejected(self):
        xlsx = self._file()
        xlsb = self._xlsb_file()
        cases = [
            ("status.xlsb", b"not-an-xlsb", "not an Excel workbook"),
            ("status.xlsb", b"PK\x03\x04not-a-zip", "not a readable Excel workbook"),
            ("status.xlsx", b"\xd0\xcf\x11\xe0" + b"\x00" * 32, "legacy Excel"),
            ("status.xlsb", b"\xd0\xcf\x11\xe0" + b"\x00" * 32, "legacy Excel"),
            ("renamed.xlsb", xlsx, ".xlsx workbook with an .xlsb name"),
            ("renamed.xlsx", xlsb, ".xlsb workbook with an .xlsx name"),
            ("notes.txt", xlsx, ".xlsx or .xlsb"),
        ]
        for name, content, expected in cases:
            response = self._import(content, name=name)
            self.assertEqual(response.status_code, 400, name)
            self.assertIn(expected, str(response.json()))
        empty = BytesIO()
        with zipfile.ZipFile(empty, "w") as archive:
            archive.writestr("xl/workbook.bin", b"\x00\x00")
            archive.writestr("xl/_rels/workbook.bin.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>")
        broken = self._import(empty.getvalue(), name="broken.xlsb")
        self.assertEqual(broken.status_code, 400)
        self.assertTrue(
            "worksheet" in str(broken.json()).lower() or "spreadsheet" in str(broken.json()).lower(),
            broken.content,
        )
        oversized = self._import(b"PK" + b"0" * (5 * 1024 * 1024), name="big.xlsx")
        self.assertEqual(oversized.status_code, 400)
        self.assertIn("5 MB", str(oversized.json()))
        self.assertEqual(OfficialOcmOrder.objects.count(), 0)

    def test_xlsb_duplicate_file_and_duplicate_order_number(self):
        content = self._xlsb_file()
        self.assertEqual(self._import(content, name="status.xlsb").status_code, 201)
        again = self._import(content, name="status-copy.xlsb")
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.json()["duplicate_file"])
        self.assertEqual(OfficialOcmOrder.objects.count(), 1)
        other = self._xlsb_file(qty=12)
        reported = self._import(other, name="other.xlsb")
        self.assertEqual(reported.status_code, 201, reported.content)
        self.assertIn("already imported", reported.json()["row_errors"][0]["reason"])
        self.assertEqual(OfficialOcmOrder.objects.count(), 1)
        self.assertEqual(OfficialOcmOrder.objects.get().lines.get().ordered_qty, Decimal("10.00"))

    def test_xlsb_unknown_customer_and_unmatched_identity_do_not_create_products(self):
        products = Product.objects.count()
        unknown = self._import(self._xlsb_file(customer="MISSING", order_no="XLSB-MISS"), name="missing-party.xlsb")
        self.assertEqual(unknown.status_code, 201, unknown.content)
        self.assertEqual(unknown.json()["orders"][0]["status"], "Needs Review")
        self.assertIsNone(OfficialOcmOrder.objects.get(order_number="XLSB-MISS").customer_id)
        duplicate_row = [
            "AT", "790731", "OCM Party", "XLSB-DUP", "REGW26",
            "NEO-CM", "A-1", "2", "101", "0365132", "004",
            "P01", "CF4", 4, 0, 0, 0, 4,
            _excel_serial(date(2026, 11, 1)), _excel_serial(date(2026, 11, 30)),
        ]
        duplicated = self._import(
            self._xlsb_file(order_no="XLSB-DUP", extra=duplicate_row),
            name="duplicate-line.xlsb",
        )
        self.assertEqual(duplicated.status_code, 201, duplicated.content)
        lines = OfficialOcmOrder.objects.get(order_number="XLSB-DUP").lines.all()
        self.assertEqual(lines.count(), 2)
        self.assertTrue(all(line.duplicate for line in lines))
        self.assertEqual(duplicated.json()["orders"][0]["status"], "Needs Review")
        self.assertEqual(Product.objects.count(), products)

    def test_xlsb_approval_and_dispatch_keep_the_internal_number(self):
        po = self._po(description="NEO-CM-0365132-004-P01-CF4", quantity="10.00")
        po.lines.update(size="CF4", delivery_from=date(2026, 11, 1), delivery_to=date(2026, 11, 30))
        imported = self._import(self._xlsb_file(), name="status.xlsb")
        order_id = imported.json()["orders"][0]["id"]
        anonymous = APIClient()
        denied = anonymous.post("/api/purchase-orders/ocm-official/", {"file": SimpleUploadedFile("status.xlsb", self._xlsb_file(order_no="NOPE"))}, format="multipart", HTTP_HOST="localhost")
        self.assertIn(denied.status_code, (401, 403))
        staff = APIClient()
        staff.force_authenticate(self.staff)
        blocked = staff.post(
            f"/api/purchase-orders/ocm-official/{order_id}/approve/",
            {"reason": "no"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blocked.status_code, 403)
        group = {
            "group_key": "XLSB-100||INV-9",
            "order_code": "XLSB-100",
            "invoice_no": "INV-9",
            "customer_codes": ["790731"],
            "customer_name": "OCM Party",
            "transporter": "Road",
            "lr_number": "LR9",
            "lr_date": date(2026, 11, 2),
            "invoice_date": date(2026, 11, 2),
            "source_rows": [2],
            "lines": [{
                "description": "NEO-CM-0365132-004-P01-CF4",
                "product_code": "",
                "code1": "NEO-CM",
                "client_item_key": "NEO-CM-0365132-004-P01-CF4",
                "shade": "004",
                "quantity": "4.00",
                "invoice_line_no": "1",
                "excel_row": 2,
            }],
        }
        _waiting, excluded = evaluate_group(group, _po_by_number(self.admin), self.admin)
        self.assertIn("not approved", excluded["reason"])
        approved = self.client.post(
            f"/api/purchase-orders/ocm-official/{order_id}/approve/",
            {"reason": "checked"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(approved.status_code, 200, approved.content)
        po.refresh_from_db()
        self.assertEqual(po.po_number, "AO102601")
        self.assertEqual(po.brand_order_code, "XLSB-100")
        self.assertEqual(po.lines.get().quantity, Decimal("10.00"))
        matched, excluded = evaluate_group(group, _po_by_number(self.admin), self.admin)
        self.assertIsNone(excluded)
        self.assertEqual(matched["po_number"], "AO102601")

    def test_same_file_twice_does_not_duplicate(self):
        content = self._file()
        self.assertEqual(self._import(content).status_code, 201)
        again = self._import(content)
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.json()["duplicate_file"])
        self.assertEqual(OfficialOcmOrder.objects.count(), 1)

    def test_duplicate_official_order_number_is_reported(self):
        self._import(self._file())
        again = self._import(self._file(qty=12))
        self.assertEqual(again.status_code, 201)
        self.assertIn("already imported", again.json()["row_errors"][0]["reason"])
        self.assertEqual(OfficialOcmOrder.objects.count(), 1)

    def test_unknown_customer_needs_review(self):
        response = self._import(self._file(customer="MISSING"))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["orders"][0]["status"], "Needs Review")

    def test_exact_identity_match(self):
        po = self._po()
        imported = self._import(self._file())
        detail = self.client.get(f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/", HTTP_HOST="localhost")
        self.assertEqual(detail.json()["lines"][0]["status"], "Exact Match")
        self.assertEqual(detail.json()["internal_po_number"], po.po_number)

    def test_ambiguous_internal_lines_need_review(self):
        po = self._po()
        PurchaseOrderLine.objects.create(
            purchase_order=po, product=self.product, product_description="C1-C5-C6-TMP-SZ",
            quantity=Decimal("10.00"), shade="1", size="SZ",
        )
        imported = self._import(self._file())
        detail = self.client.get(f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/", HTTP_HOST="localhost")
        self.assertEqual(detail.json()["lines"][0]["status"], "Needs Review")
        blocked = self.client.post(
            f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/approve/",
            {"reason": "accept"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blocked.status_code, 400)

    def test_missing_and_extra_lines_and_quantity_date_differences(self):
        po = self._po(quantity="8.00")
        PurchaseOrderLine.objects.create(
            purchase_order=po, product=self.product, product_description="ONLY-INTERNAL",
            quantity=Decimal("2.00"), shade="9",
        )
        content = self._file(qty=10, delivery_end="2026-12-31", extra_row=[
            "790731", "OCM Party", "OCM-100", "W26", "X1", "C2", "C3", "C4", "C5", "C6", "TMP", "SZ", 3, 0, 0, 0, 3, "2026-12-01", "2026-12-15",
        ])
        imported = self._import(content)
        detail = self.client.get(f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/", HTTP_HOST="localhost").json()
        statuses = {line["status"] for line in detail["lines"]}
        reasons = " ".join(line["reason"] for line in detail["lines"])
        self.assertIn("Quantity Difference", statuses)
        self.assertIn("Delivery end differs", reasons)
        self.assertIn("Missing in Official Order", statuses)
        mapped = self.client.post(
            f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/mapping/",
            {"line_id": OfficialOcmOrder.objects.get().lines.get(code1="X1").id, "quality_label": "NO-SUCH", "shade": "1", "reason": "checked"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(mapped.status_code, 200)
        extra = [line for line in mapped.json()["lines"] if line["ocm_identity"].startswith("X1")]
        self.assertEqual(extra[0]["status"], "Extra Official Line")

    def test_approval_preserves_internal_number_and_stores_official_number(self):
        po = self._po()
        imported = self._import(self._file())
        order_id = imported.json()["orders"][0]["id"]
        response = self.client.post(f"/api/purchase-orders/ocm-official/{order_id}/approve/", {"reason": ""}, format="json", HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 200, response.content)
        po.refresh_from_db()
        self.assertEqual(po.po_number, "AO102601")
        self.assertEqual(po.brand_order_code, "OCM-100")
        self.assertEqual(po.lines.get().quantity, Decimal("10.00"))
        self.assertEqual(OfficialOcmOrder.objects.get().status, "Approved")

    def test_staff_without_edit_cannot_approve(self):
        self._po()
        imported = self._import(self._file())
        staff = APIClient()
        staff.force_authenticate(self.staff)
        response = staff.post(
            f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/approve/",
            {"reason": "no"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(PurchaseOrder.objects.get().brand_order_code)

    def test_dispatch_uses_approved_official_number_and_rejects_a_duplicate_invoice_line(self):
        po = self._po()
        imported = self._import(self._file())
        self.client.post(
            f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/approve/",
            {"reason": ""},
            format="json",
            HTTP_HOST="localhost",
        )
        group = {
            "group_key": "OCM-100||INV-1",
            "order_code": "OCM-100",
            "invoice_no": "INV-1",
            "customer_codes": ["790731"],
            "customer_name": "OCM Party",
            "transporter": "Road",
            "lr_number": "LR1",
            "lr_date": date(2026, 11, 2),
            "invoice_date": date(2026, 11, 2),
            "source_rows": [2],
            "lines": [{
                "description": "C1-C5-C6-TMP-SZ",
                "product_code": "",
                "code1": "C1",
                "client_item_key": "C1-C5-C6-TMP-SZ",
                "shade": "C6",
                "quantity": "4.00",
                "invoice_line_no": "7",
                "excel_row": 2,
            }],
        }
        importable, excluded = evaluate_group(group, _po_by_number(self.admin), self.admin)
        self.assertIsNone(excluded)
        self.assertEqual(importable["po_number"], po.po_number)
        self.assertEqual(importable["closing_pending_quantity"], "6.00")
        dispatch = Dispatch.objects.create(
            purchase_order=po, lr_number="LR1", transporter="Road", challan_reference="OTHER-INV",
        )
        line = DispatchLine.objects.create(
            dispatch=dispatch, purchase_order_line=po.lines.get(), dispatched_quantity=Decimal("4.00"),
        )
        OcmDispatchSource.objects.create(invoice_no="INV-1", invoice_line="7", dispatch_line=line)
        _again, duplicate = evaluate_group(group, _po_by_number(self.admin), self.admin)
        self.assertIn("Duplicate dispatch", duplicate["reason"])

    def test_dispatch_product_mismatch_is_not_attached_by_similarity(self):
        po = self._po()
        imported = self._import(self._file())
        self.client.post(
            f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/approve/",
            {},
            format="json",
            HTTP_HOST="localhost",
        )
        group = {
            "group_key": "OCM-100||INV-2",
            "order_code": "OCM-100",
            "invoice_no": "INV-2",
            "customer_codes": ["790731"],
            "customer_name": "Similar Name",
            "transporter": "Road",
            "lr_number": "LR2",
            "lr_date": date(2026, 11, 2),
            "invoice_date": date(2026, 11, 2),
            "source_rows": [2],
            "lines": [{
                "description": "NOT-THE-PRODUCT",
                "product_code": "ZZZ",
                "code1": "ZZZ",
                "client_item_key": "NOT-THE-PRODUCT",
                "shade": "",
                "quantity": "1.00",
                "invoice_line_no": "1",
                "excel_row": 2,
            }],
        }
        _importable, excluded = evaluate_group(group, _po_by_number(self.admin), self.admin)
        self.assertIn("No matching PO line", excluded["reason"])
        self.assertEqual(po.dispatches.count(), 0)

    def test_unapproved_official_order_blocks_dispatch_fallback(self):
        self._po(description="C1-C5-C6-TMP-SZ")
        self._import(self._file())
        group = {
            "group_key": "OCM-100||INV-3",
            "order_code": "OCM-100",
            "invoice_no": "INV-3",
            "customer_codes": ["790731"],
            "customer_name": "OCM Party",
            "transporter": "Road",
            "lr_number": "LR3",
            "lr_date": date(2026, 11, 2),
            "invoice_date": date(2026, 11, 2),
            "source_rows": [2],
            "lines": [{
                "description": "C1-C5-C6-TMP-SZ",
                "product_code": "",
                "code1": "C1",
                "client_item_key": "C1-C5-C6-TMP-SZ",
                "shade": "C6",
                "quantity": "1.00",
                "invoice_line_no": "1",
                "excel_row": 2,
            }],
        }
        _importable, excluded = evaluate_group(group, _po_by_number(self.admin), self.admin)
        self.assertIn("not approved", excluded["reason"])

    def test_customer_conflict_cannot_select_another_party(self):
        self._po(number="OTHER-PO", customer=self.other)
        imported = self._import(self._file())
        order_id = imported.json()["orders"][0]["id"]
        response = self.client.post(
            f"/api/purchase-orders/ocm-official/{order_id}/select/",
            {"purchase_order_id": PurchaseOrder.objects.get().id},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 400)

    def test_unique_code_shade_and_size_match_automatically(self):
        po = self._po(description="C1-C5", shade="C2")
        imported = self._import(self._file())
        detail = self.client.get(
            f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/",
            HTTP_HOST="localhost",
        ).json()
        self.assertEqual(detail["lines"][0]["status"], "Exact Match")
        self.assertIn("automatically", detail["lines"][0]["reason"])
        self.assertEqual(detail["internal_po_number"], po.po_number)
        self.assertEqual(detail["blockers"], [])
        self.assertEqual(po.po_number, "AO102601")

    def test_repeated_code_shade_and_size_are_not_selected_automatically(self):
        po = self._po(description="C1-C5", shade="C2")
        extra = ["790731", "OCM Party", "OCM-100", "W26", "C1", "C2", "C3", "C4", "C5", "OTHER", "TMP", "SZ", 4, 0, 0, 0, 4, "2026-11-01", "2026-11-30"]
        imported = self._import(self._file(extra_row=extra))
        detail = self.client.get(
            f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/",
            HTTP_HOST="localhost",
        ).json()
        official_statuses = [line["status"] for line in detail["lines"] if line["official_line_id"]]
        self.assertEqual(official_statuses, ["Needs Review", "Needs Review"])
        self.assertTrue(detail["blockers"])
        blocked = self.client.post(
            f"/api/purchase-orders/ocm-official/{imported.json()['orders'][0]['id']}/approve/",
            {"reason": "test"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(blocked.status_code, 400)
        po.refresh_from_db()
        self.assertEqual(po.po_number, "AO102601")
        self.assertFalse(po.brand_order_code)

    def test_delete_removes_the_official_order_and_keeps_the_internal_po(self):
        po = self._po()
        first = self._import(self._file())
        second = self._import(self._file(order_no="OCM-101", qty=4))
        kept_id = second.json()["orders"][0]["id"]
        removed_id = first.json()["orders"][0]["id"]
        response = self.client.delete(f"/api/purchase-orders/ocm-official/{removed_id}/", HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["deleted"][0]["order_number"], "OCM-100")
        self.assertFalse(OfficialOcmOrder.objects.filter(pk=removed_id).exists())
        self.assertTrue(OfficialOcmOrder.objects.filter(pk=kept_id).exists())
        self.assertEqual(OfficialOcmImport.objects.count(), 1)
        po.refresh_from_db()
        self.assertEqual(po.po_number, "AO102601")
        self.assertFalse(po.brand_order_code)
        again = self._import(self._file())
        self.assertEqual(again.status_code, 201, again.content)
        cleared = self.client.delete(f"/api/purchase-orders/ocm-official/{kept_id}/", HTTP_HOST="localhost")
        self.assertEqual(cleared.status_code, 200, cleared.content)
        self.assertEqual(OfficialOcmImport.objects.count(), 1)
        reimported = self._import(self._file(order_no="OCM-101", qty=4))
        self.assertEqual(reimported.status_code, 201, reimported.content)

    def test_bulk_delete_skips_approved_orders_and_requires_permission(self):
        po = self._po()
        imported = self._import(self._file())
        other = self._import(self._file(order_no="OCM-101", qty=4))
        approved_id = imported.json()["orders"][0]["id"]
        other_id = other.json()["orders"][0]["id"]
        self.client.post(
            f"/api/purchase-orders/ocm-official/{approved_id}/approve/",
            {"reason": "checked"},
            format="json",
            HTTP_HOST="localhost",
        )
        staff = APIClient()
        staff.force_authenticate(self.staff)
        denied = staff.post(
            "/api/purchase-orders/ocm-official/delete/",
            {"ids": [approved_id, other_id]},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(denied.status_code, 403)
        response = self.client.post(
            "/api/purchase-orders/ocm-official/delete/",
            {"ids": [approved_id, other_id]},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([row["order_number"] for row in response.json()["deleted"]], ["OCM-101"])
        self.assertEqual(response.json()["blocked"][0]["order_number"], "OCM-100")
        self.assertTrue(OfficialOcmOrder.objects.filter(pk=approved_id).exists())
        self.assertFalse(OfficialOcmOrder.objects.filter(pk=other_id).exists())
        po.refresh_from_db()
        self.assertEqual(po.po_number, "AO102601")
        self.assertEqual(po.brand_order_code, "OCM-100")
        blocked = self.client.delete(f"/api/purchase-orders/ocm-official/{approved_id}/", HTTP_HOST="localhost")
        self.assertEqual(blocked.status_code, 400)
        self.assertTrue(OfficialOcmOrder.objects.filter(pk=approved_id).exists())

    def test_delete_all_unapproved_leaves_the_approved_order_and_reports_the_total(self):
        po = self._po()
        imported = self._import(self._file())
        self._import(self._file(order_no="OCM-101", qty=4))
        approved_id = imported.json()["orders"][0]["id"]
        listed = self.client.get("/api/purchase-orders/ocm-official/", HTTP_HOST="localhost")
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertEqual(listed.json()["total"], 2)
        self.assertEqual(len(listed.json()["orders"]), 2)
        self.client.post(
            f"/api/purchase-orders/ocm-official/{approved_id}/approve/",
            {"reason": "checked"},
            format="json",
            HTTP_HOST="localhost",
        )
        response = self.client.post(
            "/api/purchase-orders/ocm-official/delete/",
            {"all_unapproved": True},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["deleted_count"], 1)
        self.assertEqual(response.json()["remaining"], 0)
        self.assertTrue(OfficialOcmOrder.objects.filter(pk=approved_id).exists())
        po.refresh_from_db()
        self.assertEqual(po.po_number, "AO102601")
        self.assertEqual(po.brand_order_code, "OCM-100")
