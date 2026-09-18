from rest_framework.permissions import BasePermission

from accounts.access import is_admin_user


class DashboardPermission(BasePermission):
    """Authenticated staff may read the staff dashboard.

    Admin and entity company-wide snapshots require is_admin_role.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)


class DashboardAdminPermission(BasePermission):
    """Company-wide admin/entity dashboards are admin-only."""

    def has_permission(self, request, view):
        return is_admin_user(request.user)
