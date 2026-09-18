from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PaymentAdjustmentViewSet, PaymentViewSet

router = DefaultRouter()
router.register(r"payments", PaymentViewSet, basename="payment")
router.register(r"payment-adjustments", PaymentAdjustmentViewSet, basename="payment-adjustment")

urlpatterns = [
    path("api/", include(router.urls)),
]
