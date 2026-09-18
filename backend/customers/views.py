from django.http import HttpResponse
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.access import operator_can_view_customer
from masters.permissions import IsAuthenticatedAdminOrReadOnly

from .models import Customer
from .query import active_downstream_count, downstream_count
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = (
        Customer.objects.select_related("created_by")
        .prefetch_related("entity_links__entity")
        .all()
        .order_by("customer_code")
    )
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticatedAdminOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        q = self.request.query_params.get("search")
        entity_id = self.request.query_params.get("entity_id")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if q:
            qs = qs.filter(Q(customer_name__icontains=q) | Q(customer_code__icontains=q))
        if entity_id:
            qs = qs.filter(entities__id=entity_id)
        return qs.distinct()

    def _forbid_unrelated_financial_view(self, customer):
        """Judgment call: operators may open ledger/360 only for customers on a
        PO, invoice, or payment they created. Admins see every customer.
        The original spec did not define this boundary; full financial history
        is treated as staff-scoped unless the user is admin.
        """
        if operator_can_view_customer(self.request.user, customer):
            return None
        return Response(
            {
                "detail": (
                    "You can only view this customer’s ledger and 360° if they appear "
                    "on a purchase order, invoice, or payment you created."
                )
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    def destroy(self, request, *args, **kwargs):
        customer = self.get_object()
        permanent = (request.query_params.get("permanent") or "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        if permanent:
            return self._hard_delete(customer)
        linked = active_downstream_count(customer.id)
        if linked:
            noun = "active downstream record" if linked == 1 else "active downstream records"
            return Response(
                {
                    "detail": (
                        f"Cannot deactivate {customer.customer_name}: it has {linked} {noun}. "
                        "Deactivate or reassign them first."
                    ),
                    "active_downstream_count": linked,
                },
                status=status.HTTP_409_CONFLICT,
            )
        customer.status = Customer.Status.INACTIVE
        customer.save(update_fields=["status", "updated_at"])
        return Response(CustomerSerializer(customer, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="advance-balance")
    def advance_balance(self, request, pk=None):
        customer = self.get_object()
        from payments.services import customer_advance_credit

        return Response(
            {
                "customer_id": customer.id,
                "customer_code": customer.customer_code,
                "advance_balance": str(customer_advance_credit(customer.id)),
            }
        )

    def _parse_ledger_dates(self, request):
        from datetime import date

        raw_from = (request.query_params.get("from") or request.query_params.get("date_from") or "").strip()
        raw_to = (request.query_params.get("to") or request.query_params.get("date_to") or "").strip()
        date_from = date_to = None
        try:
            if raw_from:
                date_from = date.fromisoformat(raw_from)
            if raw_to:
                date_to = date.fromisoformat(raw_to)
        except ValueError:
            return None, None, Response(
                {"detail": "Dates must be YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if date_from and date_to and date_from > date_to:
            return None, None, Response(
                {"detail": "The from date cannot be after the to date."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return date_from, date_to, None

    @action(detail=True, methods=["get"], url_path="ledger")
    def ledger(self, request, pk=None):
        from ledger.customer import build_customer_ledger

        customer = self.get_object()
        date_from, date_to, err = self._parse_ledger_dates(request)
        if err:
            return err
        forbidden = self._forbid_unrelated_financial_view(customer)
        if forbidden:
            return forbidden
        return Response(build_customer_ledger(customer, date_from=date_from, date_to=date_to))

    @action(detail=True, methods=["get"], url_path="ledger/pdf")
    def ledger_pdf(self, request, pk=None):
        from ledger.customer import build_customer_ledger
        from ledger.pdf import build_customer_ledger_pdf

        customer = self.get_object()
        date_from, date_to, err = self._parse_ledger_dates(request)
        if err:
            return err
        forbidden = self._forbid_unrelated_financial_view(customer)
        if forbidden:
            return forbidden
        payload = build_customer_ledger(customer, date_from=date_from, date_to=date_to)
        pdf = build_customer_ledger_pdf(customer, payload)
        safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in customer.customer_code)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="LEDGER-{safe}.pdf"'
        return response

    @action(detail=True, methods=["get"], url_path="360")
    def profile_360(self, request, pk=None):
        from .profile360 import build_customer_360

        customer = self.get_object()
        date_from, date_to, err = self._parse_ledger_dates(request)
        if err:
            return err
        forbidden = self._forbid_unrelated_financial_view(customer)
        if forbidden:
            return forbidden
        return Response(build_customer_360(customer, date_from=date_from, date_to=date_to))

    def _hard_delete(self, customer: Customer):
        if customer.status != Customer.Status.INACTIVE:
            return Response(
                {"detail": "Only inactive customers can be permanently deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        linked = downstream_count(customer.id)
        if linked:
            noun = "downstream record" if linked == 1 else "downstream records"
            return Response(
                {
                    "detail": (
                        f"Cannot permanently delete {customer.customer_name}: "
                        f"it still has {linked} {noun}. Reassign or delete them first."
                    ),
                    "downstream_count": linked,
                },
                status=status.HTTP_409_CONFLICT,
            )
        customer.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
