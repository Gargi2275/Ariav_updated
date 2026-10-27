"""Validate personal workspace preferences. Unknown or unsafe values are rejected."""

from accounts.models import AuthUser

THEME = {"light", "dark", "system"}
DENSITY = {"compact", "comfortable", "spacious"}
TEXT_SIZE = {"sm", "md", "lg", "xl"}
MOTION = {"system", "reduce", "allow"}
SIDEBAR = {"expanded", "collapsed"}
PAGE_SIZE = {25, 50, 100}
ADMIN_ONLY_SCREENS = {5, 7, 8, 9, 10}
LANDING_SCREENS = {
    5, 6, 7, 8, 9, 10, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28,
    29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
}
MODULE_SORT = {
    "product_code", "product_name", "brand_name", "category_name", "rate", "frate",
    "trate", "availability", "status",
}
MODULE_COLUMNS = {"image", "category"}
MODULE_KEYS = {"39"}

DEFAULTS = {
    "theme": "dark",
    "density": "comfortable",
    "text_size": "md",
    "high_contrast": False,
    "large_targets": False,
    "reduced_motion": "system",
    "table_density": "comfortable",
    "page_size": 25,
    "sidebar": "expanded",
    "landing_screen_id": None,
    "modules": {},
}


class PreferenceError(ValueError):
    pass


def _choice(value, allowed, label):
    if value not in allowed:
        raise PreferenceError(f"Invalid {label}.")
    return value


def _module(existing, incoming):
    if not isinstance(incoming, dict) or len(incoming) > 8:
        raise PreferenceError("Invalid module preferences.")
    merged = dict(existing or {})
    for screen_id, patch in incoming.items():
        if screen_id not in MODULE_KEYS or not isinstance(patch, dict) or len(patch) > 8:
            raise PreferenceError("Unsupported module preference.")
        current = dict(merged.get(screen_id) or {})
        for field, value in patch.items():
            if field == "page_size":
                number = value if isinstance(value, int) else None
                if number not in PAGE_SIZE:
                    raise PreferenceError("Invalid page size.")
                current[field] = number
            elif field == "sort_key":
                if value is not None and value not in MODULE_SORT:
                    raise PreferenceError("Invalid sort.")
                current[field] = value
            elif field == "sort_asc":
                if not isinstance(value, bool):
                    raise PreferenceError("Invalid sort direction.")
                current[field] = value
            elif field == "hidden_columns":
                if not isinstance(value, list) or len(value) > len(MODULE_COLUMNS):
                    raise PreferenceError("Invalid columns.")
                if any(item not in MODULE_COLUMNS for item in value):
                    raise PreferenceError("Invalid columns.")
                current[field] = list(dict.fromkeys(value))
            else:
                raise PreferenceError("Unsupported module preference.")
        merged[screen_id] = current
    return merged


def _landing(value, user: AuthUser):
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value not in LANDING_SCREENS:
        raise PreferenceError("Invalid landing page.")
    if not user.is_admin_role and value in ADMIN_ONLY_SCREENS:
        raise PreferenceError("That landing page is not available for this account.")
    return value


def merge_preferences(stored, incoming, user: AuthUser) -> dict:
    if not isinstance(incoming, dict):
        raise PreferenceError("Invalid preferences.")
    if "user" in incoming or "user_id" in incoming:
        raise PreferenceError("Invalid preferences.")
    data = dict(stored or {})
    for key, value in incoming.items():
        if key == "theme":
            data[key] = _choice(value, THEME, "theme")
        elif key in ("density", "table_density"):
            data[key] = _choice(value, DENSITY, "density")
        elif key == "text_size":
            data[key] = _choice(value, TEXT_SIZE, "text size")
        elif key == "reduced_motion":
            data[key] = _choice(value, MOTION, "motion preference")
        elif key == "sidebar":
            data[key] = _choice(value, SIDEBAR, "sidebar")
        elif key == "page_size":
            if not isinstance(value, int) or value not in PAGE_SIZE:
                raise PreferenceError("Invalid page size.")
            data[key] = value
        elif key in ("high_contrast", "large_targets"):
            if not isinstance(value, bool):
                raise PreferenceError(f"Invalid {key.replace('_', ' ')}.")
            data[key] = value
        elif key == "landing_screen_id":
            data[key] = _landing(value, user)
        elif key == "modules":
            data[key] = _module(data.get("modules"), value)
        else:
            raise PreferenceError("Unknown preference.")
    return data


def public_preferences(stored, user: AuthUser) -> dict:
    raw = dict(stored or {})
    modules = raw.get("modules") if isinstance(raw.get("modules"), dict) else {}
    landing = raw.get("landing_screen_id")
    if not user.is_admin_role and landing in ADMIN_ONLY_SCREENS:
        landing = None
    if landing not in LANDING_SCREENS:
        landing = None
    prefs = {
        "theme": raw.get("theme") if raw.get("theme") in THEME else DEFAULTS["theme"],
        "density": raw.get("density") if raw.get("density") in DENSITY else DEFAULTS["density"],
        "text_size": raw.get("text_size") if raw.get("text_size") in TEXT_SIZE else DEFAULTS["text_size"],
        "high_contrast": raw.get("high_contrast") if isinstance(raw.get("high_contrast"), bool) else False,
        "large_targets": raw.get("large_targets") if isinstance(raw.get("large_targets"), bool) else False,
        "reduced_motion": raw.get("reduced_motion") if raw.get("reduced_motion") in MOTION else DEFAULTS["reduced_motion"],
        "table_density": raw.get("table_density") if raw.get("table_density") in DENSITY else DEFAULTS["table_density"],
        "page_size": raw.get("page_size") if raw.get("page_size") in PAGE_SIZE else DEFAULTS["page_size"],
        "sidebar": raw.get("sidebar") if raw.get("sidebar") in SIDEBAR else DEFAULTS["sidebar"],
        "landing_screen_id": landing,
        "modules": {},
    }
    product = modules.get("39")
    if isinstance(product, dict):
        hidden = product.get("hidden_columns")
        prefs["modules"]["39"] = {
            "page_size": product.get("page_size") if product.get("page_size") in PAGE_SIZE else None,
            "sort_key": product.get("sort_key") if product.get("sort_key") in MODULE_SORT else None,
            "sort_asc": product.get("sort_asc") if isinstance(product.get("sort_asc"), bool) else None,
            "hidden_columns": [item for item in hidden if item in MODULE_COLUMNS] if isinstance(hidden, list) else [],
        }
    return prefs
