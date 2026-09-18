from rest_framework.permissions import BasePermission


class ReportsPermission(BasePermission):
    """Authenticated staff may read live report aggregations.

    Operators receive created_by-scoped rows in the view layer; admins are unscoped.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)
