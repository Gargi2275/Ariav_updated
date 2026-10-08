from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt
from rest_framework.routers import DefaultRouter

from .views import PriceListViewSet

router = DefaultRouter()
router.register(r"price-lists", PriceListViewSet, basename="price-list")

urlpatterns = [
    path("api/", include(router.urls)),
    path("api/price-lists/<int:pk>/entries/", csrf_exempt(PriceListViewSet.as_view({"post": "entries"})), name="price-list-entries"),
    path("api/price-lists/<int:pk>/entries/<int:entry_id>/", csrf_exempt(PriceListViewSet.as_view({"put": "entry_detail", "delete": "entry_detail"})), name="price-list-entry-detail"),
]
