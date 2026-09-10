from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import OrderForm, SalesInvoice


@api_view(["GET"])
@permission_classes([AllowAny])
def orders(request):
    rows = list(
        OrderForm.objects.values("order_no", "order_date", "meters", "rate", "amount", "status", "broker")
    )
    return Response({"success": True, "results": rows, "count": len(rows)})


@api_view(["GET"])
@permission_classes([AllowAny])
def invoices(request):
    rows = list(
        SalesInvoice.objects.values("invoice_no", "invoice_date", "taxable_amount", "gst_amount", "net_amount", "status")
    )
    return Response({"success": True, "results": rows, "count": len(rows)})
