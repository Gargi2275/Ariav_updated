from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from entities.models import Entity

from .permissions import DashboardAdminPermission, DashboardPermission
from .services import admin_snapshot, staff_snapshot


def _parse_entity_id(request):
    raw = (request.query_params.get("entity_id") or "all").strip()
    if not raw or raw.lower() == "all":
        return None
    try:
        entity_id = int(raw)
    except (TypeError, ValueError):
        return Response({"detail": "Branch selection must be an integer or 'all'."}, status=status.HTTP_400_BAD_REQUEST)
    if not Entity.objects.filter(pk=entity_id).exists():
        return Response({"detail": "Branch not found."}, status=status.HTTP_404_NOT_FOUND)
    return entity_id


def _parse_period(request):
    raw_from = (request.query_params.get("from") or "").strip()
    raw_to = (request.query_params.get("to") or "").strip()
    if not raw_from and not raw_to:
        return None, None, None
    if not raw_from or not raw_to:
        return None, None, Response(
            {"detail": "Both 'from' and 'to' dates are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        date_from = date.fromisoformat(raw_from)
        date_to = date.fromisoformat(raw_to)
    except ValueError:
        return None, None, Response(
            {"detail": "Dates must use YYYY-MM-DD format."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if date_from > date_to:
        return None, None, Response(
            {"detail": "'from' date must be on or before 'to' date."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if (date_to - date_from).days > 400:
        return None, None, Response(
            {"detail": "The dashboard period cannot be longer than 400 days."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return date_from, date_to, None


@api_view(["GET"])
@permission_classes([DashboardAdminPermission])
def admin_dashboard(request):
    parsed = _parse_entity_id(request)
    if isinstance(parsed, Response):
        return parsed
    date_from, date_to, period_error = _parse_period(request)
    if period_error:
        return period_error
    return Response(admin_snapshot(parsed, date_from=date_from, date_to=date_to))


@api_view(["GET"])
@permission_classes([DashboardAdminPermission])
def entity_dashboard(request):
    parsed = _parse_entity_id(request)
    if isinstance(parsed, Response):
        return parsed
    return Response(admin_snapshot(parsed))


@api_view(["GET"])
@permission_classes([DashboardPermission])
def staff_dashboard(request):
    return Response(staff_snapshot(request.user))
from datetime import date
