"""Full data export — JSON (one document) and CSV (a zip of per-entity files).

Own-your-data is a core promise: everything the user has entered comes back
out, cleanly structured, with nothing proprietary about the format.
"""

import csv
import io
import json
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import Response
from sqlmodel import Session, select

from ..deps import CurrentUser, SessionDep
from ..models import (
    ChargeSession,
    ChargeSessionTag,
    FuelUp,
    FuelUpTag,
    OdometerAdjustment,
    ServiceItem,
    ServiceRecord,
    ServiceReminder,
    Tag,
    Vehicle,
)

router = APIRouter(prefix="/api/export", tags=["export"])


def _clean(row: dict) -> dict:
    """Model dump with datetimes as ISO strings."""
    return {
        key: (value.isoformat() if isinstance(value, datetime) else getattr(value, "value", value))
        for key, value in row.items()
    }


def _collect(session: Session, user_id: int) -> dict:
    vehicles = list(session.exec(select(Vehicle).where(Vehicle.owner_id == user_id)).all())
    vehicle_ids = [v.id for v in vehicles]

    def for_vehicles(model):
        if not vehicle_ids:
            return []
        return list(
            session.exec(select(model).where(model.vehicle_id.in_(vehicle_ids))).all()  # type: ignore[attr-defined]
        )

    fuelups = for_vehicles(FuelUp)
    charges = for_vehicles(ChargeSession)
    services = for_vehicles(ServiceRecord)
    reminders = for_vehicles(ServiceReminder)
    adjustments = for_vehicles(OdometerAdjustment)
    service_ids = [s.id for s in services]
    items = (
        list(
            session.exec(
                select(ServiceItem).where(ServiceItem.record_id.in_(service_ids))  # type: ignore[attr-defined]
            ).all()
        )
        if service_ids
        else []
    )
    tags = list(session.exec(select(Tag).where(Tag.owner_id == user_id)).all())
    tag_names = {t.id: t.name for t in tags}

    # tags flattened onto entries as name lists
    fuelup_tags: dict[int, list[str]] = {}
    if fuelups:
        for link in session.exec(
            select(FuelUpTag).where(FuelUpTag.fuelup_id.in_([f.id for f in fuelups]))  # type: ignore[attr-defined]
        ).all():
            fuelup_tags.setdefault(link.fuelup_id, []).append(tag_names.get(link.tag_id, ""))
    charge_tags: dict[int, list[str]] = {}
    if charges:
        for link in session.exec(
            select(ChargeSessionTag).where(
                ChargeSessionTag.charge_session_id.in_([c.id for c in charges])  # type: ignore[attr-defined]
            )
        ).all():
            charge_tags.setdefault(link.charge_session_id, []).append(
                tag_names.get(link.tag_id, "")
            )

    return {
        "vehicles": [_clean(v.model_dump(exclude={"owner_id"})) for v in vehicles],
        "fuelups": [
            {**_clean(f.model_dump()), "tags": sorted(fuelup_tags.get(f.id, []))} for f in fuelups
        ],
        "charge_sessions": [
            {**_clean(c.model_dump()), "tags": sorted(charge_tags.get(c.id, []))} for c in charges
        ],
        "service_records": [
            {
                **_clean(s.model_dump()),
                "items": [
                    _clean(i.model_dump(exclude={"record_id"}))
                    for i in items
                    if i.record_id == s.id
                ],
            }
            for s in services
        ],
        "service_reminders": [_clean(r.model_dump()) for r in reminders],
        "odometer_adjustments": [_clean(a.model_dump()) for a in adjustments],
    }


@router.get("/json")
def export_json(session: SessionDep, user: CurrentUser) -> Response:
    data = {
        "app": "Pitstop",
        "format_version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        **_collect(session, user.id),
    }
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Response(
        content=json.dumps(data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="pitstop-export-{stamp}.json"'},
    )


def _csv_bytes(rows: list[dict]) -> bytes:
    if not rows:
        return b""
    # union of keys across rows, keeping first-seen order
    fieldnames: list[str] = []
    for row in rows:
        for key in row:
            if key not in fieldnames:
                fieldnames.append(key)
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                key: "|".join(value) if isinstance(value, list) and all(isinstance(x, str) for x in value) else value
                for key, value in row.items()
                if key != "items"
            }
        )
    return buffer.getvalue().encode("utf-8-sig")


@router.get("/csv")
def export_csv(session: SessionDep, user: CurrentUser) -> Response:
    data = _collect(session, user.id)

    # service items become their own sheet, joined by record id
    service_items = []
    for record in data["service_records"]:
        for item in record["items"]:
            service_items.append({"service_record_id": record["id"], **item})

    sheets = {
        "vehicles.csv": data["vehicles"],
        "fuelups.csv": data["fuelups"],
        "charge_sessions.csv": data["charge_sessions"],
        "service_records.csv": [{k: v for k, v in r.items() if k != "items"} for r in data["service_records"]],
        "service_items.csv": service_items,
        "service_reminders.csv": data["service_reminders"],
        "odometer_adjustments.csv": data["odometer_adjustments"],
    }

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, rows in sheets.items():
            zf.writestr(name, _csv_bytes(rows))
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Response(
        content=archive.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="pitstop-export-{stamp}.zip"'},
    )
