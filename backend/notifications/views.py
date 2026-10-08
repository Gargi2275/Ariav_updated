from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.access import customers_visible_to, is_admin_user

from .models import Notification
from .permissions import NotificationPermission
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Notification.objects.select_related("customer", "entity", "recipient_user").all()
    serializer_class = NotificationSerializer
    permission_classes = [NotificationPermission]
    pagination_class = None
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_admin_user(user):
            qs = qs.filter(Q(recipient_user__isnull=True) | Q(recipient_user=user))
        else:
            qs = qs.filter(
                Q(recipient_user=user)
                | Q(recipient_user__isnull=True, customer_id__in=customers_visible_to(user).values("id"))
            )
        status_filter = self.request.query_params.get("status")
        notification_type = self.request.query_params.get("notification_type")
        entity_id = self.request.query_params.get("entity_id")
        customer_id = self.request.query_params.get("customer_id")
        unread_only = self.request.query_params.get("unread_only")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        q = self.request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if notification_type:
            qs = qs.filter(notification_type__iexact=notification_type)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if unread_only and unread_only.lower() in ("1", "true", "yes"):
            qs = qs.filter(status=Notification.Status.UNREAD)
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(message__icontains=q))
        return qs

    def _unread_qs(self):
        return self.get_queryset().filter(status=Notification.Status.UNREAD)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread_count": self._unread_qs().count()})

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if notification.status == Notification.Status.UNREAD:
            notification.status = Notification.Status.READ
            notification.read_at = timezone.now()
            notification.save(update_fields=["status", "read_at"])
        return Response(NotificationSerializer(notification, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        now = timezone.now()
        updated = self._unread_qs().update(status=Notification.Status.READ, read_at=now)
        return Response({"updated": updated, "unread_count": 0})

    @action(detail=True, methods=["post"], url_path="dismiss")
    def dismiss(self, request, pk=None):
        notification = self.get_object()
        notification.status = Notification.Status.DISMISSED
        if notification.read_at is None:
            notification.read_at = timezone.now()
        notification.save(update_fields=["status", "read_at"])
        return Response(NotificationSerializer(notification, context={"request": request}).data)
