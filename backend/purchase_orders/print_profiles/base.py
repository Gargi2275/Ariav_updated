from dataclasses import dataclass


@dataclass(frozen=True)
class PrintProfile:
    id: str
    brand_codes: tuple[str, ...]
    form_ref: str
    salutation: str
    insurance_line: str
    retention_line: str
    copies: dict[str, str]
    seller_lines: tuple[str, ...] = ()
    form_meta: tuple[str, ...] = ()

    def applies_to(self, brand_code: str) -> bool:
        return (brand_code or "").strip().upper() in self.brand_codes
