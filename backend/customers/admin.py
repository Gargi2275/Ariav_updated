from django.contrib import admin

from .models import Customer, CustomerEntity


class CustomerEntityInline(admin.TabularInline):
    model = CustomerEntity
    extra = 0


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("customer_code", "customer_name", "customer_type", "city", "status")
    list_filter = ("status", "customer_type")
    search_fields = ("customer_code", "customer_name", "gst_no", "city")
    inlines = [CustomerEntityInline]
