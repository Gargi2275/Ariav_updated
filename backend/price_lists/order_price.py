"""The only price basis used when an order or invoice line is filled."""

from datetime import date
from decimal import Decimal

from django.db.models import Q
from django.utils.dateparse import parse_date

from .models import BrandQualityPrice, PriceList

PO_PRICE_TIER = "ex_mill"
MISSING_EX_MILL = "No Ex-mill price in an Active list"


def _on_date(value) -> date:
    if isinstance(value, date):
        return value
    parsed = parse_date(str(value or ""))
    return parsed or date.today()


def _quality_parts(text: str) -> tuple[str, str]:
    raw = (text or "").strip()
    parts = [part for part in raw.split("-") if part]
    number = ""
    for part in parts:
        if len(part) == 7 and part.isdigit():
            number = part
            break
    prefix = parts[0] if parts else ""
    return prefix, number


def _match_rows(queryset, text: str):
    raw = (text or "").strip()
    prefix, number = _quality_parts(raw)
    if prefix and number:
        matched = queryset.filter(quality_prefix__iexact=prefix, quality_number=number)
        if matched.exists():
            return matched
    if not raw:
        return queryset.none()
    return queryset.filter(
        Q(quality_code__iexact=raw)
        | Q(product__product_code__iexact=raw)
    )


def _dated(queryset, on: date, *, active_only: bool):
    rows = queryset.filter(price_list__valid_from__lte=on).filter(
        Q(price_list__valid_to__isnull=True) | Q(price_list__valid_to__gte=on)
    )
    if active_only:
        rows = rows.filter(price_list__status=PriceList.Status.ACTIVE)
    return rows


def _quote(row: BrandQualityPrice) -> dict | None:
    if row.ex_mill is None:
        return None
    price_list = row.price_list
    wef = price_list.valid_from.strftime("%d.%m.%Y")
    return {
        "price": row.ex_mill,
        "list_id": price_list.id,
        "list_name": price_list.season_label,
        "effective_from": price_list.valid_from,
        "rate_source": f"Ex-mill, {price_list.season_label}, w.e.f {wef}",
    }


def _single(rows) -> dict | None:
    found = list(rows[:2])
    if len(found) != 1:
        return None
    return _quote(found[0])


def quote_for_quality(brand_id, quality_text, on_date) -> dict | None:
    on = _on_date(on_date)
    rows = _dated(
        _match_rows(BrandQualityPrice.objects.select_related("price_list", "product").filter(price_list__brand_id=brand_id), quality_text),
        on,
        active_only=True,
    )
    return _single(rows)


def quote_for_product(product_id, on_date) -> dict | None:
    if not product_id:
        return None
    on = _on_date(on_date)
    linked = _dated(
        BrandQualityPrice.objects.select_related("price_list", "product").filter(product_id=product_id),
        on,
        active_only=True,
    )
    quote = _single(linked)
    if quote is not None or linked.exists():
        return quote
    from products.models import Product

    product = Product.objects.filter(pk=product_id).only("id", "brand_id", "product_code").first()
    if product is None:
        return None
    return quote_for_quality(product.brand_id, product.product_code, on)


def public_quote(quote: dict | None) -> dict:
    if quote is None:
        return {
            "po_price_tier": PO_PRICE_TIER,
            "price": None,
            "list_id": None,
            "list_name": "",
            "effective_from": None,
            "rate_source": "",
            "reason": MISSING_EX_MILL,
        }
    return {
        "po_price_tier": PO_PRICE_TIER,
        "price": f"{quote['price']:.2f}",
        "list_id": quote["list_id"],
        "list_name": quote["list_name"],
        "effective_from": quote["effective_from"].isoformat(),
        "rate_source": quote["rate_source"],
        "reason": "",
    }


def public_order_price(params) -> dict:
    product_id = str(params.get("product_id") or "").strip()
    quality = str(params.get("quality") or params.get("q") or "").strip()
    brand_id = str(params.get("brand_id") or "").strip()
    if not product_id and not quality:
        return {"po_price_tier": PO_PRICE_TIER}
    on = _on_date(params.get("date"))
    quote = None
    if product_id.isdigit():
        quote = quote_for_product(int(product_id), on)
    elif quality and brand_id.isdigit():
        quote = quote_for_quality(int(brand_id), quality, on)
    return public_quote(quote)


def resolve_invoice_rate(po_line, invoice_date, supplied):
    """PO line rate, then the Ex-Mill list for the invoice date, otherwise None."""
    if supplied is not None:
        return supplied
    if po_line.rate is not None:
        return po_line.rate
    quote = quote_for_product(po_line.product_id, invoice_date) if po_line.product_id else None
    if quote is None:
        quote = quote_for_quality(po_line.purchase_order.brand_id, po_line.product_description, invoice_date)
    if quote is None:
        return None
    return quote["price"]


def stamp_preview(preview: dict, brand_id) -> None:
    """Fill import lines from the Active Ex-Mill list. Parsed files are left unchanged."""
    rows = list(preview.get("importable") or [])
    for party_rows in (preview.get("unmatched_rows") or {}).values():
        rows.extend(party_rows)
    for row in rows:
        on = _on_date(row.get("po_date"))
        for line in row.get("lines") or []:
            description = line.get("description") or line.get("product_description") or ""
            quote = quote_for_quality(brand_id, description, on)
            if quote is None:
                continue
            line["rate"] = f"{quote['price']:.2f}"
            line["rate_source"] = quote["rate_source"]


def catalogue_row(brand_id, quality_text, on_date):
    """Read-only price row covering the date, used by the audit command. Not an order quote."""
    on = _on_date(on_date)
    rows = list(
        _dated(
            _match_rows(
                BrandQualityPrice.objects.select_related("price_list").filter(price_list__brand_id=brand_id),
                quality_text,
            ),
            on,
            active_only=False,
        ).order_by("-price_list__valid_from", "-id")[:5]
    )
    if len(rows) == 1:
        return rows[0]
    active = [row for row in rows if row.price_list.status == PriceList.Status.ACTIVE]
    if len(active) == 1:
        return active[0]
    return None


def tier_name(rate, row) -> str:
    if row is None:
        return "no list entry"
    if rate is None:
        return "blank"
    if row.ex_mill is not None and rate == row.ex_mill:
        return "ex_mill"
    if row.wholesale is not None and rate == row.wholesale:
        return "wholesale"
    if row.retail is not None and rate == row.retail:
        return "retail"
    return "none"


def money_text(value) -> str:
    if value is None:
        return ""
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return f"{value:.2f}"
