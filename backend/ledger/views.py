from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from masters.models import AccountMaster

from .models import LedgerLine


@api_view(["GET"])
@permission_classes([AllowAny])
def trial_balance(request):
    rows = []
    for account in AccountMaster.objects.all().order_by("code"):
        agg = account.ledger_lines.aggregate(dr=Sum("debit"), cr=Sum("credit"))
        dr = (agg["dr"] or 0) + (account.opening_balance if account.balance_type == "Dr" else 0)
        cr = (agg["cr"] or 0) + (account.opening_balance if account.balance_type == "Cr" else 0)
        rows.append(
            {
                "code": account.code,
                "name": account.name,
                "group": account.group,
                "debit": str(dr),
                "credit": str(cr),
            }
        )
    return Response({"success": True, "results": rows})
