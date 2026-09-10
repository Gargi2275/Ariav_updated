from django.contrib import admin

from .models import AccountMaster, GroupProduct, ItemMaster, MasterBranch, MstFinYear, Parameter

admin.site.register(MasterBranch)
admin.site.register(MstFinYear)
admin.site.register(GroupProduct)
admin.site.register(ItemMaster)
admin.site.register(AccountMaster)
admin.site.register(Parameter)
