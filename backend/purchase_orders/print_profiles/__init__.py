from .base import PrintProfile
from .ocm import PROFILE as OCM_PROFILE

PROFILES = (OCM_PROFILE,)


def profile_for_brand(brand_code: str):
    code = (brand_code or "").strip().upper()
    for profile in PROFILES:
        if profile.applies_to(code):
            return profile
    return None


def profile_id_for_brand(brand_code: str) -> str:
    profile = profile_for_brand(brand_code)
    return profile.id if profile else ""


def profile_copies_for_brand(brand_code: str) -> list[dict]:
    profile = profile_for_brand(brand_code)
    if profile is None:
        return []
    return [{"id": key, "label": label} for key, label in profile.copies.items()]
