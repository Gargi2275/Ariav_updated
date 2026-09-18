from django.contrib import admin

from .models import Dispatch, DispatchLine


class DispatchLineInline(admin.TabularInline):
    model = DispatchLine
    extra = 0


@admin.register(Dispatch)
class DispatchAdmin(admin.ModelAdmin):
    list_display = ("lr_number", "purchase_order", "dispatch_date", "transporter", "challan_reference")
    list_filter = ("dispatch_date", "transporter")
    search_fields = ("lr_number", "challan_reference")
    inlines = [DispatchLineInline]
