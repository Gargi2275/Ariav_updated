import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() in ("1", "true", "yes")

# Never used outside DEBUG: without DJANGO_SECRET_KEY a non-debug process refuses to start.
DEV_ONLY_SECRET_KEY = "dev-only-insecure-secret-key-do-not-use-in-production"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")
    SECRET_KEY = DEV_ONLY_SECRET_KEY
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if h.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "accounts",
    "entities",
    "brands",
    "categories",
    "products",
    "price_lists",
    "customers",
    "purchase_orders",
    "dispatches",
    "invoices",
    "payments",
    "notifications",
    "dashboards",
    "reports",
    "masters",
    "transactions",
    "ledger",
    "statements",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

# Exact env var names — do not rename (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "HOST": os.environ.get("DB_HOST", "127.0.0.1"),
        "PORT": os.environ.get("DB_PORT", "3306"),
        "NAME": os.environ.get("DB_NAME", "ariav_erp"),
        "USER": os.environ.get("DB_USER", "ariav"),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "OPTIONS": {
            "charset": "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

AUTH_USER_MODEL = "accounts.AuthUser"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
# Original price-list PDFs. Not under MEDIA_ROOT, so the public media route cannot serve them.
PRICE_LIST_PRIVATE_ROOT = Path(os.environ.get("PRICE_LIST_PRIVATE_ROOT", BASE_DIR / "private_price_lists"))

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "DJANGO_CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
# Vite --host serves the app on the LAN (e.g. http://192.168.1.20:5173).
# Port is left open because Vite increments it when 5173 is already taken.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://(localhost|127\.0\.0\.1):\d+$",
]
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES.append(
        r"^http://("
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r"):\d+$"
    )
    ALLOWED_HOSTS = ["*"]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "ariav-auth",
        "TIMEOUT": 300,
    }
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "accounts.authentication.UserTokenAuthentication",
    ],
    # Closed by default: public routes must declare @permission_classes([AllowAny])
    # and be listed in accounts/tests_route_guard.py PUBLIC_ROUTES.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

LOGIN_REQUEST_TTL_SECONDS = 300
PIN_MAX_ATTEMPTS = 5
PIN_LOCKOUT_SECONDS = 300
OTP_MAX_ATTEMPTS = 5
SESSION_TOKEN_HOURS = 24
# Product Category → Subcategory is optional and hidden while this is false.
# Set PRODUCT_CATEGORY_ENABLED=true to restore the previous required behaviour.
PRODUCT_CATEGORY_ENABLED = os.environ.get("PRODUCT_CATEGORY_ENABLED", "false").lower() in ("1", "true", "yes")
TEMP_TOKEN_SECONDS = 600
# Only enable behind a reverse proxy that overwrites X-Forwarded-For; otherwise
# clients could spoof their IP and dodge the per-IP rate limits.
TRUST_X_FORWARDED_FOR = os.environ.get("DJANGO_TRUST_X_FORWARDED_FOR", "false").lower() in ("1", "true", "yes")

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"
    SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SECURE_SSL_REDIRECT", "false").lower() in ("1", "true", "yes")
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "0"))
    if TRUST_X_FORWARDED_FOR:
        SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

DEV_ADMIN_USERNAME = os.environ.get("DEV_ADMIN_USERNAME", "admin")
DEV_ADMIN_PASSWORD = os.environ.get("DEV_ADMIN_PASSWORD", "admin123")
DEV_OPERATOR_USERNAME = os.environ.get("DEV_OPERATOR_USERNAME", "bhavin.operator")
DEV_OPERATOR_PASSWORD = os.environ.get("DEV_OPERATOR_PASSWORD", "operator123")

# Invoice reminder lead time for `python manage.py generate_reminders`.
NOTIFICATION_UPCOMING_DUE_DAYS = int(os.environ.get("NOTIFICATION_UPCOMING_DUE_DAYS", "3"))

# Purchase-order mail. Host, account and password stay in the environment.
# EMAIL_MODE: off (default) sends nothing, test redirects every message, live
# also requires the admin EmailSettings.enabled toggle.
EMAIL_MODE = os.environ.get("EMAIL_MODE", "off").strip().lower()
if EMAIL_MODE not in {"off", "test", "live"}:
    EMAIL_MODE = "off"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "").strip()
try:
    EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587") or "587")
except ValueError:
    EMAIL_PORT = 587
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
_tls_raw = os.environ.get("EMAIL_USE_TLS")
_ssl_raw = os.environ.get("EMAIL_USE_SSL")
if _tls_raw is None and _ssl_raw is None:
    EMAIL_USE_TLS = EMAIL_MODE != "off"
    EMAIL_USE_SSL = False
else:
    EMAIL_USE_TLS = (_tls_raw or "").strip().lower() in ("1", "true", "yes")
    EMAIL_USE_SSL = (_ssl_raw or "").strip().lower() in ("1", "true", "yes")
if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ImproperlyConfigured("Set only one of EMAIL_USE_TLS or EMAIL_USE_SSL.")
if not DEBUG and EMAIL_MODE in {"test", "live"} and not (EMAIL_USE_TLS or EMAIL_USE_SSL):
    raise ImproperlyConfigured(
        "SMTP requires EMAIL_USE_TLS or EMAIL_USE_SSL when DJANGO_DEBUG is false."
    )
EMAIL_TIMEOUT = 20
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "").strip()
EMAIL_TEST_RECIPIENT = os.environ.get("EMAIL_TEST_RECIPIENT", "").strip().lower()
