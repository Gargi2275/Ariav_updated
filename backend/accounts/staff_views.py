from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import AuthUser, UserToken
from .permissions import IsAdminRole
from .staff_serializers import StaffSerializer
from .views import client_ip, write_audit


def _revoke(user: AuthUser) -> None:
    UserToken.objects.filter(user=user, revoked=False).update(revoked=True)


class StaffViewSet(viewsets.ModelViewSet):
    """Admin-only staff directory. Staff cannot call this, and admin accounts are not in the queryset."""

    serializer_class = StaffSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None
    http_method_names = ["get", "post", "put", "head", "options"]

    def get_queryset(self):
        return (
            AuthUser.objects.filter(role=AuthUser.Role.STAFF, is_superuser=False)
            .select_related("entity")
            .order_by("display_name", "username")
        )

    def perform_create(self, serializer):
        user = serializer.save()
        write_audit(
            "Staff account created",
            "Staff",
            f"{user.username} created. Login bypass={user.login_bypass}",
            self.request.user.display_name or self.request.user.username,
            "admin",
            client_ip(self.request),
            "notice",
        )

    def perform_update(self, serializer):
        previous_active = serializer.instance.is_active
        password_changed = bool(serializer.validated_data.get("password"))
        user = serializer.save()
        if password_changed or (previous_active and not user.is_active):
            _revoke(user)
        write_audit(
            "Staff account updated",
            "Staff",
            (
                f"{user.username} updated. Active={user.is_active} Login bypass={user.login_bypass}"
                + (" Password changed." if password_changed else "")
            ),
            self.request.user.display_name or self.request.user.username,
            "admin",
            client_ip(self.request),
            "notice" if user.is_active else "critical",
        )

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        if not user.is_active:
            return Response(StaffSerializer(user).data)
        with transaction.atomic():
            user.is_active = False
            user.save(update_fields=["is_active"])
            _revoke(user)
        write_audit(
            "Staff account deactivated",
            "Staff",
            f"{user.username} deactivated and signed out.",
            request.user.display_name or request.user.username,
            "admin",
            client_ip(request),
            "critical",
        )
        return Response(StaffSerializer(user).data, status=status.HTTP_200_OK)
