"""Customer ledger statement PDF."""

from io import BytesIO


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


def _primary_entity(customer):
    link = customer.entity_links.filter(primary_entity=True).select_related("entity").first()
    if link:
        return link.entity
    link = customer.entity_links.select_related("entity").first()
    return link.entity if link else None


def build_customer_ledger_pdf(customer, payload: dict) -> bytes:
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

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=f"Customer Ledger {customer.customer_code}",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "LedTitle",
        parent=styles["Heading1"],
        fontName="Times-Bold",
        fontSize=16,
        textColor=ink,
        spaceAfter=2,
        leading=20,
    )
    subtitle = ParagraphStyle(
        "LedSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=muted,
        leading=12,
        spaceAfter=2,
    )
    heading = ParagraphStyle(
        "LedHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=gold,
        spaceBefore=8,
        spaceAfter=6,
    )
    body = ParagraphStyle(
        "LedBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=ink,
        leading=12,
    )
    small = ParagraphStyle(
        "LedSmall",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=muted,
        leading=11,
    )

    story = []
    entity = _primary_entity(customer)
    if entity:
        story.append(Paragraph(entity.entity_name, title))
        addr = _entity_address(entity)
        if addr:
            story.append(Paragraph(addr, subtitle))
        meta = _join_parts(
            f"Code {entity.short_code}" if entity.short_code else "",
            f"GSTIN {entity.gst_no}" if getattr(entity, "gst_no", "") else "",
            entity.phone,
            entity.email,
        )
        if meta:
            story.append(Paragraph(meta, subtitle))
    else:
        story.append(Paragraph("Customer Ledger", title))
    story.append(Spacer(1, 6))
    story.append(Paragraph("CUSTOMER LEDGER STATEMENT", heading))

    range_label = "Full history"
    if payload.get("date_from") or payload.get("date_to"):
        range_label = f"{payload.get('date_from') or '…'} to {payload.get('date_to') or '…'}"
    cust_addr = _customer_address(customer)
    story.append(
        Paragraph(
            f"<b>{customer.customer_name}</b><br/>Customer Code {customer.customer_code}"
            + (f"<br/>{cust_addr}" if cust_addr else "")
            + f"<br/>Period {range_label}",
            body,
        )
    )
    story.append(Spacer(1, 8))
    if payload.get("date_from"):
        story.append(Paragraph(f"Opening balance as of {payload['date_from']}: {payload['opening_balance']}", small))
        story.append(Spacer(1, 6))

    header = ["Date", "Type", "Reference", "Debit", "Credit", "Balance"]
    data = [header]
    entries = payload.get("entries") or []
    if not entries:
        data.append(["—", "—", "No transactions yet", "0.00", "0.00", payload.get("opening_balance") or "0.00"])
    else:
        for row in entries:
            data.append(
                [
                    row["date"],
                    row["type"],
                    row["reference"],
                    row["debit_amount"],
                    row["credit_amount"],
                    row["running_balance"],
                ]
            )
    col_w = [28 * mm, 28 * mm, 42 * mm, 24 * mm, 24 * mm, 26 * mm]
    table = Table(data, colWidths=col_w, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), gold),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
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
    story.append(Spacer(1, 10))

    summary = payload.get("summary") or {}
    totals = [
        [Paragraph("<b>Total invoiced</b>", body), Paragraph(summary.get("total_invoiced", "0.00"), body)],
        [Paragraph("Total paid", small), Paragraph(summary.get("total_paid", "0.00"), body)],
        [Paragraph("Outstanding balance", small), Paragraph(summary.get("outstanding_balance", "0.00"), body)],
        [Paragraph("Advance/Credit balance", small), Paragraph(summary.get("advance_credit_balance", "0.00"), body)],
        [Paragraph("Overdue amount", small), Paragraph(summary.get("overdue_amount", "0.00"), body)],
    ]
    totals_table = Table(totals, colWidths=[120 * mm, 50 * mm])
    totals_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(totals_table)
    doc.build(story)
    return buffer.getvalue()
