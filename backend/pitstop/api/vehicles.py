from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from ..deps import CurrentUser, SessionDep
from ..models import Vehicle, utcnow
from ..schemas import VehicleCreate, VehicleOut, VehicleUpdate

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


def _get_owned_vehicle(session: SessionDep, user: CurrentUser, vehicle_id: int) -> Vehicle:
    vehicle = session.get(Vehicle, vehicle_id)
    if vehicle is None or vehicle.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.get("", response_model=list[VehicleOut])
def list_vehicles(
    session: SessionDep, user: CurrentUser, include_archived: bool = False
) -> list[Vehicle]:
    query = select(Vehicle).where(Vehicle.owner_id == user.id)
    if not include_archived:
        query = query.where(Vehicle.archived == False)  # noqa: E712
    return list(session.exec(query.order_by(Vehicle.created_at)).all())


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
def create_vehicle(body: VehicleCreate, session: SessionDep, user: CurrentUser) -> Vehicle:
    vehicle = Vehicle(owner_id=user.id, **body.model_dump())
    session.add(vehicle)
    session.commit()
    session.refresh(vehicle)
    return vehicle


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(vehicle_id: int, session: SessionDep, user: CurrentUser) -> Vehicle:
    return _get_owned_vehicle(session, user, vehicle_id)


@router.patch("/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(
    vehicle_id: int, body: VehicleUpdate, session: SessionDep, user: CurrentUser
) -> Vehicle:
    vehicle = _get_owned_vehicle(session, user, vehicle_id)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(vehicle, field, value)
    vehicle.updated_at = utcnow()
    session.add(vehicle)
    session.commit()
    session.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}", response_model=VehicleOut)
def archive_vehicle(vehicle_id: int, session: SessionDep, user: CurrentUser) -> Vehicle:
    """Vehicles are archived, never hard-deleted, so history is preserved."""
    vehicle = _get_owned_vehicle(session, user, vehicle_id)
    vehicle.archived = True
    vehicle.updated_at = utcnow()
    session.add(vehicle)
    session.commit()
    session.refresh(vehicle)
    return vehicle
