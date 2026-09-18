from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DispatchViewSet

router = DefaultRouter()
router.register(r"dispatches", DispatchViewSet, basename="dispatch")

urlpatterns = [
    path("api/", include(router.urls)),
]
