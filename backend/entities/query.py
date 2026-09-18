"""Hierarchy helpers and reusable entity-scope filters for later modules.

Future Staff / Clients / POs / invoices should FK to Entity and filter with:

    from entities.query import apply_entity_scope
    qs = apply_entity_scope(qs, entity_id=eid, include_children=True)
"""

from __future__ import annotations

from django.db.models import Q, QuerySet

from .models import Entity


def descendant_ids(entity_id: int, include_self: bool = False) -> list[int]:
    ids: list[int] = [entity_id] if include_self else []
    queue = [entity_id]
    while queue:
        current = queue.pop(0)
        kids = list(Entity.objects.filter(parent_entity_id=current).values_list("id", flat=True))
        ids.extend(kids)
        queue.extend(kids)
    return ids


def ancestor_ids(entity_id: int) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    current = Entity.objects.filter(pk=entity_id).select_related("parent_entity").first()
    while current and current.parent_entity_id:
        pid = current.parent_entity_id
        if pid in seen:
            break
        seen.add(pid)
        ids.append(pid)
        current = current.parent_entity
    return ids


def would_create_cycle(entity_id: int | None, new_parent_id: int | None) -> bool:
    if not new_parent_id:
        return False
    if entity_id and int(new_parent_id) == int(entity_id):
        return True
    if entity_id and int(new_parent_id) in descendant_ids(int(entity_id), include_self=True):
        return True
    return False


def active_child_count(entity_id: int) -> int:
    return Entity.objects.filter(parent_entity_id=entity_id, status=Entity.Status.ACTIVE).count()


def entity_id_scope(entity_id: int, include_children: bool = False) -> list[int]:
    """IDs to use when a report/filter is scoped to one entity, with optional roll-up."""
    if include_children:
        return descendant_ids(entity_id, include_self=True)
    return [entity_id]


def apply_entity_scope(
    queryset: QuerySet,
    *,
    entity_id: int,
    include_children: bool = False,
    field: str = "entity_id",
) -> QuerySet:
    ids = entity_id_scope(entity_id, include_children)
    return queryset.filter(Q(**{f"{field}__in": ids}))


def tree_inclusion_ids(status_filter: str | None) -> tuple[set[int], set[int]]:
    """IDs to render in a status-filtered tree, plus which of those actually match.

    Matching nodes keep full styling. Ancestors of matches are included so the
    tree can nest correctly; callers mark those as context_only.
    """
    qs = Entity.objects.all()
    if status_filter:
        match_ids = set(qs.filter(status__iexact=status_filter).values_list("id", flat=True))
    else:
        match_ids = set(qs.values_list("id", flat=True))
    include_ids = set(match_ids)
    if status_filter:
        for eid in list(match_ids):
            include_ids.update(ancestor_ids(eid))
    return include_ids, match_ids
