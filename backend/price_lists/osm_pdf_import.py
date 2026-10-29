"""OSM regular price-list PDF import.

Numbers are taken only from the PDF text. A dash stays empty. A line that
does not match the known OSM layout fails the file instead of being skipped.
"""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path

import pdfplumber
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from rest_framework.exceptions import ValidationError

from brands.models import Brand
from categories.models import Category
from entities.models import Entity
from products.models import Product

from .models import BrandQualityPrice, PriceList, PriceListImportBatch

FORMAT_ID = "osm_pdf_pricelist"
CACHE_PREFIX = "price_list_osm_pdf_preview:"
TTL = 30 * 60
MAX_FILE_SIZE = 8 * 1024 * 1024
MAX_PAGES = 40
MAX_ROWS = 2000
PARENT_CATEGORY_CODE = "QUALITY"
PARENT_CATEGORY_NAME = "Quality"

CODE_RE = re.compile(r"^([A-Z0-9]+) -([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+) ?-([A-Z0-9]+)-$")
HYPHEN_CODE_RE = re.compile(r"^([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)$")
COLLECTION_RE = re.compile(r"^(?P<name>.+?)\s*\((?P<code>[^)]+)\)\s*(?P<rest>.*)$")
CODE_ONLY_RE = re.compile(r"^\(([A-Z0-9]+)\)$")
ROW_RE = re.compile(r"^(\d+) (.+) (-|\d+(?:\.\d{1,2})?) (-|\d+(?:\.\d{1,2})?) (-|\d+(?:\.\d{1,2})?)$")
TITLE_RE = re.compile(r"^Regular Price List-(Summer|Winter)'(\d{4})(?: \((Revised)\))?$")
WEF_RE = re.compile(r"^w\.e\.f (\d{2})\.(\d{2})\.(\d{4})$")
PAGE_RE = re.compile(r"^Page (\d+) of (\d+)$")
DISCOUNT_RE = re.compile(r"^(\d+(?:\.\d+)?)% Discount will be given on than of (\d+\.\d+) mts & above$")
PACKING_LINES = (
    "*Order in piece length of 8.00 meters and above will be",
    "supplied in than packing without any additional packing",
)
GST_LINES = (
    "*Above Ex-mill & W/S are exclusive of GST",
    "*Above Retail is inclusive of GST",
)
ACTIVE_MARKERS = (b"/JavaScript", b"/JS", b"/EmbeddedFile", b"/Launch", b"/OpenAction", b"/Encrypt", b"/AA")


def is_osm_brand(brand: Brand) -> bool:
    code = (brand.brand_code or "").upper()
    name = (brand.brand_name or "").upper()
    return code in {"OCM", "OSM"} or "OSM" in name


def _money(token: str):
    if token == "-":
        return None
    try:
        value = Decimal(token)
    except InvalidOperation as exc:
        raise ValidationError({"file": f"Price '{token}' is not an exact number."}) from exc
    if value.as_tuple().exponent < -2:
        raise ValidationError({"file": f"Price '{token}' has more than two decimal places."})
    return value


def _decimal_text(token: str) -> Decimal:
    try:
        return Decimal(token)
    except InvalidOperation as exc:
        raise ValidationError({"file": "A discount figure could not be read exactly."}) from exc


def _reject_active_pdf(file_bytes: bytes):
    if not file_bytes.startswith(b"%PDF-"):
        raise ValidationError({"file": "Upload a PDF price list. Excel files are not accepted for this brand."})
    if len(file_bytes) > MAX_FILE_SIZE:
        raise ValidationError({"file": "The PDF must be no larger than 8 MB."})
    head = file_bytes[:65536]
    for marker in ACTIVE_MARKERS:
        if marker in head or marker in file_bytes:
            raise ValidationError({"file": "This PDF contains encryption or active content and was not imported."})


