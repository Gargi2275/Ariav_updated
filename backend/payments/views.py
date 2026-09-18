from django.db import transaction
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Payment, PaymentAllocation, PaymentAdjustment
from .permissions import PaymentAdjustmentPermission, PaymentPermission
from .serializers import (
    AllocateSerializer,
    PaymentAdjustmentSerializer,
    PaymentSerializer,
    _save_allocations,
    _validate_allocation_batch,
)
from .services import (
    create_payment_adjustment,
    payment_allocated_total,
    refresh_unallocated_amount,
    sync_invoice_payment_status,
)


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = (
        Payment.objects.select_related("entity", "customer", "created_by")
        .prefetch_related(
            "allocations__invoice",
            "adjustments__invoice",
            "adjustments__created_by",
            "adjustments__approved_by",
        )
        .all()
    )
    serializer_class = PaymentSerializer
    permission_classes = [PaymentPermission]
    pagination_class = None
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        customer_id = self.request.query_params.get("customer_id")
        entity_id = self.request.query_params.get("entity_id")
        payment_mode = self.request.query_params.get("payment_mode")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        invoice_id = self.request.query_params.get("invoice_id")
        q = self.request.query_params.get("search")
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        if payment_mode:
            qs = qs.filter(payment_mode__iexact=payment_mode)
        if date_from:
            qs = qs.filter(payment_date__gte=date_from)
        if date_to:
            qs = qs.filter(payment_date__lte=date_to)
        if invoice_id:
            qs = qs.filter(allocations__invoice_id=invoice_id).distinct()
        if q:
            qs = qs.filter(
                Q(payment_number__icontains=q)
                | Q(transaction_reference__icontains=q)
                | Q(customer_code__icontains=q)
                | Q(customer__customer_name__icontains=q)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        payment = self.get_object()
        allocations = list(payment.allocations.select_related("invoice").all())
        if allocations:
            numbers = []
            seen = set()
            for row in allocations:
                number = row.invoice.invoice_number
                if number not in seen:
                    seen.add(number)
                    numbers.append(number)
            listed = ", ".join(numbers)
            return Response(
                {
                    "detail": (
                        f"Cannot delete payment {payment.payment_number}: it has allocations against "
                        f"invoices {listed}. Remove allocations first."
                    ),
                    "invoices": numbers,
                },
                status=status.HTTP_409_CONFLICT,
            )
        payment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="allocate")
    def allocate(self, request, pk=None):
        payment = self.get_object()
        serializer = AllocateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.validated_data["invoice_id"]
        amount = serializer.validated_data["allocated_amount"]
        reason = serializer.validated_data["reason"]
        reference = serializer.validated_data.get("reference") or ""
        already = payment_allocated_total(payment)
        _validate_allocation_batch(
            payment.customer,
            payment.amount,
            [{"invoice": invoice, "allocated_amount": amount}],
            extra_already=already,
        )
        with transaction.atomic():
            created = _save_allocations(payment, [{"invoice": invoice, "allocated_amount": amount}])
            create_payment_adjustment(
                payment=payment,
                allocation=created[0],
                invoice=invoice,
                amount=amount,
                reason=reason,
                reference=reference,
                user=request.user,
            )
            refresh_unallocated_amount(payment)
            sync_invoice_payment_status(invoice)
        payment = self.get_queryset().get(pk=payment.pk)
        return Response(PaymentSerializer(payment, context={"request": request}).data)

    @action(detail=True, methods=["delete"], url_path=r"allocations/(?P<allocation_id>[^/.]+)")
    def destroy_allocation(self, request, pk=None, allocation_id=None):
        payment = self.get_object()
        try:
            allocation = payment.allocations.select_related("invoice").get(pk=allocation_id)
        except PaymentAllocation.DoesNotExist:
            return Response(
                {"detail": "Allocation not found on this payment."},
                status=status.HTTP_404_NOT_FOUND,
            )
        invoice = allocation.invoice
        with transaction.atomic():
            allocation.delete()
            refresh_unallocated_amount(payment)
            sync_invoice_payment_status(invoice)
        payment = self.get_queryset().get(pk=payment.pk)
        return Response(PaymentSerializer(payment, context={"request": request}).data)


class PaymentAdjustmentViewSet(viewsets.ReadOnlyModelViewSet):
    """GET-only audit trail. Records are created via POST /api/payments/:id/allocate/."""

    queryset = (
        PaymentAdjustment.objects.select_related(
            "payment",
            "payment__customer",
            "invoice",
            "created_by",
            "approved_by",
        ).all()
    )
    serializer_class = PaymentAdjustmentSerializer
    permission_classes = [PaymentAdjustmentPermission]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        payment_id = self.request.query_params.get("payment_id")
        invoice_id = self.request.query_params.get("invoice_id")
        customer_id = self.request.query_params.get("customer_id")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        q = self.request.query_params.get("search")
        if payment_id:
            qs = qs.filter(payment_id=payment_id)
        if invoice_id:
            qs = qs.filter(invoice_id=invoice_id)
        if customer_id:
            qs = qs.filter(payment__customer_id=customer_id)
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        if q:
            qs = qs.filter(
                Q(reason__icontains=q)
                | Q(reference__icontains=q)
                | Q(payment__payment_number__icontains=q)
                | Q(invoice__invoice_number__icontains=q)
            )
        return qs
