from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("accounts.urls")),
    path("", include("entities.urls")),
    path("", include("brands.urls")),
    path("", include("categories.urls")),
    path("", include("products.urls")),
    path("", include("price_lists.urls")),
    path("", include("customers.urls")),
    path("", include("purchase_orders.urls")),
    path("", include("dispatches.urls")),
    path("", include("invoices.urls")),
    path("", include("payments.urls")),
    path("", include("notifications.urls")),
    path("", include("dashboards.urls")),
    path("", include("reports.urls")),
    path("api/", include("masters.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
