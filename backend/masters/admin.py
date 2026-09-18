from django.contrib import admin

from .models import (
    AccountMaster,
    BrokerMaster,
    ChartAccount,
    GroupProduct,
    ItemMaster,
    MasterBranch,
    MstFinYear,
    Parameter,
    TaxSlab,
)

admin.site.register(MasterBranch)
admin.site.register(MstFinYear)
admin.site.register(GroupProduct)
admin.site.register(ItemMaster)
admin.site.register(AccountMaster)
admin.site.register(Parameter)
admin.site.register(TaxSlab)
admin.site.register(BrokerMaster)
admin.site.register(ChartAccount)
