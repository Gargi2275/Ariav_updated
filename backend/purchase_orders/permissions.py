from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.access import can_delete_records, can_edit_records


class PurchaseOrderPermission(BasePermission):
    """Authenticated staff may read, create/edit/submit Draft POs, and delete Drafts or Cancelled POs.

    Status overrides (Sent to Brand, Reject, Cancel after submit, On Hold, …)
    are admin-only. Operator = operational staff. Operators only reach POs of
    customers_visible_to them (viewset queryset; out-of-scope ids are 404).
    """

    STAFF_ACTIONS = {
        "create",
        "update",
        "partial_update",
        "destroy",
        "submit",
        "import_preview",
        "import_commit",
    }

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        action = getattr(view, "action", None)
        if action == "change_status" and request.data.get("status") in {
            "Partially Dispatched",
            "Fully Dispatched",
        }:
            return True
        if action in {"update", "partial_update"}:
            return can_edit_records(user)
        if action == "destroy":
            return can_delete_records(user)
        if action in self.STAFF_ACTIONS:
            return True
        return bool(getattr(user, "is_admin_role", False))
