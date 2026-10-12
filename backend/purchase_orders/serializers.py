import json
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from brands.models import Brand
from customers.models import Customer, CustomerEntity
from entities.models import Entity
from invoices.services import money
from products.models import Product

from .models import PurchaseOrder, PurchaseOrderLine
from .transitions import allowed_transitions_for_user


def _order_type_for_brand(brand: Brand) -> str:
    if brand.order_method == Brand.OrderMethod.MANUAL_POR:
        return PurchaseOrder.OrderType.MANUAL
    return PurchaseOrder.OrderType.DIGITAL


def create_purchase_order_with_lines(*, user=None, lines, **validated_data):
    if user is not None and getattr(user, "is_authenticated", False):
        validated_data["created_by"] = user
    with transaction.atomic():
        po = PurchaseOrder.objects.create(**validated_data)
        for row in lines:
            PurchaseOrderLine.objects.create(
                purchase_order=po,
                product=row.get("product"),
                product_description=(row.get("product_description") or "").strip(),
                quantity=row["quantity"],
                rate=row.get("rate"),
                expected_delivery_period=row.get("expected_delivery_period", ""),
                customer_delivery_date=row.get("customer_delivery_date"),
                extra_data=row.get("extra_data", {}),
            )
    return po


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        required=False,
        allow_null=True,
    )
    product_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()
    total_dispatched = serializers.SerializerMethodField()
    pending_quantity = serializers.SerializerMethodField()
    total_invoiced = serializers.SerializerMethodField()
    invoiceable_quantity = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderLine
        fields = (
            "id",
            "product_id",
            "product_description",
            "product_code",
            "product_name",
            "unit",
            "quantity",
            "rate",
            "line_total",
            "expected_delivery_period",
            "customer_delivery_date",
            "extra_data",
            "total_dispatched",
            "pending_quantity",
            "total_invoiced",
            "invoiceable_quantity",
        )
        read_only_fields = (
            "id",
            "product_code",
            "product_name",
            "unit",
            "line_total",
            "expected_delivery_period",
            "customer_delivery_date",
            "extra_data",
            "total_dispatched",
            "pending_quantity",
            "total_invoiced",
            "invoiceable_quantity",
        )
        extra_kwargs = {
            "rate": {"required": False, "allow_null": True},
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
        desc = data.get("product_description")
        if desc is None:
            data["product_description"] = ""
        return super().to_internal_value(data)

    def get_product_code(self, obj):
        return obj.product.product_code if obj.product_id else ""

    def get_product_name(self, obj):
        if obj.product_id:
            return obj.product.product_name
        return obj.product_description

    def get_unit(self, obj):
        return obj.product.unit if obj.product_id else ""

    def get_total_dispatched(self, obj):
        total = sum((row.dispatched_quantity for row in obj.dispatch_lines.all()), Decimal("0"))
        return str(total.quantize(Decimal("0.01")))

    def get_pending_quantity(self, obj):
        dispatched = sum((row.dispatched_quantity for row in obj.dispatch_lines.all()), Decimal("0"))
        pending = (obj.quantity or Decimal("0")) - dispatched
        if pending < 0:
            pending = Decimal("0")
        return str(pending.quantize(Decimal("0.01")))

    def get_total_invoiced(self, obj):
        from invoices.models import Invoice

        total = Decimal("0")
        for row in obj.invoice_lines.all():
            if row.invoice.status == Invoice.Status.CANCELLED:
                continue
            total += row.quantity
        return str(total.quantize(Decimal("0.01")))

    def get_invoiceable_quantity(self, obj):
        from invoices.models import Invoice

        dispatched = sum((row.dispatched_quantity for row in obj.dispatch_lines.all()), Decimal("0"))
        invoiced = Decimal("0")
        for row in obj.invoice_lines.all():
            if row.invoice.status == Invoice.Status.CANCELLED:
                continue
            invoiced += row.quantity
        pending = dispatched - invoiced
        if pending < 0:
            pending = Decimal("0")
        return str(pending.quantize(Decimal("0.01")))

    def validate_quantity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0.")
        return value

    def validate_rate(self, value):
        if value is None:
            return value
        if value <= 0:
            raise serializers.ValidationError("Rate must be greater than 0 when entered.")
        return value

    def validate(self, attrs):
        product = attrs.get("product")
        description = (attrs.get("product_description") or "").strip()
        attrs["product_description"] = description
        if not product and not description:
            raise serializers.ValidationError(
                "Enter a catalogue product or a free-text description."
            )
        rate = attrs.get("rate")
        if product is not None and rate is None:
            attrs["rate"] = product.rate
        return attrs


class PurchaseOrderSerializer(serializers.ModelSerializer):
    entity_id = serializers.PrimaryKeyRelatedField(source="entity", queryset=Entity.objects.all())
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Customer.objects.all())
    brand_id = serializers.PrimaryKeyRelatedField(source="brand", queryset=Brand.objects.all())
    entity_code = serializers.CharField(source="entity.short_code", read_only=True)
    entity_name = serializers.CharField(source="entity.entity_name", read_only=True)
    customer_code = serializers.CharField(source="customer.customer_code", read_only=True)
    customer_name = serializers.CharField(source="customer.customer_name", read_only=True)
    brand_code = serializers.CharField(source="brand.brand_code", read_only=True)
    brand_name = serializers.CharField(source="brand.brand_name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    handy_form_url = serializers.SerializerMethodField()
    lines = PurchaseOrderLineSerializer(many=True, required=False)
    total_quantity = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
    priced_lines = serializers.SerializerMethodField()
    unpriced_lines = serializers.SerializerMethodField()
    has_unpriced_lines = serializers.SerializerMethodField()
    dispatch_progress = serializers.SerializerMethodField()
    financial_status = serializers.SerializerMethodField()
    dispatched_amount = serializers.SerializerMethodField()
    invoiced_amount = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    debit_amount = serializers.SerializerMethodField()
    credit_amount = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        validators = []
        fields = (
            "id",
            "po_number",
            "brand_order_code",
            "order_type",
            "entity_id",
            "entity_code",
            "entity_name",
            "customer_id",
            "customer_code",
            "customer_name",
            "brand_id",
            "brand_code",
            "brand_name",
            "po_date",
            "status",
            "remarks",
            "source_format",
            "extra_data",
            "handy_form_upload",
            "handy_form_url",
            "lines",
            "total_quantity",
            "total_amount",
            "priced_lines",
            "unpriced_lines",
            "has_unpriced_lines",
            "dispatch_progress",
            "financial_status",
            "dispatched_amount",
            "invoiced_amount",
            "paid_amount",
            "debit_amount",
            "credit_amount",
            "allowed_transitions",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
        )
        read_only_fields = (
            "id",
            "status",
            "entity_code",
            "entity_name",
            "customer_code",
            "customer_name",
            "brand_code",
            "brand_name",
            "handy_form_url",
            "total_quantity",
            "total_amount",
            "dispatch_progress",
            "financial_status",
            "dispatched_amount",
            "invoiced_amount",
            "paid_amount",
            "debit_amount",
            "credit_amount",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
            "source_format",
            "extra_data",
        )
        extra_kwargs = {
            "po_number": {"validators": []},
            "brand_order_code": {"required": False, "allow_null": True, "allow_blank": True, "default": None},
            "order_type": {"required": False},
            "handy_form_upload": {"required": False, "allow_null": True, "write_only": True},
        }

    def to_internal_value(self, data):
        payload = data
        if hasattr(data, "dict"):
            payload = data.dict()
            upload = data.get("handy_form_upload")
            if upload not in (None, "", "undefined"):
                payload["handy_form_upload"] = upload
            else:
                payload.pop("handy_form_upload", None)
        lines = payload.get("lines") if isinstance(payload, dict) else None
        if isinstance(lines, str):
            try:
                payload["lines"] = json.loads(lines) if lines.strip() else []
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError({"lines": "Invalid line items payload."}) from exc
        return super().to_internal_value(payload)

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.display_name or obj.created_by.username

    def get_handy_form_url(self, obj):
        if not obj.handy_form_upload:
            return ""
        request = self.context.get("request")
        url = obj.handy_form_upload.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_total_quantity(self, obj):
        lines = obj.lines.all() if hasattr(obj, "lines") else []
        total = sum((line.quantity for line in lines), Decimal("0"))
        return str(total)

    def get_total_amount(self, obj):
        lines = obj.lines.all() if hasattr(obj, "lines") else []
        total = sum((line.line_total for line in lines if line.rate is not None), Decimal("0"))
        return str(total)

    def get_priced_lines(self, obj):
        return sum(1 for line in obj.lines.all() if line.rate is not None)

    def get_unpriced_lines(self, obj):
        return sum(1 for line in obj.lines.all() if line.rate is None)

    def get_has_unpriced_lines(self, obj):
        return any(line.rate is None for line in obj.lines.all())

    def get_dispatch_progress(self, obj):
        lines = list(obj.lines.all()) if hasattr(obj, "lines") else []
        if not lines:
            return "Not Started"
        any_dispatched = False
        all_complete = True
        for line in lines:
            dispatched = sum(
                (row.dispatched_quantity for row in line.dispatch_lines.all()),
                Decimal("0"),
            )
            if dispatched > 0:
                any_dispatched = True
            pending = (line.quantity or Decimal("0")) - dispatched
            if pending > 0:
                all_complete = False
        if not any_dispatched:
            return "Not Started"
        if all_complete:
            return "Complete"
        return "Partial"

    def _financial_summary(self, obj):
        from invoices.models import Invoice
        from payments.models import PaymentAllocation
        from payments.services import balance_breakdown

        dispatched = Decimal("0")
        for line in obj.lines.all():
            dispatched += sum(
                (row.dispatched_quantity * (line.rate or Decimal("0")) for row in line.dispatch_lines.all()),
                Decimal("0"),
            )
        invoices = list(obj.invoices.exclude(status=Invoice.Status.CANCELLED))
        invoiced = sum((invoice.net_amount for invoice in invoices), Decimal("0"))
        paid = sum(
            (
                row.allocated_amount
                for row in PaymentAllocation.objects.filter(invoice__in=invoices)
            ),
            Decimal("0"),
        )
        breakdown = balance_breakdown(invoiced - paid)
        return {
            "dispatched": str(money(dispatched)),
            "invoiced": str(money(invoiced)),
            "paid": str(money(paid)),
            **breakdown,
        }

    def get_financial_status(self, obj):
        summary = self._financial_summary(obj)
        if obj.status == PurchaseOrder.Status.FULLY_DISPATCHED and Decimal(summary["balance"]) <= 0:
            return "Clear"
        return "Pending"

    def get_dispatched_amount(self, obj):
        return self._financial_summary(obj)["dispatched"]

    def get_invoiced_amount(self, obj):
        return self._financial_summary(obj)["invoiced"]

    def get_paid_amount(self, obj):
        return self._financial_summary(obj)["paid"]

    def get_debit_amount(self, obj):
        return self._financial_summary(obj)["debit"]

    def get_credit_amount(self, obj):
        return self._financial_summary(obj)["credit"]

    def get_allowed_transitions(self, obj):
        request = self.context.get("request")
        return sorted(allowed_transitions_for_user(obj.status, request.user if request else None))

    def validate_po_number(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("PO number is required.")
        qs = PurchaseOrder.objects.filter(po_number__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"PO number {value} is already in use.")
        return value

    def validate_handy_form_upload(self, value):
        if not value:
            return value
        name = (getattr(value, "name", "") or "").lower()
        allowed = (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif")
        if not name.endswith(allowed):
            raise serializers.ValidationError("Handy form must be a PDF or image file.")
        return value

    def validate(self, attrs):
        if self.instance and self.instance.status != PurchaseOrder.Status.DRAFT:
            raise serializers.ValidationError(
                {"detail": "Only draft purchase orders can be edited."}
            )

        entity = attrs.get("entity", getattr(self.instance, "entity", None))
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        brand = attrs.get("brand", getattr(self.instance, "brand", None))
        lines = attrs.get("lines")
        requested_type = attrs.get("order_type") or None

        if entity is None:
            raise serializers.ValidationError({"entity_id": "Branch is required."})
        if customer is None:
            raise serializers.ValidationError({"customer_id": "Party is required."})
        if brand is None:
            raise serializers.ValidationError({"brand_id": "Brand is required."})

        code = (attrs.get("brand_order_code") or "").strip()
        if code:
            query = PurchaseOrder.objects.filter(brand=brand, brand_order_code=code)
            if self.instance:
                query = query.exclude(pk=self.instance.pk)
            if query.exists():
                raise serializers.ValidationError(
                    {"brand_order_code": "This brand order code is already used for this brand."}
                )
            attrs["brand_order_code"] = code
        elif "brand_order_code" in attrs:
            attrs["brand_order_code"] = None

        derived = _order_type_for_brand(brand)
        if requested_type and requested_type != derived:
            if requested_type == PurchaseOrder.OrderType.MANUAL:
                raise serializers.ValidationError(
                    {
                        "brand_id": (
                            "Manual/POR requires a brand with order method Manual/POR. "
                            "This brand is Digital PO."
                        )
                    }
                )
            raise serializers.ValidationError(
                {
                    "brand_id": (
                        "Digital PO requires a brand with order method Digital PO. "
                        "This brand is Manual/POR."
                    )
                }
            )
        attrs["order_type"] = derived

        if not CustomerEntity.objects.filter(customer=customer, entity=entity).exists():
            raise serializers.ValidationError(
                {"customer_id": "Party is not linked to the selected branch."}
            )

        if lines is None:
            if self.instance is None:
                raise serializers.ValidationError({"lines": "Add at least one line item."})
            lines = []
        elif not lines:
            raise serializers.ValidationError({"lines": "Add at least one line item."})

        for index, row in enumerate(lines):
            product = row.get("product")
            description = (row.get("product_description") or "").strip()
            if derived == PurchaseOrder.OrderType.DIGITAL and not product:
                raise serializers.ValidationError(
                    {
                        "lines": {
                            index: {
                                "product_id": "Digital PO lines must use a catalogue product."
                            }
                        }
                    }
                )
            if product and product.brand_id != brand.id:
                raise serializers.ValidationError(
                    {
                        "lines": {
                            index: {
                                "product_id": "Product must belong to the selected brand."
                            }
                        }
                    }
                )
            if not product and not description:
                raise serializers.ValidationError(
                    {
                        "lines": {
                            index: {
                                "product_id": "Enter a catalogue product or a free-text description."
                            }
                        }
                    }
                )
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines")
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return create_purchase_order_with_lines(user=user, lines=lines, **validated_data)

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        upload = validated_data.get("handy_form_upload", serializers.empty)
        if upload is None:
            validated_data.pop("handy_form_upload", None)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if lines is not None:
                self._replace_lines(instance, lines)
        return instance

    def _replace_lines(self, po: PurchaseOrder, lines: list):
        po.lines.all().delete()
        for row in lines:
            PurchaseOrderLine.objects.create(
                purchase_order=po,
                product=row.get("product"),
                product_description=(row.get("product_description") or "").strip(),
                quantity=row["quantity"],
                rate=row.get("rate"),
            )
