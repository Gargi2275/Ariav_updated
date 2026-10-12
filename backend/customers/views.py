from django.http import HttpResponse
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from accounts.access import can_view_customer, scope_to_visible_customers
from masters.permissions import IsAuthenticatedAdminOrReadOnly
from statements.models import CustomerStatement

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
        if self.action == "list" and (self.request.query_params.get("scope") or "").lower() == "visible":
            qs = scope_to_visible_customers(qs, self.request.user, field="id")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if q:
            qs = qs.filter(
                Q(customer_name__icontains=q)
                | Q(customer_code__icontains=q)
                | Q(gst_no__icontains=q)
                | Q(city__icontains=q)
            )
        if entity_id:
            qs = qs.filter(entities__id=entity_id)
        return qs.distinct()

    def _forbid_unrelated_financial_view(self, customer):
        """Operators may open ledger/360 only for customers_visible_to them (403 here,
        unlike the transaction endpoints' 404, to keep the existing behaviour).
        """
        if can_view_customer(self.request.user, customer.pk):
            return None
        return Response(
            {
                "detail": (
                    "You can only view this party’s ledger and 360° if they appear "
                    "on a purchase order, dispatch, invoice, or payment you created."
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
        if not can_view_customer(request.user, customer.pk):
            raise NotFound()
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

    def _statement_for_customer(self, request, customer):
        entity_id = (request.query_params.get("entity_id") or "").strip()
        if not entity_id:
            return None, Response(
                {"detail": "entity_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            entity_id = int(entity_id)
        except ValueError:
            return None, Response(
                {"detail": "Branch selection must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not can_view_customer(request.user, customer.pk):
            return None, Response(
                status=status.HTTP_404_NOT_FOUND,
            )
        statements = CustomerStatement.objects.filter(
            customer=customer,
            entity_id=entity_id,
        ).prefetch_related("entries")
        period_to = (request.query_params.get("period_to") or "").strip()
        if period_to:
            try:
                from datetime import date

                requested_to = date.fromisoformat(period_to)
            except ValueError:
                return None, Response(
                    {"detail": "period_to must be YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            statements = statements.filter(period_to=requested_to)
        statement = statements.order_by("-period_to", "-period_from").first()
        if statement is None:
            return None, Response(status=status.HTTP_404_NOT_FOUND)
        return statement, None

    @action(detail=True, methods=["get"], url_path="statement")
    def statement(self, request, pk=None):
        customer = self.get_object()
        statement, error = self._statement_for_customer(request, customer)
        if error:
            return error
        return Response(
            {
                "customer_id": customer.id,
                "customer_code": customer.customer_code,
                "customer_name": customer.customer_name,
                "period_from": statement.period_from.isoformat(),
                "period_to": statement.period_to.isoformat(),
                "ledger_code": statement.ledger_code,
                "ledger_description": statement.ledger_description,
                "opening_amount": str(statement.opening_amount),
                "opening_dc": statement.opening_dc,
                "total_debit": str(statement.total_debit),
                "total_credit": str(statement.total_credit),
                "closing_amount": str(statement.closing_amount),
                "closing_dc": statement.closing_dc,
                "entries": [
                    {
                        "post_date": entry.post_date.isoformat(),
                        "doc_type": entry.doc_type,
                        "doc_no": entry.doc_no,
                        "text": entry.text,
                        "debit": str(entry.debit),
                        "credit": str(entry.credit),
                        "balance_amount": str(entry.balance_amount),
                        "balance_dc": entry.balance_dc,
                        "reference": entry.reference,
                        "due_date": entry.due_date.isoformat() if entry.due_date else None,
                        "tds_amount": str(entry.tds_amount),
                    }
                    for entry in statement.entries.all().order_by("line_no")
                ],
            }
        )

    @action(detail=True, methods=["get"], url_path="statement-summary")
    def statement_summary(self, request, pk=None):
        customer = self.get_object()
        statement, error = self._statement_for_customer(request, customer)
        if error:
            return error
        return Response(
            {
                "closing_amount": str(statement.closing_amount),
                "closing_dc": statement.closing_dc,
                "period_to": statement.period_to.isoformat(),
            }
        )

    @action(detail=False, methods=["get"], url_path="statement-report")
    def statement_report(self, request):
        entity_id = (request.query_params.get("entity_id") or "").strip()
        if not entity_id:
            return Response({"detail": "entity_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            entity_id = int(entity_id)
        except ValueError:
            return Response(            {"detail": "Branch selection must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        statements = CustomerStatement.objects.filter(
            entity_id=entity_id,
            customer__in=scope_to_visible_customers(Customer.objects.all(), request.user, field="id"),
        ).select_related("customer").order_by("customer_code")
        customer_code = (request.query_params.get("customer_code") or "").strip()
        customer_name = (request.query_params.get("customer_name") or "").strip()
        if customer_code:
            statements = statements.filter(customer_code__icontains=customer_code)
        if customer_name:
            statements = statements.filter(customer__customer_name__icontains=customer_name)

        period_from = (request.query_params.get("period_from") or "").strip()
        period_to = (request.query_params.get("period_to") or "").strip()
        try:
            if period_from:
                from datetime import date

                statements = statements.filter(period_from=date.fromisoformat(period_from))
            if period_to:
                from datetime import date

                statements = statements.filter(period_to=date.fromisoformat(period_to))
        except ValueError:
            return Response({"detail": "period_from and period_to must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        rows = []
        for statement in statements:
            rows.append(
                {
                    "customer_id": statement.customer_id,
                    "customer_code": statement.customer_code,
                    "customer_name": statement.customer.customer_name,
                    "period_from": statement.period_from.isoformat(),
                    "period_to": statement.period_to.isoformat(),
                    "opening_debit": str(statement.opening_amount if statement.opening_dc == "DR" else 0),
                    "opening_credit": str(statement.opening_amount if statement.opening_dc == "CR" else 0),
                    "period_debit": str(statement.total_debit),
                    "period_credit": str(statement.total_credit),
                    "closing_debit": str(statement.closing_amount if statement.closing_dc == "DR" else 0),
                    "closing_credit": str(statement.closing_amount if statement.closing_dc == "CR" else 0),
                }
            )
        return Response({"rows": rows, "count": len(rows)})

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
