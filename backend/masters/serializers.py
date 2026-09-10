from rest_framework import serializers

from masters.models import AccountMaster, ItemMaster, MasterBranch


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterBranch
        fields = ("id", "code", "name", "city", "gstin", "address", "phone", "is_head_office")


class PartySerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountMaster
        fields = (
            "id",
            "code",
            "name",
            "trade_name",
            "group",
            "city",
            "state",
            "gstin",
            "pan",
            "credit_limit",
            "credit_days",
            "broker",
            "opening_balance",
            "balance_type",
        )


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemMaster
        fields = (
            "id",
            "sku",
            "description",
            "category",
            "construction",
            "width_inches",
            "hsn",
            "base_rate",
            "packing_unit",
            "stock_quantity",
            "gst_percent",
        )
