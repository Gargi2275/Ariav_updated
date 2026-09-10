from django.urls import path

from . import views

urlpatterns = [
    path("masters/branches/", views.branches),
    path("masters/parties/", views.parties),
    path("masters/items/", views.items),
    path("masters/parameters/", views.parameters),
]
