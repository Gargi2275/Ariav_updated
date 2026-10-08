"""DB-backed rate limits and lockouts for the public auth endpoints.

Every limit is a (scope, parts) key. `bump` counts one event inside a rolling
window; when the count reaches `limit` the key is locked for `lock` seconds and
the counter restarts. Callers check `locked_seconds` before doing work.
"""

import hashlib
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import AuthThrottle


@dataclass(frozen=True)
class Limit:
    limit: int
    window: int
    lock: int


def _key(scope: str, *parts) -> str:
    raw = "|".join([scope, *[str(p).strip().lower() for p in parts]])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def locked_seconds(scope: str, *parts) -> int:
    row = AuthThrottle.objects.filter(key=_key(scope, *parts)).only("locked_until").first()
    if not row or not row.locked_until:
        return 0
    return max(int((row.locked_until - timezone.now()).total_seconds()), 0)


def bump(scope: str, *parts, rule: Limit, subject: str = "") -> tuple[int, int]:
    """Record one event. Returns (events counted in the current window, lock seconds remaining)."""
    key = _key(scope, *parts)
    now = timezone.now()
    with transaction.atomic():
        row, _ = AuthThrottle.objects.select_for_update().get_or_create(
            key=key, defaults={"window_started_at": now, "subject": subject}
        )
        if row.locked_until and row.locked_until > now:
            return row.hits, int((row.locked_until - now).total_seconds())
        if row.window_started_at + timedelta(seconds=rule.window) <= now or row.locked_until:
            row.hits = 0
            row.window_started_at = now
            row.locked_until = None
        row.hits += 1
        hits = row.hits
        if row.hits >= rule.limit:
            row.locked_until = now + timedelta(seconds=rule.lock)
            row.hits = 0
            row.window_started_at = now
        row.save()
    return hits, (rule.lock if row.locked_until else 0)


def reset(scope: str, *parts) -> None:
    AuthThrottle.objects.filter(key=_key(scope, *parts)).delete()


def reset_subject(subject: str) -> None:
    AuthThrottle.objects.filter(subject=subject).delete()
