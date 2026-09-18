# Ariav ERP backend (Django 4.2 + DRF)

MySQL env vars read by `config/settings.py` (names must match): `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

This project is **Django 4.2** (see `requirements.txt`) because local XAMPP MariaDB is **10.4**. Django 5/6 need MariaDB 10.6+ and will crash with `NotSupportedError` if you use the global Python install.

Always use `backend\.venv`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 8000
```

`manage.py` re-launches itself with `.venv\Scripts\python.exe` if you accidentally run it with another interpreter.

LOCAL DEV ONLY admin: username `admin`, password `admin123`, PIN `2468` (see `.env`).

## Invoice due reminders

There is no Celery/task queue in this stack. Upcoming Due / Due Today / Overdue
notifications are created by a management command, which you can run by hand or
on a schedule:

```bash
python manage.py generate_reminders
```

Optional: `--upcoming-days N` (default 3, or `NOTIFICATION_UPCOMING_DUE_DAYS` in `.env`).
The command is idempotent — re-running the same day does not duplicate a reminder
for the same invoice.

Production (Linux cron, daily at 07:00 IST):

```
0 7 * * * cd /path/to/ariav-erp/backend && .venv/bin/python manage.py generate_reminders
```

Production (Windows Task Scheduler): run `backend\.venv\Scripts\python.exe manage.py generate_reminders` on a daily trigger.

Payment Confirmation, PO Notification, and Dispatch Notification are event-driven
(created immediately; no command needed). Email/SMS/WhatsApp channels are schema
only — no external delivery.

