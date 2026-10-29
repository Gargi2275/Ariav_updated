"""Report which price tier each purchase-order line rate matches. Changes nothing."""

import csv
from pathlib import Path

from django.core.management.base import BaseCommand

from price_lists.order_price import catalogue_row, money_text, tier_name
from purchase_orders.models import PurchaseOrderLine

COLUMNS = (
    "po_number",
    "status",
    "line",
    "quality",
    "shade",
    "rate",
    "ex_mill",
    "wholesale",
    "retail",
    "tier",
)


class Command(BaseCommand):
    help = "Print which price tier each purchase-order rate equals. Does not update any rate."

    def add_arguments(self, parser):
        parser.add_argument("--csv", dest="csv_path", default="", help="Optional path for the same rows as CSV.")

    def handle(self, *args, **options):
        lines = PurchaseOrderLine.objects.select_related("purchase_order").order_by(
            "purchase_order__po_number", "id"
        )
        rows = []
        flagged = []
        for line in lines:
            po = line.purchase_order
            catalogue = catalogue_row(po.brand_id, line.product_description, po.po_date)
            tier = tier_name(line.rate, catalogue)
            record = {
                "po_number": po.po_number,
                "status": po.status,
                "line": line.id,
                "quality": line.product_description,
                "shade": line.shade,
                "rate": money_text(line.rate),
                "ex_mill": money_text(catalogue.ex_mill) if catalogue else "",
                "wholesale": money_text(catalogue.wholesale) if catalogue else "",
                "retail": money_text(catalogue.retail) if catalogue else "",
                "tier": tier,
            }
            rows.append(record)
            if tier in {"wholesale", "retail"}:
                flagged.append(record)
            self.stdout.write("\t".join(str(record[column]) for column in COLUMNS))
        self.stdout.write(
            f"Lines whose rate equals Wholesale or Retail but not Ex-Mill: {len(flagged)}"
        )
        if flagged:
            numbers = []
            for record in flagged:
                if record["po_number"] not in numbers:
                    numbers.append(record["po_number"])
            self.stdout.write("Purchase orders: " + ", ".join(numbers))
            for record in flagged:
                self.stdout.write(
                    f"{record['po_number']}\t{record['status']}\t{record['line']}\t{record['quality']}\t{record['rate']}\t{record['tier']}"
                )
        else:
            self.stdout.write("None.")
        csv_path = (options.get("csv_path") or "").strip()
        if csv_path:
            path = Path(csv_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=COLUMNS)
                writer.writeheader()
                writer.writerows(rows)
            self.stdout.write(f"Wrote {len(rows)} rows to {path}")
