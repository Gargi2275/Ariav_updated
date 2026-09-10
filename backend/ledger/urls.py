from django.urls import path

from . import views

urlpatterns = [
    path("ledger/trial-balance/", views.trial_balance),
]
