from .base import PrintProfile


PROFILE = PrintProfile(
    id="ocm",
    brand_codes=("OCM",),
    form_ref="SAL/F/04",
    salutation=(
        "Dear Sir(s), Please supply us the goods listed below on the conditions "
        "given overleaf which we have carefully read and understood, of which we "
        "have retained a copy."
    ),
    insurance_line="Goods to be Insured at Buyer's Cost",
    retention_line="RETENTION PERIOD 2 YEARS",
    copies={
        "mill": "Mill's Copy",
        "buyer": "Buyer's Copy",
        "rep": "Sales Rep's Copy",
    },
    seller_lines=(
        "OCM Private Limited",
        "G.T. ROAD, CHHEHARTA, AMRITSAR - 143 105",
        "Phone : +91-183-2820600",
        "E-mail : info@ocm.in | Website : www.ocm.in",
        "G.S.T. NO. 03AAACO1892M1ZB",
    ),
    form_meta=(
        "SAL/F/04",
        "Issue No. : 01",
        "Issue Date : 13-04-2018",
        "Approved by : HOD",
    ),
)
