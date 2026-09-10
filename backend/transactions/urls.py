from django.urls import path

from . import views

urlpatterns = [
    path("transactions/orders/", views.orders),
    path("transactions/invoices/", views.invoices),
]
