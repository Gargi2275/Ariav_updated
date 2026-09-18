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
        return Response({"detail": "entity_id must be an integer or 'all'."}, status=status.HTTP_400_BAD_REQUEST)
    if not Entity.objects.filter(pk=entity_id).exists():
        return Response({"detail": "Entity not found."}, status=status.HTTP_404_NOT_FOUND)
    return entity_id


@api_view(["GET"])
@permission_classes([DashboardAdminPermission])
def admin_dashboard(request):
    parsed = _parse_entity_id(request)
    if isinstance(parsed, Response):
        return parsed
    return Response(admin_snapshot(parsed))


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