def _pages(file_bytes: bytes):
    try:
        document = pdfplumber.open(BytesIO(file_bytes))
    except Exception as exc:
        raise ValidationError({"file": "The PDF could not be read."}) from exc
    try:
        if len(document.pages) > MAX_PAGES:
            raise ValidationError({"file": f"The PDF has more than {MAX_PAGES} pages."})
        pages = []
        for index, page in enumerate(document.pages, 1):
            pages.append({
                "number": index,
                "text": page.extract_text() or "",
                "words": page.extract_words(x_tolerance=1, y_tolerance=1) or [],
            })
        return pages
    finally:
        document.close()


def _word_lines(words):
    lines = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        if lines and abs(word["top"] - lines[-1]["top"]) <= 2.5:
            lines[-1]["words"].append(word)
        else:
            lines.append({"top": word["top"], "words": [word]})
    for line in lines:
        line["words"].sort(key=lambda item: item["x0"])
        line["text"] = " ".join(word["text"] for word in line["words"])
    return lines


def _join_price(words):
    if not words:
        return None
    raw = "".join(word["text"] for word in words).replace(" ", "")
    if raw in {"-", "–"}:
        return None
    digits = raw.replace(",", "")
    if not re.fullmatch(r"\d+", digits):
        raise ValidationError({"file": f"Price '{raw}' is not an exact number."})
    return Decimal(digits)


def _append_shades(entry, extra):
    current = entry["shades_raw"]
    if not current:
        entry["shades_raw"] = extra
    elif current.endswith(","):
        entry["shades_raw"] = current + extra
    else:
        entry["shades_raw"] = f"{current},{extra}"


