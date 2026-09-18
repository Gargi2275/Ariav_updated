from rest_framework.permissions import BasePermission


class NotificationPermission(BasePermission):
    """Authenticated staff may read and mark notifications.

    Operators are queryset-scoped to their own records in the view.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)
