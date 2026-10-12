from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Callable


Parser = Callable[[Any], tuple[Any, str | None, str | None]]


@dataclass(frozen=True)
class ImportProfile:
    id: str
    display_name: str
    brand_codes: tuple[str, ...]
    signature: tuple[str, ...]
    aliases: dict[str, tuple[str, ...]]
    field_parsers: dict[str, Parser]
    header_fields: tuple[str, ...]
    line_fields: tuple[str, ...]
    required_fields: tuple[str, ...]
    order_field: str
    customer_code_field: str
    customer_name_field: str
    description_field: str
    line_key_field: str
    quantity_field: str
    rate_field: str | None
    date_field: str | None
    remarks_field: str | None
    source_extra_fields: tuple[str, ...]
    line_extra_fields: tuple[str, ...]
    allow_duplicate_line_keys: bool = False

    def applies_to(self, brand_code: str) -> bool:
        return brand_code in self.brand_codes


def normalize_header(value: Any) -> str:
    text = "" if value is None else str(value).strip().lower()
    return "".join(character for character in text if character.isalnum())


def text_parser(value: Any) -> tuple[str, str | None, str | None]:
    if value is None or str(value).strip() == "":
        return "", None, None
    warning = None
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        warning = "Numeric identifier cell may have lost leading zeroes."
        if isinstance(value, float) and value.is_integer():
            value = int(value)
    return str(value).strip(), warning, None


def customer_code_parser(value: Any) -> tuple[str, str | None, str | None]:
    if value is None or str(value).strip() == "":
        return "", None, None
    raw = str(int(value)) if isinstance(value, float) and value.is_integer() else str(value).strip()
    digits = "".join(character for character in raw if character.isdigit())
    if not digits:
        return "", None, "Party code must contain digits."
    return digits.zfill(10), None, None


def decimal_parser(value: Any) -> tuple[Decimal | None, str | None, str | None]:
    if value is None or str(value).strip() == "":
        return None, None, None
    raw = str(value).strip().replace(",", "")
    try:
        parsed = Decimal(raw)
    except (InvalidOperation, ValueError):
        return None, None, f"Invalid number {raw!r}."
    if parsed <= 0:
        return None, None, "Value must be greater than zero."
    return parsed.quantize(Decimal("0.01")), None, None


def date_parser(format_name: str) -> Parser:
    def parse(value: Any) -> tuple[date | None, str | None, str | None]:
        if value is None or str(value).strip() == "":
            return None, None, None
        if isinstance(value, datetime):
            return value.date(), None, None
        if isinstance(value, date):
            return value, None, None
        raw = str(value).strip()
        for fmt in (format_name,):
            try:
                return datetime.strptime(raw, fmt).date(), None, None
            except ValueError:
                pass
        return None, None, f"Invalid date {raw!r}; expected {format_name}."

    return parse
