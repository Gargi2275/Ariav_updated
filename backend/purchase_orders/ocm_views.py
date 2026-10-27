"""HTTP API for official OCM order review."""

from django.db.models import Q
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from purchase_orders.models import OfficialOcmOrder

from purchase_orders.ocm_official import (
    approve_order,
    compare_order,
    delete_official_orders,
    import_official_file,
    save_mapping,
    select_internal_po,
)


class OfficialOcmListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = OfficialOcmOrder.objects.select_related(
            "customer", "purchase_order", "import_batch", "brand"
        )
        search = (request.query_params.get("search") or "").strip()
        status = (request.query_params.get("status") or "").strip()
        if search:
            query = query.filter(
                Q(order_number__icontains=search)
                | Q(purchase_order__po_number__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(customer_code__icontains=search)
                | Q(customer__customer_name__icontains=search)
                | Q(customer__customer_code__icontains=search)
            )
        if status:
            query = query.filter(status=status)
        if request.query_params.get("unresolved") == "1":
            query = query.exclude(status=OfficialOcmOrder.Status.APPROVED)
        total = query.count()
        rows = []
        for order in query.order_by("-id")[:200]:
            report = compare_order(order)
            lines = report["lines"]
            matched = sum(1 for line in lines if line["status"] == "Exact Match")
            rows.append({
                "id": order.id,
                "order_number": order.order_number,
                "status": order.status,
                "customer_code": order.customer_code,
                "customer_name": order.customer.customer_name if order.customer_id else order.customer_name,
                "filename": order.import_batch.filename,
                "imported_at": order.import_batch.imported_at.isoformat(),
                "purchase_order_number": order.purchase_order.po_number if order.purchase_order_id else "",
                "brand": order.brand.brand_code,
                "line_count": len(lines),
                "matched_line_count": matched,
                "unmatched_line_count": len(lines) - matched,
            })
        return Response({"orders": rows, "total": total})

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"file": "Choose an official OCM workbook."}, status=400)
        name = upload.name or ""
        if not name.lower().endswith((".xlsx", ".xlsb")):
            return Response({"file": "Upload an .xlsx or .xlsb workbook."}, status=400)
        result = import_official_file(upload.read(), name, request.user)
        return Response(result, status=200 if result["duplicate_file"] else 201)


class OfficialOcmDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = OfficialOcmOrder.objects.filter(pk=pk).first()
        if order is None:
            return Response({"detail": "Not found."}, status=404)
        return Response(compare_order(order))

    def delete(self, request, pk):
        try:
            result = delete_official_orders([pk], request.user)
        except ValidationError as exc:
            return Response(exc.detail, status=400)
        if result["missing"]:
            return Response({"detail": "Not found."}, status=404)
        if result["blocked"] and not result["deleted"]:
            return Response({"detail": result["blocked"][0]["reason"]}, status=400)
        return Response(result)


class OfficialOcmBulkDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data if hasattr(request.data, "get") else {}
        try:
            if data.get("all_unapproved"):
                result = delete_official_orders([], request.user, all_unapproved=True)
            else:
                result = delete_official_orders(data.get("ids"), request.user)
        except ValidationError as exc:
            return Response(exc.detail, status=400)
        return Response(result)


class OfficialOcmSelectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        order = _order_or_404(pk)
        return Response(select_internal_po(order, request.data.get("purchase_order_id"), request.user))


class OfficialOcmMappingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        order = _order_or_404(pk)
        return Response(save_mapping(order, request.data, request.user))


class OfficialOcmApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not OfficialOcmOrder.objects.filter(pk=pk).exists():
            return Response({"detail": "Not found."}, status=404)
        return Response(approve_order(pk, str(request.data.get("reason") or ""), request.user))


def _order_or_404(pk):
    order = OfficialOcmOrder.objects.filter(pk=pk).first()
    if order is None:
        raise NotFound("Not found.")
    return order
