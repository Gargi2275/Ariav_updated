from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from customers.models import Customer
from entities.models import Entity
from invoices.models import Invoice
from invoices.services import money

from .models import Payment, PaymentAllocation, PaymentAdjustment
from .services import (
    ALLOCATABLE_STATUSES,
    invoice_remaining_balance,
    payment_allocated_total,
    refresh_unallocated_amount,
    rupee_label,
    sync_invoice_payment_status,
)


def _user_display_name(user):
    if user is None:
        return ""
    return user.display_name or user.username


class PaymentAllocationSerializer(serializers.ModelSerializer):
    invoice_id = serializers.PrimaryKeyRelatedField(source="invoice", queryset=Invoice.objects.all())
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    invoice_date = serializers.DateField(source="invoice.invoice_date", read_only=True)
    invoice_status = serializers.CharField(source="invoice.status", read_only=True)
    invoice_net_amount = serializers.DecimalField(
        source="invoice.net_amount",
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = PaymentAllocation
        fields = (
            "id",
            "invoice_id",
            "invoice_number",
            "invoice_date",
            "invoice_status",
            "invoice_net_amount",
            "allocated_amount",
        )
        read_only_fields = (
            "id",
            "invoice_number",
            "invoice_date",
            "invoice_status",
            "invoice_net_amount",
        )

    def validate_allocated_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Allocated amount must be greater than 0.")
        return money(value)


class PaymentAdjustmentSerializer(serializers.ModelSerializer):
    payment_id = serializers.IntegerField(read_only=True)
    payment_number = serializers.CharField(source="payment.payment_number", read_only=True)
    payment_allocation_id = serializers.IntegerField(read_only=True, allow_null=True)
    invoice_id = serializers.IntegerField(read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    customer_id = serializers.IntegerField(source="payment.customer_id", read_only=True)
    customer_code = serializers.CharField(source="payment.customer_code", read_only=True)
    customer_name = serializers.CharField(source="payment.customer.customer_name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PaymentAdjustment
        fields = (
            "id",
            "payment_id",
            "payment_number",
            "payment_allocation_id",
            "invoice_id",
            "invoice_number",
            "customer_id",
            "customer_code",
            "customer_name",
            "amount",
            "reason",
            "reference",
            "status",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_name",
            "created_at",
            "approved_at",
        )
        read_only_fields = fields

    def get_created_by_name(self, obj):
        return _user_display_name(obj.created_by)

    def get_approved_by_name(self, obj):
        return _user_display_name(obj.approved_by)


class PaymentSerializer(serializers.ModelSerializer):
    entity_id = serializers.PrimaryKeyRelatedField(source="entity", queryset=Entity.objects.all())
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Customer.objects.all())
    entity_code = serializers.CharField(source="entity.short_code", read_only=True)
    entity_name = serializers.CharField(source="entity.entity_name", read_only=True)
    customer_name = serializers.CharField(source="customer.customer_name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    allocations = PaymentAllocationSerializer(many=True, required=False)
    adjustments = PaymentAdjustmentSerializer(many=True, read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id",
            "payment_number",
            "payment_date",
            "entity_id",
            "entity_code",
            "entity_name",
            "customer_id",
            "customer_code",
            "customer_name",
            "amount",
            "payment_mode",
            "bank_cash_account",
            "transaction_reference",
            "remarks",
            "unallocated_amount",
            "allocations",
            "adjustments",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
        )
        read_only_fields = (
            "id",
            "entity_code",
            "entity_name",
            "customer_code",
            "customer_name",
            "unallocated_amount",
            "adjustments",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
        )
        extra_kwargs = {
            "payment_number": {"validators": []},
            "transaction_reference": {"required": False},
            "remarks": {"required": False},
        }

    def get_created_by_name(self, obj):
        return _user_display_name(obj.created_by)

    def validate_payment_number(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Payment number is required.")
        qs = Payment.objects.filter(payment_number__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Payment number {value} is already in use.")
        return value

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Amount must be greater than 0.")
        return money(value)

    def validate_bank_cash_account(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Bank/cash account is required.")
        return value

    def validate(self, attrs):
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        if customer is not None:
            attrs["customer_code"] = customer.customer_code
        allocations = attrs.get("allocations")
        if allocations:
            amount = attrs.get("amount", getattr(self.instance, "amount", None))
            _validate_allocation_batch(customer, amount, allocations)
        return attrs

    def create(self, validated_data):
        allocations = validated_data.pop("allocations", [])
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            validated_data["created_by"] = user
        with transaction.atomic():
            payment = Payment.objects.create(**validated_data)
            created = _save_allocations(payment, allocations)
            refresh_unallocated_amount(payment)
            seen = set()
            for allocation in created:
                if allocation.invoice_id not in seen:
                    seen.add(allocation.invoice_id)
                    sync_invoice_payment_status(allocation.invoice)
            from notifications.services import notify_payment_created

            notify_payment_created(payment)
        return payment


class AllocateSerializer(serializers.Serializer):
    invoice_id = serializers.PrimaryKeyRelatedField(queryset=Invoice.objects.all())
    allocated_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reason = serializers.CharField(max_length=255)
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")

    def validate_allocated_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Allocated amount must be greater than 0.")
        return money(value)

    def validate_reason(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Reason is required.")
        return value


def _validate_allocation_batch(customer, payment_amount, allocations, extra_already: Decimal | None = None):
    incoming_total = sum((money(row["allocated_amount"]) for row in allocations), Decimal("0"))
    already = extra_already if extra_already is not None else Decimal("0")
    if already + incoming_total > money(payment_amount):
        remaining = money(payment_amount) - money(already)
        if remaining < 0:
            remaining = Decimal("0.00")
        raise serializers.ValidationError(
            {
                "allocations": (
                    f"Cannot allocate {rupee_label(incoming_total)} — only "
                    f"{rupee_label(remaining)} remaining on this payment."
                )
            }
        )

    per_invoice = defaultdict(Decimal)
    for index, row in enumerate(allocations):
        invoice = row["invoice"]
        amount = money(row["allocated_amount"])
        if customer is not None and invoice.customer_id != customer.id:
            raise serializers.ValidationError(
                {
                    "allocations": {
                        index: {
                            "invoice_id": (
                                f"Invoice {invoice.invoice_number} belongs to a different customer."
                            )
                        }
                    }
                }
            )
        if invoice.status not in ALLOCATABLE_STATUSES:
            raise serializers.ValidationError(
                {
                    "allocations": {
                        index: {
                            "invoice_id": (
                                f"Invoice {invoice.invoice_number} cannot be allocated against "
                                f"because it is {invoice.status}."
                            )
                        }
                    }
                }
            )
        per_invoice[invoice.id] += amount

    invoice_map = {row["invoice"].id: row["invoice"] for row in allocations}
    for invoice_id, extra in per_invoice.items():
        invoice = invoice_map[invoice_id]
        remaining = invoice_remaining_balance(invoice)
        if extra > remaining:
            raise serializers.ValidationError(
                {
                    "allocations": (
                        f"Cannot allocate {rupee_label(extra)} — only "
                        f"{rupee_label(remaining)} remaining on invoice {invoice.invoice_number}."
                    )
                }
            )


def _save_allocations(payment, allocations):
    created = []
    for row in allocations:
        created.append(
            PaymentAllocation.objects.create(
                payment=payment,
                invoice=row["invoice"],
                allocated_amount=money(row["allocated_amount"]),
            )
        )
    return created
