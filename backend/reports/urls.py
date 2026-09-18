from django.urls import path

from . import views

urlpatterns = [
    path("api/reports/purchase-sales-trend/", views.purchase_sales_trend),
    path("api/reports/payment-trend/", views.payment_trend),
    path("api/reports/product-trend/", views.product_trend),
    path("api/reports/seasonal-trend/", views.seasonal_trend),
    path("api/reports/bad-debt-trend/", views.bad_debt_trend),
    path("api/reports/outstanding-report/", views.outstanding_report),
    path("api/reports/customer-performance/", views.customer_performance),
    path("api/reports/brand-performance/", views.brand_performance),
    path("api/reports/entity-performance/", views.entity_performance),
]
