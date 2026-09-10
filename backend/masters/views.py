from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import AccountMaster, ItemMaster, MasterBranch, Parameter
from .serializers import BranchSerializer, ItemSerializer, PartySerializer


@api_view(["GET"])
@permission_classes([AllowAny])
def branches(request):
    return Response({"success": True, "results": BranchSerializer(MasterBranch.objects.all(), many=True).data})


@api_view(["GET"])
@permission_classes([AllowAny])
def parties(request):
    qs = AccountMaster.objects.exclude(group__in=["Income", "Expense", "Capital"])
    return Response({"success": True, "results": PartySerializer(qs, many=True).data})


@api_view(["GET"])
@permission_classes([AllowAny])
def items(request):
    return Response({"success": True, "results": ItemSerializer(ItemMaster.objects.all(), many=True).data})


@api_view(["GET"])
@permission_classes([AllowAny])
def parameters(request):
    rows = list(Parameter.objects.values("category", "code", "name", "value", "is_active"))
    return Response({"success": True, "results": rows})
