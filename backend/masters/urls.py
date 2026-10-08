from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"masters/branches", views.BranchViewSet, basename="master-branch")
router.register(r"masters/groups", views.GroupProductViewSet, basename="master-group")
router.register(r"masters/items", views.ItemViewSet, basename="master-item")
router.register(r"masters/parameters", views.ParameterViewSet, basename="master-parameter")
router.register(r"masters/tax-slabs", views.TaxSlabViewSet, basename="master-tax-slab")
router.register(r"masters/brokers", views.BrokerViewSet, basename="master-broker")
router.register(r"masters/chart-accounts", views.ChartAccountViewSet, basename="master-chart-account")

urlpatterns = [
    path("", include(router.urls)),
]
