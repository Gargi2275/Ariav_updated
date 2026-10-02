from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.access import scope_to_visible_customers

from .models import Invoice
from .pdf import build_invoice_pdf
from .permissions import InvoicePermission
from .serializers import InvoiceSerializer
from .services import InvoiceTransitionError, change_invoice_status, issue_invoice
from .trace import build_invoice_trace, trace_queryset
from .transitions import allowed_next_statuses


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = (
        Invoice.objects.select_related(
            "entity", "customer", "brand", "purchase_order", "created_by"
        )
        .prefetch_related(
            "lines__product",
            "lines__purchase_order_line__dispatch_lines",
            "lines__purchase_order_line__invoice_lines__invoice",
            "allocations__payment",
        )
        .all()
    )
    serializer_class = InvoiceSerializer
    permission_classes = [InvoicePermission]
    pagination_class = None
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = trace_queryset() if self.action == "trace" else super().get_queryset()
        qs = scope_to_visible_customers(qs, self.request.user)
        status_filter = self.request.query_params.get("status")
        entity_id = self.request.query_params.get("entity_id")
        customer_id = self.request.query_params.get("customer_id")
        purchase_order_id = self.request.query_params.get("purchase_order_id")
        q = self.request.query_params.get("search")
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            if len(statuses) == 1 and statuses[0].lower() == "overdue":
                today = timezone.localdate()
                qs = qs.filter(
                    status__in=[Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID],
                    due_date__lt=today,
                )
            else:
                qs = qs.filter(status__in=statuses)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if purchase_order_id:
            qs = qs.filter(purchase_order_id=purchase_order_id)
        if q:
            qs = qs.filter(
                Q(invoice_number__icontains=q)
                | Q(customer_code__icontains=q)
                | Q(customer__customer_name__icontains=q)
                | Q(purchase_order__po_number__icontains=q)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        invoice = self.get_object()
        if invoice.status != Invoice.Status.DRAFT:
            return Response(
                {"detail": "Only draft invoices can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invoice.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="issue")
    def issue(self, request, pk=None):
        invoice = self.get_object()
        try:
            issue_invoice(invoice, request.user)
        except InvoiceTransitionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InvoiceSerializer(invoice, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        invoice = self.get_object()
        target = (request.data.get("status") or "").strip()
        if not target:
            return Response(
                {"status": "Status is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target not in dict(Invoice.Status.choices):
            return Response(
                {"status": "Invalid status."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            change_invoice_status(invoice, target, request.user)
        except InvoiceTransitionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InvoiceSerializer(invoice, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="trace")
    def trace(self, request, pk=None):
        return Response(build_invoice_trace(self.get_object(), user=request.user))

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        payload = build_invoice_pdf(invoice)
        safe_name = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in invoice.invoice_number)
        response = HttpResponse(payload, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="INV-{safe_name}.pdf"'
        return response

    @action(detail=False, methods=["get"], url_path="transitions")
    def transitions(self, request):
        current = (request.query_params.get("status") or "").strip()
        return Response({"status": current, "next": sorted(allowed_next_statuses(current))})
