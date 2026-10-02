from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.access import scope_to_visible_customers

from .import_service import (
    build_preview,
    commit_import,
    public_preview_payload,
    store_preview,
)
from .models import Dispatch
from .permissions import DispatchPermission
from .serializers import DispatchSerializer
from .services import sync_purchase_order_dispatch_status


class DispatchViewSet(viewsets.ModelViewSet):
    queryset = (
        Dispatch.objects.select_related("purchase_order", "created_by")
        .prefetch_related(
            "lines__purchase_order_line__product",
            "lines__purchase_order_line__dispatch_lines",
        )
        .all()
    )
    serializer_class = DispatchSerializer
    permission_classes = [DispatchPermission]
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = scope_to_visible_customers(super().get_queryset(), self.request.user, "purchase_order__customer_id")
        po_id = self.request.query_params.get("purchase_order_id")
        customer_id = self.request.query_params.get("customer_id")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        transporter = self.request.query_params.get("transporter")
        q = self.request.query_params.get("search")
        if po_id:
            qs = qs.filter(purchase_order_id=po_id)
        if customer_id:
            qs = qs.filter(purchase_order__customer_id=customer_id)
        if date_from:
            qs = qs.filter(dispatch_date__gte=date_from)
        if date_to:
            qs = qs.filter(dispatch_date__lte=date_to)
        if transporter:
            qs = qs.filter(transporter__icontains=transporter)
        if q:
            qs = qs.filter(
                Q(lr_number__icontains=q)
                | Q(challan_reference__icontains=q)
                | Q(purchase_order__po_number__icontains=q)
                | Q(transporter__icontains=q)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        dispatch = self.get_object()
        po = dispatch.purchase_order
        dispatch.delete()
        sync_purchase_order_dispatch_status(po, user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="import/preview")
    def import_preview(self, request):
        upload = request.FILES.get("file") or request.data.get("file")
        if not upload:
            return Response({"file": "A source file is required."}, status=status.HTTP_400_BAD_REQUEST)
        name = (getattr(upload, "name", "") or "").lower()
        if not name.endswith((".xlsx", ".xlsm")):
            return Response({"file": "Upload an Excel file (.xlsx)."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            preview = build_preview(upload.read(), user=request.user)
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        token = store_preview(request.user.id, preview)
        return Response(public_preview_payload(preview, token), status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="import/commit")
    def import_commit(self, request):
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
        group_keys = request.data.get("group_keys")
        if isinstance(group_keys, str):
            group_keys = [part.strip() for part in group_keys.split(",") if part.strip()]
        if not isinstance(group_keys, list):
            return Response(
                {
                    "group_keys": (
                        "group_keys must be the list of Order Code / Invoice No groups approved from preview."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = commit_import(
                user=request.user,
                token=token,
                group_keys=group_keys,
            )
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)
