"""Admin settings and purchase-order email endpoints. Authenticated only."""

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from brands.models import Brand

from .mail import (
    MailError,
    badges_for,
    brand_payload,
    build_attachment,
    check_connection,
    compose,
    empty_brand_payload,
    history_for,
    load_settings,
    retry_row,
    save_brand_config,
    save_settings,
    send_items,
    send_test_message,
    settings_payload,
    visible_orders,
)
from .models import BrandEmailConfig


class MailAPIView(APIView):
    def get_authenticate_header(self, request):
        return "Bearer"


def _call(fn):
    try:
        return fn()
    except MailError as exc:
        return Response(exc.payload, status=exc.status)


class EmailSettingsView(MailAPIView):
    permission_classes = [IsAdminRole]
    http_method_names = ["get", "put"]

    def get(self, request):
        return Response(settings_payload(load_settings()))

    def put(self, request):
        return _call(lambda: Response(save_settings(request.data, request.user, request)))


class EmailConnectionView(MailAPIView):
    permission_classes = [IsAdminRole]
    http_method_names = ["post"]

    def post(self, request):
        return Response(check_connection())


class EmailTestView(MailAPIView):
    permission_classes = [IsAdminRole]
    http_method_names = ["post"]

    def post(self, request):
        return _call(lambda: Response(send_test_message(request.user)))


class BrandEmailConfigView(MailAPIView):
    permission_classes = [IsAdminRole]
    http_method_names = ["get", "put"]

    def get(self, request, brand_id):
        brand = Brand.objects.filter(pk=brand_id).first()
        if brand is None:
            return Response({"detail": "Brand not found."}, status=404)
        row = BrandEmailConfig.objects.filter(brand=brand).first()
        return Response(brand_payload(row) if row else empty_brand_payload(brand.id))

    def put(self, request, brand_id):
        brand = Brand.objects.filter(pk=brand_id).first()
        if brand is None:
            return Response({"detail": "Brand not found."}, status=404)
        return _call(lambda: Response(save_brand_config(brand, request.data, request.user, request)))


class EmailComposeView(MailAPIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["post"]

    def post(self, request):
        return _call(lambda: Response(compose(request.data.get("po_ids"), request.user)))


class EmailSendView(MailAPIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["post"]

    def post(self, request):
        return _call(lambda: Response(send_items(request.data.get("items"), request.user)))


class EmailBadgeView(MailAPIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get"]

    def get(self, request):
        return Response(badges_for(request.user))


class EmailPreviewPdfView(MailAPIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get"]

    def get(self, request, pk):
        po = visible_orders(request.user).filter(pk=pk).first()
        if po is None:
            return Response({"detail": "Purchase order not found."}, status=404)
        from .mail import _config_for

        config = _config_for(po.brand)
        include_rates = bool(config.include_rates) if config else False
        label = config.copy_label if config else "Mill's Copy"
        payload, filename = build_attachment(po, include_rates, label)
        response = HttpResponse(payload, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class EmailHistoryView(MailAPIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get"]

    def get(self, request, pk):
        return _call(lambda: Response(history_for(pk, request.user)))


class EmailRetryView(MailAPIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["post"]

    def post(self, request):
        try:
            pk = int(request.data.get("id"))
        except (TypeError, ValueError):
            return Response({"id": "Choose an email."}, status=400)
        return _call(lambda: Response(retry_row(pk, request.user)))