def _parse_column_pdf(pages):
    title = season = revision = unit_text = ""
    year = None
    valid_from = None
    tax_lines = []
    packing_lines = []
    entries = []
    seen_pages = []
    declared_total = None
    current_discount = None
    current_note = ""
    collection_name = ""
    collection_code = ""
    footnote_open = False

    for page in pages:
        page_no = page["number"]
        for raw_line in page["text"].splitlines():
            line = raw_line.strip()
            title_match = TITLE_RE.match(line)
            if title_match:
                found_season, found_year, found_revision = title_match.group(1), int(title_match.group(2)), title_match.group(3) or ""
                if title and (found_season != season or found_year != year or line != title):
                    raise ValidationError({"file": "The PDF title changes between pages."})
                title, season, year, revision = line, found_season, found_year, found_revision
            wef_match = WEF_RE.match(line)
            if wef_match:
                day, month, wef_year = (int(part) for part in wef_match.groups())
                try:
                    found_date = date(wef_year, month, day)
                except ValueError as exc:
                    raise ValidationError({"file": f"The w.e.f. date '{line}' is not a real date."}) from exc
                if valid_from and found_date != valid_from:
                    raise ValidationError({"file": "The PDF contains more than one w.e.f. date."})
                valid_from = found_date
            if line == "INR Per Mtr.*":
                unit_text = line
            page_match = PAGE_RE.match(line)
            if page_match:
                current, total = int(page_match.group(1)), int(page_match.group(2))
                if current != page_no:
                    raise ValidationError({"file": f"Page footer says {current} on PDF page {page_no}."})
                if declared_total not in (None, total):
                    raise ValidationError({"file": "The PDF page count changes between pages."})
                declared_total = total
                seen_pages.append(current)

        headers = {word["text"]: word["x0"] for word in page["words"] if word["top"] < 120}
        shades_x = headers.get("Shades", 168)
        delivery_x = headers.get("Delivery", 428)
        exmill_x = headers.get("Ex-Mill", 472)
        wholesale_x = headers.get("W/S", 510)
        retail_x = headers.get("Retail", 542)
        exmill_cut = (exmill_x + wholesale_x) / 2
        wholesale_cut = (wholesale_x + retail_x) / 2

        for line in _word_lines(page["words"]):
            text = line["text"].strip()
            if not text or text.startswith("Regular Price") or text.startswith("w.e.f") or text.startswith("INR "):
                continue
            if text.startswith("Page ") or "Ex-Mill" in text or text.startswith("Serial") or text.startswith("Quality No"):
                continue
            words = line["words"]
            quality = next((word for word in words if HYPHEN_CODE_RE.match(word["text"])), None)
            if quality is not None:
                prefix, seg_a, seg_b, seg_c, number = HYPHEN_CODE_RE.match(quality["text"]).groups()
                if len(number) > 7:
                    raise ValidationError({"file": f"Quality number '{number}' is longer than 7 characters."})
                serial_words = [word for word in words if word["x0"] < quality["x0"] and word["text"].isdigit()]
                if len(serial_words) != 1:
                    raise ValidationError({"file": f"Quality {quality['text']} on page {page_no} has no serial number."})
                shade_words = [word for word in words if shades_x - 8 <= word["x0"] < delivery_x - 12 and word is not quality]
                delivery_words = [word for word in words if delivery_x - 12 <= word["x0"] < exmill_x - 8]
                exmill_words = [word for word in words if exmill_x - 8 <= word["x0"] < exmill_cut]
                wholesale_words = [word for word in words if exmill_cut <= word["x0"] < wholesale_cut]
                retail_words = [word for word in words if word["x0"] >= wholesale_cut]
                percent, meters = current_discount if current_discount else (Decimal("0"), None)
                entries.append({
                    "sr_no": int(serial_words[0]["text"]),
                    "source_page": page_no,
                    "quality_code": quality["text"],
                    "quality_prefix": prefix,
                    "seg_a": seg_a,
                    "seg_b": seg_b,
                    "seg_c": seg_c,
                    "quality_number": number,
                    "ex_mill": _join_price(exmill_words),
                    "wholesale": _join_price(wholesale_words),
                    "retail": _join_price(retail_words),
                    "discount_percent": percent,
                    "discount_min_meters": meters,
                    "discount_note": current_note,
                    "raw_line": text,
                    "collection_name": collection_name,
                    "collection_code": collection_code,
                    "shades_raw": " ".join(word["text"] for word in shade_words),
                    "delivery_raw": " ".join(word["text"] for word in delivery_words),
                })
                footnote_open = False
                continue
            if all(shades_x - 8 <= word["x0"] < delivery_x - 12 for word in words) and entries:
                extra = text
                discount_match = DISCOUNT_RE.match(extra)
                if discount_match:
                    current_discount = (_decimal_text(discount_match.group(1)), _decimal_text(discount_match.group(2)))
                    current_note = extra
                    continue
                _append_shades(entries[-1], extra)
                entries[-1]["raw_line"] = f"{entries[-1]['raw_line']} {extra}"
                continue
            collection_match = COLLECTION_RE.match(text)
            if collection_match and not any(word["x0"] >= exmill_x - 8 for word in words):
                collection_name = collection_match.group("name").strip()
                collection_code = collection_match.group("code").strip()
                rest = collection_match.group("rest").strip()
                discount_match = DISCOUNT_RE.match(rest)
                if discount_match:
                    current_discount = (_decimal_text(discount_match.group(1)), _decimal_text(discount_match.group(2)))
                    current_note = rest
                elif rest:
                    raise ValidationError({"file": f"Unrecognized PDF line on page {page_no}: {text}"})
                footnote_open = False
                continue
            if text in GST_LINES:
                if text not in tax_lines:
                    tax_lines.append(text)
                footnote_open = False
                continue
            if text.startswith("*") or footnote_open:
                packing_lines.append(text)
                footnote_open = not text.endswith(".")
                continue
            if all(word["x0"] < shades_x - 8 for word in words):
                code_only = CODE_ONLY_RE.match(text)
                if code_only:
                    collection_code = code_only.group(1)
                    collection_name = collection_code
                else:
                    collection_name = text
                    collection_code = ""
                footnote_open = False
                continue
            raise ValidationError({"file": f"Unrecognized PDF line on page {page_no}: {text}"})

    return {
        "title": title,
        "season": season,
        "year": year,
        "revision_label": revision,
        "valid_from": valid_from,
        "unit_text": unit_text,
        "tax_lines": tax_lines,
        "packing_lines": packing_lines,
        "entries": entries,
        "seen_pages": seen_pages,
        "declared_total": declared_total,
        "restarting_serials": True,
    }


