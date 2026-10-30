"""Purchase-order email: templates, outbox, and one locked send path.

Transport settings come from the environment. This module never logs them.
MariaDB 10.4 has no SKIP LOCKED, so a queued row is claimed with an atomic
UPDATE that only one worker can win.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMessage, get_connection
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone
from email.utils import make_msgid

from accounts.access import is_admin_user, scope_to_visible_customers
from accounts.models import AuditLog

from .form_pdf import build_order_form_pdf
from .models import BrandEmailConfig, EmailOutbox, EmailSettings, PurchaseOrder
from .pdf import build_po_pdf
from .print_profiles import profile_for_brand

logger = logging.getLogger(__name__)

MAX_ADDRESSES = 10
MAX_SUBJECT = 200
MAX_BODY = 20000
MAX_PO_IDS = 50
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_ATTEMPTS = 3
IDEMPOTENCY_WINDOW = timedelta(minutes=10)
UNKNOWN_AFTER = timedelta(minutes=15)
PLACEHOLDERS = (
    "po_number",
    "po_date",
    "brand_name",
    "party_name",
    "party_code",
    "branch_name",
    "line_count",
    "total_pieces",
    "total_amount",
    "sender_name",
    "signature",
)
SENDABLE = {
    PurchaseOrder.Status.SUBMITTED,
    PurchaseOrder.Status.SENT_TO_BRAND,
    PurchaseOrder.Status.BRAND_ACCEPTED,
    PurchaseOrder.Status.PARTIALLY_DISPATCHED,
    PurchaseOrder.Status.FULLY_DISPATCHED,
}
TOKEN = re.compile(r"\{([a-z_]+)\}")
HEADER_BREAK = re.compile(r"[\r\n]")
DEFAULT_SUBJECT = "Purchase order {po_number}"
DEFAULT_BODY = (
    "Please find purchase order {po_number} dated {po_date} "
    "for {party_name} ({party_code}).\n\n{signature}"
)


class MailError(Exception):
    def __init__(self, status: int, payload: dict):
        super().__init__(payload.get("detail", "email error"))
        self.status = status
        self.payload = payload


def public_error(exc: BaseException) -> str:
    text = " ".join(str(exc).split())
    secrets = [
        getattr(settings, "EMAIL_HOST_PASSWORD", "") or "",
        getattr(settings, "EMAIL_HOST_USER", "") or "",
    ]
    row = EmailSettings.objects.order_by("id").first()
    if row is not None:
        secrets.extend([row.smtp_password or "", row.smtp_user or ""])
    for secret in secrets:
        if secret:
            text = text.replace(secret, "[redacted]")
    return (text or "The message could not be sent.")[:400]


def load_settings() -> EmailSettings:
    row = EmailSettings.objects.order_by("id").first()
    if row is None:
        row = EmailSettings.objects.create()
    return row


def mailbox(row: EmailSettings | None = None) -> dict:
    """Saved mailbox wins. Environment values are only the fallback until one is saved."""
    row = row or load_settings()
    saved_user = (row.smtp_user or "").strip()
    saved_password = row.smtp_password or ""
    if saved_user and saved_password:
        host = (row.smtp_host or "").strip() or "smtp.gmail.com"
        port = row.smtp_port or 587
        user = saved_user
        password = saved_password
        sender = (row.from_email or saved_user).strip()
    else:
        host = (settings.EMAIL_HOST or "").strip() or "smtp.gmail.com"
        port = settings.EMAIL_PORT or 587
        user = (settings.EMAIL_HOST_USER or "").strip()
        password = settings.EMAIL_HOST_PASSWORD or ""
        sender = (settings.DEFAULT_FROM_EMAIL or user).strip()
    return {
        "host": host,
        "port": int(port or 587),
        "user": user,
        "password": password,
        "from_email": sender,
    }


def mail_connection():
    box = mailbox()
    return get_connection(
        host=box["host"],
        port=box["port"],
        username=box["user"],
        password=box["password"],
        use_tls=True,
        timeout=settings.EMAIL_TIMEOUT,
    )


def transport_public() -> dict:
    row = load_settings()
    box = mailbox(row)
    mode = "off" if settings.EMAIL_MODE == "off" or not row.enabled else "live"
    return {
        "mode": mode,
        "configured": bool(box["password"]),
        "test_recipient": "",
        "from_configured": bool(box["from_email"]),
        "smtp_host": box["host"],
        "smtp_port": box["port"],
        "smtp_user": box["user"],
        "from_email": box["from_email"],
    }


def _audit(user, request, action: str, fields: list[str]) -> None:
    if not fields:
        return
    ip = ""
    if request is not None:
        ip = (request.META.get("REMOTE_ADDR") or "")[:64]
    AuditLog.objects.create(
        user=getattr(user, "display_name", "") or getattr(user, "username", "") or "Anonymous",
        role=getattr(user, "role", "") or "",
        action=action,
        module="Purchase Orders",
        ip_address=ip,
        details="fields: " + ", ".join(fields),
    )


def _no_header_break(value: str, label: str) -> str:
    if HEADER_BREAK.search(value or ""):
        raise MailError(400, {"detail": f"{label} cannot contain a line break."})
    return value or ""


def normalize_addresses(raw, label: str) -> list[str]:
    if raw is None:
        raw = []
    if isinstance(raw, str) or not isinstance(raw, (list, tuple)):
        raise MailError(400, {label: "Enter a list of email addresses."})
    if len(raw) > MAX_ADDRESSES:
        raise MailError(400, {label: f"Enter at most {MAX_ADDRESSES} addresses."})
    found = []
    seen = set()
    for item in raw:
        text = _no_header_break(str(item or ""), label).strip().lower()
        if not text:
            raise MailError(400, {label: "Remove the blank address."})
        try:
            validate_email(text)
        except DjangoValidationError as exc:
            raise MailError(400, {label: "Enter a valid email address."}) from exc
        if text in seen:
            raise MailError(400, {label: "Remove the duplicate address."})
        seen.add(text)
        found.append(text)
    return found


def normalize_address_sets(to, cc, bcc) -> tuple[list[str], list[str], list[str]]:
    to_list = normalize_addresses(to, "to")
    cc_list = normalize_addresses(cc, "cc")
    bcc_list = normalize_addresses(bcc, "bcc")
    overlap = (set(to_list) & set(cc_list)) | (set(to_list) & set(bcc_list)) | (set(cc_list) & set(bcc_list))
    if overlap:
        raise MailError(400, {"detail": "An address can only be in one of To, CC, or BCC."})
    return to_list, cc_list, bcc_list


def unknown_placeholders(text: str) -> list[str]:
    return sorted({match.group(1) for match in TOKEN.finditer(text or "") if match.group(1) not in PLACEHOLDERS})


def validate_template_text(subject: str, body: str) -> tuple[str, str]:
    subject = _no_header_break(subject or "", "Subject").strip()
    body = body or ""
    if HEADER_BREAK.search(subject):
        raise MailError(400, {"subject": "Subject cannot contain a line break."})
    if len(subject) > MAX_SUBJECT:
        raise MailError(400, {"subject": f"Subject must be {MAX_SUBJECT} characters or fewer."})
    if len(body) > MAX_BODY:
        raise MailError(400, {"body": f"Body must be {MAX_BODY} characters or fewer."})
    unknown = unknown_placeholders(subject) + unknown_placeholders(body)
    if unknown:
        raise MailError(400, {"detail": f"Unknown placeholder: {unknown[0]}."})
    return subject, body


def render_text(text: str, values: dict[str, str]) -> str:
    unknown = unknown_placeholders(text)
    if unknown:
        raise MailError(400, {"detail": f"Unknown placeholder: {unknown[0]}."})

    def replace(match):
        value = values.get(match.group(1))
        return value if value else "-"

    rendered = TOKEN.sub(replace, text or "")
    return rendered


def _pieces(po: PurchaseOrder) -> str:
    total = sum((line.quantity or Decimal("0")) for line in po.lines.all())
    if total == total.to_integral_value():
        return str(int(total))
    return f"{total:.2f}"


def _amount(po: PurchaseOrder, include_rates: bool) -> str:
    lines = list(po.lines.all())
    if not include_rates or any(line.rate is None for line in lines):
        return "-"
    total = sum((line.line_total or Decimal("0")) for line in lines)
    return f"{total:.2f}"


def placeholder_values(po: PurchaseOrder, user, include_rates: bool) -> dict[str, str]:
    signature = (po.entity.email_signature or "").strip()
    sender = ""
    if user is not None:
        sender = (getattr(user, "display_name", "") or getattr(user, "username", "") or "").strip()
    return {
        "po_number": po.po_number or "-",
        "po_date": po.po_date.strftime("%d/%m/%Y") if po.po_date else "-",
        "brand_name": po.brand.brand_name or "-",
        "party_name": po.customer.customer_name or "-",
        "party_code": po.customer.customer_code or "-",
        "branch_name": po.entity.entity_name or "-",
        "line_count": str(po.lines.count()),
        "total_pieces": _pieces(po),
        "total_amount": _amount(po, include_rates),
        "sender_name": sender or "-",
        "signature": signature or "-",
    }


def visible_orders(user):
    return scope_to_visible_customers(
        PurchaseOrder.objects.select_related("entity", "customer", "brand", "created_by").prefetch_related("lines"),
        user,
    )


def _config_for(brand) -> BrandEmailConfig | None:
    return BrandEmailConfig.objects.filter(brand=brand).first()


def _safe_filename(po: PurchaseOrder) -> str:
    prefix = "POR" if po.order_type == PurchaseOrder.OrderType.MANUAL else "PO"
    safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in po.po_number)
    return f"{prefix}-{safe}.pdf"


def _copy_key(po: PurchaseOrder, label: str) -> str:
    profile = profile_for_brand(po.brand.brand_code)
    if profile is None:
        return ""
    wanted = (label or "").strip().casefold()
    for key, text in profile.copies.items():
        if text.casefold() == wanted or key.casefold() == wanted:
            return key
    return "mill" if "mill" in profile.copies else next(iter(profile.copies), "")


def build_attachment(po: PurchaseOrder, include_rates: bool, copy_label: str) -> tuple[bytes, str]:
    profile = profile_for_brand(po.brand.brand_code)
    if profile is not None:
        copy = _copy_key(po, copy_label)
        payload = build_order_form_pdf(po, profile, copy, include_rates=include_rates)
    else:
        payload = build_po_pdf(po, include_rates=include_rates)
    return payload, _safe_filename(po)


def _latest_sent(po: PurchaseOrder):
    return (
        po.email_outbox.filter(status=EmailOutbox.Status.SENT).order_by("-sent_at", "-id").first()
    )


def _warnings(po, config, settings_row, attachment_size: int, user) -> list[str]:
    warnings = []
    box = mailbox(settings_row)
    if settings.EMAIL_MODE == "off":
        warnings.append("Email sending is off.")
    elif not settings_row.enabled:
        warnings.append("Live email is switched off.")
    if not box["user"] or not box["password"]:
        warnings.append("The mailbox email and app password are not saved.")
    recipients = (config.to_addresses if config else []) or []
    if not recipients:
        warnings.append("No recipients are configured for this brand.")
    if po.status not in SENDABLE:
        warnings.append("This purchase order is not in a sendable status.")
    sent = _latest_sent(po)
    if sent is not None:
        when = timezone.localtime(sent.sent_at or sent.created_at).strftime("%d/%m/%Y %H:%M")
        shown = list(sent.to_addresses or [])
        if is_admin_user(user):
            shown = shown + list(sent.cc_addresses or [])
        warnings.append(f"Already emailed on {when} to {', '.join(shown) or '-'}.")
    if config and config.include_rates and any(line.rate is None for line in po.lines.all()):
        warnings.append("This purchase order has unpriced lines.")
    if attachment_size > MAX_ATTACHMENT_BYTES:
        warnings.append("The attachment is over 10 MB.")
    return warnings


def compose(po_ids, user) -> dict:
    if not isinstance(po_ids, list) or not po_ids:
        raise MailError(400, {"po_ids": "Choose at least one purchase order."})
    if len(po_ids) > MAX_PO_IDS:
        raise MailError(400, {"po_ids": f"Choose at most {MAX_PO_IDS} purchase orders."})
    parsed = []
    for raw in po_ids:
        try:
            parsed.append(int(raw))
        except (TypeError, ValueError) as exc:
            raise MailError(400, {"po_ids": "Each purchase order id must be a number."}) from exc
    orders = list(visible_orders(user).filter(pk__in=parsed))
    if len(orders) != len(set(parsed)):
        raise MailError(404, {"detail": "Purchase order not found."})
    by_id = {po.id: po for po in orders}
    settings_row = load_settings()
    items = []
    for pk in parsed:
        po = by_id[pk]
        config = _config_for(po.brand)
        include_rates = bool(config.include_rates) if config else False
        attach = config.attach_pdf if config else True
        subject_template = (config.subject_template if config and config.subject_template else DEFAULT_SUBJECT)
        body_template = (config.body_template if config and config.body_template else DEFAULT_BODY)
        values = placeholder_values(po, user, include_rates)
        subject = render_text(subject_template, values)[:MAX_SUBJECT]
        body = render_text(body_template, values)
        size = 0
        filename = ""
        if attach:
            payload, filename = build_attachment(po, include_rates, config.copy_label if config else "Mill's Copy")
            size = len(payload)
        to_list = list(config.to_addresses or []) if config else []
        cc_list = list(config.cc_addresses or []) if config else []
        bcc_list = list(config.bcc_addresses or []) if config else []
        item = {
            "po_id": po.id,
            "po_number": po.po_number,
            "status": po.status,
            "sendable": po.status in SENDABLE,
            "subject": subject,
            "body": body,
            "to": to_list,
            "cc": cc_list,
            "attachment_name": filename,
            "attachment_bytes": size,
            "include_rates": include_rates,
            "warnings": _warnings(po, config, settings_row, size, user),
        }
        if is_admin_user(user):
            item["bcc"] = bcc_list
        items.append(item)
    public = transport_public()
    preview = settings_row.require_preview
    return {**public, "enabled": settings_row.enabled, "require_preview": preview, "items": items}


def _idempotency_key(po_id: int, to, cc, bcc, body: str, reason: str) -> str:
    bucket = int(timezone.now().timestamp()) // int(IDEMPOTENCY_WINDOW.total_seconds())
    raw = "|".join([
        str(po_id),
        ",".join(to),
        ",".join(cc),
        ",".join(bcc),
        hashlib.sha256(body.encode("utf-8")).hexdigest(),
        reason.strip(),
        str(bucket),
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cap_remaining(settings_row: EmailSettings, incoming: int) -> None:
    now = timezone.now()
    start = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
    day_count = EmailOutbox.objects.filter(created_at__gte=start).count()
    day_left = max(settings_row.daily_cap - day_count, 0)
    minute_count = EmailOutbox.objects.filter(created_at__gte=now - timedelta(minutes=1)).count()
    minute_left = max(settings_row.per_minute_cap - minute_count, 0)
    if incoming > day_left:
        raise MailError(429, {"detail": "The daily email cap has been reached.", "remaining": day_left})
    if incoming > minute_left:
        raise MailError(429, {"detail": "The per-minute email cap has been reached.", "remaining": minute_left})


def _sending_allowed() -> None:
    if settings.EMAIL_MODE == "off":
        raise MailError(400, {"detail": "Email sending is off."})
    if not load_settings().enabled:
        raise MailError(400, {"detail": "Live email is switched off."})
    box = mailbox()
    if not box["user"] or not box["password"]:
        raise MailError(400, {"detail": "The mailbox email and app password are not saved."})
    if not box["from_email"]:
        raise MailError(400, {"detail": "The from address is not configured."})


def _resolved_recipients(item: dict, config, user):
    configured_to = list(config.to_addresses or []) if config else []
    configured_cc = list(config.cc_addresses or []) if config else []
    configured_bcc = list(config.bcc_addresses or []) if config else []
    supplied = [key for key in ("to", "cc", "bcc") if key in item and item[key] is not None]
    if not is_admin_user(user):
        if supplied:
            incoming = {
                "to": normalize_addresses(item["to"], "to") if "to" in item else configured_to,
                "cc": normalize_addresses(item["cc"], "cc") if "cc" in item else configured_cc,
                "bcc": normalize_addresses(item["bcc"], "bcc") if "bcc" in item else configured_bcc,
            }
            current = {"to": configured_to, "cc": configured_cc, "bcc": configured_bcc}
            if any(incoming[key] != current[key] for key in supplied):
                raise MailError(403, {"detail": "Recipients are set on the brand and cannot be changed."})
        return configured_to, configured_cc, configured_bcc
    to_list = normalize_addresses(item["to"], "to") if "to" in item else configured_to
    cc_list = normalize_addresses(item["cc"], "cc") if "cc" in item else configured_cc
    bcc_list = normalize_addresses(item["bcc"], "bcc") if "bcc" in item else configured_bcc
    return normalize_address_sets(to_list, cc_list, bcc_list)


def send_items(items, user) -> dict:
    if not isinstance(items, list) or not items:
        raise MailError(400, {"items": "Choose at least one purchase order."})
    if len(items) > MAX_PO_IDS:
        raise MailError(400, {"items": f"Choose at most {MAX_PO_IDS} purchase orders."})
    _sending_allowed()
    settings_row = load_settings()
    prepared = []
    seen_po = set()
    for item in items:
        if not isinstance(item, dict):
            raise MailError(400, {"items": "Each item must be an object."})
        try:
            po_id = int(item.get("po_id"))
        except (TypeError, ValueError) as exc:
            raise MailError(400, {"po_id": "Each purchase order id must be a number."}) from exc
        if po_id in seen_po:
            raise MailError(400, {"po_id": "Each purchase order can be sent once in this request."})
        seen_po.add(po_id)
        po = visible_orders(user).filter(pk=po_id).first()
        if po is None:
            raise MailError(404, {"detail": "Purchase order not found."})
        config = _config_for(po.brand)
        include_rates = bool(config.include_rates) if config else False
        values = placeholder_values(po, user, include_rates)
        subject, body = validate_template_text(
            render_text(str(item.get("subject") or ""), values)[:MAX_SUBJECT],
            render_text(str(item.get("body") or ""), values)[:MAX_BODY],
        )
        if not subject:
            raise MailError(400, {"subject": "Subject is required."})
        to_list, cc_list, bcc_list = _resolved_recipients(item, config, user)
        if not to_list:
            raise MailError(400, {"detail": "No recipients are configured for this brand."})
        if po.status not in SENDABLE:
            raise MailError(400, {"detail": f"{po.po_number} is not in a sendable status."})
        attach = config.attach_pdf if config else True
        payload = b""
        filename = ""
        if attach:
            payload, filename = build_attachment(po, include_rates, config.copy_label if config else "Mill's Copy")
            if len(payload) > MAX_ATTACHMENT_BYTES:
                raise MailError(400, {"detail": f"The attachment for {po.po_number} is over 10 MB."})
        reason = str(item.get("resend_reason") or "").strip()
        if HEADER_BREAK.search(reason):
            raise MailError(400, {"resend_reason": "The reason cannot contain a line break."})
        sent = _latest_sent(po)
        prepared.append({
            "po": po,
            "subject": subject,
            "body": body,
            "to": to_list,
            "cc": cc_list,
            "bcc": bcc_list,
            "filename": filename,
            "payload": payload,
            "reason": reason,
            "resend_of": sent,
        })
    new_count = 0
    keys = []
    for entry in prepared:
        key = _idempotency_key(entry["po"].id, entry["to"], entry["cc"], entry["bcc"], entry["body"], entry["reason"])
        entry["key"] = key
        keys.append(key)
        if EmailOutbox.objects.filter(idempotency_key=key).exists():
            continue
        if entry["resend_of"] is not None and len(entry["reason"]) < 5:
            raise MailError(400, {"resend_reason": "A resend needs a reason of at least 5 characters."})
        new_count += 1
    if new_count:
        _cap_remaining(settings_row, new_count)
    created_ids = []
    rows = []
    with transaction.atomic():
        for entry in prepared:
            existing = EmailOutbox.objects.filter(idempotency_key=entry["key"]).first()
            if existing is not None:
                rows.append({"row": existing, "idempotent": True})
                continue
            try:
                row = EmailOutbox.objects.create(
                    purchase_order=entry["po"],
                    brand=entry["po"].brand,
                    created_by=user if getattr(user, "is_authenticated", False) else None,
                    to_addresses=entry["to"],
                    cc_addresses=entry["cc"],
                    bcc_addresses=entry["bcc"],
                    subject=_transmitted_subject(entry["subject"], entry["to"]),
                    body=entry["body"],
                    attachment_filename=entry["filename"],
                    attachment_sha256=hashlib.sha256(entry["payload"]).hexdigest() if entry["payload"] else "",
                    status=EmailOutbox.Status.QUEUED,
                    idempotency_key=entry["key"],
                    resend_of=entry["resend_of"],
                    resend_reason=entry["reason"],
                )
            except IntegrityError:
                row = EmailOutbox.objects.get(idempotency_key=entry["key"])
                rows.append({"row": row, "idempotent": True})
                continue
            created_ids.append(row.id)
            rows.append({"row": row, "idempotent": False})
    if created_ids:
        process_outbox(created_ids)
    marked = _after_send(settings_row, user, [item["row"] for item in rows if not item["idempotent"]])
    fresh = EmailOutbox.objects.filter(pk__in=[item["row"].id for item in rows])
    by_pk = {row.id: row for row in fresh}
    return {
        **transport_public(),
        "ask_status_update": False,
        "marked_sent_to_brand": marked["marked"],
        "rows": [
            {
                "id": item["row"].id,
                "po_id": item["row"].purchase_order_id,
                "po_number": by_pk[item["row"].id].purchase_order.po_number,
                "status": by_pk[item["row"].id].status,
                "idempotent": item["idempotent"],
            }
            for item in rows
        ],
    }


def _transmitted_subject(subject: str, to_addresses: list[str]) -> str:
    return subject


def _after_send(settings_row, user, rows: list[EmailOutbox]) -> dict:
    """A delivered email moves a Submitted purchase order to Sent to Brand."""
    eligible = []
    marked = []
    from .transitions import apply_status_change, validate_transition

    for row in rows:
        row.refresh_from_db()
        if row.status != EmailOutbox.Status.SENT:
            continue
        po = row.purchase_order
        if po.status != PurchaseOrder.Status.SUBMITTED:
            continue
        eligible.append(po.id)
        error = validate_transition(po.status, PurchaseOrder.Status.SENT_TO_BRAND)
        if error:
            continue
        apply_status_change(
            po,
            PurchaseOrder.Status.SENT_TO_BRAND,
            user=user,
            reason="Emailed to the brand.",
        )
        marked.append(po.id)
    return {"eligible": eligible, "marked": marked}


def sweep_unknown() -> int:
    cutoff = timezone.now() - UNKNOWN_AFTER
    return EmailOutbox.objects.filter(
        status=EmailOutbox.Status.SENDING,
        sending_started_at__lt=cutoff,
    ).update(status=EmailOutbox.Status.UNKNOWN, last_error="The send did not finish and needs a manual review.")


def _claim(pk: int) -> bool:
    return EmailOutbox.objects.filter(pk=pk, status=EmailOutbox.Status.QUEUED).update(
        status=EmailOutbox.Status.SENDING,
        sending_started_at=timezone.now(),
        attempts=models_f_attempts(),
    ) == 1


def models_f_attempts():
    from django.db.models import F
    return F("attempts") + 1


def _envelope(row: EmailOutbox) -> tuple[str, list[str], list[str], list[str]]:
    return row.subject, list(row.to_addresses or []), list(row.cc_addresses or []), list(row.bcc_addresses or [])


def _reply_to(row: EmailOutbox, settings_row: EmailSettings) -> list[str]:
    reply = (row.purchase_order.entity.reply_to or settings_row.reply_to_default or "").strip().lower()
    return [reply] if reply else []


def process_outbox(ids: list[int] | None = None, limit: int = 10) -> int:
    """Send queued rows. A row already claimed by another worker is left alone."""
    sweep_unknown()
    if settings.EMAIL_MODE == "off" or not load_settings().enabled:
        return 0
    if ids is None:
        ids = list(
            EmailOutbox.objects.filter(status=EmailOutbox.Status.QUEUED)
            .order_by("id")
            .values_list("id", flat=True)[:limit]
        )
    sent = 0
    for pk in ids:
        if not _claim(pk):
            continue
        if _deliver(pk):
            sent += 1
    return sent


def _deliver(pk: int) -> bool:
    row = (
        EmailOutbox.objects.select_related("purchase_order__entity", "purchase_order__brand", "purchase_order__customer", "brand")
        .get(pk=pk)
    )
    try:
        config = _config_for(row.brand)
        include_rates = bool(config.include_rates) if config else False
        attach = config.attach_pdf if config else True
        payload = b""
        filename = row.attachment_filename
        if attach:
            payload, filename = build_attachment(
                row.purchase_order,
                include_rates,
                config.copy_label if config else "Mill's Copy",
            )
            if len(payload) > MAX_ATTACHMENT_BYTES:
                raise MailError(400, {"detail": "The attachment is over 10 MB."})
        digest = hashlib.sha256(payload).hexdigest() if payload else ""
        EmailOutbox.objects.filter(pk=row.pk).update(
            attachment_filename=filename,
            attachment_sha256=digest,
        )
        row.refresh_from_db()
        subject, to_list, cc_list, bcc_list = _envelope(row)
        message_id = make_msgid(domain="ariav.local")
        settings_row = load_settings()
        box = mailbox(settings_row)
        from_email = box["from_email"]
        from_name = (settings_row.from_name or "").strip()
        if from_name and from_email:
            from_email = f"{from_name} <{from_email}>"
        message = EmailMessage(
            subject=subject,
            body=row.body,
            from_email=from_email,
            to=to_list,
            cc=cc_list,
            bcc=bcc_list,
            reply_to=_reply_to(row, settings_row),
            connection=mail_connection(),
        )
        if payload:
            message.attach(filename, payload, "application/pdf")
        message.extra_headers["Message-ID"] = message_id
        message.send(fail_silently=False)
    except Exception as exc:
        cleaned = public_error(exc)
        logger.warning("purchase order email failed: %s", cleaned)
        EmailOutbox.objects.filter(pk=pk, status=EmailOutbox.Status.SENDING).update(
            status=EmailOutbox.Status.FAILED,
            last_error=cleaned,
        )
        return False
    EmailOutbox.objects.filter(pk=pk, status=EmailOutbox.Status.SENDING).update(
        status=EmailOutbox.Status.SENT,
        sent_at=timezone.now(),
        message_id=message_id,
        last_error="",
    )
    return True


def retry_row(pk: int, user) -> dict:
    row = EmailOutbox.objects.select_related("purchase_order").filter(pk=pk).first()
    if row is None or not visible_orders(user).filter(pk=row.purchase_order_id).exists():
        raise MailError(404, {"detail": "Email not found."})
    if row.status != EmailOutbox.Status.FAILED:
        raise MailError(400, {"detail": "Only a failed email can be retried."})
    if row.attempts >= MAX_ATTEMPTS:
        raise MailError(400, {"detail": "This email has already been tried 3 times."})
    _sending_allowed()
    updated = EmailOutbox.objects.filter(
        pk=row.pk,
        status=EmailOutbox.Status.FAILED,
        attempts__lt=MAX_ATTEMPTS,
    ).update(status=EmailOutbox.Status.QUEUED, last_error="")
    if not updated:
        raise MailError(400, {"detail": "This email can no longer be retried."})
    process_outbox([row.pk])
    row.refresh_from_db()
    return {"id": row.id, "status": row.status, "attempts": row.attempts, "last_error": row.last_error}


def history_for(po_id: int, user) -> list[dict]:
    po = visible_orders(user).filter(pk=po_id).first()
    if po is None:
        raise MailError(404, {"detail": "Purchase order not found."})
    admin = is_admin_user(user)
    rows = []
    for row in po.email_outbox.select_related("created_by").order_by("-created_at", "-id"):
        item = {
            "id": row.id,
            "status": row.status,
            "subject": row.subject,
            "body": row.body,
            "to": row.to_addresses,
            "cc": row.cc_addresses,
            "attachment_filename": row.attachment_filename,
            "attachment_sha256": row.attachment_sha256,
            "attempts": row.attempts,
            "last_error": row.last_error,
            "sent_at": row.sent_at.isoformat() if row.sent_at else None,
            "created_at": row.created_at.isoformat(),
            "created_by": (row.created_by.display_name or row.created_by.username) if row.created_by_id else "",
            "resend_reason": row.resend_reason,
            "resend_of": row.resend_of_id,
        }
        if admin:
            item["bcc"] = row.bcc_addresses
        rows.append(item)
    return rows


def badges_for(user) -> dict:
    latest: dict[int, str] = {}
    visible = visible_orders(user).values("id")
    pairs = (
        EmailOutbox.objects.filter(purchase_order_id__in=visible)
        .order_by("-id")
        .values_list("purchase_order_id", "status")
    )
    for po_id, status in pairs:
        if po_id in latest:
            continue
        if status == EmailOutbox.Status.SENDING:
            status = EmailOutbox.Status.QUEUED
        latest[po_id] = status
    return {"statuses": {str(key): value for key, value in latest.items()}, **transport_public()}


def save_settings(data: dict, user, request) -> dict:
    row = load_settings()
    changed = []
    if "enabled" in data:
        enabled = bool(data.get("enabled"))
        if enabled != row.enabled:
            row.enabled = enabled
            changed.append("enabled")
    if "from_name" in data:
        from_name = _no_header_break(str(data.get("from_name") or ""), "From name").strip()[:120]
        if from_name != row.from_name:
            row.from_name = from_name
            changed.append("from_name")
    if "reply_to_default" in data:
        reply = str(data.get("reply_to_default") or "").strip().lower()
        if reply:
            _no_header_break(reply, "Reply-to")
            try:
                validate_email(reply)
            except DjangoValidationError as exc:
                raise MailError(400, {"reply_to_default": "Enter a valid email address."}) from exc
        if reply != row.reply_to_default:
            row.reply_to_default = reply
            changed.append("reply_to_default")
    if "daily_cap" in data:
        try:
            cap = int(data.get("daily_cap"))
        except (TypeError, ValueError) as exc:
            raise MailError(400, {"daily_cap": "Enter a whole number."}) from exc
        if cap < 0 or cap > 10000:
            raise MailError(400, {"daily_cap": "Daily cap must be between 0 and 10000."})
        if cap != row.daily_cap:
            row.daily_cap = cap
            changed.append("daily_cap")
    if "per_minute_cap" in data:
        try:
            cap = int(data.get("per_minute_cap"))
        except (TypeError, ValueError) as exc:
            raise MailError(400, {"per_minute_cap": "Enter a whole number."}) from exc
        if cap < 1 or cap > 100:
            raise MailError(400, {"per_minute_cap": "Per-minute cap must be between 1 and 100."})
        if cap != row.per_minute_cap:
            row.per_minute_cap = cap
            changed.append("per_minute_cap")
    if "require_preview" in data:
        required = bool(data.get("require_preview"))
        if required != row.require_preview:
            row.require_preview = required
            changed.append("require_preview")
    if "after_send_status_action" in data:
        action = str(data.get("after_send_status_action") or "")
        allowed = {choice for choice, _label in EmailSettings.AfterSend.choices}
        if action not in allowed:
            raise MailError(400, {"after_send_status_action": "Choose none, ask, or mark_sent_to_brand."})
        if action != row.after_send_status_action:
            row.after_send_status_action = action
            changed.append("after_send_status_action")
    if any(key in data for key in ("smtp_host", "smtp_port", "smtp_user", "smtp_password", "from_email")):
        _save_mailbox(row, data, changed)
    row.updated_by = user
    row.save()
    _audit(user, request, "Email settings updated", changed)
    return settings_payload(row)


def settings_payload(row: EmailSettings | None = None) -> dict:
    row = row or load_settings()
    connection = {"ok": None, "detail": ""}
    return {
        **transport_public(),
        "enabled": row.enabled,
        "from_name": row.from_name,
        "reply_to_default": row.reply_to_default,
        "daily_cap": row.daily_cap,
        "per_minute_cap": row.per_minute_cap,
        "require_preview": row.require_preview,
        "after_send_status_action": row.after_send_status_action,
        "connection": connection,
    }


def _mailbox_address(value, label: str) -> str:
    text = _no_header_break(str(value or ""), label).strip().lower()
    if not text:
        return ""
    try:
        validate_email(text)
    except DjangoValidationError as exc:
        raise MailError(400, {"detail": f"Enter a valid {label.lower()}."}) from exc
    return text


def _save_mailbox(row: EmailSettings, data: dict, changed: list[str]) -> None:
    current = mailbox(row)
    host = _no_header_break(str(data.get("smtp_host", current["host"]) or ""), "Mail host").strip() or "smtp.gmail.com"
    if len(host) > 200:
        raise MailError(400, {"detail": "Mail host is too long."})
    try:
        port = int(data.get("smtp_port", current["port"] or 587))
    except (TypeError, ValueError) as exc:
        raise MailError(400, {"detail": "Enter a port number."}) from exc
    if port < 1 or port > 65535:
        raise MailError(400, {"detail": "Enter a port from 1 to 65535."})
    user = _mailbox_address(data.get("smtp_user", current["user"]), "Mailbox") or current["user"]
    sender = _mailbox_address(data.get("from_email", current["from_email"]) or user, "From address") or user
    password = str(data.get("smtp_password") or "")
    if any(char in password for char in "\r\n"):
        raise MailError(400, {"detail": "The app password cannot contain a line break."})
    saved = bool((row.smtp_user or "").strip() and row.smtp_password)
    if not password and (user != current["user"] or not saved):
        if user != current["user"]:
            raise MailError(400, {"detail": "Enter the app password for this mailbox."})
        return
    if password and password != row.smtp_password:
        row.smtp_password = password
        changed.append("smtp_password")
    if host != row.smtp_host:
        row.smtp_host = host
        changed.append("smtp_host")
    if port != row.smtp_port:
        row.smtp_port = port
        changed.append("smtp_port")
    if user != (row.smtp_user or ""):
        row.smtp_user = user
        changed.append("smtp_user")
    if sender != (row.from_email or ""):
        row.from_email = sender
        changed.append("from_email")


def check_connection() -> dict:
    public = transport_public()
    box = mailbox()
    if not box["user"] or not box["password"]:
        return {**public, "ok": False, "detail": "The mailbox email and app password are not saved."}
    try:
        connection = mail_connection()
        connection.open()
        connection.close()
    except Exception as exc:
        cleaned = public_error(exc)
        logger.warning("purchase order email connection failed: %s", cleaned)
        return {**public, "ok": False, "detail": cleaned}
    return {**public, "ok": True, "detail": "Connection OK."}


def send_test_message(user) -> dict:
    _sending_allowed()
    box = mailbox()
    address = box["from_email"]
    subject = "Ariav purchase-order email test"
    body = "This is a test message from purchase-order email settings."
    from_email = address
    from_name = (load_settings().from_name or "").strip()
    if from_name:
        from_email = f"{from_name} <{address}>"
    try:
        message = EmailMessage(
            subject=subject,
            body=body,
            from_email=from_email,
            to=[address],
            connection=mail_connection(),
        )
        message.send(fail_silently=False)
    except Exception as exc:
        cleaned = public_error(exc)
        logger.warning("purchase order test email failed: %s", cleaned)
        raise MailError(400, {"detail": cleaned}) from exc
    return {"detail": "Test email handed to the mail transport.", **transport_public()}


def save_brand_config(brand, data: dict, user, request) -> dict:
    row, _created = BrandEmailConfig.objects.get_or_create(brand=brand)
    changed = []
    if any(key in data for key in ("to_addresses", "cc_addresses", "bcc_addresses")):
        to_list, cc_list, bcc_list = normalize_address_sets(
            data.get("to_addresses", row.to_addresses),
            data.get("cc_addresses", row.cc_addresses),
            data.get("bcc_addresses", row.bcc_addresses),
        )
        if to_list != list(row.to_addresses or []):
            row.to_addresses = to_list
            changed.append("to_addresses")
        if cc_list != list(row.cc_addresses or []):
            row.cc_addresses = cc_list
            changed.append("cc_addresses")
        if bcc_list != list(row.bcc_addresses or []):
            row.bcc_addresses = bcc_list
            changed.append("bcc_addresses")
    if "subject_template" in data or "body_template" in data:
        subject, body = validate_template_text(
            data.get("subject_template", row.subject_template),
            data.get("body_template", row.body_template),
        )
        if subject != row.subject_template:
            row.subject_template = subject
            changed.append("subject_template")
        if body != row.body_template:
            row.body_template = body
            changed.append("body_template")
    if "attach_pdf" in data and bool(data.get("attach_pdf")) != row.attach_pdf:
        row.attach_pdf = bool(data.get("attach_pdf"))
        changed.append("attach_pdf")
    if "include_rates" in data and bool(data.get("include_rates")) != row.include_rates:
        row.include_rates = bool(data.get("include_rates"))
        changed.append("include_rates")
    if "copy_label" in data:
        label = _no_header_break(str(data.get("copy_label") or ""), "Copy label").strip()[:80] or "Mill's Copy"
        if label != row.copy_label:
            row.copy_label = label
            changed.append("copy_label")
    if "require_preview" in data:
        raw = data.get("require_preview")
        value = None if raw is None or raw == "" else bool(raw)
        if value != row.require_preview:
            row.require_preview = value
            changed.append("require_preview")
    row.save()
    _audit(user, request, "Brand email settings updated", changed)
    return brand_payload(row)


def brand_payload(row: BrandEmailConfig) -> dict:
    return {
        "brand_id": row.brand_id,
        "to_addresses": row.to_addresses or [],
        "cc_addresses": row.cc_addresses or [],
        "bcc_addresses": row.bcc_addresses or [],
        "subject_template": row.subject_template,
        "body_template": row.body_template,
        "attach_pdf": row.attach_pdf,
        "include_rates": row.include_rates,
        "copy_label": row.copy_label,
        "require_preview": row.require_preview,
        "placeholders": list(PLACEHOLDERS),
    }


def empty_brand_payload(brand_id: int) -> dict:
    return {
        "brand_id": brand_id,
        "to_addresses": [],
        "cc_addresses": [],
        "bcc_addresses": [],
        "subject_template": "",
        "body_template": "",
        "attach_pdf": True,
        "include_rates": False,
        "copy_label": "Mill's Copy",
        "require_preview": None,
        "placeholders": list(PLACEHOLDERS),
    }
