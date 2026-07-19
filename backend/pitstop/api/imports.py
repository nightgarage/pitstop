import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import select

from ..config import get_settings
from ..deps import CurrentUser, SessionDep
from ..importer import (
    FUELUP_FIELDS,
    SERVICE_FIELDS,
    mapped_value,
    parse_bool,
    parse_csv,
    parse_date,
    parse_number,
    suggest_mapping,
)
from ..models import FillType, FuelUp, ServiceItem, ServiceRecord
from .entries import complete_price, set_fuelup_tags
from .vehicles import _get_owned_vehicle

router = APIRouter(prefix="/api/vehicles/{vehicle_id}/import", tags=["import"])

MAX_UPLOAD = 10 * 1024 * 1024  # 10 MB of CSV is a lot of fill-ups


def _imports_dir() -> Path:
    directory = get_settings().data_dir / "imports"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


class ImportPreview(BaseModel):
    token: str
    kind: str
    headers: list[str]
    suggested_mapping: dict[str, str | None]
    sample_rows: list[dict[str, str]]
    row_count: int
    fields: dict[str, dict]  # target fields + which are required


class ImportRequest(BaseModel):
    token: str
    kind: str
    mapping: dict[str, str | None]


class ImportResult(BaseModel):
    created: int
    skipped_duplicates: int
    errors: list[str]  # "row 7: no parsable date" — capped
    notes: list[str] = []  # things the importer did for data hygiene


@router.post("/preview", response_model=ImportPreview)
async def preview_import(
    vehicle_id: int,
    file: UploadFile,
    kind: str,
    session: SessionDep,
    user: CurrentUser,
) -> ImportPreview:
    """Upload a CSV, get back detected columns + a suggested mapping. The file
    is parked server-side under a token until the mapping is confirmed."""
    _get_owned_vehicle(session, user, vehicle_id)
    if kind not in ("fuelups", "services"):
        raise HTTPException(status_code=422, detail="kind must be 'fuelups' or 'services'")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="CSV is too large (10 MB max)")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    headers, rows = parse_csv(text)
    if not headers or not rows:
        raise HTTPException(status_code=422, detail="Couldn't find a header row and data in this CSV")

    token = uuid.uuid4().hex
    (_imports_dir() / f"{token}.csv").write_text(text, encoding="utf-8")

    # the user's choice of kind is authoritative — no auto-detection
    return ImportPreview(
        token=token,
        kind=kind,
        headers=headers,
        suggested_mapping=suggest_mapping(headers, kind),
        sample_rows=rows[:5],
        row_count=len(rows),
        fields=FUELUP_FIELDS if kind == "fuelups" else SERVICE_FIELDS,
    )


@router.post("", response_model=ImportResult)
def run_import(
    vehicle_id: int, body: ImportRequest, session: SessionDep, user: CurrentUser
) -> ImportResult:
    _get_owned_vehicle(session, user, vehicle_id)
    path = _imports_dir() / f"{body.token}.csv"
    if not body.token.isalnum() or not path.is_file():
        raise HTTPException(status_code=404, detail="Upload expired — please upload the CSV again")

    fields = FUELUP_FIELDS if body.kind == "fuelups" else SERVICE_FIELDS
    mapped_targets = {t for t in body.mapping.values() if t}
    missing = [f for f, spec in fields.items() if spec["required"] and f not in mapped_targets]
    if missing:
        raise HTTPException(status_code=422, detail=f"Required columns not mapped: {', '.join(missing)}")

    _, rows = parse_csv(path.read_text(encoding="utf-8"))
    if body.kind == "fuelups":
        result = _import_fuelups(session, user, vehicle_id, rows, body.mapping)
    else:
        result = _import_services(session, vehicle_id, rows, body.mapping)
    session.commit()
    path.unlink(missing_ok=True)
    return result


