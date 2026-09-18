import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "unsafe-dev-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() in ("1", "true", "yes")
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
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=24),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

LOGIN_REQUEST_TTL_SECONDS = 300
PIN_MAX_ATTEMPTS = 5
PIN_LOCKOUT_SECONDS = 300
SESSION_TOKEN_HOURS = 24
TEMP_TOKEN_SECONDS = 600

DEV_ADMIN_USERNAME = os.environ.get("DEV_ADMIN_USERNAME", "admin")
DEV_ADMIN_PASSWORD = os.environ.get("DEV_ADMIN_PASSWORD", "admin123")
DEV_ADMIN_PIN = os.environ.get("DEV_ADMIN_PIN", "2468")
DEV_OPERATOR_USERNAME = os.environ.get("DEV_OPERATOR_USERNAME", "bhavin.operator")
DEV_OPERATOR_PASSWORD = os.environ.get("DEV_OPERATOR_PASSWORD", "operator123")

# Invoice reminder lead time for `python manage.py generate_reminders`.
NOTIFICATION_UPCOMING_DUE_DAYS = int(os.environ.get("NOTIFICATION_UPCOMING_DUE_DAYS", "3"))
