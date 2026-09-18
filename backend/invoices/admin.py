from django.contrib import admin

from .models import Invoice, InvoiceLine


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "customer_code",
        "purchase_order",
        "invoice_date",
        "due_date",
        "net_amount",
        "status",
    )
    list_filter = ("status", "entity", "brand")
    search_fields = ("invoice_number", "customer_code")
    inlines = [InvoiceLineInline]
