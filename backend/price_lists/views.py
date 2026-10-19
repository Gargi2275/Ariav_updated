from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from django.http import HttpResponse
from openpyxl import Workbook
from django.core.cache import cache

from masters.permissions import IsAuthenticatedAdminOrReadOnly

from .models import PriceList, PriceListEntry, PriceListQualityEntry
from .serializers import PriceListEntrySerializer, PriceListSerializer
from .services import expire_past_price_lists, overlapping_active_warning
from .import_service import build_preview, commit_import, public_preview_payload, store_preview
from .ocm_quality_import import (
    FORMAT_ID,
    MAX_FILE_SIZE,
    build_quality_preview,
    commit_quality_import,
    _public_preview as public_quality_preview,
    store_quality_preview,
)
from .osm_pdf_import import (
    FORMAT_ID as OSM_PDF_FORMAT,
    MAX_FILE_SIZE as OSM_PDF_MAX_FILE_SIZE,
    build_osm_pdf_preview,
    commit_osm_pdf_import,
    public_osm_preview,
    store_osm_preview,
)


def _import_selection(data):
    raw_year = data.get("year")
    try:
        year = int(raw_year)
    except (TypeError, ValueError):
        raise ValueError("Year must be an integer from 2000 to 2100.") from None
    if isinstance(raw_year, bool) or not 2000 <= year <= 2100:
        raise ValueError("Year must be an integer from 2000 to 2100.")
    season = data.get("season")
    if season not in ("Summer", "Winter"):
        raise ValueError("Season must be Summer or Winter.")
    return year, season


