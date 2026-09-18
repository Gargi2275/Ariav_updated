from django.contrib import admin

from .models import Brand


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("brand_code", "brand_name", "order_method", "gst_no", "status")
    list_filter = ("status", "order_method")
    search_fields = ("brand_code", "brand_name", "gst_no")
