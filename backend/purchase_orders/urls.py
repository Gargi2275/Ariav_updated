from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .ocm_views import (
    OfficialOcmApproveView,
    OfficialOcmBulkDeleteView,
    OfficialOcmDetailView,
    OfficialOcmListView,
    OfficialOcmMappingView,
    OfficialOcmSelectView,
)
from .mail_views import (
    BrandEmailConfigView,
    EmailBadgeView,
    EmailComposeView,
    EmailConnectionView,
    EmailHistoryView,
    EmailPreviewPdfView,
    EmailRetryView,
    EmailSendView,
    EmailSettingsView,
    EmailTestView,
)
from .views import PurchaseOrderViewSet

router = DefaultRouter()
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")

urlpatterns = [
    path("api/purchase-orders/email/settings/", EmailSettingsView.as_view()),
    path("api/purchase-orders/email/connection/", EmailConnectionView.as_view()),
    path("api/purchase-orders/email/test/", EmailTestView.as_view()),
    path("api/purchase-orders/email/brands/<int:brand_id>/", BrandEmailConfigView.as_view()),
    path("api/purchase-orders/email/compose/", EmailComposeView.as_view()),
    path("api/purchase-orders/email/send/", EmailSendView.as_view()),
    path("api/purchase-orders/email/badges/", EmailBadgeView.as_view()),
    path("api/purchase-orders/email/retry/", EmailRetryView.as_view()),
    path("api/purchase-orders/<int:pk>/email/preview-pdf/", EmailPreviewPdfView.as_view()),
    path("api/purchase-orders/<int:pk>/email/history/", EmailHistoryView.as_view()),
    path("api/purchase-orders/ocm-official/", OfficialOcmListView.as_view()),
    path("api/purchase-orders/ocm-official/delete/", OfficialOcmBulkDeleteView.as_view()),
    path("api/purchase-orders/ocm-official/<int:pk>/", OfficialOcmDetailView.as_view()),
    path("api/purchase-orders/ocm-official/<int:pk>/select/", OfficialOcmSelectView.as_view()),
    path("api/purchase-orders/ocm-official/<int:pk>/mapping/", OfficialOcmMappingView.as_view()),
    path("api/purchase-orders/ocm-official/<int:pk>/approve/", OfficialOcmApproveView.as_view()),
    path("api/", include(router.urls)),
]
