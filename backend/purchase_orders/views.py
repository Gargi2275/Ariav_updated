from decimal import Decimal, InvalidOperation

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.access import scope_to_visible_customers
from brands.models import Brand
from entities.models import Entity

from .import_service import (
    build_preview,
    commit_import,
    public_preview_payload,
    store_preview,
)
from .models import PurchaseOrder, PurchaseOrderStatusChange
from .pdf import build_po_pdf
from .dispatch_export import build_dispatch_workbook
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

    def get_queryset(self, include_order_type=True):
        qs = scope_to_visible_customers(super().get_queryset(), self.request.user)
        status_filter = self.request.query_params.get("status")
        entity_id = self.request.query_params.get("entity_id")
        customer_id = self.request.query_params.get("customer_id")
        brand_id = self.request.query_params.get("brand_id")
        order_type = self.request.query_params.get("order_type")
        has_unpriced = self.request.query_params.get("has_unpriced")
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
        if po.status != PurchaseOrder.Status.DRAFT:
            return Response(
                {"detail": "Only draft purchase orders can be deleted."},
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
        payload = build_po_pdf(po)
        safe_name = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in po.po_number)
        response = HttpResponse(payload, content_type="application/pdf")
        prefix = "POR" if po.order_type == PurchaseOrder.OrderType.MANUAL else "PO"
        response["Content-Disposition"] = f'inline; filename="{prefix}-{safe_name}.pdf"'
        return response

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
        token = (request.data.get("preview_token") or "").strip()
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
        try:
            result = commit_import(
                user=request.user,
                token=token,
                entity_id=entity.id,
                brand_id=brand.id,
                order_nos=order_nos,
            )
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
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
    return entity, brand, upload


def _unpriced_lines_error(po: PurchaseOrder) -> str:
    return ""
