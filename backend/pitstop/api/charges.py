from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from ..deps import CurrentUser, SessionDep
from ..economy import compute_intervals
from ..models import ChargeSession, ChargeSessionTag, utcnow
from ..schemas import ChargeCreate, ChargeOut, ChargeUpdate
from .entries import (
    charge_tag_names,
    charges_as_entries,
    complete_price,
    load_adjustments,
    normalize_date,
    set_charge_tags,
)
from .vehicles import _get_owned_vehicle

router = APIRouter(prefix="/api/vehicles/{vehicle_id}/charges", tags=["charge sessions"])


def _vehicle_charges(session: SessionDep, vehicle_id: int) -> list[ChargeSession]:
    return list(
        session.exec(select(ChargeSession).where(ChargeSession.vehicle_id == vehicle_id)).all()
    )


def _with_economy(session: SessionDep, vehicle_id: int, charges: list[ChargeSession]) -> list[ChargeOut]:
    all_charges = _vehicle_charges(session, vehicle_id)
    intervals = {
        i.entry_id: i
        for i in compute_intervals(charges_as_entries(all_charges), load_adjustments(session, vehicle_id))
    }
    tags = charge_tag_names(session, [c.id for c in charges])
    out = []
    for c in sorted(charges, key=lambda c: (c.date, c.odometer), reverse=True):
        interval = intervals.get(c.id)
        out.append(
            ChargeOut(
                **c.model_dump(),
                tags=sorted(tags.get(c.id, [])),
                economy=interval.economy if interval else None,
                distance=interval.distance if interval else None,
            )
        )
    return out


def _get_owned_charge(
    session: SessionDep, user: CurrentUser, vehicle_id: int, charge_id: int
) -> ChargeSession:
    _get_owned_vehicle(session, user, vehicle_id)
    charge = session.get(ChargeSession, charge_id)
    if charge is None or charge.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Charge session not found")
    return charge


@router.get("", response_model=list[ChargeOut])
def list_charges(vehicle_id: int, session: SessionDep, user: CurrentUser) -> list[ChargeOut]:
    _get_owned_vehicle(session, user, vehicle_id)
    return _with_economy(session, vehicle_id, _vehicle_charges(session, vehicle_id))


@router.post("", response_model=ChargeOut, status_code=status.HTTP_201_CREATED)
def create_charge(
    vehicle_id: int, body: ChargeCreate, session: SessionDep, user: CurrentUser
) -> ChargeOut:
    _get_owned_vehicle(session, user, vehicle_id)
    data = body.model_dump(exclude={"tags"})
    data["date"] = normalize_date(data["date"])
    data["price_per_kwh"], data["total_cost"] = complete_price(
        data["kwh_added"], data["price_per_kwh"], data["total_cost"]
    )
    charge = ChargeSession(vehicle_id=vehicle_id, **data)
    session.add(charge)
    session.flush()
    set_charge_tags(session, charge, user.id, body.tags)
    session.commit()
    session.refresh(charge)
    return _with_economy(session, vehicle_id, [charge])[0]


@router.patch("/{charge_id}", response_model=ChargeOut)
def update_charge(
    vehicle_id: int, charge_id: int, body: ChargeUpdate, session: SessionDep, user: CurrentUser
) -> ChargeOut:
    charge = _get_owned_charge(session, user, vehicle_id, charge_id)
    updates = body.model_dump(exclude_unset=True)
    tags = updates.pop("tags", None)
    if "date" in updates and updates["date"] is not None:
        updates["date"] = normalize_date(updates["date"])
    for field, value in updates.items():
        setattr(charge, field, value)
    if "total_cost" in updates and "price_per_kwh" not in updates:
        if charge.total_cost is not None and charge.kwh_added > 0:
            charge.price_per_kwh = round(charge.total_cost / charge.kwh_added, 4)
    elif "price_per_kwh" in updates and "total_cost" not in updates:
        if charge.price_per_kwh is not None:
            charge.total_cost = round(charge.price_per_kwh * charge.kwh_added, 2)
    elif "kwh_added" in updates and charge.price_per_kwh is not None:
        charge.total_cost = round(charge.price_per_kwh * charge.kwh_added, 2)
    charge.updated_at = utcnow()
    if tags is not None:
        set_charge_tags(session, charge, user.id, tags)
    session.add(charge)
    session.commit()
    session.refresh(charge)
    return _with_economy(session, vehicle_id, [charge])[0]


@router.delete("/{charge_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_charge(
    vehicle_id: int, charge_id: int, session: SessionDep, user: CurrentUser
) -> None:
    charge = _get_owned_charge(session, user, vehicle_id, charge_id)
    for link in session.exec(
        select(ChargeSessionTag).where(ChargeSessionTag.charge_session_id == charge.id)
    ).all():
        session.delete(link)
    session.delete(charge)
    session.commit()
