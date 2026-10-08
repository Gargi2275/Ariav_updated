from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from masters.permissions import IsAuthenticatedAdminOrReadOnly

from .models import PriceList, PriceListEntry
from .serializers import PriceListEntrySerializer, PriceListSerializer
from .services import expire_past_price_lists, overlapping_active_warning
from .import_service import build_preview, commit_import, public_preview_payload, store_preview


class PriceListViewSet(viewsets.ModelViewSet):
    queryset = PriceList.objects.select_related("brand", "created_by").prefetch_related("entries__product__brand", "entries__product__category").all()
    permission_classes = [IsAuthenticatedAdminOrReadOnly]
    serializer_class = PriceListSerializer
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        expire_past_price_lists()
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("brand_id"): qs = qs.filter(brand_id=params["brand_id"])
        if params.get("status"): qs = qs.filter(status__iexact=params["status"])
        if params.get("season_label"): qs = qs.filter(season_label__icontains=params["season_label"])
        start, end = parse_date(params.get("date_from", "")), parse_date(params.get("date_to", ""))
        if start: qs = qs.filter(valid_to__gte=start)
        if end: qs = qs.filter(valid_from__lte=end)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        price_list = self.get_queryset().get(pk=response.data["id"])
        response.data["warning"] = overlapping_active_warning(price_list) if price_list.status == PriceList.Status.ACTIVE else ""
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        price_list = self.get_queryset().get(pk=response.data["id"])
        response.data["warning"] = overlapping_active_warning(price_list) if price_list.status == PriceList.Status.ACTIVE else ""
        return response

    def destroy(self, request, *args, **kwargs):
        price_list = self.get_object()
        if price_list.status != PriceList.Status.DRAFT:
            return Response({"detail": "Only Draft Price Lists can be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    def entries(self, request, pk=None):
        price_list = self.get_object()
        if request.method == "POST":
            serializer = PriceListEntrySerializer(data=request.data, context={"price_list": price_list})
            serializer.is_valid(raise_exception=True)
            entry = serializer.save()
            response = Response(PriceListEntrySerializer(entry).data, status=status.HTTP_201_CREATED)
            response.data["warning"] = overlapping_active_warning(price_list) if price_list.status == PriceList.Status.ACTIVE else ""
            return response
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def entry_detail(self, request, pk=None, entry_id=None):
        price_list = self.get_object()
        entry = price_list.entries.get(pk=entry_id)
        if request.method == "PUT":
            serializer = PriceListEntrySerializer(entry, data=request.data, context={"price_list": price_list})
            serializer.is_valid(raise_exception=True)
            return Response(PriceListEntrySerializer(serializer.save()).data)
        if request.method == "DELETE":
            entry.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=False, methods=["post"], url_path="import/preview")
    def import_preview(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"file": "Upload an Excel file."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            preview = build_preview(upload.read())
        except Exception as exc:
            from rest_framework.exceptions import ValidationError
            if isinstance(exc, ValidationError):
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            raise
        token = store_preview(request.user.id, preview)
        return Response(public_preview_payload(preview, token))

    @action(detail=False, methods=["post"], url_path="import/commit")
    def import_commit(self, request):
        token = (request.data.get("preview_token") or "").strip()
        group_keys = request.data.get("group_keys")
        if isinstance(group_keys, str):
            group_keys = [item.strip() for item in group_keys.split(",") if item.strip()]
        if not token:
            return Response({"preview_token": "A matching preview is required before import can be committed."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(group_keys, list):
            return Response({"group_keys": "group_keys must be approved identifiers from the preview."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = commit_import(user=request.user, token=token, group_keys=group_keys)
        except Exception as exc:
            from rest_framework.exceptions import ValidationError
            if isinstance(exc, ValidationError):
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            raise
        return Response(result, status=status.HTTP_201_CREATED)
