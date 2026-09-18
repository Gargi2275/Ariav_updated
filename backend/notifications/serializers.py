from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(read_only=True, allow_null=True)
    customer_code = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    entity_id = serializers.IntegerField(read_only=True, allow_null=True)
    entity_code = serializers.SerializerMethodField()
    recipient_user_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "notification_type",
            "title",
            "message",
            "reference_type",
            "reference_id",
            "customer_id",
            "customer_code",
            "customer_name",
            "entity_id",
            "entity_code",
            "recipient_user_id",
            "status",
            "channel",
            "delivery_status",
            "created_at",
            "read_at",
        )
        read_only_fields = fields

    def get_customer_code(self, obj):
        return obj.customer.customer_code if obj.customer_id else ""

    def get_customer_name(self, obj):
        return obj.customer.customer_name if obj.customer_id else ""

    def get_entity_code(self, obj):
        return obj.entity.short_code if obj.entity_id else ""
