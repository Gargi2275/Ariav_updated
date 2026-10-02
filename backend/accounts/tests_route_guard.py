"""Closed-by-default guard: every URL rejects anonymous callers unless listed in PUBLIC_ROUTES.

The walk covers every pattern reachable from ROOT_URLCONF with two documented exceptions:

* ``admin/`` — the Django admin site uses Django session auth and its own login
  redirect (302 to the admin login page), not DRF permissions. It is protected by
  ``is_staff`` and is left out of this walk on purpose.
* ``/media/`` — static file serving is only mounted when DEBUG is true (see
  config/urls.py); tests run with DEBUG false, so the route does not exist here.
  Production must serve MEDIA_ROOT behind the web server, not through Django.

DRF format-suffix variants (``.json`` etc.) share their view and permission with the
un-suffixed route, so they are skipped.
"""

import re

from django.http import HttpResponse
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import URLPattern, URLResolver, get_resolver, path, resolve
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.test import APIClient

# route template -> methods anonymous callers may use. Keep this list short and justified.
PUBLIC_ROUTES: dict[str, set[str]] = {
    # Liveness probe; returns status only.
    "api/auth/health": {"GET"},
    "api/auth/health/": {"GET"},
    # Sign-in step 1 (username + password). Rate limited per IP and per IP+username.
    "api/check-credentials": {"POST"},
    "api/check-credentials/": {"POST"},
    "api/auth/check-credentials": {"POST"},
    # Admin sign-in step 2. Needs a temp_token from step 1; rate limited per IP and IP+account.
    "api/admin-login": {"POST"},
    "api/admin-login/": {"POST"},
    "api/admin/verify-pin": {"POST"},
    "api/admin/verify-pin/": {"POST"},
    "api/auth/admin/login": {"POST"},
    "api/auth/admin/verify-pin": {"POST"},
    # Operator login request (creates a pending ticket). Rate limited per IP.
    "api/login": {"POST"},
    "api/login/": {"POST"},
    "api/auth/operator/request": {"POST"},
    # Operator waiting screen poll; returns status only, no side effects.
    "api/check-request-status": {"GET"},
    "api/check-request-status/": {"GET"},
    "api/auth/operator/status": {"GET"},
    # Operator OTP exchange. Needs request_id; 5 wrong codes kill the ticket; rate limited per IP.
    "verify-otp/": {"POST"},
    "api/verify-otp": {"POST"},
    "api/verify-otp/": {"POST"},
    "api/auth/operator/verify-otp": {"POST"},
    # Revokes the presented token, if any.
    "api/auth/logout": {"POST"},
}

SKIPPED_PREFIXES = ("admin/",)
_CONVERTER = re.compile(r"<(?:(\w+):)?(\w+)>")
_REGEX_GROUP = re.compile(r"\(\?P<(\w+)>[^()]*\)")


def _template(pattern) -> str:
    return str(pattern)


def _concrete(template: str) -> str:
    """Fill converters / named groups with a dummy value so the URL resolves."""
    concrete = _REGEX_GROUP.sub("1", template)
    concrete = _CONVERTER.sub("1", concrete)
    return concrete.lstrip("^").rstrip("$").replace("\\.", ".").replace("/?", "/")


def iter_routes(patterns=None, prefix=""):
    """Yield (template, concrete_path, URLPattern) for every leaf route."""
    if patterns is None:
        patterns = get_resolver().url_patterns
    for entry in patterns:
        template = prefix + _template(entry.pattern).lstrip("^").rstrip("$")
        if isinstance(entry, URLResolver):
            yield from iter_routes(entry.url_patterns, template)
        elif isinstance(entry, URLPattern):
            yield template, "/" + _concrete(template), entry


def allowed_methods(callback) -> list[str]:
    actions = getattr(callback, "actions", None)
    if actions:
        return sorted(m.upper() for m in actions)
    cls = getattr(callback, "cls", None) or getattr(callback, "view_class", None)
    if cls is not None:
        return sorted(m.upper() for m in cls.http_method_names if m not in ("head", "options") and hasattr(cls, m))
    return ["GET", "POST"]


def find_open_routes(client=None) -> tuple[list[str], list[str], int]:
    """Return (open_routes, unresolvable, calls_made). An open route answers an anonymous
    call with something other than 401/403."""
    client = client or APIClient()
    open_routes, unresolvable, calls = [], [], 0
    for template, url, entry in iter_routes():
        if template.startswith(SKIPPED_PREFIXES) or "(?P<format>" in template or "<drf_format_suffix" in template:
            continue
        try:
            resolve(url)
        except Exception:
            unresolvable.append(f"{template} -> {url}")
            continue
        public = PUBLIC_ROUTES.get(template, set())
        for method in allowed_methods(entry.callback):
            if method in public:
                continue
            response = getattr(client, method.lower())(url, {}, format="json", HTTP_HOST="localhost")
            calls += 1
            if response.status_code not in (401, 403):
                open_routes.append(f"{method} {template} -> {response.status_code}")
    return open_routes, unresolvable, calls


class RouteGuardTests(TestCase):
    def test_every_non_public_route_rejects_anonymous_callers(self):
        open_routes, unresolvable, calls = find_open_routes()
        self.assertEqual(unresolvable, [], "Guard could not build a URL for these routes")
        self.assertEqual(open_routes, [], "Routes reachable without credentials and not in PUBLIC_ROUTES")
        self.assertGreater(calls, 100)

    def test_public_routes_still_exist(self):
        templates = {template: entry for template, _url, entry in iter_routes()}
        for template, methods in PUBLIC_ROUTES.items():
            self.assertIn(template, templates, f"PUBLIC_ROUTES entry {template!r} no longer matches a route")
            self.assertTrue(
                methods <= set(allowed_methods(templates[template].callback)),
                f"PUBLIC_ROUTES entry {template!r} lists a method the view does not accept",
            )

    def test_walk_covers_the_api(self):
        templates = {template for template, _url, _entry in iter_routes()}
        for expected in ("api/auth/admin/queue", "api/auth/audit-trail", "api/masters/groups/"):
            self.assertTrue(any(t.startswith(expected) for t in templates), expected)


@api_view(["GET"])
@permission_classes([AllowAny])
def _unlisted_open_view(request):
    return HttpResponse("open")


@api_view(["GET"])
def _default_closed_view(request):
    return HttpResponse("closed")


urlpatterns = [
    path("api/unlisted-open/", _unlisted_open_view),
    path("api/default-closed/", _default_closed_view),
]


@override_settings(ROOT_URLCONF=__name__)
class RouteGuardNegativeExampleTests(TestCase):
    """An AllowAny route that is not in PUBLIC_ROUTES must be reported; a view with no
    explicit permission_classes falls back to the IsAuthenticated default and stays closed."""

    def test_unlisted_open_route_is_reported(self):
        open_routes, unresolvable, calls = find_open_routes()
        self.assertEqual(unresolvable, [])
        self.assertEqual(calls, 2)
        self.assertEqual(open_routes, ["GET api/unlisted-open/ -> 200"])


class ConcretePathTests(SimpleTestCase):
    def test_fills_converters_and_regex_groups(self):
        self.assertEqual(_concrete("api/admin/approve/<str:request_id>/"), "api/admin/approve/1/")
        self.assertEqual(_concrete("^api/masters/groups/(?P<pk>[^/.]+)/$"), "api/masters/groups/1/")
