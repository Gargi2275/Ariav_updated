from django.contrib import admin

from .models import PriceList, PriceListEntry


admin.site.register(PriceList)
admin.site.register(PriceListEntry)