def parse_osm_pdf(file_bytes: bytes) -> dict:
    _reject_active_pdf(file_bytes)
    pages = _pages(file_bytes)
    if not pages:
        raise ValidationError({"file": "The PDF has no pages."})
    if any(word["text"] == "Shades" for page in pages for word in page["words"]):
        parsed = _parse_column_pdf(pages)
        return _finish_pdf(pages, parsed)

    title = season = revision = unit_text = ""
    year = None
    valid_from = None
    tax_lines = []
    packing_lines = []
    entries = []
    seen_pages = []
    declared_total = None
    current_discount = None
    current_note = ""

    for page in pages:
        page_no = page["number"]
        text = page["text"]
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            title_match = TITLE_RE.match(line)
            if title_match:
                found_season, found_year, found_revision = title_match.group(1), int(title_match.group(2)), title_match.group(3) or ""
                if title and (found_season != season or found_year != year or line != title):
                    raise ValidationError({"file": "The PDF title changes between pages."})
                title, season, year, revision = line, found_season, found_year, found_revision
                continue
            wef_match = WEF_RE.match(line)
            if wef_match:
                day, month, wef_year = (int(part) for part in wef_match.groups())
                try:
                    found_date = date(wef_year, month, day)
                except ValueError as exc:
                    raise ValidationError({"file": f"The w.e.f. date '{line}' is not a real date."}) from exc
                if valid_from and found_date != valid_from:
                    raise ValidationError({"file": "The PDF contains more than one w.e.f. date."})
                valid_from = found_date
                continue
            if line == "INR Per Mtr.*":
                unit_text = line
                continue
            if line.startswith("Sr.No.") or line.startswith("Ex-Mill"):
                continue
            page_match = PAGE_RE.match(line)
            if page_match:
                current, total = int(page_match.group(1)), int(page_match.group(2))
                if current != page_no:
                    raise ValidationError({"file": f"Page footer says {current} on PDF page {page_no}."})
                if declared_total not in (None, total):
                    raise ValidationError({"file": "The PDF page count changes between pages."})
                declared_total = total
                seen_pages.append(current)
                continue
            discount_match = DISCOUNT_RE.match(line)
            if discount_match:
                current_discount = (_decimal_text(discount_match.group(1)), _decimal_text(discount_match.group(2)))
                current_note = line
                continue
            if line in PACKING_LINES:
                if line not in packing_lines:
                    packing_lines.append(line)
                continue
            if line in GST_LINES:
                if line not in tax_lines:
                    tax_lines.append(line)
                continue
            row_match = ROW_RE.match(line)
            code_match = CODE_RE.match(row_match.group(2)) if row_match else None
            if row_match and code_match:
                prefix, seg_a, seg_b, seg_c, number = code_match.groups()
                if len(number) > 7:
                    raise ValidationError({"file": f"Quality number '{number}' is longer than 7 characters."})
                percent, meters = current_discount if current_discount else (Decimal("0"), None)
                entries.append({
                    "sr_no": int(row_match.group(1)),
                    "source_page": page_no,
                    "quality_code": row_match.group(2),
                    "quality_prefix": prefix,
                    "seg_a": seg_a,
                    "seg_b": seg_b,
                    "seg_c": seg_c,
                    "quality_number": number,
                    "ex_mill": _money(row_match.group(3)),
                    "wholesale": _money(row_match.group(4)),
                    "retail": _money(row_match.group(5)),
                    "discount_percent": percent,
                    "discount_min_meters": meters,
                    "discount_note": current_note,
                    "raw_line": line,
                    "collection_name": "",
                    "collection_code": "",
                    "shades_raw": "",
                    "delivery_raw": "",
                })
                continue
            raise ValidationError({"file": f"Unrecognized PDF line on page {page_no}: {line}"})

    return _finish_pdf(pages, {
        "title": title,
        "season": season,
        "year": year,
        "revision_label": revision,
        "valid_from": valid_from,
        "unit_text": unit_text,
        "tax_lines": tax_lines,
        "packing_lines": packing_lines,
        "entries": entries,
        "seen_pages": seen_pages,
        "declared_total": declared_total,
        "restarting_serials": False,
    })


