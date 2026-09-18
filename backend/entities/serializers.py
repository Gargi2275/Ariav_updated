from django.db import IntegrityError
from rest_framework import serializers

from masters.serializers import validate_gstin, validate_pan, validate_phone

from .models import Entity
from .query import active_child_count, descendant_ids, would_create_cycle


class EntitySummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Entity
        fields = ("id", "short_code", "entity_name", "entity_type", "status")


class EntitySerializer(serializers.ModelSerializer):
    parent_entity_id = serializers.PrimaryKeyRelatedField(
        source="parent_entity",
        queryset=Entity.objects.all(),
        allow_null=True,
        required=False,
    )
    created_by_name = serializers.SerializerMethodField()
    active_children_count = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = Entity
        fields = (
            "id",
            "short_code",
            "entity_name",
            "entity_type",
            "parent_entity_id",
            "cash_code",
            "invoice_series",
            "status",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
            "address_line_1",
            "street",
            "address_line_2",
            "area",
            "city",
            "state",
            "country",
            "pin_code",
            "district",
            "zone",
            "contact_person",
            "phone",
            "mobile",
            "fax",
            "email",
            "website",
            "std_code",
            "pan_no",
            "gst_no",
            "cst_tin",
            "licence_no",
            "ecc",
            "division",
            "range",
            "other_1",
            "other_2",
            "active_children_count",
            "children_count",
        )
        read_only_fields = ("id", "created_at", "updated_at", "created_by", "created_by_name")
        extra_kwargs = {
            "short_code": {"validators": []},
            "entity_name": {"validators": []},
        }

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.display_name or obj.created_by.username

    def get_active_children_count(self, obj):
        return active_child_count(obj.id)

    def get_children_count(self, obj):
        return obj.child_entities.count()

    def validate_short_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Short code is required.")
        qs = Entity.objects.filter(short_code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Short code {value} is already in use.")
        return value

    def validate_entity_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Entity name is required.")
        qs = Entity.objects.filter(entity_name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("An entity with this name already exists.")
        return value

    def validate_gst_no(self, value):
        return validate_gstin(value)

    def validate_pan_no(self, value):
        return validate_pan(value)

    def validate_phone(self, value):
        return validate_phone(value)

    def validate_mobile(self, value):
        return validate_phone(value)

    def validate(self, attrs):
        parent = attrs.get("parent_entity", getattr(self.instance, "parent_entity", None))
        parent_id = parent.pk if parent is not None else None
        entity_id = self.instance.pk if self.instance else None
        if would_create_cycle(entity_id, parent_id):
            raise serializers.ValidationError(
                {"parent_entity_id": "Cannot set parent to this entity or one of its descendants."}
            )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            validated_data["created_by"] = user
        try:
            return super().create(validated_data)
        except IntegrityError:
            raise serializers.ValidationError(
                {"short_code": ["Short code is already in use. Try a different code."]}
            )


class EntityDetailSerializer(EntitySerializer):
    parent = EntitySummarySerializer(source="parent_entity", read_only=True)
    children = serializers.SerializerMethodField()
    ancestor_ids = serializers.SerializerMethodField()
    descendant_ids = serializers.SerializerMethodField()

    class Meta(EntitySerializer.Meta):
        fields = EntitySerializer.Meta.fields + (
            "parent",
            "children",
            "ancestor_ids",
            "descendant_ids",
        )

    def get_children(self, obj):
        qs = obj.child_entities.all().order_by("short_code")
        return EntitySummarySerializer(qs, many=True).data

    def get_ancestor_ids(self, obj):
        from .query import ancestor_ids

        return ancestor_ids(obj.id)

    def get_descendant_ids(self, obj):
        return descendant_ids(obj.id, include_self=False)


class EntityTreeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    active_children_count = serializers.SerializerMethodField()
    context_only = serializers.SerializerMethodField()

    class Meta:
        model = Entity
        fields = (
            "id",
            "short_code",
            "entity_name",
            "entity_type",
            "parent_entity_id",
            "status",
            "city",
            "state",
            "active_children_count",
            "context_only",
            "children",
        )

    def get_active_children_count(self, obj):
        return active_child_count(obj.id)

    def get_context_only(self, obj):
        match_ids = self.context.get("match_ids")
        if match_ids is None:
            return False
        return obj.id not in match_ids

    def get_children(self, obj):
        qs = obj.child_entities.all().order_by("short_code")
        include_ids = self.context.get("include_ids")
        if include_ids is not None:
            qs = qs.filter(id__in=include_ids)
        return EntityTreeSerializer(qs, many=True, context=self.context).data
