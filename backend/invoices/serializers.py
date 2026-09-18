from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from products.models import Product
from purchase_orders.models import PurchaseOrder, PurchaseOrderLine

from .models import Invoice, InvoiceLine
from .services import (
    compute_invoice_totals,
    default_due_date,
    default_payment_terms,
    invoice_display_status,
    invoice_is_overdue,
    line_invoiceable_quantity,
    money,
    po_has_dispatched_quantity,
)
from dispatches.services import qty_label


class InvoiceLineSerializer(serializers.ModelSerializer):
    purchase_order_line_id = serializers.PrimaryKeyRelatedField(
        source="purchase_order_line",
        queryset=PurchaseOrderLine.objects.all(),
    )
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        required=False,
        allow_null=True,
    )
    product_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()
    invoiceable_quantity = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceLine
        fields = (
            "id",
            "purchase_order_line_id",
            "product_id",
            "product_description",
            "product_code",
            "product_name",
            "unit",
            "quantity",
            "rate",
            "line_total",
            "invoiceable_quantity",
        )
        read_only_fields = (
            "id",
            "product_code",
            "product_name",
            "unit",
            "line_total",
            "invoiceable_quantity",
        )
        extra_kwargs = {
            "rate": {"required": False, "allow_null": True},
            "product_description": {"required": False},
        }

    def to_internal_value(self, data):
        if hasattr(data, "items") and not isinstance(data, dict):
            data = {k: data.get(k) for k in data.keys()}
        elif isinstance(data, dict):
            data = dict(data)
        if data.get("product_id") in ("", None):
            data["product_id"] = None
        if data.get("rate") in ("", None):
            data["rate"] = None
        return super().to_internal_value(data)

    def get_product_code(self, obj):
        return obj.product.product_code if obj.product_id else ""

    def get_product_name(self, obj):
        if obj.product_id:
            return obj.product.product_name
        return obj.product_description

    def get_unit(self, obj):
        return obj.product.unit if obj.product_id else ""

    def get_invoiceable_quantity(self, obj):
        return str(line_invoiceable_quantity(obj.purchase_order_line, exclude_invoice_id=obj.invoice_id))

    def validate_quantity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0.")
        return value


