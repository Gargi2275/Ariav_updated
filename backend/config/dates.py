"""Strict inclusive date bounds for list filters. Invalid text is rejected."""

from datetime import date

from rest_framework.exceptions import ValidationError


def parse_query_dates(params, start_key="date_from", end_key="date_to"):
    raw_from = (params.get(start_key) or "").strip()
    raw_to = (params.get(end_key) or "").strip()
    parsed_from = parsed_to = None
    if raw_from:
        try:
            parsed_from = date.fromisoformat(raw_from)
        except ValueError as exc:
            raise ValidationError({start_key: f"Invalid {start_key}. Use YYYY-MM-DD."}) from exc
    if raw_to:
        try:
            parsed_to = date.fromisoformat(raw_to)
        except ValueError as exc:
            raise ValidationError({end_key: f"Invalid {end_key}. Use YYYY-MM-DD."}) from exc
    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise ValidationError({start_key: f"{start_key} cannot be after {end_key}."})
    return parsed_from, parsed_to
