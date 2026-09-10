from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("accounts.urls")),
    path("api/", include("masters.urls")),
    path("api/", include("transactions.urls")),
    path("api/", include("ledger.urls")),
]
