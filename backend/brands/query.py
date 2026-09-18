"""Helpers for Brand Master. Brand is independent of Entity (no entity_id)."""


def product_count(brand_id: int) -> int:
    from products.models import Product

    return Product.objects.filter(brand_id=brand_id).count()


def active_product_count(brand_id: int) -> int:
    from products.models import Product

    return Product.objects.filter(brand_id=brand_id, status=Product.Status.ACTIVE).count()
