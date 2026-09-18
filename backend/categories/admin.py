from django.contrib import admin

from .models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("category_code", "category_name", "parent_category", "status")
    list_filter = ("status",)
    search_fields = ("category_code", "category_name")
