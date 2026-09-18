"""Two-level Category helpers. Depth is fixed at Category → Subcategory."""

from __future__ import annotations

from .models import Category


def ancestor_ids(category_id: int) -> list[int]:
    current = Category.objects.filter(pk=category_id).only("parent_category_id").first()
    if current and current.parent_category_id:
        return [current.parent_category_id]
    return []


def active_child_count(category_id: int) -> int:
    return Category.objects.filter(
        parent_category_id=category_id,
        status=Category.Status.ACTIVE,
    ).count()


def child_count(category_id: int) -> int:
    return Category.objects.filter(parent_category_id=category_id).count()


def product_count(category_id: int) -> int:
    from products.models import Product

    return Product.objects.filter(category_id=category_id).count()


def active_product_count(category_id: int, include_children: bool = True) -> int:
    from products.models import Product

    ids = [category_id]
    if include_children:
        ids.extend(
            Category.objects.filter(parent_category_id=category_id).values_list("id", flat=True)
        )
    return Product.objects.filter(
        category_id__in=ids,
        status=Product.Status.ACTIVE,
    ).count()


def tree_inclusion_ids(status_filter: str | None) -> tuple[set[int], set[int]]:
    qs = Category.objects.all()
    if status_filter:
        match_ids = set(qs.filter(status__iexact=status_filter).values_list("id", flat=True))
    else:
        match_ids = set(qs.values_list("id", flat=True))
    include_ids = set(match_ids)
    if status_filter:
        for cid in list(match_ids):
            include_ids.update(ancestor_ids(cid))
    return include_ids, match_ids
