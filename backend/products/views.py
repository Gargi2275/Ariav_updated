from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from masters.permissions import IsAuthenticatedAdminOrReadOnly

from .models import Product
from .serializers import ProductSerializer


class ProductViewSet(viewsets.ModelViewSet):
    queryset = (
        Product.objects.select_related("brand", "category", "category__parent_category", "created_by")
        .all()
        .order_by("product_code")
    )
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedAdminOrReadOnly]
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        brand_id = self.request.query_params.get("brand_id")
        category_id = self.request.query_params.get("category_id")
        availability = self.request.query_params.get("availability")
        q = self.request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if brand_id:
            qs = qs.filter(brand_id=brand_id)
        if category_id:
            qs = qs.filter(category_id=category_id)
        if availability:
            qs = qs.filter(availability__iexact=availability)
        if q:
            qs = qs.filter(
                Q(product_name__icontains=q)
                | Q(product_code__icontains=q)
                | Q(design__icontains=q)
                | Q(colour__icontains=q)
            )
        return qs.distinct()

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        product.status = Product.Status.INACTIVE
        product.save(update_fields=["status", "updated_at"])
        return Response(ProductSerializer(product, context={"request": request}).data)
