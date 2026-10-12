from .arvind_digital_po import PROFILE as ARVIND_DIGITAL_PO
from .ocm_po import PROFILE as OCM_PO

PROFILES = (OCM_PO, ARVIND_DIGITAL_PO)


def profiles_for_brand(brand_code: str):
    code = (brand_code or "").strip().upper()
    return tuple(profile for profile in PROFILES if profile.applies_to(code))