def _import_scope(data):
    try:
        branch_id = int(data.get("branch_id"))
        brand_id = int(data.get("brand_id"))
    except (TypeError, ValueError):
        raise ValueError("An active Branch and Brand are required.") from None
    if branch_id <= 0 or brand_id <= 0:
        raise ValueError("An active Branch and Brand are required.")
    return branch_id, brand_id


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

    @action(detail=True, methods=["get"], url_path="quality-entries")
    def quality_entries(self, request, pk=None):
        price_list = self.get_object()
        rows = []
        query = price_list.quality_entries.prefetch_related("shades").all()
        search = (request.query_params.get("search") or "").strip()
        if search:
            query = query.filter(quality_no__icontains=search)
        for entry in query:
            rows.append({
                "id": entry.id,
                "source_row": entry.source_row,
                "source_page": entry.source_page,
                "collection_name": entry.collection_name,
                "collection_code": entry.collection_code,
                "serial_no": entry.serial_no,
                "quality_no": entry.quality_no,
                "shades_raw": entry.shades_raw,
                "shades": [shade.shade_raw for shade in entry.shades.all()],
                "delivery_raw": entry.delivery_raw,
                "delivery_month": entry.delivery_month,
                "ex_mill": str(entry.ex_mill) if entry.ex_mill is not None else None,
                "wholesale": str(entry.wholesale) if entry.wholesale is not None else None,
                "retail": str(entry.retail) if entry.retail is not None else None,
                "flags": entry.flags,
                "raw_values": entry.raw_values,
                "review_status": entry.review_status,
            })
        return Response(rows)

    @action(detail=True, methods=["get"], url_path="quality-entries/export")
    def quality_entries_export(self, request, pk=None):
        price_list = self.get_object()
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Quality Prices"
        sheet.append(["Collection", "Collection Code", "Serial No.", "Quality No.", "Shades", "Delivery", "Ex-Mill", "W/S", "Retail", "Source Row", "Page"])
        def safe(value):
            if isinstance(value, str) and value[:1] in "=+-@":
                return "'" + value
            return value

        for entry in price_list.quality_entries.prefetch_related("shades").all():
            sheet.append([
                safe(entry.collection_name), safe(entry.collection_code), entry.serial_no, safe(entry.quality_no),
                safe(entry.shades_raw), safe(entry.delivery_raw), entry.ex_mill, entry.wholesale, entry.retail,
                entry.source_row, entry.source_page,
            ])
        response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = f'attachment; filename="quality-prices-{price_list.id}.xlsx"'
        workbook.save(response)
        return response

    @action(detail=False, methods=["post"], url_path="import/preview")
    def import_preview(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"file": "Upload a price list file."}, status=status.HTTP_400_BAD_REQUEST)
        if request.data.get("format_id") == OSM_PDF_FORMAT:
            if not (upload.name or "").lower().endswith(".pdf"):
                return Response({"file": "Upload a PDF price list. Excel files are not accepted for this brand."}, status=status.HTTP_400_BAD_REQUEST)
            if upload.size > OSM_PDF_MAX_FILE_SIZE:
                return Response({"file": "The PDF must be no larger than 8 MB."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                try:
                    branch_id, brand_id = _import_scope(request.data)
                    year, season = _import_selection(request.data)
                except ValueError as exc:
                    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
                preview = build_osm_pdf_preview(
                    upload.read(),
                    file_name=upload.name,
                    branch_id=branch_id,
                    brand_id=brand_id,
                    year=year,
                    season=season,
                )
            except Exception as exc:
                from rest_framework.exceptions import ValidationError
                if isinstance(exc, ValidationError):
                    return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
                raise
            token = store_osm_preview(request.user.id, preview)
            return Response(public_osm_preview(preview, token))
        if request.data.get("format_id") == FORMAT_ID:
            if upload.name and "." in upload.name and not upload.name.lower().endswith(".xlsx"):
                return Response({"code": "PL_FILE_TYPE_UNSUPPORTED", "file": "Quality price imports accept .xlsx files only."}, status=status.HTTP_400_BAD_REQUEST)
            if upload.size > MAX_FILE_SIZE:
                return Response({"code": "PL_FILE_TOO_LARGE", "file": "The quality price list must be no larger than 5 MB."}, status=status.HTTP_400_BAD_REQUEST)
            key = f"price-list-quality-preview-rate:{request.user.id}"
            if not cache.add(key, 1, timeout=60):
                hits = cache.incr(key)
                if hits > 5:
                    return Response({"code": "PL_PREVIEW_RATE_LIMITED", "file": "Too many preview requests. Try again in a minute."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if request.data.get("format_id") and request.data.get("format_id") != FORMAT_ID:
            return Response({"format_id": "Unsupported Price List format."}, status=status.HTTP_400_BAD_REQUEST)
        if request.data.get("format_id") == FORMAT_ID:
            try:
                try:
                    branch_id, brand_id = _import_scope(request.data)
                except ValueError as exc:
                    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
                preview = build_quality_preview(
                    upload.read(),
                    file_name=upload.name,
                    branch_id=branch_id,
                    brand_id=brand_id,
                    year=request.data.get("year") or None,
                    season=request.data.get("season") or None,
                    valid_from=request.data.get("valid_from") or None,
                    valid_to=request.data.get("valid_to") or None,
                )
            except Exception as exc:
                from rest_framework.exceptions import ValidationError
                if isinstance(exc, ValidationError):
                    return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
                raise
            token = store_quality_preview(request.user.id, preview)
            return Response(public_quality_preview(preview, token))
        try:
            try:
                year, season = _import_selection(request.data)
            except ValueError as exc:
                return Response({"year": str(exc)} if "Year" in str(exc) else {"season": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            try:
                branch_id, brand_id = _import_scope(request.data)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            preview = build_preview(upload.read(), year, season, branch_id, brand_id)
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
        if request.data.get("format_id") == OSM_PDF_FORMAT:
            try:
                try:
                    branch_id, brand_id = _import_scope(request.data)
                    year, season = _import_selection(request.data)
                except ValueError as exc:
                    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
                result = commit_osm_pdf_import(
                    user=request.user,
                    token=token,
                    branch_id=branch_id,
                    brand_id=brand_id,
                    year=year,
                    season=season,
                )
            except Exception as exc:
                from rest_framework.exceptions import ValidationError
                if isinstance(exc, ValidationError):
                    return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
                raise
            return Response(result, status=status.HTTP_201_CREATED)
        if not isinstance(group_keys, list):
            return Response({"group_keys": "group_keys must be approved identifiers from the preview."}, status=status.HTTP_400_BAD_REQUEST)
        if request.data.get("format_id") and request.data.get("format_id") != FORMAT_ID:
            return Response({"format_id": "Unsupported Price List format."}, status=status.HTTP_400_BAD_REQUEST)
        if request.data.get("format_id") == FORMAT_ID:
            try:
                try:
                    branch_id, brand_id = _import_scope(request.data)
                except ValueError as exc:
                    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
                result = commit_quality_import(
                    user=request.user,
                    token=token,
                    branch_id=branch_id,
                    brand_id=brand_id,
                    confirmed_warnings=str(request.data.get("confirmed_warnings", "")).lower() == "true" or request.data.get("confirmed_warnings") is True,
                )
            except Exception as exc:
                from rest_framework.exceptions import ValidationError
                if isinstance(exc, ValidationError):
                    return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
                raise
            return Response(result, status=status.HTTP_201_CREATED)
        try:
            try:
                year, season = _import_selection(request.data)
            except ValueError as exc:
                return Response({"year": str(exc)} if "Year" in str(exc) else {"season": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            try:
                branch_id, brand_id = _import_scope(request.data)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            result = commit_import(user=request.user, token=token, group_keys=group_keys, year=year, season=season, branch_id=branch_id, brand_id=brand_id)
        except Exception as exc:
            from rest_framework.exceptions import ValidationError
            if isinstance(exc, ValidationError):
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            raise
        return Response(result, status=status.HTTP_201_CREATED)
