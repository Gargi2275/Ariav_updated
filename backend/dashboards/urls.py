from django.urls import path

from . import views

urlpatterns = [
    path("api/dashboards/admin/", views.admin_dashboard),
    path("api/dashboards/entity/", views.entity_dashboard),
    path("api/dashboards/staff/", views.staff_dashboard),
]
