from rest_framework.permissions import BasePermission


class NotificationPermission(BasePermission):
    """Authenticated staff may read and mark notifications.

    Operators see notifications addressed to them, plus unaddressed ones for
    customers_visible_to them (queryset-scoped in the view).
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)
