from django.contrib import admin

from .models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "product_code",
        "product_name",
        "brand",
        "category",
        "availability",
        "status",
        "rate",
    )
    list_filter = ("status", "availability", "brand")
    search_fields = ("product_code", "product_name", "print_name", "design", "colour", "product_type", "group")
