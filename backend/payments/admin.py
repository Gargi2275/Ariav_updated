from django.contrib import admin

from .models import Payment, PaymentAllocation, PaymentAdjustment


class PaymentAllocationInline(admin.TabularInline):
    model = PaymentAllocation
    extra = 0


class PaymentAdjustmentInline(admin.TabularInline):
    model = PaymentAdjustment
    extra = 0
    readonly_fields = (
        "invoice",
        "amount",
        "reason",
        "reference",
        "status",
        "created_by",
        "approved_by",
        "created_at",
        "approved_at",
    )


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "payment_number",
        "customer_code",
        "payment_date",
        "amount",
        "unallocated_amount",
        "payment_mode",
    )
    list_filter = ("payment_mode", "entity")
    search_fields = ("payment_number", "customer_code", "transaction_reference")
    inlines = [PaymentAllocationInline, PaymentAdjustmentInline]


@admin.register(PaymentAdjustment)
class PaymentAdjustmentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "payment",
        "invoice",
        "amount",
        "reason",
        "status",
        "created_by",
        "created_at",
    )
    list_filter = ("status",)
    search_fields = ("reason", "reference", "payment__payment_number")
    readonly_fields = (
        "payment",
        "payment_allocation",
        "invoice",
        "amount",
        "reason",
        "reference",
        "created_by",
        "approved_by",
        "status",
        "created_at",
        "approved_at",
    )
