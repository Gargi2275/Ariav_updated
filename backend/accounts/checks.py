from django.conf import settings
from django.core.checks import Error, Tags, Warning, register


@register(Tags.security, deploy=True)
def auth_deploy_checks(app_configs, **kwargs):
    issues = []
    if settings.SECRET_KEY == getattr(settings, "DEV_ONLY_SECRET_KEY", None):
        issues.append(
            Error(
                "SECRET_KEY is the dev-only fallback.",
                hint="Set DJANGO_SECRET_KEY in the environment.",
                id="ariav.E001",
            )
        )
    if "*" in settings.ALLOWED_HOSTS:
        issues.append(
            Warning(
                "ALLOWED_HOSTS contains '*'.",
                hint="Set DJANGO_DEBUG=false and list real hosts in DJANGO_ALLOWED_HOSTS.",
                id="ariav.W001",
            )
        )
    if "rest_framework.permissions.IsAuthenticated" not in settings.REST_FRAMEWORK.get("DEFAULT_PERMISSION_CLASSES", []):
        issues.append(
            Error(
                "REST_FRAMEWORK DEFAULT_PERMISSION_CLASSES must include IsAuthenticated.",
                id="ariav.E002",
            )
        )
    return issues
