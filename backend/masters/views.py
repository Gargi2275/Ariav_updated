from django.db.models import ProtectedError, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .permissions import IsAuthenticatedAdminOrReadOnly

from .models import (
    BrokerMaster,
    ChartAccount,
    GroupProduct,
    ItemMaster,
    MasterBranch,
    Parameter,
    TaxSlab,
)
from .serializers import (
    BranchSerializer,
    BrokerSerializer,
    ChartAccountSerializer,
    ChartAccountTreeSerializer,
    GroupProductSerializer,
    ItemSerializer,
    ParameterSerializer,
    TaxSlabSerializer,
)


class MastersViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticatedAdminOrReadOnly]
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete this record because it is used by other documents."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class BranchViewSet(MastersViewSet):
    queryset = MasterBranch.objects.all().order_by("code")
    serializer_class = BranchSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("search")
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(code__icontains=q)
                | Q(city__icontains=q)
                | Q(gstin__icontains=q)
                | Q(address__icontains=q)
                | Q(phone__icontains=q)
            )
        active = self.request.query_params.get("is_active")
        if active in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        return qs


class GroupProductViewSet(MastersViewSet):
    queryset = GroupProduct.objects.all().order_by("code")
    serializer_class = GroupProductSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get("category")
        q = self.request.query_params.get("search")
        if category and category.lower() != "all":
            qs = qs.filter(category__iexact=category)
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q) | Q(construction__icontains=q))
        return qs


class ItemViewSet(MastersViewSet):
    queryset = ItemMaster.objects.select_related("group", "tax_slab").all().order_by("sku")
    serializer_class = ItemSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get("category")
        q = self.request.query_params.get("search")
        if category and category.lower() != "all":
            qs = qs.filter(category__iexact=category)
        if q:
            qs = qs.filter(Q(sku__icontains=q) | Q(description__icontains=q) | Q(hsn__icontains=q) | Q(construction__icontains=q))
        return qs


class ParameterViewSet(MastersViewSet):
    queryset = Parameter.objects.all().order_by("category", "code")
    serializer_class = ParameterSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get("category")
        q = self.request.query_params.get("search")
        if category and category.lower() != "all":
            qs = qs.filter(category__iexact=category)
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q) | Q(value__icontains=q) | Q(notes__icontains=q))
        return qs


class TaxSlabViewSet(MastersViewSet):
    queryset = TaxSlab.objects.all().order_by("gst_percent", "code")
    serializer_class = TaxSlabSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("search")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q) | Q(hsn_coverage__icontains=q))
        return qs


class BrokerViewSet(MastersViewSet):
    queryset = BrokerMaster.objects.prefetch_related("parties").all().order_by("code")
    serializer_class = BrokerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("search")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q) | Q(city__icontains=q) | Q(firm_name__icontains=q))
        return qs


class ChartAccountViewSet(MastersViewSet):
    queryset = ChartAccount.objects.select_related("parent").all().order_by("code")
    serializer_class = ChartAccountSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("search")
        nature = self.request.query_params.get("nature")
        account_type = self.request.query_params.get("account_type")
        if nature and nature.lower() != "all":
            qs = qs.filter(nature__iexact=nature)
        if account_type and account_type.lower() != "all":
            qs = qs.filter(account_type__iexact=account_type)
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q))
        return qs

    @action(detail=False, methods=["get"])
    def tree(self, request):
        roots = ChartAccount.objects.filter(parent__isnull=True).order_by("code")
        return Response(ChartAccountTreeSerializer(roots, many=True).data)
