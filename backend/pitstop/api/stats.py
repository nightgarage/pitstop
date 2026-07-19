from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from ..deps import CurrentUser, SessionDep
from ..economy import Entry, blended_cost_per_distance, summarize
from ..models import ChargeSession, EnergyType, FuelUp, OdometerAdjustment, Vehicle
from ..schemas import (
    AdjustmentCreate,
    AdjustmentOut,
    EnergyStats,
    VehicleStats,
    VehicleStatsSummary,
)
from .entries import charges_as_entries, fuelups_as_entries, load_adjustments, normalize_date
from .vehicles import _get_owned_vehicle

router = APIRouter(prefix="/api/vehicles", tags=["stats"])

GAS_TYPES = {EnergyType.gasoline, EnergyType.diesel, EnergyType.hybrid, EnergyType.plug_in_hybrid}
ELECTRIC_TYPES = {EnergyType.electric, EnergyType.plug_in_hybrid}


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _energy_stats(entries: list[Entry], adjustments) -> EnergyStats | None:
    if not entries:
        return None
    stats = summarize(entries, adjustments)
    return EnergyStats(
        lifetime=stats.lifetime,
        best=stats.best,
        worst=stats.worst,
        last=stats.last,
        total_energy=stats.total_energy,
        total_spend=stats.total_spend,
        cost_per_distance=stats.cost_per_distance,
    )


def _collect(session, vehicle: Vehicle):
    fuel_entries = []
    charge_entries = []
    if vehicle.energy_type in GAS_TYPES:
        fuelups = session.exec(select(FuelUp).where(FuelUp.vehicle_id == vehicle.id)).all()
        fuel_entries = fuelups_as_entries(list(fuelups))
    if vehicle.energy_type in ELECTRIC_TYPES:
        charges = session.exec(
            select(ChargeSession).where(ChargeSession.vehicle_id == vehicle.id)
        ).all()
        charge_entries = charges_as_entries(list(charges))
    return fuel_entries, charge_entries


def _vehicle_stats(session, vehicle: Vehicle, now: datetime) -> VehicleStats:
    fuel_entries, charge_entries = _collect(session, vehicle)
    adjustments = load_adjustments(session, vehicle.id)
    combined = sorted([*fuel_entries, *charge_entries], key=lambda e: (e.date, e.odometer))

    month_start = _month_start(now)
    month_spend = sum(
        e.cost for e in combined if e.cost is not None and e.date >= month_start
    )

    latest_odometer = combined[-1].odometer if combined else vehicle.odometer_start
    blended = None
    if vehicle.energy_type == EnergyType.plug_in_hybrid:
        blended = blended_cost_per_distance(fuel_entries, charge_entries, adjustments)

    return VehicleStats(
        vehicle_id=vehicle.id,
        latest_odometer=latest_odometer,
        entry_count=len(combined),
        month_spend=round(month_spend, 2),
        fuel=_energy_stats(fuel_entries, adjustments),
        electric=_energy_stats(charge_entries, adjustments),
        blended_cost_per_distance=blended,
    )


@router.get("/stats-summary", response_model=list[VehicleStatsSummary])
def stats_summary(session: SessionDep, user: CurrentUser) -> list[VehicleStatsSummary]:
    """Key numbers for every vehicle in the garage, one call."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    vehicles = session.exec(select(Vehicle).where(Vehicle.owner_id == user.id)).all()
    summaries = []
    for vehicle in vehicles:
        stats = _vehicle_stats(session, vehicle, now)
        primary = stats.electric if vehicle.energy_type == EnergyType.electric else stats.fuel
        fuel_entries, charge_entries = _collect(session, vehicle)
        combined = [*fuel_entries, *charge_entries]
        summaries.append(
            VehicleStatsSummary(
                vehicle_id=vehicle.id,
                latest_odometer=stats.latest_odometer,
                avg_economy=primary.lifetime if primary else None,
                month_spend=stats.month_spend,
                last_entry_date=max((e.date for e in combined), default=None),
            )
        )
    return summaries


@router.get("/{vehicle_id}/stats", response_model=VehicleStats)
def vehicle_stats(vehicle_id: int, session: SessionDep, user: CurrentUser) -> VehicleStats:
    vehicle = _get_owned_vehicle(session, user, vehicle_id)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return _vehicle_stats(session, vehicle, now)


# ---- odometer adjustments ----

@router.get("/{vehicle_id}/adjustments", response_model=list[AdjustmentOut])
def list_adjustments(vehicle_id: int, session: SessionDep, user: CurrentUser):
    _get_owned_vehicle(session, user, vehicle_id)
    return session.exec(
        select(OdometerAdjustment)
        .where(OdometerAdjustment.vehicle_id == vehicle_id)
        .order_by(OdometerAdjustment.date)
    ).all()


@router.post("/{vehicle_id}/adjustments", response_model=AdjustmentOut, status_code=status.HTTP_201_CREATED)
def create_adjustment(
    vehicle_id: int, body: AdjustmentCreate, session: SessionDep, user: CurrentUser
):
    _get_owned_vehicle(session, user, vehicle_id)
    adjustment = OdometerAdjustment(
        vehicle_id=vehicle_id,
        date=normalize_date(body.date),
        old_odometer=body.old_odometer,
        new_odometer=body.new_odometer,
        note=body.note,
    )
    session.add(adjustment)
    session.commit()
    session.refresh(adjustment)
    return adjustment


@router.delete("/{vehicle_id}/adjustments/{adjustment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adjustment(
    vehicle_id: int, adjustment_id: int, session: SessionDep, user: CurrentUser
) -> None:
    _get_owned_vehicle(session, user, vehicle_id)
    adjustment = session.get(OdometerAdjustment, adjustment_id)
    if adjustment is None or adjustment.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    session.delete(adjustment)
    session.commit()
