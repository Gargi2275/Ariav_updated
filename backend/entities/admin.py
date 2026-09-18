from django.contrib import admin

from .models import Entity


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ("short_code", "entity_name", "entity_type", "parent_entity", "status", "city")
    list_filter = ("status", "entity_type")
    search_fields = ("short_code", "entity_name", "city")
