from decimal import Decimal, InvalidOperation

from django.db.models import CharField, Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, Concat
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.access import scope_to_visible_customers
from accounts.models import AuditLog
from config.dates import parse_query_dates
from brands.models import Brand
from entities.models import Entity

from .import_service import (
    build_preview,
    commit_import,
    public_preview_payload,
    store_preview,
)
from .models import PurchaseOrder, PurchaseOrderStatusChange
from .form_pdf import build_order_form_pdf
from .pdf import build_po_pdf
from .print_profiles import profile_for_brand
from .dispatch_export import build_dispatch_workbook
from .numbering import ManualPoNumberError, preview_manual_po_number
from .permissions import PurchaseOrderPermission
from .serializers import PurchaseOrderSerializer
from .transitions import (
    DISPATCH_STATUSES,
    MANUAL_DISPATCH_ERROR,
    allowed_next_statuses,
    allowed_transitions_for_user,
    apply_status_change,
    validate_transition,
)


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = (
        PurchaseOrder.objects.select_related("entity", "customer", "brand", "created_by")
        .prefetch_related("lines__product", "lines__dispatch_lines", "lines__invoice_lines__invoice")
        .all()
    )
    serializer_class = PurchaseOrderSerializer
    permission_classes = [PurchaseOrderPermission]
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_authenticate_header(self, request):
        return "Bearer"

    def get_queryset(self, include_order_type=True):
        qs = scope_to_visible_customers(super().get_queryset(), self.request.user)
        status_filter = self.request.query_params.get("status")
        entity_id = self.request.query_params.get("entity_id")
        customer_id = self.request.query_params.get("customer_id")
        brand_id = self.request.query_params.get("brand_id")
        order_type = self.request.query_params.get("order_type")
        has_unpriced = self.request.query_params.get("has_unpriced")
        date_from, date_to = parse_query_dates(self.request.query_params)
        q = self.request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if brand_id:
            qs = qs.filter(brand_id=brand_id)
        if order_type and include_order_type:
            qs = qs.filter(order_type__iexact=order_type)
        if date_from:
            qs = qs.filter(po_date__gte=date_from)
        if date_to:
            qs = qs.filter(po_date__lte=date_to)
        if has_unpriced == "true":
            qs = qs.filter(lines__rate__isnull=True).distinct()
        if q:
            qs = qs.filter(
                Q(po_number__icontains=q)
                | Q(customer__customer_name__icontains=q)
                | Q(brand__brand_name__icontains=q)
            )
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        limit_raw = request.query_params.get("limit")
        if limit_raw:
            try:
                limit = max(1, min(int(limit_raw), 100))
                offset = max(0, int(request.query_params.get("offset", 0)))
            except ValueError:
                return Response({"detail": "limit and offset must be integers."}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset[offset:offset + limit]
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        po = self.get_object()
        if po.status not in {PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.CANCELLED}:
            return Response(
                {"detail": "Only draft or cancelled purchase orders can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        po.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        po = self.get_object()
        err = validate_transition(po.status, PurchaseOrder.Status.SUBMITTED)
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
        if not po.lines.exists():
            return Response(
                {"detail": "Add at least one line item before submitting."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        apply_status_change(po, PurchaseOrder.Status.SUBMITTED, user=request.user)
        return Response(PurchaseOrderSerializer(po, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        po = self.get_object()
        target = (request.data.get("status") or "").strip()
        if not target:
            return Response(
                {"status": "Status is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target not in dict(PurchaseOrder.Status.choices):
            return Response(
                {"status": "Invalid status."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target in DISPATCH_STATUSES:
            return Response({"detail": MANUAL_DISPATCH_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        if target not in allowed_transitions_for_user(po.status, request.user):
            return Response(
                {"detail": "Only administrators can change this status." if not request.user.is_admin_role else f"Cannot change status from {po.status} to {target}."},
                status=status.HTTP_403_FORBIDDEN if not request.user.is_admin_role else status.HTTP_400_BAD_REQUEST,
            )
        err = validate_transition(po.status, target)
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
        apply_status_change(po, target, user=request.user)
        return Response(PurchaseOrderSerializer(po, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path=r"lines/(?P<line_id>\d+)/set-rate")
    def set_rate(self, request, pk=None, line_id=None):
        if not request.user.is_admin_role:
            return Response({"detail": "Only administrators can set a purchase order line rate."}, status=status.HTTP_403_FORBIDDEN)
        po = self.get_object()
        if po.status in {PurchaseOrder.Status.CLOSED, PurchaseOrder.Status.REJECTED, PurchaseOrder.Status.CANCELLED}:
            return Response({"detail": "Rates cannot be set on a closed, rejected, or cancelled purchase order."}, status=status.HTTP_400_BAD_REQUEST)
        line = po.lines.filter(pk=line_id).first()
        if line is None:
            return Response({"detail": "Purchase order line not found."}, status=status.HTTP_404_NOT_FOUND)
        if line.rate is not None:
            return Response({"detail": "This purchase order line already has a rate."}, status=status.HTTP_400_BAD_REQUEST)
        if line.invoice_lines.filter(invoice__status__in=["Issued", "Partially Paid", "Paid", "Overdue"]).exists():
            return Response({"detail": "This line cannot be rated after it has been invoiced."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rate = Decimal(str(request.data.get("rate")))
        except (TypeError, ValueError, InvalidOperation):
            return Response({"rate": "Rate must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)
        if rate <= 0:
            return Response({"rate": "Rate must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)
        line.rate = rate
        line.save(update_fields=["rate", "line_total"])
        PurchaseOrderStatusChange.objects.create(
            purchase_order=po,
            from_status=po.status,
            to_status=po.status,
            changed_by=request.user,
            source=PurchaseOrderStatusChange.Source.RATE_FILL,
            reason=f"Rate filled for line {line.id}: {rate}",
            purchase_order_line=line,
            rate=rate,
        )
        return Response(PurchaseOrderSerializer(po, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="pipeline-summary")
    def pipeline_summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        type_counts = self.filter_queryset(
            self.get_queryset(include_order_type=False)
        ).values("order_type").annotate(count=Count("id", distinct=True))
        total_expression = Coalesce(
            Sum("lines__line_total"),
            Value(0),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        )
        summary = queryset.values("status").annotate(
            count=Count("id", distinct=True),
            total_amount=total_expression,
        )
        by_status = {
            row["status"]: {
                "count": row["count"],
                "total_amount": str(row["total_amount"] or 0),
            }
            for row in summary
        }
        return Response({
            "type_counts": {
                order_type: next(
                    (row["count"] for row in type_counts if row["order_type"] == order_type),
                    0,
                )
                for order_type in PurchaseOrder.OrderType.values
            },
            "statuses": {
            status_value: {
                "count": by_status.get(status_value, {}).get("count", 0),
                "total_amount": by_status.get(status_value, {}).get("total_amount", "0"),
            }
            for status_value in PurchaseOrder.Status.values
            },
        })

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        po = self.get_object()
        form_requested = (request.query_params.get("form") or "") == "1"
        blank = (request.query_params.get("blank") or "") == "1"
        copy = (request.query_params.get("copy") or "").strip().lower()
        profile = profile_for_brand(po.brand.brand_code) if form_requested else None
        if profile:
            if copy not in profile.copies:
                return Response(
                    {"copy": "Choose mill, buyer, or rep."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            payload = build_order_form_pdf(po, profile, copy, blank=blank)
            disposition = "inline"
        else:
            payload = build_po_pdf(po)
            disposition = "inline"
        user = request.user
        AuditLog.objects.create(
            user=getattr(user, "display_name", "") or getattr(user, "username", ""),
            role=getattr(user, "role", ""),
            action="Purchase Order PDF",
            module="Purchase Orders",
            details=(
                f"PO {po.po_number}; form={'1' if profile else '0'}; "
                f"copy={copy or '-'}; blank={'1' if blank and profile else '0'}"
            ),
        )
        safe_name = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in po.po_number)
        response = HttpResponse(payload, content_type="application/pdf")
        prefix = "POR" if po.order_type == PurchaseOrder.OrderType.MANUAL else "PO"
        response["Content-Disposition"] = f'{disposition}; filename="{prefix}-{safe_name}.pdf"'
        return response

    @action(detail=False, methods=["get"], url_path="next-number")
    def next_number(self, request):
        entity_id = (request.query_params.get("entity_id") or "").strip()
        brand_id = (request.query_params.get("brand_id") or "").strip()
        if not entity_id.isdigit():
            return Response({"entity_id": "Choose a branch."}, status=status.HTTP_400_BAD_REQUEST)
        if not brand_id.isdigit():
            return Response({"brand_id": "Choose a brand."}, status=status.HTTP_400_BAD_REQUEST)
        entity = Entity.objects.filter(pk=int(entity_id)).first()
        brand = Brand.objects.filter(pk=int(brand_id)).first()
        if entity is None or entity.status != Entity.Status.ACTIVE:
            return Response(
                {"entity_id": "Choose an active branch."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if brand is None or brand.status != Brand.Status.ACTIVE:
            return Response(
                {"brand_id": "Choose an active brand."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if brand.order_method != Brand.OrderMethod.MANUAL_POR:
            return Response(
                {"brand_id": "Automatic numbers are only issued for manual purchase orders."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not entity.brands.filter(pk=brand.pk).exists():
            return Response(
                {"brand_id": f"Brand {brand.brand_name} is not mapped to branch {entity.entity_name}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            number = preview_manual_po_number(entity, brand)
        except ManualPoNumberError as exc:
            return Response({exc.field: exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"po_number": number})

    @action(detail=False, methods=["get"], url_path="form-qualities")
    def form_qualities(self, request):
        from price_lists.models import BrandQualityPrice, PriceList

        from datetime import date

        from django.utils.dateparse import parse_date

        from price_lists.order_price import MISSING_EX_MILL, quote_for_product

        brand_id = (request.query_params.get("brand_id") or "").strip()
        if not brand_id.isdigit():
            return Response({"brand_id": "Choose a brand."}, status=status.HTTP_400_BAD_REQUEST)
        query = (request.query_params.get("q") or "").strip()
        on = parse_date(request.query_params.get("date") or "") or date.today()
        rows = BrandQualityPrice.objects.select_related("product", "price_list").filter(
            price_list__brand_id=brand_id,
            price_list__status__in=[PriceList.Status.ACTIVE, PriceList.Status.DRAFT],
            price_list__valid_from__lte=on,
        ).filter(Q(price_list__valid_to__isnull=True) | Q(price_list__valid_to__gte=on))
        if query:
            rows = rows.annotate(
                short_code=Concat(
                    "quality_prefix",
                    Value("-"),
                    "quality_number",
                    output_field=CharField(),
                )
            ).filter(
                Q(quality_code__icontains=query)
                | Q(quality_prefix__icontains=query)
                | Q(quality_number__icontains=query)
                | Q(collection_name__icontains=query)
                | Q(short_code__icontains=query)
                | Q(product__product_code__icontains=query)
                | Q(product__product_name__icontains=query)
            )
        def money(value):
            return None if value is None else f"{value:.2f}"

        payload = []
        for row in rows.order_by("quality_code")[:50]:
            short = "-".join(part for part in (row.quality_prefix, row.quality_number) if part)
            shades = [part.strip() for part in (row.shades_raw or "").replace(";", ",").split(",") if part.strip()]
            active_ex_mill = row.price_list.status == PriceList.Status.ACTIVE and row.ex_mill is not None
            listed = money(row.ex_mill) if active_ex_mill else None
            payload.append({
                "quality_code": row.quality_code,
                "quality_label": short or row.quality_code,
                "shades": shades,
                "price": listed,
                "ex_mill": listed,
                "list_name": row.price_list.season_label if listed else "",
                "effective_from": row.price_list.valid_from.isoformat() if listed else None,
                "rate_source": (
                    f"Ex-mill, {row.price_list.season_label}, w.e.f {row.price_list.valid_from.strftime('%d.%m.%Y')}"
                    if listed else ""
                ),
                "price_reason": "" if listed else MISSING_EX_MILL,
                "collection": row.collection_name or "",
                "product_id": row.product_id,
                "product_code": row.product.product_code if row.product_id else "",
                "product_name": row.product.product_name if row.product_id else (row.collection_name or ""),
            })
        from products.models import Product

        linked = {item["product_id"] for item in payload if item["product_id"]}
        products = Product.objects.filter(brand_id=brand_id, status=Product.Status.ACTIVE)
        if query:
            products = products.filter(Q(product_code__icontains=query) | Q(product_name__icontains=query))
        for product in products.order_by("product_code")[:30]:
            if product.id in linked:
                continue
            quote = quote_for_product(product.id, on)
            listed = None if quote is None else money(quote["price"])
            payload.append({
                "quality_code": product.product_code,
                "quality_label": product.product_code,
                "shades": [],
                "price": listed,
                "ex_mill": listed,
                "list_name": "" if quote is None else quote["list_name"],
                "effective_from": None if quote is None else quote["effective_from"].isoformat(),
                "rate_source": "" if quote is None else quote["rate_source"],
                "price_reason": "" if quote else MISSING_EX_MILL,
                "collection": product.collection or "",
                "product_id": product.id,
                "product_code": product.product_code,
                "product_name": product.product_name,
            })
        grouped = {}
        order = []
        for item in payload:
            key = item["quality_label"]
            if key not in grouped:
                grouped[key] = []
                order.append(key)
            grouped[key].append(item)
        merged = []
        for key in order:
            bucket = grouped[key]
            priced = [item for item in bucket if item["price"]]
            base = dict(priced[0] if len(priced) == 1 else bucket[0])
            shades = []
            for item in bucket:
                for shade in item["shades"]:
                    if shade not in shades:
                        shades.append(shade)
            if len(priced) != 1:
                base["price"] = None
                base["ex_mill"] = None
                base["list_name"] = ""
                base["effective_from"] = None
                base["rate_source"] = ""
                base["price_reason"] = MISSING_EX_MILL
            base["shades"] = shades
            merged.append(base)
        return Response(merged)

    @action(detail=True, methods=["get"], url_path="dispatch-excel")
    def dispatch_excel(self, request, pk=None):
        po = self.get_object()
        payload = build_dispatch_workbook(po)
        safe_name = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in po.po_number)
        response = HttpResponse(
            payload,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="dispatch-{safe_name}.xlsx"'
        return response

    @action(detail=False, methods=["get"], url_path="transitions")
    def transitions(self, request):
        current = (request.query_params.get("status") or "").strip()
        return Response({"status": current, "next": sorted(allowed_next_statuses(current))})

    @action(detail=False, methods=["post"], url_path="import/preview")
    def import_preview(self, request):
        try:
            entity, brand, upload = _require_import_context(request, require_file=True)
            format_id = (request.data.get("format_id") or "").strip() or None
            preview = build_preview(upload.read(), entity, brand, format_id)
            preview["file_name"] = getattr(upload, "name", "")
            from price_lists.order_price import stamp_preview

            stamp_preview(preview, brand.id)
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        token = store_preview(request.user.id, preview)
        return Response(public_preview_payload(preview, token), status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="import/commit")
    def import_commit(self, request):
        try:
            entity, brand, _upload = _require_import_context(request, require_file=False)
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        token = (request.data.get("preview_token") or request.data.get("preview_id") or "").strip()
        if not token:
            return Response(
                {
                    "preview_token": (
                        "A matching preview is required before import can be committed."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        order_nos = request.data.get("order_nos")
        if isinstance(order_nos, str):
            order_nos = [part.strip() for part in order_nos.split(",") if part.strip()]
        if not isinstance(order_nos, list):
            return Response(
                {"order_nos": "order_nos must be the list of Order No values approved from preview."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        decisions = request.data.get("decisions")
        if decisions is not None and not isinstance(decisions, dict):
            return Response({"decisions": "decisions must be an object keyed by Party code."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = commit_import(
                user=request.user,
                token=token,
                entity_id=entity.id,
                brand_id=brand.id,
                order_nos=order_nos,
                decisions=decisions,
            )
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as exc:
            return Response({"detail": str(exc.detail)}, status=status.HTTP_403_FORBIDDEN)
        return Response(result, status=status.HTTP_201_CREATED)


def _require_import_context(request, *, require_file: bool):
    errors = {}
    entity_raw = request.data.get("entity_id")
    brand_raw = request.data.get("brand_id")
    if entity_raw in (None, ""):
        errors["entity_id"] = "Branch is required."
    if brand_raw in (None, ""):
        errors["brand_id"] = "Brand is required."

    upload = None
    if require_file:
        upload = request.FILES.get("file") or request.data.get("file")
        if not upload:
            errors["file"] = "A source file is required."
        else:
            name = (getattr(upload, "name", "") or "").lower()
            if not name.endswith((".xlsx", ".xlsm")):
                errors["file"] = "Upload an Excel file (.xlsx)."

    if errors:
        raise ValidationError(errors)

    try:
        entity_id = int(entity_raw)
        brand_id = int(brand_raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            {"entity_id": "Invalid branch selection.", "brand_id": "Invalid brand_id."}
        ) from exc

    entity = Entity.objects.filter(pk=entity_id).first()
    brand = Brand.objects.filter(pk=brand_id).first()
    lookup = {}
    if entity is None:
        lookup["entity_id"] = "Branch was not found."
    if brand is None:
        lookup["brand_id"] = "Brand was not found."
    if lookup:
        raise ValidationError(lookup)
    if entity.status != Entity.Status.ACTIVE:
        raise ValidationError({"entity_id": "Only active branches can be used for purchase order imports."})
    if brand.status != Brand.Status.ACTIVE:
        raise ValidationError({"brand_id": "Only active brands can be used for purchase order imports."})
    if not entity.brands.filter(pk=brand.pk).exists():
        raise ValidationError(
            {"brand_id": f"Brand {brand.brand_name} is not mapped to branch {entity.entity_name}."}
        )
    return entity, brand, upload


def _unpriced_lines_error(po: PurchaseOrder) -> str:
    return ""
