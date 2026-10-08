from datetime import date

from django.db import transaction

from .models import PriceList, PriceListEntry


def expire_past_price_lists():
    return PriceList.objects.filter(status=PriceList.Status.ACTIVE, valid_to__lt=date.today()).update(status=PriceList.Status.EXPIRED)


def get_current_price(product_id, lookup_date=None):
    lookup_date = lookup_date or date.today()
    if lookup_date >= date.today():
        expire_past_price_lists()
    return (
        PriceListEntry.objects.select_related("price_list", "product", "product__brand", "product__category")
        .filter(
            product_id=product_id,
            status=PriceListEntry.Status.ACTIVE,
            price_list__status=PriceList.Status.ACTIVE,
            price_list__valid_from__lte=lookup_date,
            price_list__valid_to__gte=lookup_date,
        )
        .order_by("-price_list__valid_from", "-price_list__updated_at", "-id")
        .first()
    )


def overlapping_active_warning(price_list):
    product_ids = price_list.entries.values_list("product_id", flat=True)
    if not product_ids.exists():
        return ""
    overlaps = PriceListEntry.objects.filter(
        product_id__in=product_ids,
        status=PriceListEntry.Status.ACTIVE,
        price_list__status=PriceList.Status.ACTIVE,
        price_list__brand_id=price_list.brand_id,
        price_list__valid_from__lte=price_list.valid_to,
        price_list__valid_to__gte=price_list.valid_from,
    ).exclude(price_list_id=price_list.id).values_list("price_list__season_label", flat=True)
    labels = list(dict.fromkeys(overlaps))
    return f"This Active list overlaps another Active list for the same brand/product: {', '.join(labels)}." if labels else ""
