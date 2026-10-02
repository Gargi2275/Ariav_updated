from rest_framework import serializers

from brands.models import Brand
from products.models import Product

from .models import PriceList, PriceListEntry


class PriceListEntrySerializer(serializers.ModelSerializer):
    product_id = serializers.PrimaryKeyRelatedField(source="product", queryset=Product.objects.select_related("brand", "category"))
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    product_name = serializers.CharField(source="product.product_name", read_only=True)
    brand_name = serializers.CharField(source="product.brand.brand_name", read_only=True)
    category_name = serializers.CharField(source="product.category.category_name", read_only=True)

    class Meta:
        model = PriceListEntry
        fields = ("id", "product_id", "product_code", "product_name", "brand_name", "category_name", "taka_length_meters", "price_basis", "price_value", "price_per_meter", "price_per_taka", "taka_quantity", "status", "created_at", "updated_at")
        read_only_fields = ("id", "product_code", "product_name", "brand_name", "category_name", "price_per_meter", "price_per_taka", "created_at", "updated_at")

    def validate(self, attrs):
        price_list = self.context["price_list"]
        product = attrs.get("product", getattr(self.instance, "product", None))
        if product and product.brand_id != price_list.brand_id:
            raise serializers.ValidationError({"product_id": "Product must belong to the Price List brand."})
        if self.instance is None and product and PriceListEntry.objects.filter(price_list=price_list, product=product).exists():
            raise serializers.ValidationError({"product_id": "This product already exists in the Price List."})
        basis = attrs.get("price_basis", getattr(self.instance, "price_basis", None))
        length = attrs.get("taka_length_meters", getattr(self.instance, "taka_length_meters", None))
        if basis == PriceListEntry.PriceBasis.PER_TAKA and (length is None or length <= 0):
            raise serializers.ValidationError({"taka_length_meters": "Taka length must be greater than zero."})
        return attrs

    def create(self, validated_data):
        return PriceListEntry.objects.create(price_list=self.context["price_list"], **validated_data)


class PriceListSerializer(serializers.ModelSerializer):
    brand_id = serializers.PrimaryKeyRelatedField(source="brand", queryset=Brand.objects.all())
    brand_name = serializers.CharField(source="brand.brand_name", read_only=True)
    entry_count = serializers.IntegerField(source="entries.count", read_only=True)
    entries = PriceListEntrySerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PriceList
        fields = ("id", "brand_id", "brand_name", "season_label", "valid_from", "valid_to", "status", "entry_count", "entries", "created_at", "updated_at", "created_by", "created_by_name")
        read_only_fields = ("id", "brand_name", "entry_count", "entries", "created_at", "updated_at", "created_by", "created_by_name")

    def validate(self, attrs):
        start = attrs.get("valid_from", getattr(self.instance, "valid_from", None))
        end = attrs.get("valid_to", getattr(self.instance, "valid_to", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"valid_to": "Valid to must be after valid from."})
        if not (attrs.get("season_label", getattr(self.instance, "season_label", "")) or "").strip():
            raise serializers.ValidationError({"season_label": "Season label is required."})
        return attrs

    def get_created_by_name(self, obj):
        return (obj.created_by.display_name or obj.created_by.username) if obj.created_by_id else ""


class CurrentPriceSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    date = serializers.DateField()
    price = serializers.DecimalField(max_digits=14, decimal_places=2)
    price_per_meter = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    price_per_taka = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    source = serializers.CharField()
    season_label = serializers.CharField(allow_blank=True)
    price_list_id = serializers.IntegerField(allow_null=True)

    def __init__(self, instance, product, lookup_date, **kwargs):
        self.entry = instance
        self.product = product
        self.lookup_date = lookup_date
        super().__init__(instance)

    @property
    def data(self):
        entry = self.entry
        return {
            "product_id": self.product.id,
            "date": str(self.lookup_date or __import__("datetime").date.today()),
            "price": str(entry.price_per_meter if entry else self.product.rate),
            "price_per_meter": str(entry.price_per_meter if entry else self.product.rate),
            "price_per_taka": str(entry.price_per_taka) if entry else None,
            "source": "Price List" if entry else "Product",
            "season_label": entry.price_list.season_label if entry else "",
            "price_list_id": entry.price_list_id if entry else None,
        }
