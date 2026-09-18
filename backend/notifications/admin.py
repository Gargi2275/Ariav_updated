from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "notification_type",
        "title",
        "status",
        "channel",
        "created_at",
    )
    list_filter = ("notification_type", "status", "channel")
    search_fields = ("title", "message")
    readonly_fields = (
        "notification_type",
        "title",
        "message",
        "reference_type",
        "reference_id",
        "customer",
        "entity",
        "recipient_user",
        "status",
        "channel",
        "delivery_status",
        "created_at",
        "read_at",
    )
