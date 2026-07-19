"""Shared helpers for fuel-up and charge-session endpoints."""

from datetime import datetime, timezone

from sqlmodel import Session, select

from ..economy import Adjustment, Entry, Fill, entry_cost
from ..models import (
    ChargeSession,
    ChargeSessionTag,
    FuelUp,
    FuelUpTag,
    OdometerAdjustment,
    Tag,
)


def normalize_date(value: datetime) -> datetime:
    """Store all dates as naive UTC so ordering and month math stay consistent."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def complete_price(amount: float, price_per_unit: float | None, total_cost: float | None):
    """Fill in the missing member of (price, total) when the other is known."""
    if price_per_unit is not None and total_cost is None:
        total_cost = round(price_per_unit * amount, 2)
    elif total_cost is not None and price_per_unit is None and amount > 0:
        price_per_unit = round(total_cost / amount, 4)
    return price_per_unit, total_cost


def resolve_tags(session: Session, owner_id: int, names: list[str]) -> list[Tag]:
    """Find or create the owner's tags for the given names."""
    tags = []
    for raw in names:
        name = raw.strip()
        if not name:
            continue
        tag = session.exec(
            select(Tag).where(Tag.owner_id == owner_id, Tag.name == name)
        ).first()
        if tag is None:
            tag = Tag(owner_id=owner_id, name=name)
            session.add(tag)
            session.flush()
        tags.append(tag)
    return tags


def set_fuelup_tags(session: Session, fuelup: FuelUp, owner_id: int, names: list[str]) -> None:
    for link in session.exec(select(FuelUpTag).where(FuelUpTag.fuelup_id == fuelup.id)).all():
        session.delete(link)
    for tag in resolve_tags(session, owner_id, names):
        session.add(FuelUpTag(fuelup_id=fuelup.id, tag_id=tag.id))


def set_charge_tags(session: Session, charge: ChargeSession, owner_id: int, names: list[str]) -> None:
    for link in session.exec(
        select(ChargeSessionTag).where(ChargeSessionTag.charge_session_id == charge.id)
    ).all():
        session.delete(link)
    for tag in resolve_tags(session, owner_id, names):
        session.add(ChargeSessionTag(charge_session_id=charge.id, tag_id=tag.id))


def fuelup_tag_names(session: Session, fuelup_ids: list[int]) -> dict[int, list[str]]:
    if not fuelup_ids:
        return {}
    rows = session.exec(
        select(FuelUpTag.fuelup_id, Tag.name)
        .join(Tag, Tag.id == FuelUpTag.tag_id)
        .where(FuelUpTag.fuelup_id.in_(fuelup_ids))  # type: ignore[attr-defined]
    ).all()
    result: dict[int, list[str]] = {}
    for fuelup_id, name in rows:
        result.setdefault(fuelup_id, []).append(name)
    return result


def charge_tag_names(session: Session, charge_ids: list[int]) -> dict[int, list[str]]:
    if not charge_ids:
        return {}
    rows = session.exec(
        select(ChargeSessionTag.charge_session_id, Tag.name)
        .join(Tag, Tag.id == ChargeSessionTag.tag_id)
        .where(ChargeSessionTag.charge_session_id.in_(charge_ids))  # type: ignore[attr-defined]
    ).all()
    result: dict[int, list[str]] = {}
    for charge_id, name in rows:
        result.setdefault(charge_id, []).append(name)
    return result


def load_adjustments(session: Session, vehicle_id: int) -> list[Adjustment]:
    rows = session.exec(
        select(OdometerAdjustment).where(OdometerAdjustment.vehicle_id == vehicle_id)
    ).all()
    return [Adjustment(date=r.date, old_odometer=r.old_odometer, new_odometer=r.new_odometer) for r in rows]


def fuelups_as_entries(fuelups: list[FuelUp]) -> list[Entry]:
    return [
        Entry(
            id=f.id,
            date=f.date,
            odometer=f.odometer,
            amount=f.volume,
            fill_type=Fill(f.fill_type.value),
            cost=entry_cost(f.volume, f.price_per_unit, f.total_cost),
            grade=f.fuel_grade,
        )
        for f in fuelups
    ]


def charges_as_entries(charges: list[ChargeSession]) -> list[Entry]:
    return [
        Entry(
            id=c.id,
            date=c.date,
            odometer=c.odometer,
            amount=c.kwh_added,
            fill_type=Fill(c.fill_type.value),
            cost=entry_cost(c.kwh_added, c.price_per_kwh, c.total_cost),
        )
        for c in charges
    ]