class InvoiceSerializer(serializers.ModelSerializer):
    purchase_order_id = serializers.PrimaryKeyRelatedField(
        source="purchase_order",
        queryset=PurchaseOrder.objects.all(),
    )
    entity_id = serializers.IntegerField(source="entity.id", read_only=True)
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    brand_id = serializers.IntegerField(source="brand.id", read_only=True)
    entity_code = serializers.CharField(source="entity.short_code", read_only=True)
    entity_name = serializers.CharField(source="entity.entity_name", read_only=True)
    customer_name = serializers.CharField(source="customer.customer_name", read_only=True)
    brand_code = serializers.CharField(source="brand.brand_code", read_only=True)
    brand_name = serializers.CharField(source="brand.brand_name", read_only=True)
    po_number = serializers.CharField(source="purchase_order.po_number", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    display_status = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    remaining_balance = serializers.SerializerMethodField()
    payment_allocations = serializers.SerializerMethodField()
    lines = InvoiceLineSerializer(many=True, required=False)
    due_date = serializers.DateField(required=False)

    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_number",
            "invoice_date",
            "due_date",
            "entity_id",
            "entity_code",
            "entity_name",
            "customer_id",
            "customer_code",
            "customer_name",
            "purchase_order_id",
            "po_number",
            "brand_id",
            "brand_code",
            "brand_name",
            "status",
            "display_status",
            "is_overdue",
            "discount_percent",
            "discount_amount",
            "tax_percent",
            "tax_amount",
            "other_charges",
            "subtotal",
            "net_amount",
            "total_paid",
            "remaining_balance",
            "payment_allocations",
            "payment_terms",
            "remarks",
            "lines",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
        )
        read_only_fields = (
            "id",
            "entity_id",
            "entity_code",
            "entity_name",
            "customer_id",
            "customer_code",
            "customer_name",
            "po_number",
            "brand_id",
            "brand_code",
            "brand_name",
            "status",
            "display_status",
            "is_overdue",
            "tax_amount",
            "subtotal",
            "net_amount",
            "total_paid",
            "remaining_balance",
            "payment_allocations",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
        )
        extra_kwargs = {
            "invoice_number": {"validators": []},
            "discount_percent": {"required": False},
            "discount_amount": {"required": False},
            "tax_percent": {"required": False},
            "other_charges": {"required": False},
        }

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.display_name or obj.created_by.username

    def get_is_overdue(self, obj):
        return invoice_is_overdue(obj)

    def get_display_status(self, obj):
        return invoice_display_status(obj)

    def get_total_paid(self, obj):
        from payments.services import invoice_total_paid

        return str(invoice_total_paid(obj))

    def get_remaining_balance(self, obj):
        from payments.services import invoice_remaining_balance

        return str(invoice_remaining_balance(obj))

    def get_payment_allocations(self, obj):
        from payments.services import money

        rows = []
        for row in obj.allocations.all():
            rows.append(
                {
                    "id": row.id,
                    "payment_id": row.payment_id,
                    "payment_number": row.payment.payment_number,
                    "payment_date": row.payment.payment_date.isoformat(),
                    "payment_mode": row.payment.payment_mode,
                    "allocated_amount": str(money(row.allocated_amount)),
                }
            )
        return rows

    def validate_invoice_number(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Invoice number is required.")
        qs = Invoice.objects.filter(invoice_number__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Invoice number {value} is already in use.")
        return value

    def validate(self, attrs):
        if self.instance and self.instance.status != Invoice.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only draft invoices can be edited."})

        po = attrs.get("purchase_order", getattr(self.instance, "purchase_order", None))
        lines_provided = "lines" in attrs
        lines = attrs.get("lines")
        if po is None:
            raise serializers.ValidationError({"purchase_order_id": "Purchase order is required."})

        exclude_id = self.instance.pk if self.instance else None
        if not po_has_dispatched_quantity(po):
            raise serializers.ValidationError(
                {"purchase_order_id": "Cannot create an invoice — this purchase order has no dispatched quantity."}
            )

        if lines_provided:
            if not lines:
                raise serializers.ValidationError({"lines": "Add at least one invoice line."})
        elif self.instance is None:
            raise serializers.ValidationError({"lines": "Add at least one invoice line."})
        else:
            lines = []

        incoming = defaultdict(Decimal)
        for index, row in enumerate(lines):
            po_line = row["purchase_order_line"]
            if po_line.purchase_order_id != po.id:
                raise serializers.ValidationError(
                    {
                        "lines": {
                            index: {
                                "purchase_order_line_id": "Invoice line must belong to the selected purchase order."
                            }
                        }
                    }
                )
            if row.get("rate") is None:
                row["rate"] = po_line.rate
            if not row.get("product") and not (row.get("product_description") or "").strip():
                row["product"] = po_line.product
                row["product_description"] = po_line.product_description
            incoming[po_line.id] += money(row["quantity"])

        po_lines = {
            line.id: line
            for line in PurchaseOrderLine.objects.filter(purchase_order=po, id__in=incoming.keys()).prefetch_related(
                "dispatch_lines", "invoice_lines__invoice"
            )
        }
        for po_line_id, extra in incoming.items():
            po_line = po_lines[po_line_id]
            invoiceable = line_invoiceable_quantity(po_line, exclude_invoice_id=exclude_id)
            if extra > invoiceable:
                raise serializers.ValidationError(
                    {
                        "lines": (
                            f"Cannot invoice {qty_label(extra)} units — only "
                            f"{qty_label(invoiceable)} units dispatched and not yet invoiced for this line."
                        )
                    }
                )

        attrs["entity"] = po.entity
        attrs["customer"] = po.customer
        attrs["brand"] = po.brand
        attrs["customer_code"] = po.customer.customer_code
        invoice_date = attrs.get("invoice_date") or getattr(self.instance, "invoice_date", None) or timezone.localdate()
        if not attrs.get("invoice_date") and not self.instance:
            attrs["invoice_date"] = invoice_date
        if not attrs.get("due_date"):
            attrs["due_date"] = default_due_date(invoice_date, po.customer.credit_days)
        if not (attrs.get("payment_terms") or "").strip() and not self.instance:
            attrs["payment_terms"] = default_payment_terms(po.customer.credit_days)
        if lines_provided:
            attrs["lines"] = lines
        else:
            attrs.pop("lines", None)
        return attrs

    def _apply_totals(self, invoice, lines_data, validated_data):
        subtotal = sum((money(row["quantity"]) * money(row["rate"]) for row in lines_data), Decimal("0"))
        try:
            totals = compute_invoice_totals(
                subtotal,
                discount_percent=validated_data.get("discount_percent", invoice.discount_percent),
                discount_amount=validated_data.get("discount_amount", invoice.discount_amount),
                tax_percent=validated_data.get("tax_percent", invoice.tax_percent),
                other_charges=validated_data.get("other_charges", invoice.other_charges),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        for key, value in totals.items():
            setattr(invoice, key, value)

    def _replace_lines(self, invoice, lines):
        invoice.lines.all().delete()
        for row in lines:
            InvoiceLine.objects.create(
                invoice=invoice,
                purchase_order_line=row["purchase_order_line"],
                product=row.get("product"),
                product_description=(row.get("product_description") or "").strip(),
                quantity=row["quantity"],
                rate=row["rate"],
            )

    def create(self, validated_data):
        lines = validated_data.pop("lines")
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            validated_data["created_by"] = user
        with transaction.atomic():
            invoice = Invoice(**validated_data)
            self._apply_totals(invoice, lines, validated_data)
            invoice.save()
            self._replace_lines(invoice, lines)
        return invoice

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            if lines is None:
                lines = [
                    {
                        "purchase_order_line": line.purchase_order_line,
                        "product": line.product,
                        "product_description": line.product_description,
                        "quantity": line.quantity,
                        "rate": line.rate,
                    }
                    for line in instance.lines.all()
                ]
            else:
                self._replace_lines(instance, lines)
            self._apply_totals(instance, lines, validated_data)
            instance.save()
        return instance
