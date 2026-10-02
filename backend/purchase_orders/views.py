from django.db.models import Q
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
from .models import PurchaseOrder
from .pdf import build_po_pdf
from .permissions import PurchaseOrderPermission
from .serializers import PurchaseOrderSerializer
from .transitions import (
    DISPATCH_STATUSES,
    MANUAL_DISPATCH_ERROR,
    allowed_next_statuses,
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

    def get_queryset(self):
        qs = scope_to_visible_customers(super().get_queryset(), self.request.user)
        status_filter = self.request.query_params.get("status")
        entity_id = self.request.query_params.get("entity_id")
        customer_id = self.request.query_params.get("customer_id")
        brand_id = self.request.query_params.get("brand_id")
        order_type = self.request.query_params.get("order_type")
        q = self.request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if brand_id:
            qs = qs.filter(brand_id=brand_id)
        if order_type:
            qs = qs.filter(order_type__iexact=order_type)
        if q:
            qs = qs.filter(
                Q(po_number__icontains=q)
                | Q(customer__customer_name__icontains=q)
                | Q(brand__brand_name__icontains=q)
            )
        return qs

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
        rate_err = _unpriced_lines_error(po)
        if rate_err:
            return Response({"detail": rate_err}, status=status.HTTP_400_BAD_REQUEST)
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
        if not getattr(request.user, "is_admin_role", False):
            return Response(
                {"detail": "Only administrators can change this status."},
                status=status.HTTP_403_FORBIDDEN,
            )
        err = validate_transition(po.status, target)
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
        if target == PurchaseOrder.Status.SUBMITTED:
            rate_err = _unpriced_lines_error(po)
            if rate_err:
                return Response({"detail": rate_err}, status=status.HTTP_400_BAD_REQUEST)
        apply_status_change(po, target, user=request.user)
        return Response(PurchaseOrderSerializer(po, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        po = self.get_object()
        payload = build_po_pdf(po)
        safe_name = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in po.po_number)
        response = HttpResponse(payload, content_type="application/pdf")
        prefix = "POR" if po.order_type == PurchaseOrder.OrderType.MANUAL else "PO"
        response["Content-Disposition"] = f'inline; filename="{prefix}-{safe_name}.pdf"'
        return response

    @action(detail=False, methods=["get"], url_path="transitions")
    def transitions(self, request):
        current = (request.query_params.get("status") or "").strip()
        return Response({"status": current, "next": sorted(allowed_next_statuses(current))})

    @action(detail=False, methods=["post"], url_path="import/preview")
    def import_preview(self, request):
        try:
            entity, brand, upload = _require_import_context(request, require_file=True)
            preview = build_preview(upload.read(), entity, brand)
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
        errors["entity_id"] = "Entity is required."
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
            {"entity_id": "Invalid entity_id.", "brand_id": "Invalid brand_id."}
        ) from exc

    entity = Entity.objects.filter(pk=entity_id).first()
    brand = Brand.objects.filter(pk=brand_id).first()
    lookup = {}
    if entity is None:
        lookup["entity_id"] = "Entity was not found."
    if brand is None:
        lookup["brand_id"] = "Brand was not found."
    if lookup:
        raise ValidationError(lookup)
    return entity, brand, upload


def _unpriced_lines_error(po: PurchaseOrder) -> str:
    if any(line.rate is None for line in po.lines.all()):
        return (
            "Every line must have a rate before the purchase order can be submitted. "
            "Rate is not set on one or more lines."
        )
    return ""
