from rest_framework.permissions import BasePermission

from .access import is_admin_user


class IsAdminRole(BasePermission):
    """Authenticated user with the admin role (AuthUser.is_admin_role)."""

    def has_permission(self, request, view):
        return is_admin_user(request.user)
