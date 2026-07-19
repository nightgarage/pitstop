from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from ..deps import CurrentUser, SessionDep
from ..economy import compute_intervals
from ..models import FuelUp, FuelUpTag, utcnow
from ..schemas import FuelUpCreate, FuelUpOut, FuelUpUpdate
from .entries import (
    complete_price,
    fuelup_tag_names,
    fuelups_as_entries,
    load_adjustments,
    normalize_date,
    set_fuelup_tags,
)
from .vehicles import _get_owned_vehicle

router = APIRouter(prefix="/api/vehicles/{vehicle_id}/fuelups", tags=["fuel-ups"])


def _vehicle_fuelups(session: SessionDep, vehicle_id: int) -> list[FuelUp]:
    return list(session.exec(select(FuelUp).where(FuelUp.vehicle_id == vehicle_id)).all())


def _with_economy(session: SessionDep, vehicle_id: int, fuelups: list[FuelUp]) -> list[FuelUpOut]:
    """Annotate fuel-ups with chain economy, newest first."""
    all_fuelups = _vehicle_fuelups(session, vehicle_id)
    intervals = {
        i.entry_id: i
        for i in compute_intervals(fuelups_as_entries(all_fuelups), load_adjustments(session, vehicle_id))
    }
    tags = fuelup_tag_names(session, [f.id for f in fuelups])
    out = []
    for f in sorted(fuelups, key=lambda f: (f.date, f.odometer), reverse=True):
        interval = intervals.get(f.id)
        out.append(
            FuelUpOut(
                **f.model_dump(),
                tags=sorted(tags.get(f.id, [])),
                economy=interval.economy if interval else None,
                distance=interval.distance if interval else None,
            )
        )
    return out


def _get_owned_fuelup(session: SessionDep, user: CurrentUser, vehicle_id: int, fuelup_id: int) -> FuelUp:
    _get_owned_vehicle(session, user, vehicle_id)
    fuelup = session.get(FuelUp, fuelup_id)
    if fuelup is None or fuelup.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Fuel-up not found")
    return fuelup


@router.get("", response_model=list[FuelUpOut])
def list_fuelups(vehicle_id: int, session: SessionDep, user: CurrentUser) -> list[FuelUpOut]:
    _get_owned_vehicle(session, user, vehicle_id)
    return _with_economy(session, vehicle_id, _vehicle_fuelups(session, vehicle_id))


@router.post("", response_model=FuelUpOut, status_code=status.HTTP_201_CREATED)
def create_fuelup(
    vehicle_id: int, body: FuelUpCreate, session: SessionDep, user: CurrentUser
) -> FuelUpOut:
    _get_owned_vehicle(session, user, vehicle_id)
    data = body.model_dump(exclude={"tags"})
    data["date"] = normalize_date(data["date"])
    data["price_per_unit"], data["total_cost"] = complete_price(
        data["volume"], data["price_per_unit"], data["total_cost"]
    )
    fuelup = FuelUp(vehicle_id=vehicle_id, **data)
    session.add(fuelup)
    session.flush()
    set_fuelup_tags(session, fuelup, user.id, body.tags)
    session.commit()
    session.refresh(fuelup)
    return _with_economy(session, vehicle_id, [fuelup])[0]


@router.patch("/{fuelup_id}", response_model=FuelUpOut)
def update_fuelup(
    vehicle_id: int, fuelup_id: int, body: FuelUpUpdate, session: SessionDep, user: CurrentUser
) -> FuelUpOut:
    fuelup = _get_owned_fuelup(session, user, vehicle_id, fuelup_id)
    updates = body.model_dump(exclude_unset=True)
    tags = updates.pop("tags", None)
    if "date" in updates and updates["date"] is not None:
        updates["date"] = normalize_date(updates["date"])
    for field, value in updates.items():
        setattr(fuelup, field, value)
    # keep price and total consistent: the field(s) the caller sent win,
    # and the untouched member is re-derived
    if "total_cost" in updates and "price_per_unit" not in updates:
        if fuelup.total_cost is not None and fuelup.volume > 0:
            fuelup.price_per_unit = round(fuelup.total_cost / fuelup.volume, 4)
    elif "price_per_unit" in updates and "total_cost" not in updates:
        if fuelup.price_per_unit is not None:
            fuelup.total_cost = round(fuelup.price_per_unit * fuelup.volume, 2)
    elif "volume" in updates and fuelup.price_per_unit is not None:
        fuelup.total_cost = round(fuelup.price_per_unit * fuelup.volume, 2)
    fuelup.updated_at = utcnow()
    if tags is not None:
        set_fuelup_tags(session, fuelup, user.id, tags)
    session.add(fuelup)
    session.commit()
    session.refresh(fuelup)
    return _with_economy(session, vehicle_id, [fuelup])[0]


@router.delete("/{fuelup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fuelup(
    vehicle_id: int, fuelup_id: int, session: SessionDep, user: CurrentUser
) -> None:
    fuelup = _get_owned_fuelup(session, user, vehicle_id, fuelup_id)
    for link in session.exec(select(FuelUpTag).where(FuelUpTag.fuelup_id == fuelup.id)).all():
        session.delete(link)
    session.delete(fuelup)
    session.commit()
