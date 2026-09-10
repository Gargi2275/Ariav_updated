# Ariav ERP backend (Django 4.2 + DRF)

MySQL env vars read by `config/settings.py` (names must match): `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 8000
```

LOCAL DEV ONLY admin: username `admin`, password `admin123`, PIN `2468` (see `.env`).
