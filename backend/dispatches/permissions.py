from rest_framework.permissions import BasePermission, SAFE_METHODS


class DispatchPermission(BasePermission):
    """Authenticated staff may read and create/edit/delete dispatches.

    Operators only reach dispatches on POs of customers_visible_to them (viewset
    queryset and the create serializer's PO field).
    TODO: tighten create/update/destroy when the roles/permissions module lands.
    Operator = operational staff (same note as PO creation).
    """

    STAFF_ACTIONS = {
        "create",
        "update",
        "partial_update",
        "destroy",
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
        if action in self.STAFF_ACTIONS:
            return True
        return bool(getattr(user, "is_admin_role", False))