def _finish_pdf(pages, parsed):
    title = parsed["title"]
    year = parsed["year"]
    valid_from = parsed["valid_from"]
    entries = parsed["entries"]
    if not title or year is None or not valid_from or not parsed["unit_text"]:
        raise ValidationError({"file": "The PDF is missing the title, season, w.e.f. date, or unit line."})
    if parsed["declared_total"] != len(pages) or parsed["seen_pages"] != list(range(1, len(pages) + 1)):
        raise ValidationError({"file": "The PDF page footers do not match the pages in the file."})
    if len(entries) > MAX_ROWS:
        raise ValidationError({"file": f"The PDF has more than {MAX_ROWS} quality rows."})
    if not parsed["restarting_serials"]:
        serials = [item["sr_no"] for item in entries]
        if serials != list(range(1, len(entries) + 1)):
            raise ValidationError({"file": "Serial numbers are missing, repeated, or out of order."})
    codes = [item["quality_code"] for item in entries]
    if len(codes) != len(set(codes)):
        raise ValidationError({"file": "The PDF repeats a quality code."})
    if any(item["ex_mill"] is None for item in entries):
        raise ValidationError({"file": "A row has no Ex-Mill price."})
    if GST_LINES[0] not in parsed["tax_lines"] or GST_LINES[1] not in parsed["tax_lines"]:
        raise ValidationError({"file": "The GST notes at the end of the PDF were not found."})
    return {
        "format_id": FORMAT_ID,
        "title": title,
        "season": parsed["season"],
        "year": year,
        "revision_label": parsed["revision_label"],
        "valid_from": valid_from.isoformat(),
        "valid_to": None,
        "unit_text": parsed["unit_text"],
        "tax_note": "\n".join(parsed["tax_lines"]),
        "packing_note": "\n".join(parsed["packing_lines"]),
        "declared_page_count": parsed["declared_total"],
        "entries": entries,
    }


def _validate_scope(branch_id, brand_id):
    branch = Entity.objects.filter(pk=branch_id, status=Entity.Status.ACTIVE).first()
    brand = Brand.objects.filter(pk=brand_id, status=Brand.Status.ACTIVE).first()
    if branch is None:
        raise ValidationError({"branch_id": "Select an active Branch."})
    if brand is None or not branch.brands.filter(pk=brand.pk).exists():
        raise ValidationError({"brand_id": "The selected Brand is not mapped to the selected Branch."})
    if not is_osm_brand(brand):
        raise ValidationError({"brand_id": "This PDF format is only for the OSM brand."})
    return branch, brand


def _check_selection(parsed, year, season):
    if str(season) != parsed["season"] or str(year) != str(parsed["year"]):
        raise ValidationError({
            "file": (
                f"This PDF is {parsed['season']} {parsed['year']}, w.e.f. {parsed['valid_from']}. "
                "The selected year and season do not match the file."
            )
        })


def build_osm_pdf_preview(file_bytes, *, file_name, branch_id, brand_id, year, season):
    branch, brand = _validate_scope(branch_id, brand_id)
    parsed = parse_osm_pdf(file_bytes)
    _check_selection(parsed, year, season)
    digest = hashlib.sha256(file_bytes).hexdigest()
    existing = PriceListImportBatch.objects.filter(brand=brand, file_sha256=digest).select_related("price_list").first()
    if existing:
        raise ValidationError({"file": f"This PDF was already imported for {brand.brand_name} as {existing.price_list.season_label}."})
    safe_name = Path(file_name or "price-list.pdf").name
    parsed.update({
        "branch_id": branch.id,
        "brand_id": brand.id,
        "file_name": safe_name,
        "file_sha256": digest,
        "file_size": len(file_bytes),
        "file_bytes": file_bytes,
        "warnings": [],
    })
    return parsed


