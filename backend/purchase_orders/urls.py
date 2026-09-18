from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PurchaseOrderViewSet

router = DefaultRouter()
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")

urlpatterns = [
    path("api/", include(router.urls)),
]
