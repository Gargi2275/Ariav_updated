from django.db.models import Count, Q
from django.utils.dateparse import parse_date
from rest_framework.decorators import action
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
        if self.request.query_params.get("with_usage") in ("1", "true"):
            # Purchase-order lines per product, excluding cancelled/rejected orders; drives "Most used" pickers.
            qs = qs.annotate(
                usage_count=Count(
                    "purchase_order_lines",
                    filter=~Q(purchase_order_lines__purchase_order__status__in=["Cancelled", "Rejected"]),
                    distinct=True,
                )
            )
            return qs
        return qs.distinct()

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        product.status = Product.Status.INACTIVE
        product.save(update_fields=["status", "updated_at"])
        return Response(ProductSerializer(product, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="current-price")
    def current_price(self, request, pk=None):
        from price_lists.serializers import CurrentPriceSerializer
        from price_lists.services import get_current_price

        product = self.get_object()
        requested_date = request.query_params.get("date")
        lookup_date = parse_date(requested_date) if requested_date else None
        if requested_date and lookup_date is None:
            return Response({"date": "Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        result = get_current_price(product.id, lookup_date)
        return Response(CurrentPriceSerializer(result, product=product, lookup_date=lookup_date).data)
