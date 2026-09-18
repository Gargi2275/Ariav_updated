"""Shared PO / POR PDF — letterhead from Entity. Header label follows order_type."""

from io import BytesIO

from .models import PurchaseOrder


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


def build_po_pdf(po: PurchaseOrder) -> bytes:
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

    po = (
        PurchaseOrder.objects.select_related("entity", "customer", "brand", "created_by")
        .prefetch_related("lines__product")
        .get(pk=po.pk)
    )
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=f"{'Purchase Order Request' if po.order_type == PurchaseOrder.OrderType.MANUAL else 'Purchase Order'} {po.po_number}",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "POTitle",
        parent=styles["Heading1"],
        fontName="Times-Bold",
        fontSize=16,
        textColor=ink,
        spaceAfter=2,
        leading=20,
    )
    subtitle = ParagraphStyle(
        "POSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=muted,
        leading=12,
        spaceAfter=2,
    )
    heading = ParagraphStyle(
        "POHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=gold,
        spaceBefore=8,
        spaceAfter=6,
    )
    body = ParagraphStyle(
        "POBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=ink,
        leading=12,
    )
    small = ParagraphStyle(
        "POSmall",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=muted,
        leading=11,
    )
    cell = ParagraphStyle(
        "POCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=ink,
        leading=11,
    )

    entity = po.entity
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
    is_manual = po.order_type == PurchaseOrder.OrderType.MANUAL
    story.append(Paragraph("PURCHASE ORDER REQUEST" if is_manual else "PURCHASE ORDER", heading))

    doc_label = "POR" if is_manual else "PO"
    info = [
        [
            Paragraph(f"<b>{doc_label} Number</b><br/>{po.po_number}", body),
            Paragraph(f"<b>PO Date</b><br/>{po.po_date.strftime('%d %b %Y')}", body),
            Paragraph(f"<b>Status</b><br/>{po.status}", body),
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

    cust_addr = _customer_address(po.customer)
    parties = [
        [
            Paragraph("<b>Customer</b>", small),
            Paragraph("<b>Brand</b>", small),
        ],
        [
            Paragraph(
                f"{po.customer.customer_name}<br/>"
                f"Code {po.customer.customer_code}"
                + (f"<br/>{cust_addr}" if cust_addr else ""),
                body,
            ),
            Paragraph(
                f"{po.brand.brand_name}<br/>Code {po.brand.brand_code}",
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
    qty_total = 0
    amt_total = 0
    for i, row in enumerate(po.lines.all(), start=1):
        qty_total += row.quantity
        amt_total += row.line_total
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
                f"{row.rate:.2f}" if row.rate is not None else "—",
                f"{row.line_total:.2f}",
            ]
        )
    data.append(["", "", "Total", f"{qty_total:.2f}", "", "", f"{amt_total:.2f}"])
    col_w = [10 * mm, 28 * mm, 52 * mm, 20 * mm, 18 * mm, 22 * mm, 26 * mm]
    table = Table(data, colWidths=col_w, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), gold),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("BACKGROUND", (0, -1), (-1, -1), header_bg),
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

    if is_manual and po.handy_form_upload:
        story.append(Spacer(1, 8))
        story.append(Paragraph("Reference form attached", small))

    if po.remarks:
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Remarks</b>", small))
        story.append(Paragraph(po.remarks.replace("\n", "<br/>"), body))

    story.append(Spacer(1, 22))
    sign = Table(
        [
            [
                Paragraph("Prepared by", small),
                Paragraph("Approved by", small),
            ],
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
