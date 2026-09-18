from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.response import Response

from masters.permissions import IsAuthenticatedAdminOrReadOnly

from .models import Brand
from .query import active_product_count, product_count
from .serializers import BrandSerializer


class BrandViewSet(viewsets.ModelViewSet):
    queryset = Brand.objects.select_related("created_by").all().order_by("brand_code")
    serializer_class = BrandSerializer
    permission_classes = [IsAuthenticatedAdminOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        q = self.request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if q:
            qs = qs.filter(Q(brand_name__icontains=q) | Q(brand_code__icontains=q))
        return qs.distinct()

    def destroy(self, request, *args, **kwargs):
        brand = self.get_object()
        permanent = (request.query_params.get("permanent") or "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        if permanent:
            return self._hard_delete(brand)
        linked = active_product_count(brand.id)
        if linked:
            noun = "active product" if linked == 1 else "active products"
            return Response(
                {
                    "detail": (
                        f"Cannot deactivate {brand.brand_name}: it has {linked} {noun}. "
                        "Deactivate or reassign them first."
                    ),
                    "active_product_count": linked,
                },
                status=status.HTTP_409_CONFLICT,
            )
        brand.status = Brand.Status.INACTIVE
        brand.save(update_fields=["status", "updated_at"])
        return Response(BrandSerializer(brand, context={"request": request}).data)

    def _hard_delete(self, brand: Brand):
        if brand.status != Brand.Status.INACTIVE:
            return Response(
                {"detail": "Only inactive brands can be permanently deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        active = active_product_count(brand.id)
        if active:
            noun = "active product" if active == 1 else "active products"
            return Response(
                {
                    "detail": (
                        f"Cannot permanently delete {brand.brand_name}: "
                        f"it has {active} {noun}. Deactivate or reassign them first."
                    ),
                    "active_product_count": active,
                },
                status=status.HTTP_409_CONFLICT,
            )
        linked = product_count(brand.id)
        if linked:
            noun = "product" if linked == 1 else "products"
            return Response(
                {
                    "detail": (
                        f"Cannot permanently delete {brand.brand_name}: "
                        f"it still has {linked} {noun}. Reassign or delete them first."
                    ),
                    "product_count": linked,
                },
                status=status.HTTP_409_CONFLICT,
            )
        brand.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
