"""Invoice PDF — Entity letterhead, customer code, PO reference, totals."""

from io import BytesIO

from .models import Invoice
from .services import invoice_display_status


def _join_parts(*parts: str) -> str:
    return ", ".join(p.strip() for p in parts if p and str(p).strip())


def _entity_address(entity) -> str:
    return _join_parts(
        entity.address_line_1,
        entity.street,
        entity.address_line_2,
        entity.area,
        entity.city,
        entity.state,
        entity.pin_code,
        entity.country,
    )


def _customer_address(customer) -> str:
    return _join_parts(
        customer.address_line_1,
        customer.address_line_2,
        customer.area,
        customer.city,
        customer.state,
        customer.pincode,
        customer.country,
    )


def build_invoice_pdf(invoice: Invoice) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    gold = colors.HexColor("#C9A24E")
    ink = colors.HexColor("#1A1F27")
    muted = colors.HexColor("#5C6570")
    line = colors.HexColor("#D5D8DE")
    header_bg = colors.HexColor("#F4F1EA")

    invoice = (
        Invoice.objects.select_related("entity", "customer", "brand", "purchase_order", "created_by")
        .prefetch_related("lines__product")
        .get(pk=invoice.pk)
    )
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=f"Invoice {invoice.invoice_number}",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "InvTitle",
        parent=styles["Heading1"],
        fontName="Times-Bold",
        fontSize=16,
        textColor=ink,
        spaceAfter=2,
        leading=20,
    )
    subtitle = ParagraphStyle(
        "InvSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=muted,
        leading=12,
        spaceAfter=2,
    )
    heading = ParagraphStyle(
        "InvHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=gold,
        spaceBefore=8,
        spaceAfter=6,
    )
    body = ParagraphStyle(
        "InvBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=ink,
        leading=12,
    )
    small = ParagraphStyle(
        "InvSmall",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=muted,
        leading=11,
    )
    cell = ParagraphStyle(
        "InvCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=ink,
        leading=11,
    )

    entity = invoice.entity
    story = []
    story.append(Paragraph(entity.entity_name, title))
    addr = _entity_address(entity)
    if addr:
        story.append(Paragraph(addr, subtitle))
    meta = _join_parts(
        f"Code {entity.short_code}" if entity.short_code else "",
        f"GSTIN {entity.gst_no}" if entity.gst_no else "",
        entity.phone,
        entity.email,
    )
    if meta:
        story.append(Paragraph(meta, subtitle))
    story.append(Spacer(1, 6))
    story.append(Paragraph("TAX INVOICE", heading))

    info = [
        [
            Paragraph(f"<b>Invoice Number</b><br/>{invoice.invoice_number}", body),
            Paragraph(f"<b>Invoice Date</b><br/>{invoice.invoice_date.strftime('%d %b %Y')}", body),
            Paragraph(f"<b>Due Date</b><br/>{invoice.due_date.strftime('%d %b %Y')}", body),
        ]
    ]
    info_table = Table(info, colWidths=[60 * mm, 55 * mm, 55 * mm])
    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), header_bg),
                ("BOX", (0, 0), (-1, -1), 0.4, line),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, line),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 8))

    cust_addr = _customer_address(invoice.customer)
    parties = [
        [
            Paragraph("<b>Customer</b>", small),
            Paragraph("<b>References</b>", small),
        ],
        [
            Paragraph(
                f"{invoice.customer.customer_name}<br/>"
                f"Customer Code {invoice.customer_code}"
                + (f"<br/>{cust_addr}" if cust_addr else ""),
                body,
            ),
            Paragraph(
                f"PO {invoice.purchase_order.po_number}<br/>"
                f"Brand {invoice.brand.brand_name}<br/>"
                f"Status {invoice_display_status(invoice)}",
                body,
            ),
        ],
    ]
    party_table = Table(parties, colWidths=[90 * mm, 80 * mm])
    party_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.4, line),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, line),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(party_table)
    story.append(Spacer(1, 10))

    header = ["#", "Product Code", "Product Name", "Qty", "Unit", "Rate", "Line Total"]
    data = [header]
    for i, row in enumerate(invoice.lines.all(), start=1):
        if row.product_id:
            code = row.product.product_code
            name = row.product.product_name
            unit = row.product.unit
        else:
            code = "—"
            name = row.product_description or "—"
            unit = "—"
        data.append(
            [
                str(i),
                Paragraph(code, cell),
                Paragraph(name, cell),
                f"{row.quantity:.2f}",
                unit,
                f"{row.rate:.2f}",
                f"{row.line_total:.2f}",
            ]
        )
    col_w = [10 * mm, 28 * mm, 52 * mm, 20 * mm, 18 * mm, 22 * mm, 26 * mm]
    table = Table(data, colWidths=col_w, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), gold),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.3, line),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 8))

    totals = [
        [Paragraph("<b>Subtotal</b>", body), Paragraph(f"{invoice.subtotal:.2f}", body)],
        [
            Paragraph(f"Discount ({invoice.discount_percent:.2f}%)", small),
            Paragraph(f"- {invoice.discount_amount:.2f}", body),
        ],
        [
            Paragraph(f"Tax ({invoice.tax_percent:.2f}%)", small),
            Paragraph(f"{invoice.tax_amount:.2f}", body),
        ],
        [Paragraph("Other charges", small), Paragraph(f"{invoice.other_charges:.2f}", body)],
        [Paragraph("<b>Net amount</b>", body), Paragraph(f"<b>{invoice.net_amount:.2f}</b>", body)],
    ]
    totals_table = Table(totals, colWidths=[120 * mm, 50 * mm])
    totals_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("BACKGROUND", (0, -1), (-1, -1), header_bg),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(totals_table)

    if invoice.payment_terms:
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Payment terms</b>", small))
        story.append(Paragraph(invoice.payment_terms, body))
    if invoice.remarks:
        story.append(Spacer(1, 8))
        story.append(Paragraph("<b>Remarks</b>", small))
        story.append(Paragraph(invoice.remarks.replace("\n", "<br/>"), body))

    story.append(Spacer(1, 22))
    sign = Table(
        [
            [Paragraph("Prepared by", small), Paragraph("Authorised signatory", small)],
            [
                Paragraph("<br/><br/>________________________", body),
                Paragraph("<br/><br/>________________________", body),
            ],
        ],
        colWidths=[85 * mm, 85 * mm],
    )
    sign.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(sign)

    doc.build(story)
    return buffer.getvalue()
