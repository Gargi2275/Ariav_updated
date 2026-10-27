"""Brand order-form PDF. Used only when the purchase order's brand has a print profile."""

from collections import OrderedDict
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from .models import PurchaseOrder, PurchaseOrderLine
from .print_profiles import PrintProfile

FORM_ROWS = 10
SHADES_PER_ROW = 7
MAROON = (0.50, 0.07, 0.11)
INK = (0.12, 0.12, 0.13)


def format_qty(value, unit: str) -> str:
    quantity = Decimal(value or 0)
    if unit == PurchaseOrderLine.Unit.PIECES or quantity == quantity.to_integral_value():
        return str(int(quantity))
    return f"{quantity:.2f}"


def format_price(value) -> str:
    if value is None:
        return ""
    amount = Decimal(value)
    if amount == 0:
        return ""
    return f"{amount:.2f}"


def _quality_text(line: PurchaseOrderLine) -> str:
    text = (line.product_description or "").strip()
    if text:
        return text
    if line.product_id:
        return line.product.product_code or line.product.product_name or ""
    return ""


def group_lines(po: PurchaseOrder) -> list[dict]:
    """One block per form row, or per quality + size + price + delivery + remarks."""
    blocks: OrderedDict = OrderedDict()
    for line in po.lines.all():
        if line.form_row_no:
            key = ("row", line.form_row_no)
        else:
            key = (
                "legacy",
                _quality_text(line),
                line.size or "",
                str(line.rate) if line.rate is not None else "",
                str(line.delivery_from or ""),
                str(line.delivery_to or ""),
                line.line_remarks or "",
            )
        block = blocks.get(key)
        if block is None:
            block = {"lines": [], "row_no": line.form_row_no}
            blocks[key] = block
        block["lines"].append(line)
    numbered = []
    for index, block in enumerate(blocks.values(), start=1):
        block["row_no"] = block["row_no"] or index
        numbered.append(block)
    return numbered


def _quality_lookup(po: PurchaseOrder) -> dict[str, tuple[str, str]]:
    from price_lists.models import BrandQualityPrice, PriceList

    rows = BrandQualityPrice.objects.filter(
        price_list__brand_id=po.brand_id,
        price_list__status=PriceList.Status.ACTIVE,
    )
    found = {}
    for row in rows:
        short = "-".join(part for part in (row.quality_prefix, row.quality_number) if part)
        full = row.quality_code or ""
        for key in {full, short, row.quality_prefix or ""}:
            if key:
                found[key] = (short or full, full if full and full != short else "")
    return found


def _display_quality(line: PurchaseOrderLine, lookup: dict[str, tuple[str, str]]) -> tuple[str, str]:
    raw = _quality_text(line)
    if raw in lookup:
        return lookup[raw]
    return raw, ""


