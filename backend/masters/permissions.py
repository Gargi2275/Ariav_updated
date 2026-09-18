from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAuthenticatedAdminOrReadOnly(BasePermission):
    """Authenticated staff may read. Only admin role may create/update/delete."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(getattr(user, "is_admin_role", False))
