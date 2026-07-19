"""CSV import: parsing, header auto-mapping, and value coercion.

The importer is generic — any CSV with a column-mapping step — plus built-in
header dictionaries for the column layouts other fuel trackers commonly use in
their exports, so those map automatically. Pure functions; DB writes live in
the API layer.
"""

import csv
import io
from datetime import datetime
from difflib import SequenceMatcher

MAX_ROWS = 10_000

# Target fields per import kind. `required` must all be mapped before importing.
FUELUP_FIELDS = {
    "date": {"required": True},
    "odometer": {"required": True},
    "volume": {"required": True},
    "price_per_unit": {"required": False},
    "total_cost": {"required": False},
    "fill_type": {"required": False},
    "partial_flag": {"required": False},
    "missed_flag": {"required": False},
    "fuel_grade": {"required": False},
    "station": {"required": False},
    "location": {"required": False},
    "notes": {"required": False},
    "tags": {"required": False},
}

SERVICE_FIELDS = {
    "date": {"required": True},
    "service_type": {"required": True},
    "odometer": {"required": False},
    "cost": {"required": False},
    "shop": {"required": False},
    "is_diy": {"required": False},
    "parts": {"required": False},
    "notes": {"required": False},
}

# Known header spellings, lowercased. Covers the layouts common fuel-tracker
# exports use without naming any of them.
FUELUP_ALIASES: dict[str, list[str]] = {
    "date": ["date", "fuel_up_date", "fuelup date", "refuel date", "fill date", "day"],
    "odometer": ["odometer", "odo", "odometer (mi)", "odometer (km)", "miles", "mileage", "odometer reading"],
    "volume": ["volume", "gallons", "gallons (gal)", "litres", "liters", "fuel amount", "quantity", "gal", "l", "fuel volume"],
    "price_per_unit": [
        "price", "price/gal", "price per gallon", "price per litre", "price per liter",
        "unit price", "price_per_unit", "cost per gallon", "cost/gal", "price/l", "gas price",
    ],
    "total_cost": ["total cost", "total", "total price", "totalprice", "total_cost", "amount paid", "total spent", "cost"],
    "fill_type": ["fill type", "fill_type", "type of fill"],
    "partial_flag": ["partial fill-up", "partial", "partial fill", "partial_fillup", "is partial", "partial fuel-up"],
    "missed_flag": ["missed fill-up", "missed", "missed fill", "missed_fillup", "missed fuel-up"],
    "fuel_grade": ["octane", "fuel grade", "grade", "fuel type", "fuel_type", "fueltype", "fuel"],
    "station": ["fuel brand", "brand", "station", "gas station", "fuelstation", "gas brand", "company", "vendor"],
    "location": ["location", "city", "place", "location address", "address"],
    "notes": ["note", "notes", "comment", "comments", "memo", "remark"],
    "tags": ["tags", "labels", "tag"],
}

SERVICE_ALIASES: dict[str, list[str]] = {
    "date": ["date", "service date", "day"],
    "service_type": ["service", "service type", "services", "work done", "work", "type", "description", "title", "maintenance"],
    "odometer": ["odometer", "odo", "miles", "mileage", "odometer reading"],
    "cost": ["cost", "total cost", "price", "total", "amount"],
    "shop": ["shop", "garage", "vendor", "place", "performed by", "mechanic", "company"],
    "is_diy": ["diy", "is diy", "self service", "did it myself"],
    "parts": ["parts", "part", "parts used"],
    "notes": ["note", "notes", "comment", "comments", "memo"],
}


def parse_csv(text: str) -> tuple[list[str], list[dict[str, str]]]:
    """Headers + rows from CSV text; sniffs , ; and tab delimiters."""
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [h.strip() for h in (reader.fieldnames or []) if h and h.strip()]
    rows = []
    for row in reader:
        if len(rows) >= MAX_ROWS:
            break
        cleaned = {
            (key or "").strip(): (value or "").strip()
            for key, value in row.items()
            if key is not None
        }
        if any(cleaned.values()):
            rows.append(cleaned)
    return headers, rows


def suggest_mapping(headers: list[str], kind: str) -> dict[str, str | None]:
    """Best-guess target field for each CSV header (exact alias, then fuzzy)."""
    aliases = FUELUP_ALIASES if kind == "fuelups" else SERVICE_ALIASES
    mapping: dict[str, str | None] = {}
    taken: set[str] = set()

    # pass 1: exact alias matches
    for header in headers:
        normalized = header.lower().strip()
        match = next(
            (field for field, names in aliases.items() if normalized in names and field not in taken),
            None,
        )
        mapping[header] = match
        if match:
            taken.add(match)

    # pass 2: fuzzy for the leftovers
    for header in headers:
        if mapping[header] is not None:
            continue
        normalized = header.lower().strip()
        best_field, best_score = None, 0.0
        for field, names in aliases.items():
            if field in taken:
                continue
            for name in names:
                score = SequenceMatcher(None, normalized, name).ratio()
                if score > best_score:
                    best_field, best_score = field, score
        if best_field and best_score >= 0.82:
            mapping[header] = best_field
            taken.add(best_field)

    return mapping


DATE_FORMATS = [
    "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
    "%m/%d/%Y", "%m/%d/%y", "%m/%d/%Y %H:%M", "%d.%m.%Y", "%d/%m/%Y",
    "%b %d, %Y", "%B %d, %Y", "%d %b %Y",
]


def parse_date(raw: str) -> datetime | None:
    value = raw.strip()
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None)
    except ValueError:
        pass
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def parse_number(raw: str) -> float | None:
    value = raw.strip().replace(" ", "")
    if not value:
        return None
    # strip currency symbols and letters ("$3.29", "3,29 €", "12.4 gal")
    value = "".join(ch for ch in value if ch.isdigit() or ch in ".,-")
    if not value:
        return None
    if "." in value and "," in value:
        value = value.replace(",", "")  # 1,234.56
    elif "," in value:
        # 3,29 (decimal comma) vs 1,234 (thousands) — decimal if <= 2 digits follow
        head, _, tail = value.rpartition(",")
        value = f"{head}.{tail}" if len(tail) <= 2 else value.replace(",", "")
    try:
        return float(value)
    except ValueError:
        return None


TRUTHY = {"1", "true", "yes", "y", "x", "on", "partial", "missed", "checked"}


def parse_bool(raw: str) -> bool:
    return raw.strip().lower() in TRUTHY


def mapped_value(row: dict[str, str], mapping: dict[str, str | None], field: str) -> str:
    """The raw cell for a target field, going through the header mapping."""
    for header, target in mapping.items():
        if target == field:
            return row.get(header, "")
    return ""
