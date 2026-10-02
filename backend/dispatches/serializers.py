from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from accounts.access import scope_to_visible_customers
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine

from .models import Dispatch, DispatchLine
from .services import (
    line_dispatched_total,
    line_pending_quantity,
    qty_label,
    quantize_qty,
    sync_purchase_order_dispatch_status,
)

DISPATCHABLE_STATUSES = {
    PurchaseOrder.Status.BRAND_ACCEPTED,
    PurchaseOrder.Status.PARTIALLY_DISPATCHED,
    PurchaseOrder.Status.FULLY_DISPATCHED,
}


class DispatchLineSerializer(serializers.ModelSerializer):
    purchase_order_line_id = serializers.PrimaryKeyRelatedField(
        source="purchase_order_line",
        queryset=PurchaseOrderLine.objects.all(),
    )
    product_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()
    ordered_quantity = serializers.SerializerMethodField()
    total_dispatched = serializers.SerializerMethodField()
    pending_quantity = serializers.SerializerMethodField()

    class Meta:
        model = DispatchLine
        fields = (
            "id",
            "purchase_order_line_id",
            "dispatched_quantity",
            "product_code",
            "product_name",
            "unit",
            "ordered_quantity",
            "total_dispatched",
            "pending_quantity",
        )
        read_only_fields = (
            "id",
            "product_code",
            "product_name",
            "unit",
            "ordered_quantity",
            "total_dispatched",
            "pending_quantity",
        )

    def get_product_code(self, obj):
        product = obj.purchase_order_line.product
        return product.product_code if product else ""

    def get_product_name(self, obj):
        line = obj.purchase_order_line
        if line.product_id:
            return line.product.product_name
        return line.product_description

    def get_unit(self, obj):
        product = obj.purchase_order_line.product
        return product.unit if product else ""

    def get_ordered_quantity(self, obj):
        return str(quantize_qty(obj.purchase_order_line.quantity))

    def get_total_dispatched(self, obj):
        return str(line_dispatched_total(obj.purchase_order_line))

    def get_pending_quantity(self, obj):
        return str(line_pending_quantity(obj.purchase_order_line))

    def validate_dispatched_quantity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Dispatched quantity must be greater than 0.")
        return value


class DispatchSerializer(serializers.ModelSerializer):
    purchase_order_id = serializers.PrimaryKeyRelatedField(
        source="purchase_order",
        queryset=PurchaseOrder.objects.all(),
    )
    po_number = serializers.CharField(source="purchase_order.po_number", read_only=True)
    purchase_order_status = serializers.CharField(source="purchase_order.status", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    lines = DispatchLineSerializer(many=True, required=False)

    class Meta:
        model = Dispatch
        fields = (
            "id",
            "purchase_order_id",
            "po_number",
            "purchase_order_status",
            "dispatch_date",
            "lr_number",
            "transporter",
            "challan_reference",
            "lines",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
        )
        read_only_fields = (
            "id",
            "po_number",
            "purchase_order_status",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
        )

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            fields["purchase_order_id"].read_only = True
            fields["lines"].read_only = True
        elif self.context.get("request") is not None:
            fields["purchase_order_id"].queryset = scope_to_visible_customers(
                PurchaseOrder.objects.all(), self.context["request"].user
            )
        return fields

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.display_name or obj.created_by.username

    def validate(self, attrs):
        if self.instance is not None:
            return attrs

        po = attrs.get("purchase_order")
        lines = attrs.get("lines")
        if po is None:
            raise serializers.ValidationError({"purchase_order_id": "Purchase order is required."})
        if po.status not in DISPATCHABLE_STATUSES:
            raise serializers.ValidationError(
                {
                    "purchase_order_id": (
                        f"Cannot record a dispatch while the purchase order is {po.status}. "
                        "Status must be Brand Accepted, Partially Dispatched, or Fully Dispatched."
                    )
                }
            )
        if not lines:
            raise serializers.ValidationError({"lines": "Add at least one dispatch line."})

        incoming = defaultdict(Decimal)
        for index, row in enumerate(lines):
            po_line = row["purchase_order_line"]
            if po_line.purchase_order_id != po.id:
                raise serializers.ValidationError(
                    {
                        "lines": {
                            index: {
                                "purchase_order_line_id": (
                                    "Dispatch line must belong to the selected purchase order."
                                )
                            }
                        }
                    }
                )
            incoming[po_line.id] += quantize_qty(row["dispatched_quantity"])

        po_lines = {
            line.id: line
            for line in PurchaseOrderLine.objects.filter(purchase_order=po, id__in=incoming.keys())
        }
        for po_line_id, extra in incoming.items():
            po_line = po_lines[po_line_id]
            pending = line_pending_quantity(po_line)
            if extra > pending:
                raise serializers.ValidationError(
                    {
                        "lines": (
                            f"Cannot dispatch {qty_label(extra)} units — only "
                            f"{qty_label(pending)} units pending for this line."
                        )
                    }
                )
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines")
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            validated_data["created_by"] = user
        with transaction.atomic():
            dispatch = Dispatch.objects.create(**validated_data)
            for row in lines:
                DispatchLine.objects.create(
                    dispatch=dispatch,
                    purchase_order_line=row["purchase_order_line"],
                    dispatched_quantity=row["dispatched_quantity"],
                )
            sync_purchase_order_dispatch_status(dispatch.purchase_order, user=user)
            dispatch.refresh_from_db()
            dispatch.purchase_order.refresh_from_db()
            from notifications.services import notify_dispatch_created

            notify_dispatch_created(dispatch)
        return dispatch

    def update(self, instance, validated_data):
        # v1: header fields only — line quantities are create-only.
        validated_data.pop("lines", None)
        validated_data.pop("purchase_order", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
