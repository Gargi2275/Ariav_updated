from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import AuditLog, AuthUser, AuthUserMstLogin, LoginRequest
from ledger.models import LedgerLine
from masters.models import AccountMaster, GroupProduct, ItemMaster, MasterBranch, MstFinYear, Parameter
from transactions.models import (
    BankPayment,
    BankReceivedVoucher,
    CashReceivedVoucher,
    JournalEntry,
    JournalLine,
    OrderForm,
    SalesInvoice,
)


class Command(BaseCommand):
    help = "Idempotent demo seed for Ariav ERP (local development)."

    def handle(self, *args, **options):
        fy, _ = MstFinYear.objects.update_or_create(
            code="2025-26",
            defaults={
                "starts_on": "2025-04-01",
                "ends_on": "2026-03-31",
                "is_current": True,
            },
        )

        branches = {}
        for code, name, city, gstin, ho in [
            ("AHM-01", "Ahmedabad Narol Central", "Ahmedabad", "24AAACA1234F1Z8", True),
            ("SUR-02", "Surat Ring Road Textile Mkt", "Surat", "24AAACA1234F2Z7", False),
            ("RJK-03", "Rajkot Commercial Hub", "Rajkot", "24AAACA1234F3Z6", False),
        ]:
            obj, _ = MasterBranch.objects.update_or_create(
                code=code,
                defaults={"name": name, "city": city, "gstin": gstin, "is_head_office": ho, "is_active": True},
            )
            branches[code] = obj

        groups = {}
        for code, name, cat, hsn in [
            ("GRP-GREY", "Grey Cotton Weaves", "Grey Fabric", "5208"),
            ("GRP-FIN", "Finished / Processed", "Finished Fabric", "5407"),
            ("GRP-YRN", "Yarn", "Yarn", "5205"),
        ]:
            groups[code], _ = GroupProduct.objects.update_or_create(
                code=code, defaults={"name": name, "category": cat, "hsn_chapter": hsn, "is_active": True}
            )

        items_spec = [
            ("GRY-6060-58", "Cotton Cambric Grey Fabric 60x60 / 92x88 58\"", "GRP-GREY", "Grey Fabric", "60s x 60s / 92 x 88", 58, "52081190", "48.50", "Meters", "42800"),
            ("GRY-4040-44", "Cotton Poplin Grey Fabric 40x40 / 100x92 44\"", "GRP-GREY", "Grey Fabric", "40s x 40s / 100 x 92", 44, "52081290", "38.25", "Meters", "61400"),
            ("FIN-RAY-14K", "Heavy Rayon Dyed & Discharge Print 14kg 44\"", "GRP-FIN", "Finished Fabric", "30s Rayon x 30s Rayon", 44, "54075200", "62.00", "Taka", "18900"),
            ("FIN-PLY-TWL", "Poly-Cotton Micro Twill Suiting Finish 58\"", "GRP-FIN", "Finished Fabric", "80/2 PV x 80/2 PV", 58, "55151100", "94.00", "Meters", "12500"),
            ("YRN-30C-WARP", "100% Cotton Carded Cone Yarn 30s AutoConed", "GRP-YRN", "Yarn", "30s Ne Single Warp Quality", 0, "52051210", "245.00", "Kgs", "8400"),
            ("JAC-BRO-MET", "Brocade Metallic Jacquard Loom Fabric 54\"", "GRP-FIN", "Processed Jacquard", "75D Poly x 150D Zari", 54, "54078400", "128.50", "Meters", "9150"),
        ]
        items = {}
        for sku, desc, gcode, cat, cons, width, hsn, rate, unit, stock in items_spec:
            items[sku], _ = ItemMaster.objects.update_or_create(
                sku=sku,
                defaults={
                    "description": desc,
                    "group": groups[gcode],
                    "category": cat,
                    "construction": cons,
                    "width_inches": width,
                    "hsn": hsn,
                    "base_rate": Decimal(rate),
                    "packing_unit": unit,
                    "stock_quantity": Decimal(stock),
                    "gst_percent": Decimal("5.00"),
                    "is_active": True,
                },
            )

        parties_spec = [
            ("SHR-041", "Sharda Synthetics Pvt Ltd", "Sharda Textiles Surat", "Sundry Debtors", "Surat", "Gujarat", "24AABCS8891P1ZV", "AABCS8891P", "2500000", 45, "Jigneshbhai Vora (JV-09)", "1482950", "Dr"),
            ("ARV-019", "Arvind Commercial Agency", "Arvind Depot Ahmedabad", "Sundry Debtors", "Ahmedabad", "Gujarat", "24AAACA4021K1ZZ", "AAACA4021K", "5000000", 30, "Chandrakant Parekh (CP-03)", "3120400", "Dr"),
            ("SOM-092", "Somnath Weaving Mills", "Somnath Textiles Narol", "Sundry Creditors", "Ahmedabad", "Gujarat", "24AAAFS9920M1ZA", "AAAFS9920M", "4000000", 60, "Direct Mill Contract", "2740000", "Cr"),
            ("KUB-114", "Kuber Dyeing & Printing Mills", "Kuber Processors Pandesara", "Sundry Creditors", "Surat", "Gujarat", "24AABFK4512E1ZQ", "AABFK4512E", "3500000", 45, "Mukeshbhai Shah (MS-14)", "1894200", "Cr"),
            ("PAT-088", "Patel & Brothers Textiles", "Patel Cloth Maskati Mkt", "Sundry Debtors", "Ahmedabad", "Gujarat", "24AAPBP8120L1ZP", "AAPBP8120L", "1500000", 21, "Jigneshbhai Vora (JV-09)", "642800", "Dr"),
            ("HDF-001", "HDFC Bank - Textile Mkt CA", "HDFC Current A/c Ring Rd", "Bank Accounts", "Surat", "Gujarat", "", "AAACH0001H", "0", 0, "", "8419250", "Dr"),
            ("CSH-001", "Cash Vault Surat", "Petty Cash", "Cash-in-Hand", "Surat", "Gujarat", "", "", "0", 0, "", "185000", "Dr"),
            ("SAL-001", "Fabric Sales", "Trading Income", "Income", "Surat", "Gujarat", "", "", "0", 0, "", "0", "Cr"),
        ]
        parties = {}
        for code, name, trade, group, city, state, gstin, pan, clim, cdays, broker, obal, btype in parties_spec:
            parties[code], _ = AccountMaster.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "trade_name": trade,
                    "group": group,
                    "city": city,
                    "state": state,
                    "gstin": gstin,
                    "pan": pan,
                    "credit_limit": Decimal(clim),
                    "credit_days": cdays,
                    "broker": broker,
                    "opening_balance": Decimal(obal),
                    "balance_type": btype,
                    "is_active": True,
                },
            )

        Parameter.objects.update_or_create(
            category="Transport Zones",
            code="ZN-SRT-RR",
            defaults={"name": "Surat Ring Road Textile Hub", "value": "Local Intra-City", "is_active": True},
        )

        admin, created = AuthUser.objects.get_or_create(
            username=settings.DEV_ADMIN_USERNAME,
            defaults={
                "email": "paresh.patel@ariavagency.com",
                "role": AuthUser.Role.ADMIN,
                "display_name": "Paresh Patel (Managing Partner)",
                "is_staff": True,
                "is_superuser": True,
                "branch": branches["AHM-01"],
            },
        )
        admin.set_password(settings.DEV_ADMIN_PASSWORD)
        admin.phone = make_password(str(settings.DEV_ADMIN_PIN))
        admin.role = AuthUser.Role.ADMIN
        admin.display_name = admin.display_name or "Paresh Patel (Managing Partner)"
        admin.branch = branches["AHM-01"]
        admin.is_staff = True
        admin.is_active = True
        admin.save()
        AuthUserMstLogin.objects.get_or_create(user=admin)

        operator, _ = AuthUser.objects.get_or_create(
            username=settings.DEV_OPERATOR_USERNAME,
            defaults={
                "email": "bhavin.joshi@ariavagency.com",
                "role": AuthUser.Role.OPERATOR,
                "display_name": "Bhavin V. Joshi",
                "operator_code": "OP-04",
                "branch": branches["SUR-02"],
            },
        )
        operator.set_password(settings.DEV_OPERATOR_PASSWORD)
        operator.role = AuthUser.Role.OPERATOR
        operator.display_name = "Bhavin V. Joshi"
        operator.operator_code = "OP-04"
        operator.branch = branches["SUR-02"]
        operator.is_active = True
        operator.save()
        AuthUserMstLogin.objects.get_or_create(user=operator)

        orders = [
            ("SO-2025-1001", "2026-09-01", parties["SHR-041"], items["GRY-6060-58"], "4200", "48.50", branches["SUR-02"]),
            ("SO-2025-1002", "2026-09-02", parties["ARV-019"], items["GRY-4040-44"], "8000", "38.25", branches["AHM-01"]),
            ("SO-2025-1003", "2026-09-03", parties["PAT-088"], items["FIN-RAY-14K"], "2100", "62.00", branches["AHM-01"]),
            ("SO-2025-1004", "2026-09-04", parties["SHR-041"], items["JAC-BRO-MET"], "900", "128.50", branches["SUR-02"]),
            ("SO-2025-1005", "2026-09-05", parties["ARV-019"], items["FIN-PLY-TWL"], "1500", "94.00", branches["RJK-03"]),
        ]
        for ono, odt, party, item, meters, rate, branch in orders:
            amt = Decimal(meters) * Decimal(rate)
            OrderForm.objects.update_or_create(
                order_no=ono,
                defaults={
                    "order_date": odt,
                    "delivery_date": "2026-09-22",
                    "party": party,
                    "branch": branch,
                    "item": item,
                    "meters": Decimal(meters),
                    "rate": Decimal(rate),
                    "amount": amt,
                    "broker": party.broker,
                    "status": "booked",
                },
            )

        invoices = [
            ("INV-2025-1092", "2026-09-08", parties["SHR-041"], items["GRY-6060-58"], "4200", "203700.00", "10185.00", "213885.00", branches["SUR-02"]),
            ("INV-2025-1093", "2026-09-08", parties["ARV-019"], items["GRY-4040-44"], "8000", "306000.00", "15300.00", "321300.00", branches["AHM-01"]),
            ("INV-2025-1094", "2026-09-07", parties["PAT-088"], items["FIN-RAY-14K"], "2100", "130200.00", "6510.00", "136710.00", branches["AHM-01"]),
            ("INV-2025-1095", "2026-09-06", parties["SHR-041"], items["JAC-BRO-MET"], "900", "115650.00", "5782.50", "121432.50", branches["SUR-02"]),
            ("INV-2025-1096", "2026-09-05", parties["ARV-019"], items["FIN-PLY-TWL"], "1500", "141000.00", "7050.00", "148050.00", branches["RJK-03"]),
        ]
        for ino, idt, party, item, meters, tax, gst, net, branch in invoices:
            SalesInvoice.objects.update_or_create(
                invoice_no=ino,
                defaults={
                    "invoice_date": idt,
                    "party": party,
                    "branch": branch,
                    "item": item,
                    "meters": Decimal(meters),
                    "taxable_amount": Decimal(tax),
                    "gst_amount": Decimal(gst),
                    "net_amount": Decimal(net),
                    "status": "posted",
                },
            )
            self._ledger(idt, party, Decimal(net), Decimal("0"), f"Sales {ino}", "Sales Invoice", ino, fy)
            self._ledger(idt, parties["SAL-001"], Decimal("0"), Decimal(tax), f"Sales {ino}", "Sales Invoice", ino, fy)

        BankReceivedVoucher.objects.update_or_create(
            voucher_no="BR-2025-1049",
            defaults={
                "voucher_date": "2026-09-08",
                "party": parties["SHR-041"],
                "bank_account": parties["HDF-001"],
                "amount": Decimal("480000.00"),
                "cheque_no": "491028",
                "drawn_on": "ICICI Bank, Ring Road Surat",
                "narration": "Collection against grey cambric invoices",
                "status": "cleared",
            },
        )
        self._ledger("2026-09-08", parties["HDF-001"], Decimal("480000"), Decimal("0"), "Bank receipt BR-2025-1049", "Bank Receipt", "BR-2025-1049", fy)
        self._ledger("2026-09-08", parties["SHR-041"], Decimal("0"), Decimal("480000"), "Bank receipt BR-2025-1049", "Bank Receipt", "BR-2025-1049", fy)

        CashReceivedVoucher.objects.update_or_create(
            voucher_no="CR-2025-0419",
            defaults={
                "voucher_date": "2026-09-08",
                "party": parties["PAT-088"],
                "amount": Decimal("85000.00"),
                "narration": "Cash collection Surat dispatch",
                "status": "posted",
            },
        )
        BankPayment.objects.update_or_create(
            voucher_no="BP-2025-0812",
            defaults={
                "voucher_date": "2026-09-08",
                "party": parties["SOM-092"],
                "bank_account": parties["HDF-001"],
                "amount": Decimal("240000.00"),
                "reference": "NEFT-HDFC2609088192",
                "narration": "Yarn supply settlement",
                "status": "posted",
            },
        )

        jv, _ = JournalEntry.objects.update_or_create(
            voucher_no="JV-2025-0291",
            defaults={"voucher_date": "2026-09-08", "narration": "Broker commission provision", "status": "posted"},
        )
        JournalLine.objects.filter(journal=jv).delete()
        JournalLine.objects.create(journal=jv, account=parties["SAL-001"], debit=Decimal("148200.00"), credit=0, narration="Commission provision")
        JournalLine.objects.create(journal=jv, account=parties["SOM-092"], debit=0, credit=Decimal("148200.00"), narration="Commission payable")
        self._ledger("2026-09-08", parties["SAL-001"], Decimal("148200"), Decimal("0"), "JV-2025-0291", "Journal", "JV-2025-0291", fy)
        self._ledger("2026-09-08", parties["SOM-092"], Decimal("0"), Decimal("148200"), "JV-2025-0291", "Journal", "JV-2025-0291", fy)

        LoginRequest.objects.update_or_create(
            request_code="REQ-901",
            defaults={
                "user": operator,
                "username": operator.username,
                "operator_code": "OP-04",
                "operator_name": "Bhavin V. Joshi",
                "branch": branches["SUR-02"].name,
                "terminal_ip": "192.168.10.42",
                "action_requested": "Shift Login: Morning Order Entry & Sales Invoicing",
                "status": LoginRequest.Status.PENDING,
                "expires_at": timezone.now() + timedelta(minutes=5),
            },
        )

        AuditLog.objects.get_or_create(
            action="Demo data seeded",
            module="System",
            defaults={
                "user": "System",
                "role": "seed",
                "details": "Idempotent seed_demo completed",
                "severity": AuditLog.Severity.INFO,
                "ip_address": "127.0.0.1",
            },
        )

        self.stdout.write(self.style.SUCCESS("seed_demo completed"))
        self._print_counts()

    def _ledger(self, date, account, debit, credit, narration, vtype, vno, fy):
        LedgerLine.objects.update_or_create(
            voucher_type=vtype,
            voucher_no=vno,
            account=account,
            debit=debit,
            credit=credit,
            defaults={"posted_on": date, "narration": narration, "fin_year": fy},
        )

    def _print_counts(self):
        from django.apps import apps

        for label in [
            "masters.MasterBranch",
            "masters.ItemMaster",
            "masters.AccountMaster",
            "masters.GroupProduct",
            "transactions.OrderForm",
            "transactions.SalesInvoice",
            "transactions.BankReceivedVoucher",
            "transactions.CashReceivedVoucher",
            "transactions.JournalEntry",
            "ledger.LedgerLine",
            "accounts.AuthUser",
            "accounts.LoginRequest",
        ]:
            model = apps.get_model(label)
            self.stdout.write(f"{label}: {model.objects.count()}")
