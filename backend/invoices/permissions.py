from rest_framework.permissions import BasePermission, SAFE_METHODS


class InvoicePermission(BasePermission):
    """Authenticated staff may read, create/edit Draft invoices, and issue them.

    Cancel and other status stubs are admin-only. Operators only reach invoices of
    customers_visible_to them (viewset queryset; out-of-scope ids are 404).
    """

    STAFF_ACTIONS = {"create", "update", "partial_update", "destroy", "issue"}

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        action = getattr(view, "action", None)
        if action in self.STAFF_ACTIONS:
            return True
        return bool(getattr(user, "is_admin_role", False))
