from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import UserToken


class UserTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        raw = header[7:].strip()
        if not raw:
            return None
        try:
            token = UserToken.objects.select_related("user").get(token=raw)
        except UserToken.DoesNotExist:
            raise AuthenticationFailed("Invalid session token")
        if not token.is_valid():
            raise AuthenticationFailed("Session expired")
        if not token.user.is_active:
            raise AuthenticationFailed("Account disabled")
        token.user.last_login = timezone.now()
        return (token.user, token)
