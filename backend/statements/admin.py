from django.contrib import admin

from .models import CustomerStatement, StatementEntry


class StatementEntryInline(admin.TabularInline):
    model = StatementEntry
    extra = 0
    ordering = ("line_no",)


@admin.register(CustomerStatement)
class CustomerStatementAdmin(admin.ModelAdmin):
    list_display = (
        "customer_code", "customer", "entity", "period_from", "period_to",
        "opening_display", "closing_display", "total_debit", "total_credit", "source_file",
    )
    list_filter = ("entity", "period_from", "period_to", "opening_dc", "closing_dc")
    search_fields = ("customer_code", "customer__customer_name", "ledger_code", "source_file")
    inlines = [StatementEntryInline]

    @admin.display(description="Opening")
    def opening_display(self, obj):
        return f"{obj.opening_amount} {obj.opening_dc}"

    @admin.display(description="Closing")
    def closing_display(self, obj):
        return f"{obj.closing_amount} {obj.closing_dc}"


@admin.register(StatementEntry)
class StatementEntryAdmin(admin.ModelAdmin):
    list_display = ("statement", "line_no", "post_date", "doc_type", "doc_no", "debit", "credit", "balance_display")
    list_filter = ("doc_type", "balance_dc", "post_date")
    search_fields = ("statement__customer_code", "doc_no", "text", "reference", "agent_code")
    ordering = ("statement", "line_no")

    @admin.display(description="Balance")
    def balance_display(self, obj):
        return f"{obj.balance_amount} {obj.balance_dc}"
