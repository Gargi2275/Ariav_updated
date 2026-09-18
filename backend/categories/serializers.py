from django.db import IntegrityError
from rest_framework import serializers

from .models import Category
from .query import active_child_count, active_product_count


TWO_LEVEL_MSG = (
    "Categories are limited to two levels (Category → Subcategory). "
    "A subcategory cannot have children, and a subcategory cannot be used as a parent."
)


class CategorySerializer(serializers.ModelSerializer):
    parent_category_id = serializers.PrimaryKeyRelatedField(
        source="parent_category",
        queryset=Category.objects.all(),
        allow_null=True,
        required=False,
    )
    created_by_name = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()
    active_children_count = serializers.SerializerMethodField()
    active_product_count = serializers.SerializerMethodField()
    parent_category_name = serializers.SerializerMethodField()
    parent_category_code = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = (
            "id",
            "category_code",
            "category_name",
            "parent_category_id",
            "parent_category_code",
            "parent_category_name",
            "status",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
            "children_count",
            "active_children_count",
            "active_product_count",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
            "parent_category_code",
            "parent_category_name",
            "children_count",
            "active_children_count",
            "active_product_count",
        )
        extra_kwargs = {"category_code": {"validators": []}}

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.display_name or obj.created_by.username

    def get_children_count(self, obj):
        return obj.child_categories.count()

    def get_active_children_count(self, obj):
        return active_child_count(obj.id)

    def get_active_product_count(self, obj):
        return active_product_count(obj.id, include_children=True)

    def get_parent_category_name(self, obj):
        if not obj.parent_category_id:
            return ""
        return obj.parent_category.category_name

    def get_parent_category_code(self, obj):
        if not obj.parent_category_id:
            return ""
        return obj.parent_category.category_code

    def validate_category_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Category code is required.")
        qs = Category.objects.filter(category_code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Category code {value} is already in use.")
        return value

    def validate_category_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Category name is required.")
        return value

    def validate(self, attrs):
        parent = attrs["parent_category"] if "parent_category" in attrs else getattr(
            self.instance, "parent_category", None
        )
        instance = self.instance
        if parent is not None:
            if instance and parent.pk == instance.pk:
                raise serializers.ValidationError(
                    {"parent_category_id": "A category cannot be its own parent."}
                )
            if parent.parent_category_id:
                raise serializers.ValidationError({"parent_category_id": TWO_LEVEL_MSG})
            if instance and instance.child_categories.exists():
                raise serializers.ValidationError(
                    {
                        "parent_category_id": (
                            "This category already has subcategories, so it cannot become a subcategory. "
                            + TWO_LEVEL_MSG
                        )
                    }
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
                {"category_code": ["Category code is already in use. Try a different code."]}
            )


class CategoryTreeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    active_children_count = serializers.SerializerMethodField()
    context_only = serializers.SerializerMethodField()
    parent_category_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Category
        fields = (
            "id",
            "category_code",
            "category_name",
            "parent_category_id",
            "status",
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
        qs = obj.child_categories.all().order_by("category_code")
        include_ids = self.context.get("include_ids")
        if include_ids is not None:
            qs = qs.filter(id__in=include_ids)
        return CategoryTreeSerializer(qs, many=True, context=self.context).data
