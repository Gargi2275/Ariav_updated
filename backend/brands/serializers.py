from django.db import IntegrityError
from rest_framework import serializers

from masters.serializers import validate_gstin, validate_pan, validate_phone

from entities.models import Entity
from .models import Brand


class BrandSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    branch_ids = serializers.PrimaryKeyRelatedField(
        source="entities",
        queryset=Entity.objects.all(),
        many=True,
        required=False,
    )
    branches = serializers.SerializerMethodField()

    class Meta:
        model = Brand
        fields = (
            "id",
            "brand_code",
            "brand_name",
            "status",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
            "contact_person",
            "phone",
            "mobile",
            "email",
            "address",
            "gst_no",
            "pan_no",
            "commission_rate",
            "commission_basis",
            "payment_terms",
            "credit_days",
            "order_method",
            "branch_ids",
            "branches",
        )
        read_only_fields = ("id", "created_at", "updated_at", "created_by", "created_by_name")
        extra_kwargs = {
            "brand_code": {"validators": []},
        }

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.display_name or obj.created_by.username

    def get_branches(self, obj):
        return [
            {
                "id": entity.id,
                "short_code": entity.short_code,
                "entity_name": entity.entity_name,
            }
            for entity in obj.entities.filter(status=Entity.Status.ACTIVE).order_by("short_code")
        ]

    def validate_branch_ids(self, value):
        inactive = [
            entity.entity_name
            for entity in value
            if entity.status != Entity.Status.ACTIVE
            and not (self.instance and self.instance.entities.filter(pk=entity.pk).exists())
        ]
        if inactive:
            raise serializers.ValidationError(
                f"Inactive branches cannot be assigned: {', '.join(inactive)}."
            )
        return value

    def validate_brand_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Brand code is required.")
        qs = Brand.objects.filter(brand_code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Brand code {value} is already in use.")
        return value

    def validate_brand_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Brand name is required.")
        return value

    def validate_order_method(self, value):
        value = (value or "").strip()
        if value not in dict(Brand.OrderMethod.choices):
            raise serializers.ValidationError("Order method must be Digital PO or Manual/POR.")
        return value

    def validate_gst_no(self, value):
        return validate_gstin(value)

    def validate_pan_no(self, value):
        return validate_pan(value)

    def validate_phone(self, value):
        return validate_phone(value)

    def validate_mobile(self, value):
        return validate_phone(value)

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            validated_data["created_by"] = user
        try:
            return super().create(validated_data)
        except IntegrityError:
            raise serializers.ValidationError(
                {"brand_code": ["Brand code is already in use. Try a different code."]}
            )
