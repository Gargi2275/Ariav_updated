from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.response import Response

from masters.permissions import IsAuthenticatedAdminOrReadOnly

from .models import Category
from .query import (
    active_child_count,
    active_product_count,
    child_count,
    product_count,
    tree_inclusion_ids,
)
from .serializers import CategorySerializer, CategoryTreeSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.select_related("parent_category", "created_by").all().order_by(
        "category_code"
    )
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticatedAdminOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        parent = self.request.query_params.get("parent_category_id")
        q = self.request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if parent in ("null", "none", "root", "0"):
            qs = qs.filter(parent_category__isnull=True)
        elif parent:
            qs = qs.filter(parent_category_id=parent)
        if q:
            qs = qs.filter(Q(category_name__icontains=q) | Q(category_code__icontains=q))
        return qs.distinct()

    def list(self, request, *args, **kwargs):
        as_tree = request.query_params.get("tree") in ("1", "true", "yes")
        if as_tree:
            status_filter = (request.query_params.get("status") or "").strip() or None
            parent = request.query_params.get("parent_category_id")
            include_ids, match_ids = tree_inclusion_ids(status_filter)
            if parent in ("null", "none", "root", "0") or not parent:
                roots = Category.objects.filter(id__in=include_ids, parent_category__isnull=True)
            else:
                roots = Category.objects.filter(id__in=include_ids, pk=parent)
            ser = CategoryTreeSerializer(
                roots.order_by("category_code"),
                many=True,
                context={
                    "request": request,
                    "include_ids": include_ids,
                    "match_ids": None if not status_filter else match_ids,
                },
            )
            return Response(ser.data)
        return super().list(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        permanent = (request.query_params.get("permanent") or "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        if permanent:
            return self._hard_delete(category)
        products = active_product_count(category.id, include_children=True)
        if products:
            noun = "active product" if products == 1 else "active products"
            return Response(
                {
                    "detail": (
                        f"Cannot deactivate {category.category_name}: it has {products} {noun}. "
                        "Deactivate or reassign them first."
                    ),
                    "active_product_count": products,
                },
                status=status.HTTP_409_CONFLICT,
            )
        kids = active_child_count(category.id)
        if kids:
            noun = "active subcategory" if kids == 1 else "active subcategories"
            return Response(
                {
                    "detail": (
                        f"Cannot deactivate {category.category_name}: it has {kids} {noun}. "
                        "Deactivate or re-parent them first."
                    ),
                    "active_children_count": kids,
                },
                status=status.HTTP_409_CONFLICT,
            )
        category.status = Category.Status.INACTIVE
        category.save(update_fields=["status", "updated_at"])
        return Response(CategorySerializer(category, context={"request": request}).data)

    def _hard_delete(self, category: Category):
        if category.status != Category.Status.INACTIVE:
            return Response(
                {"detail": "Only inactive categories can be permanently deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        kids = child_count(category.id)
        if kids:
            return Response(
                {
                    "detail": "Delete or reassign subcategories first",
                    "children_count": kids,
                },
                status=status.HTTP_409_CONFLICT,
            )
        products = product_count(category.id)
        if products:
            noun = "product" if products == 1 else "products"
            return Response(
                {
                    "detail": (
                        f"Cannot permanently delete {category.category_name}: "
                        f"it still has {products} {noun}. Reassign or delete them first."
                    ),
                    "product_count": products,
                },
                status=status.HTTP_409_CONFLICT,
            )
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
