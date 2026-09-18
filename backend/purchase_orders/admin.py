from django.contrib import admin

from .models import PurchaseOrder, PurchaseOrderLine


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("po_number", "order_type", "entity", "customer", "brand", "po_date", "status")
    list_filter = ("status", "order_type", "brand", "entity")
    search_fields = ("po_number",)
    inlines = [PurchaseOrderLineInline]
