import re
from decimal import Decimal

from rest_framework import serializers

from masters.models import (
    BrokerMaster,
    ChartAccount,
    GroupProduct,
    ItemMaster,
    MasterBranch,
    Parameter,
    TaxSlab,
)

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
STATUTORY_GST = {Decimal("0"), Decimal("5"), Decimal("12"), Decimal("18"), Decimal("28")}


def _norm_gstin(value: str) -> str:
    return (value or "").strip().upper()


def _norm_pan(value: str) -> str:
    return (value or "").strip().upper()


def validate_gstin(value: str) -> str:
    value = _norm_gstin(value)
    if not value:
        return ""
    if not GSTIN_RE.match(value):
        raise serializers.ValidationError(
            "GSTIN must be 15 characters (e.g. 24AABCS8891P1ZV)."
        )
    return value


def validate_pan(value: str) -> str:
    value = _norm_pan(value)
    if not value:
        return ""
    if not PAN_RE.match(value):
        raise serializers.ValidationError("PAN must be 10 characters (e.g. AABCS8891P).")
    return value


def validate_phone(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    digits = re.sub(r"\D", "", value)
    mobile_ok = len(digits) == 10 and digits[0] in "6789"
    landline_ok = len(digits) == 11 and digits.startswith("0")
    intl_ok = len(digits) == 12 and digits.startswith("91")
    if not (mobile_ok or landline_ok or intl_ok):
        raise serializers.ValidationError(
            "Enter a valid Indian phone (10-digit mobile, STD landline, or +91…)."
        )
    return value


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterBranch
        fields = (
            "id",
            "code",
            "name",
            "city",
            "gstin",
            "address",
            "phone",
            "is_head_office",
            "is_active",
        )
        extra_kwargs = {
            "code": {
                "validators": [],
                "error_messages": {
                    "unique": "A branch with this code already exists.",
                },
            }
        }

    def validate_gstin(self, value):
        return validate_gstin(value)

    def validate_phone(self, value):
        return validate_phone(value)

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Branch code is required.")
        qs = MasterBranch.objects.filter(code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Branch code {value} is already in use.")
        return value

    def validate_address(self, value):
        return (value or "").strip()


class GroupProductSerializer(serializers.ModelSerializer):
    sku_count = serializers.SerializerMethodField()

    class Meta:
        model = GroupProduct
        fields = (
            "id",
            "code",
            "name",
            "category",
            "hsn_chapter",
            "construction",
            "gsm_range",
            "avg_rate",
            "is_active",
            "sku_count",
        )

    def get_sku_count(self, obj):
        return obj.items.count()

    def validate_avg_rate(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Base rate cannot be negative.")
        return value

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Group code is required.")
        return value


class ItemSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    tax_slab_code = serializers.CharField(source="tax_slab.code", read_only=True)

    class Meta:
        model = ItemMaster
        fields = (
            "id",
            "sku",
            "description",
            "group",
            "group_name",
            "category",
            "construction",
            "width_inches",
            "hsn",
            "base_rate",
            "packing_unit",
            "stock_quantity",
            "gst_percent",
            "tax_slab",
            "tax_slab_code",
            "mill_origin",
            "is_active",
        )

    def validate_sku(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("SKU is required.")
        return value

    def validate_hsn(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("HSN is required.")
        if not value.isdigit() or not (4 <= len(value) <= 8):
            raise serializers.ValidationError("HSN must be 4–8 digits.")
        return value

    def validate_base_rate(self, value):
        if value is None or value < 0:
            raise serializers.ValidationError("Base price cannot be negative.")
        return value

    def validate_gst_percent(self, value):
        if value is None:
            return value
        if Decimal(str(value)) not in STATUTORY_GST:
            raise serializers.ValidationError("GST must be a statutory slab: 0, 5, 12, 18 or 28%.")
        return value

    def validate(self, attrs):
        slab = attrs.get("tax_slab") or getattr(self.instance, "tax_slab", None)
        gst = attrs.get("gst_percent", getattr(self.instance, "gst_percent", None))
        if slab is not None and gst is not None and Decimal(str(slab.gst_percent)) != Decimal(str(gst)):
            attrs["gst_percent"] = slab.gst_percent
        return attrs


class ParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parameter
        fields = ("id", "category", "code", "name", "value", "notes", "is_active")

    def validate_category(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Category is required.")
        return value

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Code is required.")
        return value


class TaxSlabSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxSlab
        fields = (
            "id",
            "code",
            "name",
            "gst_percent",
            "cgst_percent",
            "sgst_percent",
            "igst_percent",
            "cess_percent",
            "hsn_coverage",
            "statutory_notification",
            "effective_from",
            "rcm_applicable",
            "is_active",
        )

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Tariff code is required.")
        return value

    def validate_gst_percent(self, value):
        if Decimal(str(value)) not in STATUTORY_GST:
            raise serializers.ValidationError("GST rate must be a statutory slab: 0, 5, 12, 18 or 28%.")
        return value

    def validate_cess_percent(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Cess cannot be negative.")
        return value

    def validate(self, attrs):
        gst = Decimal(str(attrs.get("gst_percent", getattr(self.instance, "gst_percent", 0))))
        cgst = Decimal(str(attrs.get("cgst_percent", getattr(self.instance, "cgst_percent", 0))))
        sgst = Decimal(str(attrs.get("sgst_percent", getattr(self.instance, "sgst_percent", 0))))
        igst = Decimal(str(attrs.get("igst_percent", getattr(self.instance, "igst_percent", 0))))
        if (cgst + sgst - gst).copy_abs() > Decimal("0.05"):
            raise serializers.ValidationError(
                {"cgst_percent": "CGST + SGST must equal the total GST rate."}
            )
        if (igst - gst).copy_abs() > Decimal("0.05"):
            raise serializers.ValidationError({"igst_percent": "IGST must equal the total GST rate."})
        return attrs


class BrokerSerializer(serializers.ModelSerializer):
    linked_parties_count = serializers.SerializerMethodField()
    linked_parties = serializers.SerializerMethodField()

    class Meta:
        model = BrokerMaster
        fields = (
            "id",
            "code",
            "name",
            "firm_name",
            "commission_rate",
            "pan",
            "mobile",
            "city",
            "is_active",
            "linked_parties_count",
            "linked_parties",
        )

    def get_linked_parties_count(self, obj):
        return obj.parties.count()

    def get_linked_parties(self, obj):
        return list(obj.parties.values_list("name", flat=True)[:8])

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Broker code is required.")
        return value

    def validate_pan(self, value):
        return validate_pan(value)

    def validate_commission_rate(self, value):
        if value is None or value < 0 or value > 100:
            raise serializers.ValidationError("Commission rate must be between 0 and 100.")
        return value


class ChartAccountSerializer(serializers.ModelSerializer):
    parent_code = serializers.CharField(source="parent.code", read_only=True)
    parent_name = serializers.CharField(source="parent.name", read_only=True)
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = ChartAccount
        fields = (
            "id",
            "code",
            "name",
            "account_type",
            "nature",
            "parent",
            "parent_code",
            "parent_name",
            "is_group",
            "opening_balance",
            "is_active",
            "sort_order",
            "children_count",
        )

    def get_children_count(self, obj):
        return obj.children.count()

    def validate_code(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Account code is required.")
        return value

    def validate_opening_balance(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Opening balance cannot be negative.")
        return value

    def validate(self, attrs):
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        instance = self.instance
        if instance and parent:
            cursor = parent
            seen = {instance.pk}
            while cursor is not None:
                if cursor.pk in seen:
                    raise serializers.ValidationError({"parent": "Cannot create a circular account hierarchy."})
                seen.add(cursor.pk)
                cursor = cursor.parent
            if parent.pk == instance.pk:
                raise serializers.ValidationError({"parent": "An account cannot be its own parent."})
        if parent and not attrs.get("account_type") and instance:
            attrs.setdefault("account_type", parent.account_type)
        elif parent and "account_type" not in attrs:
            attrs["account_type"] = parent.account_type
        return attrs


class ChartAccountTreeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = ChartAccount
        fields = (
            "id",
            "code",
            "name",
            "account_type",
            "nature",
            "parent",
            "is_group",
            "opening_balance",
            "is_active",
            "children",
        )

    def get_children(self, obj):
        qs = obj.children.all().order_by("code")
        return ChartAccountTreeSerializer(qs, many=True).data