def _public_entry(item):
    value = dict(item)
    for name in ("ex_mill", "wholesale", "retail", "discount_percent", "discount_min_meters"):
        if value[name] is not None:
            value[name] = str(value[name])
    return value


def public_osm_preview(preview, token):
    hidden = {"file_bytes", "entries"}
    result = {key: value for key, value in preview.items() if key not in hidden}
    result["preview_token"] = token
    result["entries"] = [_public_entry(item) for item in preview["entries"]]
    result["row_count"] = len(result["entries"])
    result["flagged_counts"] = {"error": 0, "warning": 0, "info": 0}
    return result


def store_osm_preview(user_id, preview):
    token = secrets.token_urlsafe(32)
    cache.set(f"{CACHE_PREFIX}{token}", {"user_id": user_id, **preview}, timeout=TTL)
    return token


def _category_for_prefix(prefix, user):
    parent = Category.objects.filter(category_code=PARENT_CATEGORY_CODE).first()
    if parent is None:
        parent = Category.objects.create(
            category_code=PARENT_CATEGORY_CODE,
            category_name=PARENT_CATEGORY_NAME,
            created_by=user,
        )
    elif parent.parent_category_id or parent.category_name != PARENT_CATEGORY_NAME:
        raise ValidationError({"file": "Category code QUALITY already exists and cannot be used for PDF qualities."})
    code = f"QP-{prefix}"
    if len(code) > 20:
        raise ValidationError({"file": f"Quality prefix '{prefix}' is too long to store as a subcategory."})
    child = Category.objects.filter(category_code=code).first()
    if child is None:
        return Category.objects.create(
            category_code=code,
            category_name=prefix,
            parent_category=parent,
            created_by=user,
        )
    if child.parent_category_id != parent.id or child.category_name != prefix:
        raise ValidationError({"file": f"Category {code} already exists with different details."})
    return child


def _description(item, preview):
    lines = []
    if item.get("collection_name"):
        lines.append(f"{item['collection_name']} ({item['collection_code']})")
    if item.get("shades_raw"):
        lines.append(f"Shades: {item['shades_raw']}")
    if item.get("delivery_raw"):
        lines.append(f"Delivery: {item['delivery_raw']}")
    lines.extend([
        f"Sr.No. {item['sr_no']}",
        f"Page {item['source_page']}",
        item["quality_code"],
        preview["unit_text"],
    ])
    if item["discount_note"]:
        lines.append(item["discount_note"])
    if preview["packing_note"]:
        lines.append(preview["packing_note"])
    lines.append(preview["tax_note"])
    return "\n".join(lines)


def _store_private_pdf(digest, file_bytes):
    root = Path(settings.PRICE_LIST_PRIVATE_ROOT).resolve()
    root.mkdir(parents=True, exist_ok=True)
    target = (root / f"{digest}.pdf").resolve()
    if target.parent != root:
        raise ValidationError({"file": "The PDF could not be stored."})
    if not target.exists():
        target.write_bytes(file_bytes)
    return target.name


def _product_groups(entries):
    """One catalogue product per collection. Woolrite (AI) becomes name Woolrite, code AI."""
    owners = {}
    groups = []
    index = {}
    for item in entries:
        name = (item.get("collection_name") or "").strip()
        code = (item.get("collection_code") or "").strip()
        if name or code:
            label = name or code
            base = code or name
            current = owners.get(base)
            if current is None or current == label:
                chosen = base
            else:
                chosen = f"{base}-{label}"
                if len(chosen) > 40:
                    raise ValidationError({"file": f"Collection {label} needs a shorter product code."})
            other = owners.get(chosen)
            if other not in (None, label):
                raise ValidationError({"file": f"Product code {chosen} is already used for {other}."})
            owners[chosen] = label
            if base not in owners:
                owners[base] = label
            identity = ("collection", chosen)
            product_name = label
            is_collection = True
        else:
            chosen = item["quality_code"]
            product_name = item["quality_code"]
            identity = ("quality", chosen)
            is_collection = False
        if identity not in index:
            index[identity] = {"code": chosen, "name": product_name, "collection": is_collection, "items": []}
            groups.append(index[identity])
        index[identity]["items"].append(item)
    return groups


