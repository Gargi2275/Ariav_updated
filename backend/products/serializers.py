from rest_framework import serializers

from brands.models import Brand
from categories.models import Category

from .models import Product


class OptionalDecimalField(serializers.DecimalField):
    def to_internal_value(self, data):
        if data in (None, "") or (isinstance(data, str) and not data.strip()):
            return None
        return super().to_internal_value(data)


class ProductSerializer(serializers.ModelSerializer):
    brand_id = serializers.PrimaryKeyRelatedField(source="brand", queryset=Brand.objects.all())
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=Category.objects.all())
    brand_code = serializers.CharField(source="brand.brand_code", read_only=True)
    brand_name = serializers.CharField(source="brand.brand_name", read_only=True)
    category_code = serializers.CharField(source="category.category_code", read_only=True)
    category_name = serializers.CharField(source="category.category_name", read_only=True)
    parent_category_id = serializers.IntegerField(source="category.parent_category_id", read_only=True, allow_null=True)
    parent_category_code = serializers.SerializerMethodField()
    parent_category_name = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    frate = OptionalDecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    trate = OptionalDecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "product_code",
            "product_name",
            "brand_id",
            "brand_code",
            "brand_name",
            "category_id",
            "category_code",
            "category_name",
            "parent_category_id",
            "parent_category_code",
            "parent_category_name",
            "print_name",
            "description",
            "design",
            "colour",
            "quality",
            "width_size",
            "product_type",
            "group",
            "unit",
            "rate",
            "frate",
            "trate",
            "season",
            "collection",
            "image",
            "image_url",
            "availability",
            "status",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
            "brand_code",
            "brand_name",
            "category_code",
            "category_name",
            "parent_category_id",
            "parent_category_code",
            "parent_category_name",
            "image_url",
        )
        extra_kwargs = {
            "product_code": {"validators": []},
            "image": {"required": False, "allow_null": True, "write_only": True},
        }

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.display_name or obj.created_by.username

    def get_parent_category_code(self, obj):
        parent = obj.category.parent_category if obj.category_id else None
        return parent.category_code if parent else ""

    def get_parent_category_name(self, obj):
        parent = obj.category.parent_category if obj.category_id else None
        return parent.category_name if parent else ""

    def get_image_url(self, obj):
        if not obj.image:
            return ""
        request = self.context.get("request")
        url = obj.image.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def validate_product_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Product code is required.")
        qs = Product.objects.filter(product_code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Product code {value} is already in use.")
        return value

    def validate_product_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Product name is required.")
        return value

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        if category is None:
            raise serializers.ValidationError({"category_id": "Category is required."})
        if not category.parent_category_id:
            raise serializers.ValidationError(
                {
                    "category_id": (
                        "Product must be assigned to a subcategory, not a top-level category. "
                        "Select Category → Subcategory."
                    )
                }
            )
        brand = attrs.get("brand", getattr(self.instance, "brand", None))
        if brand is None:
            raise serializers.ValidationError({"brand_id": "Brand is required."})
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            validated_data["created_by"] = user
        return super().create(validated_data)