def _import_fuelups(session, user, vehicle_id: int, rows, mapping) -> ImportResult:
    pre_existing = list(
        session.exec(select(FuelUp).where(FuelUp.vehicle_id == vehicle_id)).all()
    )
    existing = {(f.date, f.odometer) for f in pre_existing}
    created, duplicates, errors = 0, 0, []
    imported: list[FuelUp] = []
    for index, row in enumerate(rows, start=2):  # row 1 is the header
        value = lambda field: mapped_value(row, mapping, field)  # noqa: E731
        date = parse_date(value("date"))
        odometer = parse_number(value("odometer"))
        volume = parse_number(value("volume"))
        if date is None or odometer is None or volume is None or volume <= 0:
            if len(errors) < 20:
                what = "date" if date is None else ("odometer" if odometer is None else "volume")
                errors.append(f"row {index}: couldn't read a valid {what}")
            continue
        if (date, odometer) in existing:
            duplicates += 1
            continue

        fill_type = FillType.full
        raw_fill = value("fill_type").lower()
        if raw_fill in ("partial", "missed", "full"):
            fill_type = FillType(raw_fill)
        elif parse_bool(value("missed_flag")):
            fill_type = FillType.missed
        elif parse_bool(value("partial_flag")):
            fill_type = FillType.partial

        price = parse_number(value("price_per_unit"))
        total = parse_number(value("total_cost"))
        price, total = complete_price(volume, price, total)

        fuelup = FuelUp(
            vehicle_id=vehicle_id,
            date=date,
            odometer=odometer,
            volume=volume,
            price_per_unit=price,
            total_cost=total,
            fill_type=fill_type,
            fuel_grade=value("fuel_grade") or None,
            station=value("station") or None,
            location=value("location") or None,
            notes=value("notes") or None,
        )
        session.add(fuelup)
        session.flush()
        raw_tags = [t.strip() for t in value("tags").replace("|", ",").split(",") if t.strip()]
        if raw_tags:
            set_fuelup_tags(session, fuelup, user.id, raw_tags)
        existing.add((date, odometer))
        imported.append(fuelup)
        created += 1

    notes = _flag_gap_to_existing(session, pre_existing, imported)
    return ImportResult(
        created=created, skipped_duplicates=duplicates, errors=errors, notes=notes
    )


def _flag_gap_to_existing(session, pre_existing: list[FuelUp], imported: list[FuelUp]) -> list[str]:
    """Importing history that ends before the vehicle's previously-first entry can
    turn that entry's baseline into an absurd bridge interval (thousands of miles
    on one tank). If the bridge economy is wildly above the imported history's
    typical economy, mark that entry a missed fill so no bogus number appears."""
    from ..economy import compute_intervals
    from .entries import fuelups_as_entries

    if not pre_existing or not imported:
        return []
    oldest_existing = min(pre_existing, key=lambda f: (f.date, f.odometer))
    newest_imported = max(imported, key=lambda f: (f.date, f.odometer))
    if newest_imported.date >= oldest_existing.date:
        return []  # imported data interleaves; can't reason about a single bridge
    if oldest_existing.fill_type != FillType.full or oldest_existing.volume <= 0:
        return []

    bridge_economy = (oldest_existing.odometer - newest_imported.odometer) / oldest_existing.volume
    typical = [
        i.economy for i in compute_intervals(fuelups_as_entries(imported)) if i.economy is not None
    ]
    if not typical:
        return []
    typical.sort()
    median = typical[len(typical) // 2]
    if bridge_economy <= 3 * median or bridge_economy <= 0:
        return []

    oldest_existing.fill_type = FillType.missed
    session.add(oldest_existing)
    gap = round(oldest_existing.odometer - newest_imported.odometer)
    return [
        f"Your fill-up at {oldest_existing.odometer:,.0f} was marked as a missed fill: "
        f"the imported history leaves a {gap:,} unlogged gap before it, so no honest "
        "economy number exists for that tank."
    ]


def _import_services(session, vehicle_id: int, rows, mapping) -> ImportResult:
    existing = {
        (s.date, tuple(sorted(i.service_type for i in session.exec(
            select(ServiceItem).where(ServiceItem.record_id == s.id)).all())))
        for s in session.exec(
            select(ServiceRecord).where(ServiceRecord.vehicle_id == vehicle_id)
        ).all()
    }
    created, duplicates, errors = 0, 0, []
    for index, row in enumerate(rows, start=2):
        value = lambda field: mapped_value(row, mapping, field)  # noqa: E731
        date = parse_date(value("date"))
        types = [t.strip() for t in value("service_type").replace(";", ",").split(",") if t.strip()]
        if date is None or not types:
            if len(errors) < 20:
                errors.append(f"row {index}: couldn't read a valid {'date' if date is None else 'service type'}")
            continue
        key = (date, tuple(sorted(types)))
        if key in existing:
            duplicates += 1
            continue

        cost = parse_number(value("cost"))
        record = ServiceRecord(
            vehicle_id=vehicle_id,
            date=date,
            odometer=parse_number(value("odometer")),
            shop=value("shop") or None,
            is_diy=parse_bool(value("is_diy")),
            total_cost=cost,
            notes=value("notes") or None,
        )
        session.add(record)
        session.flush()
        # one row = one visit; comma-separated types become line items, with the
        # visit total kept on the record (per-item costs unknown from a flat CSV)
        for service_type in types:
            session.add(
                ServiceItem(
                    record_id=record.id,
                    service_type=service_type,
                    cost=cost if len(types) == 1 else None,
                    parts=value("parts") or None,
                )
            )
        existing.add(key)
        created += 1
    return ImportResult(created=created, skipped_duplicates=duplicates, errors=errors)
