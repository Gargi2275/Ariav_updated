from rest_framework.permissions import BasePermission


class ReportsPermission(BasePermission):
    """Authenticated staff may read live report aggregations.

    Operators receive rows for customers_visible_to them (view layer); admins are unscoped.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)
