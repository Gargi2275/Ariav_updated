from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from masters.permissions import IsAuthenticatedAdminOrReadOnly

from .models import Entity
from .query import active_child_count, tree_inclusion_ids
from .serializers import EntityDetailSerializer, EntitySerializer, EntityTreeSerializer


class EntityViewSet(viewsets.ModelViewSet):
    queryset = Entity.objects.select_related("parent_entity", "created_by").all().order_by("short_code")
    serializer_class = EntitySerializer
    permission_classes = [IsAuthenticatedAdminOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return EntityDetailSerializer
        return EntitySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        parent = self.request.query_params.get("parent_entity_id")
        q = self.request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if parent in ("null", "none", "root", "0"):
            qs = qs.filter(parent_entity__isnull=True)
        elif parent:
            qs = qs.filter(parent_entity_id=parent)
        if q:
            qs = qs.filter(
                Q(entity_name__icontains=q) | Q(short_code__icontains=q) | Q(city__icontains=q)
            )
        return qs.distinct()

    def list(self, request, *args, **kwargs):
        as_tree = request.query_params.get("tree") in ("1", "true", "yes")
        if as_tree:
            status_filter = (request.query_params.get("status") or "").strip() or None
            parent = request.query_params.get("parent_entity_id")
            include_ids, match_ids = tree_inclusion_ids(status_filter)
            if parent in ("null", "none", "root", "0") or not parent:
                roots = Entity.objects.filter(id__in=include_ids, parent_entity__isnull=True)
            else:
                roots = Entity.objects.filter(id__in=include_ids, pk=parent)
            ser = EntityTreeSerializer(
                roots.order_by("short_code"),
                many=True,
                context={
                    "request": request,
                    "include_ids": include_ids,
                    "match_ids": None if not status_filter else match_ids,
                },
            )
            return Response(ser.data)
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=["get"])
    def tree(self, request, pk=None):
        entity = self.get_object()
        ser = EntityTreeSerializer(entity, context={"request": request})
        return Response(ser.data)

    def destroy(self, request, *args, **kwargs):
        entity = self.get_object()
        active_kids = active_child_count(entity.id)
        if active_kids:
            noun = "child entity" if active_kids == 1 else "child entities"
            return Response(
                {
                    "detail": (
                        f"Cannot deactivate {entity.entity_name}: it has {active_kids} active {noun}. "
                        "Deactivate or re-parent them first."
                    ),
                    "active_children_count": active_kids,
                },
                status=status.HTTP_409_CONFLICT,
            )
        entity.status = Entity.Status.INACTIVE
        entity.save(update_fields=["status", "updated_at"])
        return Response(EntitySerializer(entity, context={"request": request}).data)
