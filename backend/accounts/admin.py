from django.contrib import admin

from .models import AuditLog, AuthUser, AuthUserMstLogin, LoginRequest, UserToken


@admin.register(AuthUser)
class AuthUserAdmin(admin.ModelAdmin):
    list_display = ("username", "role", "email", "operator_code", "is_active")


admin.site.register(AuthUserMstLogin)
admin.site.register(UserToken)
admin.site.register(AuditLog)
admin.site.register(LoginRequest)