def _collection_description(group, preview):
    items = group["items"]
    printed = (items[0].get("collection_code") or items[0].get("collection_name") or "").strip()
    lines = [f"{group['name']} ({printed})" if printed and printed != group["name"] else group["name"]]
    lines.append(f"{preview['season']} {preview['year']}")
    if preview.get("unit_text"):
        lines.append(preview["unit_text"])
    notes = []
    for item in items:
        if item.get("discount_note") and item["discount_note"] not in notes:
            notes.append(item["discount_note"])
    lines.extend(notes)
    if preview.get("packing_note"):
        lines.append(preview["packing_note"])
    if preview.get("tax_note"):
        lines.append(preview["tax_note"])
    prices = {(item["ex_mill"], item["wholesale"], item["retail"]) for item in items}
    if len(prices) > 1:
        lines.append("Qualities in this collection have different prices. Each price is stored on the price list.")
    return "\n".join(lines)


def commit_osm_pdf_import(*, user, token, branch_id, brand_id, year, season):
    preview = cache.get(f"{CACHE_PREFIX}{token}") if token else None
    if not isinstance(preview, dict) or preview.get("user_id") != getattr(user, "id", None):
        raise ValidationError({"detail": "The PDF preview has expired. Preview the file again."})
    _validate_scope(branch_id, brand_id)
    if preview.get("branch_id") != branch_id or preview.get("brand_id") != brand_id:
        raise ValidationError({"detail": "The preview belongs to a different Branch or Brand."})
    _check_selection(preview, year, season)
    file_bytes = preview.get("file_bytes")
    if not isinstance(file_bytes, (bytes, bytearray)):
        raise ValidationError({"detail": "The PDF preview has expired. Preview the file again."})
    brand = Brand.objects.get(pk=brand_id)
    if PriceListImportBatch.objects.filter(brand=brand, file_sha256=preview["file_sha256"]).exists():
        raise ValidationError({"file": f"This PDF was already imported for {brand.brand_name}."})
    parsed = parse_osm_pdf(bytes(file_bytes))
    _check_selection(parsed, year, season)
    preview = {**preview, "entries": parsed["entries"], "title": parsed["title"], "season": parsed["season"], "year": parsed["year"], "valid_from": parsed["valid_from"], "revision_label": parsed["revision_label"], "unit_text": parsed["unit_text"], "tax_note": parsed["tax_note"], "packing_note": parsed["packing_note"], "declared_page_count": parsed["declared_page_count"]}

    created = updated = 0
    with transaction.atomic():
        price_list = PriceList.objects.create(
            brand=brand,
            season_label=preview["title"],
            valid_from=date.fromisoformat(preview["valid_from"]),
            valid_to=None,
            revision_label=preview["revision_label"],
            season_name=preview["season"],
            season_year=preview["year"],
            source_filename=preview["file_name"],
            source_sha256=preview["file_sha256"],
            tax_note=preview["tax_note"],
            unit_text=preview["unit_text"],
            packing_note=preview["packing_note"],
            status=PriceList.Status.ACTIVE,
            created_by=user,
        )
        batch = PriceListImportBatch.objects.create(
            price_list=price_list,
            brand=brand,
            format_id=FORMAT_ID,
            file_name=preview["file_name"],
            file_sha256=preview["file_sha256"],
            file_size=preview["file_size"],
            imported_by=user,
            rows_read=len(preview["entries"]),
            rows_imported=len(preview["entries"]),
            declared_page_count=preview["declared_page_count"],
        )
        categories = {}
        for group in _product_groups(preview["entries"]):
            items = group["items"]
            first = items[0]
            prefixes = {item["quality_prefix"] for item in items}
            category = None
            if settings.PRODUCT_CATEGORY_ENABLED:
                if len(prefixes) == 1:
                    category_key = next(iter(prefixes))
                else:
                    category_key = re.sub(r"[^A-Za-z0-9]", "", group["code"]).upper()[:17]
                    if not category_key:
                        raise ValidationError({"file": f"Collection {group['name']} has no code that can be stored as a category."})
                if category_key not in categories:
                    categories[category_key] = _category_for_prefix(category_key, user)
                category = categories[category_key]
            if group["collection"]:
                printed = (first.get("collection_code") or first.get("collection_name") or "").strip()
                shared = {
                    "product_name": group["name"],
                    "client_item_code": None,
                    "print_name": group["name"],
                    "quality": next(iter(prefixes)) if len(prefixes) == 1 else "",
                    "group": "",
                    "unit": Product.Unit.METER,
                    "rate": first["ex_mill"],
                    "frate": first["wholesale"],
                    "trate": first["retail"],
                    "season": f"{preview['season']} {preview['year']}",
                    "collection": f"{group['name']} ({printed})" if printed and printed != group["name"] else group["name"],
                    "description": _collection_description(group, preview),
                }
            else:
                shared = {
                    "product_name": first["quality_code"],
                    "client_item_code": first["quality_number"],
                    "print_name": first["quality_number"],
                    "quality": first["quality_prefix"],
                    "group": f"{first['seg_a']}-{first['seg_b']}-{first['seg_c']}",
                    "unit": Product.Unit.METER,
                    "rate": first["ex_mill"],
                    "frate": first["wholesale"],
                    "trate": first["retail"],
                    "season": f"{preview['season']} {preview['year']}",
                    "collection": preview["revision_label"],
                    "description": _description(first, preview),
                }
            product = Product.objects.filter(product_code=group["code"]).first()
            if product is None:
                product = Product.objects.create(
                    product_code=group["code"],
                    brand=brand,
                    category=category,
                    created_by=user,
                    **shared,
                )
                created += 1
            else:
                if product.brand_id != brand.id:
                    raise ValidationError({"file": f"Product code {group['code']} already belongs to another brand."})
                for field, value in shared.items():
                    setattr(product, field, value)
                product.save()
                updated += 1
            for item in items:
                BrandQualityPrice.objects.create(
                    price_list=price_list,
                    product=product,
                    sr_no=item["sr_no"],
                    source_page=item["source_page"],
                    quality_code=item["quality_code"],
                    quality_prefix=item["quality_prefix"],
                    seg_a=item["seg_a"],
                    seg_b=item["seg_b"],
                    seg_c=item["seg_c"],
                    quality_number=item["quality_number"],
                    ex_mill=item["ex_mill"],
                    wholesale=item["wholesale"],
                    retail=item["retail"],
                    discount_percent=item["discount_percent"],
                    discount_min_meters=item["discount_min_meters"],
                    discount_note=item["discount_note"],
                    unit_text=preview["unit_text"],
                    raw_line=item["raw_line"],
                    collection_name=item.get("collection_name", ""),
                    collection_code=item.get("collection_code", ""),
                    shades_raw=item.get("shades_raw", ""),
                    delivery_raw=item.get("delivery_raw", ""),
                )
        stored_name = _store_private_pdf(preview["file_sha256"], bytes(file_bytes))
        price_list.source_file = stored_name
        price_list.save(update_fields=["source_file"])
    cache.delete(f"{CACHE_PREFIX}{token}")
    return {
        "price_list_id": price_list.id,
        "batch_id": batch.id,
        "rows_imported": len(preview["entries"]),
        "products_created": created,
        "products_updated": updated,
        "season_label": price_list.season_label,
        "status": price_list.status,
    }
