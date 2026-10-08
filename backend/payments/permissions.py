from rest_framework.permissions import BasePermission, SAFE_METHODS


class PaymentPermission(BasePermission):
    """Authenticated staff may read, create payments, and add allocations.

    Deleting a payment or an allocation is admin-only. Operators only reach payments
    of customers_visible_to them (viewset queryset; out-of-scope ids are 404).
    """

    STAFF_ACTIONS = {"create", "allocate"}

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


class PaymentAdjustmentPermission(BasePermission):
    """Authenticated staff may read payment adjustment audit records.

    Create is a side effect of POST /api/payments/:id/allocate/ only.
    Unsafe methods are left enabled at the permission layer so DRF returns 405
    (no handler) rather than 403. Operators only see adjustments on payments of
    customers_visible_to them.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)
