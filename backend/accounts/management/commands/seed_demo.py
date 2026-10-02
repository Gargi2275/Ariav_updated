from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand

from accounts.models import AuditLog, AuthUser, AuthUserMstLogin
from ledger.models import LedgerLine
from entities.models import Entity
from masters.models import (
    AccountMaster,
    BrokerMaster,
    ChartAccount,
    GroupProduct,
    ItemMaster,
    MasterBranch,
    MstFinYear,
    Parameter,
    TaxSlab,
)
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
        for code, name in [
            ("GUJ", "Gujarat"),
            ("ADT", "Aditi"),
            ("SRV", "Shriva"),
        ]:
            Entity.objects.update_or_create(
                short_code=code,
                defaults={
                    "entity_name": name,
                    "entity_type": Entity.EntityType.BRANCH,
                    "parent_entity": None,
                    "status": Entity.Status.ACTIVE,
                    "state": "Gujarat",
                    "country": "India",
                },
            )

        fy, _ = MstFinYear.objects.update_or_create(
            code="2025-26",
            defaults={
                "starts_on": "2025-04-01",
                "ends_on": "2026-03-31",
                "is_current": True,
            },
        )

        branches = {}
        for code, name, city, gstin, address, phone, ho in [
            (
                "AHM-01",
                "Ahmedabad Narol Central",
                "Ahmedabad",
                "24AAACA1234F1Z8",
                "Narol-Vatva Road, Narol GIDC, Ahmedabad 382405, Gujarat",
                "+91 79 2658 4410",
                True,
            ),
            (
                "SUR-02",
                "Surat Ring Road Textile Mkt",
                "Surat",
                "24AAACA1234F2Z7",
                "Ring Road Textile Market, Sahara Darwaja, Surat 395002, Gujarat",
                "+91 261 232 8841",
                False,
            ),
            (
                "RJK-03",
                "Rajkot Commercial Hub",
                "Rajkot",
                "24AAACA1234F3Z6",
                "Race Course Road Commercial Complex, Rajkot 360001, Gujarat",
                "+91 281 247 1190",
                False,
            ),
        ]:
            obj, _ = MasterBranch.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "city": city,
                    "gstin": gstin,
                    "address": address,
                    "phone": phone,
                    "is_head_office": ho,
                    "is_active": True,
                },
            )
            branches[code] = obj

        groups = {}
        for code, name, cat, hsn, cons, gsm, rate in [
            ("GRP-GREY", "Grey Cotton Weaves", "Greige", "5208", "60s x 60s / 92x88", "72 - 125 GSM", "48.50"),
            ("GRP-FIN", "Finished / Processed", "Finished Fabric", "5407", "Reactive Dye / Mercerised Finish", "75 - 85 GSM", "68.00"),
            ("GRP-YRN", "Yarn", "Yarn", "5205", "30/1 Ne Ring Spun", "Count 30s-60s", "245.00"),
            ("GRP-CAMB-60", "Cambric Premium Greige", "Greige", "5208.11", "60s Warp x 60s Weft / 92x88", "72 - 78 GSM", "48.50"),
            ("GRP-POPL-40", "Poplin Heavy Reed", "Greige", "5208.12", "40s Warp x 40s Weft / 132x72", "115 - 125 GSM", "62.00"),
            ("GRP-RAYN-140", "Viscose Rayon Plain Weave", "Greige", "5407.82", "30s Rayon x 30s Rayon / 68x64", "135 - 145 GSM", "42.00"),
            ("GRP-JACQ", "Jacquard & Butta Weaves", "Finished Fabric", "5408", "Electronic Jacquard / Zari Weft", "80 - 140 GSM", "124.00"),
        ]:
            groups[code], _ = GroupProduct.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "category": cat,
                    "hsn_chapter": hsn,
                    "construction": cons,
                    "gsm_range": gsm,
                    "avg_rate": Decimal(rate),
                    "is_active": True,
                },
            )

        slabs = {}
        for code, name, gst, hsn, notice, rcm in [
            ("GST-00-EXM", "Raw Cotton Ginned & Agriculture Seeds", "0", "5201, 5202", "Notification 2/2017 - Exempt Goods", False),
            ("GST-05-TEX", "Textile Fabric & Grey Cotton Goods", "5", "5208, 5209, 5407, 5513", "Notification 1/2017 - Central Tax (Rate)", False),
            ("GST-12-TEX", "Processed & Finished Man-Made Textiles", "12", "5408, 5801, 6001", "Notification 14/2021 - Integrated Tax", False),
            ("GST-18-SRV", "Brokerage, Commission & Depot Logistics", "18", "SAC 9961, SAC 9965", "Notification 11/2017 - Services Tax", True),
            ("GST-28-LUX", "High-Value Metallic & Technical Zari Goods", "28", "5809", "Notification 1/2017 - Sched. IV", False),
        ]:
            pct = Decimal(gst)
            slabs[code], _ = TaxSlab.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "gst_percent": pct,
                    "cgst_percent": pct / 2,
                    "sgst_percent": pct / 2,
                    "igst_percent": pct,
                    "cess_percent": Decimal("0"),
                    "hsn_coverage": hsn,
                    "statutory_notification": notice,
                    "effective_from": "2017-07-01",
                    "rcm_applicable": rcm,
                    "is_active": True,
                },
            )

        brokers = {}
        for code, name, firm, rate, pan, mobile, city in [
            ("BRK-JV09", "Jigneshbhai Vora", "J. Vora Commercial Agency", "2.00", "ABCDE1234F", "+91 98250 18492", "Surat"),
            ("BRK-CP03", "Chandrakant B. Parekh", "C. Parekh & Sons Yarn Brokers", "1.50", "BCDEF2345G", "+91 98980 44219", "Ahmedabad"),
            ("BRK-MS14", "Mukeshbhai Shah", "Shah Fabrics Intermediary", "2.00", "CDEFG3456H", "+91 94260 77102", "Rajkot"),
        ]:
            brokers[code], _ = BrokerMaster.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "firm_name": firm,
                    "commission_rate": Decimal(rate),
                    "pan": pan,
                    "mobile": mobile,
                    "city": city,
                    "is_active": True,
                },
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
                    "tax_slab": slabs["GST-05-TEX"],
                    "mill_origin": "Gujarat Textile Cluster",
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
        broker_map = {
            "Jigneshbhai Vora (JV-09)": brokers["BRK-JV09"],
            "Chandrakant Parekh (CP-03)": brokers["BRK-CP03"],
            "Mukeshbhai Shah (MS-14)": brokers["BRK-MS14"],
        }
        parties = {}
        for code, name, trade, group, city, state, gstin, pan, clim, cdays, broker, obal, btype in parties_spec:
            obj, _ = AccountMaster.objects.update_or_create(
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
                    "broker_ref": broker_map.get(broker),
                    "opening_balance": Decimal(obal),
                    "balance_type": btype,
                    "is_active": True,
                },
            )
            parties[code] = obj
            if city == "Surat":
                obj.linked_branches.set([branches["SUR-02"]])
            elif city == "Ahmedabad":
                obj.linked_branches.set([branches["AHM-01"]])
            else:
                obj.linked_branches.set([branches["RJK-03"]])

        param_rows = [
            ("City", "CT-SRT", "Surat", "GJ-24", "Ring Road / Pandesara / Katargam"),
            ("City", "CT-AMD", "Ahmedabad", "GJ-24", "Narol GIDC / Maskati Market"),
            ("City", "CT-RJK", "Rajkot", "GJ-24", "Commercial Hub"),
            ("State", "ST-GJ", "Gujarat", "24", "Home state GST jurisdiction"),
            ("State", "ST-MH", "Maharashtra", "27", "Interstate IGST supplies"),
            ("Zone", "ZN-SRT-RR", "Surat Ring Road Textile Hub", "Local Intra-City", "Within 4 Hours (Tempo / Chhakda)"),
            ("Zone", "ZN-AMD-NRL", "Narol GIDC Processing Corridor", "Ahmedabad Branch", "Next Day Morning Dispatch (260 km)"),
            ("Zone", "ZN-BHW-OCT", "Bhiwandi Powerloom Terminal", "Maharashtra Inward", "24-36 Hours Interstate Transit"),
            ("Vehicle", "GJ-05-BX-4912", "Eicher Pro 1049 (Surat Agency Owned)", "3500 kg", "Driver: Babubhai Patel • GPS Live"),
            ("Vehicle", "GJ-01-CZ-8821", "Tata 407 LPT (Ahmedabad Depot)", "2800 kg", "Contract: Gujarat Logistics Line"),
            ("Driver", "DRV-BP01", "Babubhai Patel", "GJ-DL-8821", "Surat fleet primary"),
            ("Driver", "DRV-RK02", "Rakesh Chauhan", "GJ-DL-4410", "Ahmedabad corridor"),
            ("Rate", "RT-LOCAL", "Local Tempo Delivery", "₹1.10 / mtr", "Intra-city Surat"),
            ("Rate", "RT-AMD", "Ahmedabad Full Truck", "₹18,500 / trip", "Eicher 3.5T"),
            ("Grade", "GRD-FRESH-A", "Grade-A Prime Loom State", "100% Invoice Value", "0 defects / 100m, 4-point system score < 12"),
            ("Grade", "GRD-B-SEL", "Grade-B Select / Job Lot", "92% Invoice Value", "Minor slubs allowed"),
            ("Shade", "SHD-WHT-01", "Optical White Bleached", "WH-01", "Reactive / optical brightener"),
            ("Shade", "SHD-NVY-44", "Navy Vat 44", "NV-44", "Vat dyed mill standard"),
            ("Size", "SZ-58", "58 Inch Loom Width", "58\"", "Cambric / poplin greige"),
            ("Size", "SZ-44", "44 Inch Process Width", "44\"", "Rayon / jacquard"),
            ("Commission", "COM-STD-2", "Standard Brokerage", "2.00%", "Surat textile market default"),
            ("Commission", "COM-YARN-15", "Yarn Brokerage", "1.50%", "Ahmedabad yarn corridor"),
        ]
        for cat, code, name, value, notes in param_rows:
            Parameter.objects.update_or_create(
                category=cat,
                code=code,
                defaults={"name": name, "value": value, "notes": notes, "is_active": True},
            )

        def upsert_coa(code, name, atype, nature, parent, is_group, bal):
            obj, _ = ChartAccount.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "account_type": atype,
                    "nature": nature,
                    "parent": parent,
                    "is_group": is_group,
                    "opening_balance": Decimal(str(bal)),
                    "is_active": True,
                },
            )
            return obj

        assets = upsert_coa("1000", "ASSETS", "Assets", "Debit", None, True, "84200000")
        ca = upsert_coa("1100", "Current Assets", "Assets", "Debit", assets, True, "62400000")
        cash = upsert_coa("1110", "Cash & Liquid Bank Balances", "Assets", "Debit", ca, True, "12600000")
        upsert_coa("1111", "HDFC Bank CA (Surat)", "Assets", "Debit", cash, False, "8420000")
        upsert_coa("1112", "State Bank of India CA (Narol)", "Assets", "Debit", cash, False, "3840000")
        upsert_coa("1115", "Petty Cash Till (Surat Head Office)", "Assets", "Debit", cash, False, "340000")
        debtors = upsert_coa("1120", "Sundry Debtors (Textile Buyers)", "Assets", "Debit", ca, True, "39400000")
        upsert_coa("1121", "Sharda Synthetics Pvt Ltd (Surat)", "Assets", "Debit", debtors, False, "1482950")
        upsert_coa("1122", "Patel & Brothers Textiles (Ahmedabad)", "Assets", "Debit", debtors, False, "642800")
        stock = upsert_coa("1130", "Finished & Grey Fabric Inventory", "Assets", "Debit", ca, True, "6800000")
        upsert_coa("1131", "Grey Cambric 60x60 Stock Yard", "Assets", "Debit", stock, False, "4120000")
        upsert_coa("1132", "Rayon Viscose Stock Yard", "Assets", "Debit", stock, False, "2680000")
        liab = upsert_coa("2000", "LIABILITIES", "Liabilities", "Credit", None, True, "42100000")
        cl = upsert_coa("2100", "Current Liabilities", "Liabilities", "Credit", liab, True, "28600000")
        cred = upsert_coa("2110", "Sundry Creditors (Weaving Mills)", "Liabilities", "Credit", cl, True, "18900000")
        upsert_coa("2111", "Somnath Weaving Mills", "Liabilities", "Credit", cred, False, "2740000")
        upsert_coa("2112", "Kuber Dyeing & Printing Mills", "Liabilities", "Credit", cred, False, "1894200")
        income = upsert_coa("3000", "INCOME", "Income", "Credit", None, True, "148200000")
        upsert_coa("3100", "Fabric Sales", "Income", "Credit", income, False, "128400000")
        upsert_coa("3200", "Process Job Work Income", "Income", "Credit", income, False, "19800000")
        expense = upsert_coa("4000", "EXPENSE", "Expense", "Debit", None, True, "112600000")
        upsert_coa("4100", "Yarn & Greige Purchases", "Expense", "Debit", expense, False, "86400000")
        upsert_coa("4200", "Freight, Brokerage & Depot Overhead", "Expense", "Debit", expense, False, "26200000")
        equity = upsert_coa("5000", "EQUITY", "Equity", "Credit", None, True, "42100000")
        upsert_coa("5100", "Partner Capital Account", "Equity", "Credit", equity, False, "42100000")

        admin, created = AuthUser.objects.get_or_create(
            username=settings.DEV_ADMIN_USERNAME,
            defaults={
                "email": "paresh.patel@ariavagency.com",
                "role": AuthUser.Role.ADMIN,
                "display_name": "Bhargav Akshaya",
                "is_staff": True,
                "is_superuser": True,
                "branch": branches["AHM-01"],
            },
        )
        admin.set_password(settings.DEV_ADMIN_PASSWORD)
        admin.role = AuthUser.Role.ADMIN
        admin.display_name = "Bhargav Akshaya"
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
        if not admin.phone:
            self.stdout.write(
                f"Admin {admin.username} has no PIN yet. Set one with: python manage.py reset_admin_pin {admin.username}"
            )
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
            "entities.Entity",
            "brands.Brand",
            "categories.Category",
            "products.Product",
            "customers.Customer",
            "masters.MasterBranch",
            "masters.ItemMaster",
            "masters.AccountMaster",
            "masters.GroupProduct",
            "masters.TaxSlab",
            "masters.BrokerMaster",
            "masters.ChartAccount",
            "masters.Parameter",
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
