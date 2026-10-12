from io import BytesIO

from openpyxl import Workbook


# External file header: do not rename
CLIENT_HEADERS = [
    "CompanyCd", "Area", "Agent", "Order Code", "Template Code", "InvoiceLineNo",
    "Invoice Date", "Invoice No.", "CustomerCd", "Customer Name", "Customer City",
    "State", "Postal Code", "GST Number", "Container No", "Bale Weight",
    "Mtrs/Pcs/Kgs", "Size Code", "No OF PCS", "Quantity", "Condt.Wght",
    "HSN Code", "Item Type", "Code1", "Code2", "Code3", "Code4", "Code5",
    "Code6", "Price", "Grade", "Grade %", "No.of Flag", "Flag Value",
    "Quantity Dsic %", "Sepcial Disc.%", "Sepcial Disc Value", "Cash Disc.%",
    "Cash Disc.Val", "Length Disc.%", " Basic Value", "Total Disc Value",
    "Freight %", "Freight Value", "Insurance %", "Insurance Value",
    "Taxable. Value (BasicV-Disc+FrgtV+InsuV)", "Cgst%", "Cgst Value",
    "Sgst %", "Sgst Value", "Igst %", "Igst Value", "Total GST  %",
    "Total GST Val", "New TCS Val", "VAT %", "VAT Value", "SPI %", "SPI Value",
    "BED %", "BED Value", "Invoice Value", "Transport Code", "Transport Name",
    "LR No.", "LR Date", "Payment Days", "DPL REF NO",
    "GST Registered/Unregistered", "Composite Scheme", "GST", "Blend Description",
]


def _unit_code(unit: str) -> str:
    return {"Meter": "MT", "Piece": "PCS", "Kilogram": "KG"}.get(unit, unit or "")


def build_dispatch_workbook(po) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sheet1"
    sheet.append(CLIENT_HEADERS)

    for index, line in enumerate(po.lines.all(), start=1):
        product = line.product if line.product_id else None
        quantity = line.quantity
        row = [None] * len(CLIENT_HEADERS)
        values = {
            "CompanyCd": po.entity.short_code,
            "Order Code": po.po_number,
            "InvoiceLineNo": index,
            "CustomerCd": po.customer.customer_code,
            "Customer Name": po.customer.customer_name,
            "Mtrs/Pcs/Kgs": _unit_code(product.unit if product else ""),
            "No OF PCS": quantity,
            "Quantity": quantity,
            "Code1": product.product_code if product else "",
            "Blend Description": product.product_name if product else line.product_description,
        }
        for column, value in values.items():
            row[CLIENT_HEADERS.index(column)] = value
        sheet.append(row)

    notes = workbook.create_sheet("Notes")
    notes.append(["PO dispatch export", None])
    notes.append(["Source PO", po.po_number])
    notes.append(["Instructions", "Fill Invoice No., Invoice Date, Transport Name, LR No. and LR Date before uploading."])
    notes.append(["Quantity", "Quantity and No OF PCS are populated from the PO line quantity."])
    notes.append(["Unit", "Mtrs/Pcs/Kgs is populated from the PO product unit."])

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()
