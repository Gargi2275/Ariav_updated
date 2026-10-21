from django.db.models import Count, Prefetch, ProtectedError, Q
from django.utils.dateparse import parse_date
from rest_framework.decorators import action
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from masters.permissions import IsAuthenticatedAdminOrReadOnly
from price_lists.models import BrandQualityPrice

from .models import Product
from .serializers import ProductSerializer


class ProductViewSet(viewsets.ModelViewSet):
    queryset = (
        Product.objects.select_related("brand", "category", "category__parent_category", "created_by")
        .prefetch_related(
            Prefetch(
                "brand_quality_prices",
                queryset=BrandQualityPrice.objects.only(
                    "id", "product_id", "quality_prefix", "quality_number", "shades_raw",
                ).order_by("quality_number", "id"),
                to_attr="shade_prices",
            )
        )
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
                | Q(quality__icontains=q)
                | Q(client_item_code__icontains=q)
                | Q(collection__icontains=q)
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
        permanent = (request.query_params.get("permanent") or "").strip().lower() in ("1", "true", "yes")
        if permanent:
            return self._hard_delete(product)
        product.status = Product.Status.INACTIVE
        product.save(update_fields=["status", "updated_at"])
        return Response(ProductSerializer(product, context={"request": request}).data)

    def _hard_delete(self, product: Product):
        if product.status != Product.Status.INACTIVE:
            return Response(
                {"detail": "Only inactive products can be permanently deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        blockers = []
        if product.price_list_entries.exists() or product.brand_quality_prices.exists():
            blockers.append("a price list")
        if product.purchase_order_lines.exists():
            blockers.append("a purchase order")
        if product.invoice_lines.exists():
            blockers.append("an invoice")
        if blockers:
            if len(blockers) == 1:
                where = blockers[0]
            else:
                where = ", ".join(blockers[:-1]) + " and " + blockers[-1]
            return Response(
                {"detail": f"Cannot delete {product.product_name}. It is still used on {where}."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            product.delete()
        except ProtectedError:
            return Response(
                {"detail": f"Cannot delete {product.product_name}. It is still used on another record."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        brand_id = request.query_params.get("brand_id")
        if not str(brand_id or "").isdigit():
            return Response({"brand_id": "Choose a brand before searching products."}, status=status.HTTP_400_BAD_REQUEST)
        entity_id = request.query_params.get("entity_id")
        if entity_id and entity_id != "all":
            from entities.models import Entity

            entity = Entity.objects.filter(pk=entity_id).first()
            if entity is None or not entity.brands.filter(pk=brand_id).exists():
                return Response({"brand_id": "That brand is not mapped to this branch."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            page = max(int(request.query_params.get("page") or 1), 1)
        except ValueError:
            page = 1
        q = (request.query_params.get("q") or "").strip()
        qs = Product.objects.select_related("brand", "category", "category__parent_category").filter(
            brand_id=brand_id,
            status=Product.Status.ACTIVE,
        )
        if q:
            qs = qs.filter(
                Q(product_code__icontains=q)
                | Q(product_name__icontains=q)
                | Q(quality__icontains=q)
                | Q(client_item_code__icontains=q)
                | Q(collection__icontains=q)
            )
        page_size = 50
        start = (page - 1) * page_size
        rows = list(qs.order_by("product_code")[start:start + page_size + 1])
        has_more = len(rows) > page_size
        return Response({
            "results": ProductSerializer(rows[:page_size], many=True, context={"request": request}).data,
            "page": page,
            "has_more": has_more,
        })

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