def _font_name() -> str:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    if "AriavText" in pdfmetrics.getRegisteredFontNames():
        return "AriavText"
    windows = Path(__import__("os").environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "Nirmala.ttf"
    if windows.exists():
        pdfmetrics.registerFont(TTFont("AriavText", str(windows)))
        return "AriavText"
    return "Helvetica"


def _wrap(canvas, text: str, font: str, size: float, width: float) -> list[str]:
    words = (text or "").replace("\n", " ").split()
    if not words:
        return []
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if canvas.stringWidth(trial, font, size) <= width:
            current = trial
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def _fit(canvas, text: str, font: str, size: float, width: float, max_lines: int) -> list[str]:
    lines = _wrap(canvas, text, font, size, width)
    if len(lines) <= max_lines:
        return lines
    kept = lines[:max_lines]
    last = kept[-1]
    ellipsis = "â€¦"
    while last and canvas.stringWidth(last + ellipsis, font, size) > width:
        last = last[:-1]
    kept[-1] = (last or "").rstrip() + ellipsis
    return kept


def _party_address(customer) -> str:
    parts = [
        customer.address_line_1,
        customer.address_line_2,
        customer.address_line_3,
        customer.address_line_4,
        customer.area,
        customer.city,
        customer.state,
        customer.pincode,
        customer.country,
    ]
    return ", ".join(part.strip() for part in parts if part and str(part).strip())


def _chunk_shades(lines: list, per_row: int) -> list[list]:
    rows = [lines[index:index + per_row] for index in range(0, len(lines), per_row)]
    return rows or [[]]


def _shade_row_count(block: dict) -> int:
    return max(1, -(-len(block.get("lines") or []) // SHADES_PER_ROW))


def _paginate(blocks: list[dict]) -> list[list[dict]]:
    pages: list[list[dict]] = []
    current: list[dict] = []
    used = 0
    for block in blocks:
        need = _shade_row_count(block)
        if current and used + need > FORM_ROWS:
            pages.append(current)
            current = []
            used = 0
        current.append(block)
        used += need
    if current:
        pages.append(current)
    return pages or [[]]


def build_order_form_pdf(
    po: PurchaseOrder,
    profile: PrintProfile,
    copy: str,
    blank: bool = False,
    include_rates: bool = True,
) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdf_canvas

    po = (
        PurchaseOrder.objects.select_related("entity", "customer", "brand", "created_by")
        .prefetch_related("lines__product")
        .get(pk=po.pk)
    )
    font = _font_name()
    lookup = {} if blank else _quality_lookup(po)
    blocks = [] if blank else group_lines(po)
    pages = _paginate(blocks) if blocks else [[]]
    if blank:
        pages = [[]]
    copy_label = profile.copies.get(copy, "")
    buffer = BytesIO()
    canvas = pdf_canvas.Canvas(buffer, pagesize=A4)
    canvas.setTitle(f"Order form {po.po_number}")
    page_count = len(pages)
    for index, page_blocks in enumerate(pages, start=1):
        _draw_page(
            canvas,
            po,
            profile,
            font,
            page_blocks,
            index,
            page_count,
            copy_label,
            lookup,
            blank,
            include_rates,
            is_last=index == page_count,
        )
        canvas.showPage()
    canvas.save()
    return buffer.getvalue()


def _line(canvas, x0, y0, x1, y1, width=0.6):
    canvas.setStrokeColorRGB(0.2, 0.2, 0.22)
    canvas.setLineWidth(width)
    canvas.line(x0, y0, x1, y1)


def _center(canvas, text, font, size, x, y, width):
    shown = text or ""
    while size > 3.5 and shown and canvas.stringWidth(shown, font, size) > width - 2:
        size -= 0.25
    canvas.setFont(font, size)
    canvas.drawCentredString(x + width / 2, y, shown)


def _empty_row() -> dict:
    return {
        "no": "", "quality": "", "full": "", "shades": [],
        "size": "", "unit": "", "price": "", "from": "", "to": "", "remarks": "",
    }


def _form_rows(blocks, lookup, blank, include_rates: bool = True) -> list[dict]:
    rows = []
    for block in blocks:
        lines = block.get("lines") or []
        chunks = _chunk_shades(lines, SHADES_PER_ROW) if lines else [[]]
        sample = lines[0] if lines else None
        short, full = _display_quality(sample, lookup) if sample and not blank else ("", "")
        size = "" if blank or sample is None else (sample.size or "")
        unit = "" if blank or sample is None else (sample.unit or PurchaseOrderLine.Unit.PIECES)
        price = "" if blank or sample is None or not include_rates else format_price(sample.rate)
        delivery_from = "" if blank or sample is None or not sample.delivery_from else sample.delivery_from.strftime("%d/%m/%Y")
        delivery_to = "" if blank or sample is None or not sample.delivery_to else sample.delivery_to.strftime("%d/%m/%Y")
        remarks = "" if blank or sample is None else (sample.line_remarks or "")
        for index, chunk in enumerate(chunks):
            rows.append({
                "no": "" if blank or index else str(block.get("row_no") or ""),
                "quality": "" if blank or index else short,
                "full": "" if blank or index else full,
                "shades": [] if blank else chunk,
                "size": size,
                "unit": unit,
                "price": price,
                "from": delivery_from,
                "to": delivery_to,
                "remarks": "" if index else remarks,
            })
    while len(rows) < FORM_ROWS:
        rows.append(_empty_row())
    return rows[:FORM_ROWS]


def _char_boxes(canvas, text, x, y, width, height, font, slots):
    chars = list(text or "")
    count = max(slots, len(chars), 1)
    cell = width / count
    canvas.setFillColorRGB(*INK)
    for index in range(count):
        if index:
            _line(canvas, x + index * cell, y, x + index * cell, y + height, 0.4)
        if index < len(chars):
            _center(canvas, chars[index], "Helvetica-Bold", 9, x + index * cell, y + max(3, (height - 9) / 2), cell)


def _draw_page(canvas, po, profile, font, blocks, page_no, page_count, copy_label, lookup, blank, include_rates, is_last):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm

    width, height = A4
    left = 8 * mm
    right = width - 8 * mm
    masthead_top = height - 6 * mm
    _draw_masthead(canvas, left, right, masthead_top, copy_label)
    _draw_stationery(
        canvas, po, profile, font, blocks, page_no, page_count, lookup, blank, include_rates,
        left, right, masthead_top - 58, 7 * mm,
    )


def _draw_masthead(canvas, left, right, top, copy_label):
    label = (copy_label or "Mill's Copy").upper()
    badge_w = 78
    canvas.setFillColorRGB(*MAROON)
    canvas.roundRect(left, top - 30, badge_w, 28, 3, fill=1, stroke=0)
    canvas.setFillColorRGB(1, 1, 1)
    canvas.setFont("Helvetica-Bold", 6.5)
    canvas.drawCentredString(left + badge_w / 2, top - 14, label)
    logo_w = 132
    logo_x = (left + right) / 2 - logo_w / 2
    canvas.setFillColorRGB(*MAROON)
    canvas.roundRect(logo_x, top - 32, logo_w, 30, 2, fill=1, stroke=0)
    canvas.setFillColorRGB(1, 1, 1)
    canvas.setFont("Helvetica-Bold", 16)
    canvas.drawCentredString(logo_x + logo_w / 2, top - 18, "OCM")
    canvas.setFont("Helvetica", 5)
    canvas.drawCentredString(logo_x + logo_w / 2, top - 28, "LUXURY SUITINGS & TWEEDS")
    seal_x = right - 16
    seal_y = top - 16
    canvas.setStrokeColorRGB(*MAROON)
    canvas.setLineWidth(1.1)
    canvas.circle(seal_x, seal_y, 14, stroke=1, fill=0)
    canvas.circle(seal_x, seal_y, 11, stroke=1, fill=0)
    canvas.setFillColorRGB(*MAROON)
    canvas.setFont("Helvetica-Bold", 7)
    canvas.drawCentredString(seal_x, seal_y + 1, "100")
    canvas.setFont("Helvetica", 5)
    canvas.drawCentredString(seal_x, seal_y - 7, "years")
    title = "ORDER FORM"
    canvas.setFillColorRGB(*INK)
    canvas.setFont("Helvetica-Bold", 13)
    gap = 1.6
    total = sum(canvas.stringWidth(char, "Helvetica-Bold", 13) for char in title) + gap * (len(title) - 1)
    cursor = (left + right) / 2 - total / 2
    for char in title:
        canvas.drawString(cursor, top - 50, char)
        cursor += canvas.stringWidth(char, "Helvetica-Bold", 13) + gap


def _draw_stationery(canvas, po, profile, font, blocks, page_no, page_count, lookup, blank, include_rates, left, right, top, bottom):
    span = right - left
    rows = _form_rows(blocks, lookup, blank, include_rates)
    id_head, id_value, parties, salute = 14, 18, 78, 28
    col_head, dispatch_head, dispatch_value, sign = 22, 12, 26, 34
    fixed = id_head + id_value + parties + salute + col_head + dispatch_head + dispatch_value + sign
    row_h = (top - bottom - fixed) / FORM_ROWS
    y = top
    canvas.setStrokeColorRGB(0.2, 0.2, 0.22)
    canvas.setLineWidth(0.8)
    canvas.rect(left, bottom, span, top - bottom, stroke=1, fill=0)

    party_w, indent_w, date_w = span * 0.30, span * 0.32, span * 0.14
    place_w = span - party_w - indent_w - date_w
    identity = [party_w, indent_w, date_w, place_w]
    canvas.setFillColorRGB(*MAROON)
    canvas.rect(left, y - id_head, span, id_head, stroke=0, fill=1)
    canvas.setFillColorRGB(1, 1, 1)
    canvas.setFont("Helvetica-Bold", 7)
    labels = ["PARTY CODE", "INDENT NUMBER", "DATE", "PLACE"]
    cursor = left
    for label, width in zip(labels, identity):
        canvas.drawCentredString(cursor + width / 2, y - 10, label)
        cursor += width
    y -= id_head
    _line(canvas, left, y, right, y)
    cursor = left
    for width in identity[:-1]:
        cursor += width
        _line(canvas, cursor, y - id_value, cursor, y + id_head, 0.4)
    party_code = "" if blank else (po.customer.customer_code or "")
    indent = "" if blank else (po.po_number or "")
    _char_boxes(canvas, party_code, left, y - id_value, party_w, id_value, font, 10)
    _char_boxes(canvas, indent, left + party_w, y - id_value, indent_w, id_value, font, 12)
    canvas.setFillColorRGB(*INK)
    date_text = "" if blank else po.po_date.strftime("%d/%m/%Y")
    place = "" if blank else (po.place or "")
    _center(canvas, date_text, font, 8, left + party_w + indent_w, y - 11, date_w)
    for index, line in enumerate(_fit(canvas, place, font, 7, place_w - 4, 2)):
        canvas.setFont(font, 7)
        canvas.drawString(left + party_w + indent_w + date_w + 2, y - 8 - index * 8, line)
    y -= id_value
    _line(canvas, left, y, right, y)

    meta_w = span * 0.22
    half = (span - meta_w) / 2
    _line(canvas, left + half, y - parties, left + half, y)
    _line(canvas, left + half * 2, y - parties, left + half * 2, y)
    canvas.setFillColorRGB(*INK)
    canvas.setFont(font, 7)
    canvas.drawString(left + 3, y - 9, "From")
    canvas.drawString(left + half + 3, y - 9, "To:")
    if not blank:
        buyer_lines = []
        buyer_bits = [po.customer.customer_name or "", _party_address(po.customer)]
        if po.customer.gst_no:
            buyer_bits.append(f"GST {po.customer.gst_no}")
        for bit in buyer_bits:
            buyer_lines.extend(_fit(canvas, bit, font, 6.5, half - 8, 2))
        for index, line in enumerate(buyer_lines[:6]):
            canvas.setFont(font, 6.5)
            canvas.drawString(left + 3, y - 20 - index * 8, line)
    seller = profile.seller_lines or (po.brand.brand_name,)
    seller_y = y - 20
    for index, line in enumerate(seller):
        if index == 0 and line.startswith("OCM "):
            canvas.setFillColorRGB(*MAROON)
            canvas.roundRect(left + half + 3, seller_y - 2, 18, 8, 1, fill=1, stroke=0)
            canvas.setFillColorRGB(1, 1, 1)
            canvas.setFont("Helvetica-Bold", 5)
            canvas.drawCentredString(left + half + 12, seller_y, "OCM")
            canvas.setFillColorRGB(*INK)
            canvas.setFont(font, 6.5)
            canvas.drawString(left + half + 24, seller_y, line[4:])
        else:
            canvas.setFillColorRGB(*INK)
            canvas.setFont(font, 6)
            canvas.drawString(left + half + 3, seller_y, line)
        seller_y -= 8
    canvas.setFillColorRGB(*INK)
    canvas.setFont(font, 6)
    canvas.drawRightString(left + half - 4, y - parties + 4, "(Herein called the Buyer)")
    canvas.drawCentredString(left + half + half / 2, y - parties + 4, "(Herein called the Seller)")
    meta = profile.form_meta or (profile.form_ref,)
    for index, line in enumerate(meta):
        canvas.setFont("Helvetica-Bold" if index == 0 else font, 6.5 if index == 0 else 6)
        canvas.drawString(left + half * 2 + 4, y - 12 - index * 9, line)
    y -= parties
    _line(canvas, left, y, right, y)

    _line(canvas, left + span - meta_w, y - salute, left + span - meta_w, y)
    canvas.setFillColorRGB(*INK)
    for index, line in enumerate(_fit(canvas, profile.salutation, font, 6.5, span - meta_w - 6, 3)):
        canvas.setFont(font, 6.5)
        canvas.drawString(left + 3, y - 9 - index * 8, line)
    canvas.setFont("Helvetica-Bold", 7)
    canvas.drawString(left + span - meta_w + 4, y - 12, "SHEET NO :")
    canvas.setFont(font, 8)
    canvas.drawString(left + span - meta_w + 4, y - 22, f"Sheet {page_no} of {page_count}")
    y -= salute
    _line(canvas, left, y, right, y)

    weights = [0.045, 0.15, 0.385, 0.055, 0.075, 0.06, 0.075, 0.075, 0.08]
    widths = [span * weight for weight in weights]
    widths[-1] = span - sum(widths[:-1])
    headers = [
        ("S.", "No."),
        ("Quality", ""),
        ("ASSORTMENT", ""),
        ("Size", ""),
        ("PIECES/", "METERS"),
        ("Price", ""),
        ("", ""),
        ("", ""),
        ("Remarks", ""),
    ]
    cursor = left
    canvas.setFillColorRGB(*INK)
    for (top_label, sub_label), width in zip(headers, widths):
        canvas.setFont("Helvetica-Bold", 6)
        canvas.drawCentredString(cursor + width / 2, y - 9, top_label)
        if sub_label:
            canvas.setFont("Helvetica", 6)
            canvas.drawCentredString(cursor + width / 2, y - 17, sub_label)
        cursor += width
    delivery_x = left + sum(widths[:6])
    canvas.setFont("Helvetica-Bold", 6)
    canvas.drawCentredString(delivery_x + (widths[6] + widths[7]) / 2, y - 9, "DELIVERY PERIOD")
    canvas.setFont("Helvetica", 6)
    canvas.drawCentredString(delivery_x + widths[6] / 2, y - 17, "From")
    canvas.drawCentredString(delivery_x + widths[6] + widths[7] / 2, y - 17, "To")
    _line(canvas, delivery_x + widths[6], y - col_head, delivery_x + widths[6], y - 12, 0.4)
    y -= col_head
    _line(canvas, left, y, right, y)
    cursor = left
    for width in widths[:-1]:
        cursor += width
        _line(canvas, cursor, bottom + dispatch_head + dispatch_value + sign, cursor, y)

    label_w = 26
    for row in rows:
        mid = y - row_h / 2
        assort_left = left + widths[0] + widths[1]
        _line(canvas, assort_left, mid, assort_left + widths[2], mid, 0.35)
        canvas.setFillColorRGB(*INK)
        body_y = y - row_h / 2 - 3
        _center(canvas, row["no"], font, 7, left, body_y, widths[0])
        if row["full"]:
            _center(canvas, row["quality"], font, 6.5, left + widths[0], y - 12, widths[1] - 2)
            _center(canvas, row["full"], font, 5, left + widths[0], mid + 2, widths[1] - 2)
        else:
            _center(canvas, row["quality"], font, 6.5, left + widths[0], body_y, widths[1] - 2)
        canvas.setFont(font, 6)
        canvas.drawString(left + widths[0] + widths[1] + 2, y - 11, "Shade")
        canvas.drawString(left + widths[0] + widths[1] + 2, mid - 9, "Pcs.")
        cell = (widths[2] - label_w) / SHADES_PER_ROW
        grid_x = left + widths[0] + widths[1] + label_w
        for index in range(SHADES_PER_ROW + 1):
            _line(canvas, grid_x + index * cell, y - row_h, grid_x + index * cell, y, 0.3)
        for index, line in enumerate(row["shades"]):
            origin = grid_x + index * cell
            _center(canvas, line.shade or "", font, 6, origin, y - 11, cell)
            _center(canvas, format_qty(line.quantity, line.unit), font, 7, origin, mid - 9, cell)
        _center(canvas, row["size"], font, 6.5, left + sum(widths[:3]), body_y, widths[3])
        _center(canvas, row["unit"], font, 6, left + sum(widths[:4]), body_y, widths[4])
        _center(canvas, row["price"], font, 6.5, left + sum(widths[:5]), body_y, widths[5])
        _center(canvas, row["from"], font, 5.5, left + sum(widths[:6]), body_y, widths[6])
        _center(canvas, row["to"], font, 5.5, left + sum(widths[:7]), body_y, widths[7])
        remark_x = left + sum(widths[:8])
        for index, line in enumerate(_fit(canvas, row["remarks"], font, 5.5, widths[8] - 3, 3)):
            canvas.setFont(font, 5.5)
            canvas.drawString(remark_x + 2, y - 10 - index * 7, line)
        y -= row_h
        _line(canvas, left, y, right, y, 0.45)

    dispatch_w = span / 4
    canvas.setFont("Helvetica-Bold", 6.5)
    canvas.setFillColorRGB(*INK)
    dispatch_labels = ["MODE OF DESPATCH", "DESTINATION", "DOCUMENTS THROUGH", "SPECIAL INSTRUCTIONS"]
    dispatch_values = [
        "" if blank else (po.mode_of_despatch or ""),
        "" if blank else (po.destination or ""),
        "" if blank else (po.documents_through or ""),
        "" if blank else (po.special_instructions or ""),
    ]
    for index, label in enumerate(dispatch_labels):
        canvas.setFont("Helvetica-Bold", 6)
        canvas.drawCentredString(left + dispatch_w * index + dispatch_w / 2, y - 9, label)
        if index:
            _line(canvas, left + dispatch_w * index, y - dispatch_head - dispatch_value, left + dispatch_w * index, y)
    y -= dispatch_head
    _line(canvas, left, y, right, y)
    for index, value in enumerate(dispatch_values):
        for line_index, line in enumerate(_fit(canvas, value, font, 7, dispatch_w - 6, 2)):
            canvas.setFont(font, 7)
            canvas.drawString(left + dispatch_w * index + 3, y - 10 - line_index * 8, line)
    y -= dispatch_value
    _line(canvas, left, y, right, y)
    sign_w = span * 0.36
    buyer_w = span * 0.34
    legal_w = span - sign_w - buyer_w
    _line(canvas, left + sign_w, bottom, left + sign_w, y)
    _line(canvas, left + sign_w + buyer_w, bottom, left + sign_w + buyer_w, y)
    _line(canvas, left + sign_w + buyer_w, bottom + sign / 2, right, bottom + sign / 2)
    canvas.setFont("Helvetica-Bold", 6.5)
    canvas.drawString(left + 4, y - 10, "SALES REP. SIGNATURE")
    canvas.drawString(left + sign_w + 4, y - 10, "BUYER'S SIGNATURE")
    canvas.setFont(font, 6.5)
    canvas.drawCentredString(left + sign_w + buyer_w + legal_w / 2, y - 12, profile.insurance_line)
    canvas.setFont("Helvetica-Bold", 6.5)
    canvas.drawCentredString(left + sign_w + buyer_w + legal_w / 2, bottom + 6, profile.retention_line)
