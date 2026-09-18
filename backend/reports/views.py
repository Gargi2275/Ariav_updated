from datetime import date

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.access import is_admin_user
from entities.models import Entity

from .permissions import ReportsPermission
from . import services


def _parse_date(raw, field):
    if not raw:
        return None
    try:
        return date.fromisoformat(raw.strip())
    except (TypeError, ValueError):
        return Response(
            {"detail": f"{field} must be YYYY-MM-DD."},
            status=status.HTTP_400_BAD_REQUEST,
        )


def _parse_filters(request):
    date_from = _parse_date(request.query_params.get("from"), "from")
    if isinstance(date_from, Response):
        return date_from
    date_to = _parse_date(request.query_params.get("to"), "to")
    if isinstance(date_to, Response):
        return date_to
    if date_from is None or date_to is None:
        default_from, default_to = services.default_date_range()
        date_from = date_from or default_from
        date_to = date_to or default_to
    if date_from > date_to:
        return Response(
            {"detail": "'from' must be on or before 'to'."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    raw_entity = (request.query_params.get("entity_id") or "all").strip()
    entity_id = None
    if raw_entity and raw_entity.lower() != "all":
        try:
            entity_id = int(raw_entity)
        except (TypeError, ValueError):
            return Response(
                {"detail": "entity_id must be an integer or 'all'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not Entity.objects.filter(pk=entity_id).exists():
            return Response({"detail": "Entity not found."}, status=status.HTTP_404_NOT_FOUND)
    return date_from, date_to, entity_id


def _created_by_id(request):
    if is_admin_user(request.user):
        return None
    return request.user.pk


def _ok(request, payload):
    parsed = _parse_filters(request)
    if isinstance(parsed, Response):
        return parsed
    date_from, date_to, entity_id = parsed
    body = payload(date_from, date_to, entity_id, _created_by_id(request))
    if isinstance(body, dict):
        body.setdefault("from", date_from.isoformat())
        body.setdefault("to", date_to.isoformat())
        body.setdefault("entity_id", entity_id or "all")
        return Response(body)
    return Response(
        {
            "from": date_from.isoformat(),
            "to": date_to.isoformat(),
            "entity_id": entity_id or "all",
            "rows": body,
        }
    )


@api_view(["GET"])
@permission_classes([ReportsPermission])
def purchase_sales_trend(request):
    return _ok(request, services.purchase_sales_trend)


@api_view(["GET"])
@permission_classes([ReportsPermission])
def payment_trend(request):
    return _ok(request, services.payment_trend)


@api_view(["GET"])
@permission_classes([ReportsPermission])
def product_trend(request):
    return _ok(request, services.product_trend)


@api_view(["GET"])
@permission_classes([ReportsPermission])
def seasonal_trend(request):
    return _ok(request, services.seasonal_trend)


@api_view(["GET"])
@permission_classes([ReportsPermission])
def bad_debt_trend(request):
    return _ok(request, services.bad_debt_trend)


@api_view(["GET"])
@permission_classes([ReportsPermission])
def outstanding_report(request):
    parsed = _parse_filters(request)
    if isinstance(parsed, Response):
        return parsed
    date_from, date_to, entity_id = parsed
    return Response(
        {
            "from": date_from.isoformat(),
            "to": date_to.isoformat(),
            "entity_id": entity_id or "all",
            "rows": services.outstanding_report(entity_id, _created_by_id(request)),
        }
    )


@api_view(["GET"])
@permission_classes([ReportsPermission])
def customer_performance(request):
    return _ok(request, services.customer_performance)


@api_view(["GET"])
@permission_classes([ReportsPermission])
def brand_performance(request):
    return _ok(request, services.brand_performance)


@api_view(["GET"])
@permission_classes([ReportsPermission])
def entity_performance(request):
    return _ok(request, services.entity_performance)
