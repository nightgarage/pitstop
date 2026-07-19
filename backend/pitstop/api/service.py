from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select

from ..deps import CurrentUser, SessionDep
from ..models import (
    Attachment,
    ChargeSession,
    FuelUp,
    ServiceItem,
    ServiceRecord,
    ServiceReminder,
    Vehicle,
)
from ..reminders import ReminderInput, evaluate
from ..schemas import (
    ReminderComplete,
    ReminderCreate,
    ReminderOut,
    ReminderUpdate,
    ServiceRecordCreate,
    ServiceRecordOut,
    ServiceRecordUpdate,
)
from .entries import normalize_date
from .vehicles import _get_owned_vehicle

router = APIRouter(prefix="/api", tags=["service"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def current_odometer(session: Session, vehicle: Vehicle) -> float | None:
    """The vehicle's latest known odometer: newest logged entry, else the
    starting odometer, also considering service records with an odometer."""
    candidates: list[tuple[datetime, float]] = []
    latest_fuel = session.exec(
        select(FuelUp)
        .where(FuelUp.vehicle_id == vehicle.id)
        .order_by(FuelUp.date.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()
    if latest_fuel:
        candidates.append((latest_fuel.date, latest_fuel.odometer))
    latest_charge = session.exec(
        select(ChargeSession)
        .where(ChargeSession.vehicle_id == vehicle.id)
        .order_by(ChargeSession.date.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()
    if latest_charge:
        candidates.append((latest_charge.date, latest_charge.odometer))
    latest_service = session.exec(
        select(ServiceRecord)
        .where(ServiceRecord.vehicle_id == vehicle.id, ServiceRecord.odometer != None)  # noqa: E711
        .order_by(ServiceRecord.date.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()
    if latest_service and latest_service.odometer is not None:
        candidates.append((latest_service.date, latest_service.odometer))
    if not candidates:
        return vehicle.odometer_start
    return max(candidates, key=lambda c: c[0])[1]


# ---- service records ----

def _record_out(session: Session, record: ServiceRecord, vehicle_name: str | None = None) -> ServiceRecordOut:
    items = list(session.exec(select(ServiceItem).where(ServiceItem.record_id == record.id)).all())
    item_costs = [i.cost for i in items if i.cost is not None]
    total = record.total_cost if record.total_cost is not None else (sum(item_costs) if item_costs else None)
    attachments = session.exec(
        select(Attachment).where(Attachment.service_record_id == record.id)
    ).all()
    return ServiceRecordOut(
        attachments=[
            {
                "id": a.id,
                "filename": a.filename,
                "content_type": a.content_type,
                "size": a.size,
                "kind": a.kind,
            }
            for a in attachments
        ],
        id=record.id,
        vehicle_id=record.vehicle_id,
        vehicle_name=vehicle_name,
        date=record.date,
        odometer=record.odometer,
        shop=record.shop,
        is_diy=record.is_diy,
        total_cost=total,
        notes=record.notes,
        items=[
            {"id": i.id, "service_type": i.service_type, "cost": i.cost, "parts": i.parts}
            for i in items
        ],
    )


@router.get("/services", response_model=list[ServiceRecordOut])
def all_services(session: SessionDep, user: CurrentUser) -> list[ServiceRecordOut]:
    """Service history across every vehicle in the garage, newest first."""
    rows = session.exec(
        select(ServiceRecord, Vehicle.name)
        .join(Vehicle, Vehicle.id == ServiceRecord.vehicle_id)
        .where(Vehicle.owner_id == user.id)
        .order_by(ServiceRecord.date.desc())  # type: ignore[union-attr]
    ).all()
    return [_record_out(session, record, vehicle_name) for record, vehicle_name in rows]


@router.get("/vehicles/{vehicle_id}/services", response_model=list[ServiceRecordOut])
def list_services(vehicle_id: int, session: SessionDep, user: CurrentUser):
    vehicle = _get_owned_vehicle(session, user, vehicle_id)
    records = session.exec(
        select(ServiceRecord)
        .where(ServiceRecord.vehicle_id == vehicle_id)
        .order_by(ServiceRecord.date.desc())  # type: ignore[union-attr]
    ).all()
    return [_record_out(session, record, vehicle.name) for record in records]


@router.post(
    "/vehicles/{vehicle_id}/services",
    response_model=ServiceRecordOut,
    status_code=status.HTTP_201_CREATED,
)
def create_service(
    vehicle_id: int, body: ServiceRecordCreate, session: SessionDep, user: CurrentUser
):
    vehicle = _get_owned_vehicle(session, user, vehicle_id)
    record = ServiceRecord(
        vehicle_id=vehicle_id,
        **body.model_dump(exclude={"items", "date"}),
        date=normalize_date(body.date),
    )
    session.add(record)
    session.flush()
    for item in body.items:
        session.add(ServiceItem(record_id=record.id, **item.model_dump()))
    session.commit()
    session.refresh(record)
    return _record_out(session, record, vehicle.name)


def _get_owned_record(
    session: Session, user: CurrentUser, vehicle_id: int, record_id: int
) -> ServiceRecord:
    _get_owned_vehicle(session, user, vehicle_id)
    record = session.get(ServiceRecord, record_id)
    if record is None or record.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Service record not found")
    return record


@router.patch("/vehicles/{vehicle_id}/services/{record_id}", response_model=ServiceRecordOut)
def update_service(
    vehicle_id: int,
    record_id: int,
    body: ServiceRecordUpdate,
    session: SessionDep,
    user: CurrentUser,
):
    record = _get_owned_record(session, user, vehicle_id, record_id)
    updates = body.model_dump(exclude_unset=True)
    items = updates.pop("items", None)
    if "date" in updates and updates["date"] is not None:
        updates["date"] = normalize_date(updates["date"])
    for field, value in updates.items():
        setattr(record, field, value)
    record.updated_at = _now()
    if items is not None:
        for old in session.exec(select(ServiceItem).where(ServiceItem.record_id == record.id)).all():
            session.delete(old)
        for item in items:
            session.add(ServiceItem(record_id=record.id, **item))
    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_out(session, record)


@router.delete("/vehicles/{vehicle_id}/services/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    vehicle_id: int, record_id: int, session: SessionDep, user: CurrentUser
) -> None:
    from .attachments import delete_record_attachments  # local import avoids a cycle

    record = _get_owned_record(session, user, vehicle_id, record_id)
    for item in session.exec(select(ServiceItem).where(ServiceItem.record_id == record.id)).all():
        session.delete(item)
    delete_record_attachments(session, record.id)
    session.delete(record)
    session.commit()


# ---- reminders ----

def _reminder_out(session: Session, reminder: ServiceReminder, vehicle: Vehicle) -> ReminderOut:
    state = evaluate(
        ReminderInput(
            interval_miles=reminder.interval_miles,
            interval_months=reminder.interval_months,
            due_date=reminder.due_date,
            due_odometer=reminder.due_odometer,
            last_done_date=reminder.last_done_date,
            last_done_odometer=reminder.last_done_odometer,
        ),
        current_odometer(session, vehicle),
        _now(),
    )
    return ReminderOut(
        **reminder.model_dump(),
        vehicle_name=vehicle.name,
        status=state.status,
        next_due_odometer=state.next_due_odometer,
        next_due_date=state.next_due_date,
        miles_remaining=state.miles_remaining,
        days_remaining=state.days_remaining,
    )


_STATUS_ORDER = {"overdue": 0, "due": 1, "upcoming": 2}


@router.get("/reminders", response_model=list[ReminderOut])
def all_reminders(
    session: SessionDep, user: CurrentUser, include_inactive: bool = False
) -> list[ReminderOut]:
    """Every reminder across the garage, most urgent first."""
    rows = session.exec(
        select(ServiceReminder, Vehicle)
        .join(Vehicle, Vehicle.id == ServiceReminder.vehicle_id)
        .where(Vehicle.owner_id == user.id, Vehicle.archived == False)  # noqa: E712
    ).all()
    out = [
        _reminder_out(session, reminder, vehicle)
        for reminder, vehicle in rows
        if include_inactive or reminder.active
    ]
    def sort_key(r: ReminderOut):
        remaining = [
            v
            for v in (
                r.miles_remaining,
                float(r.days_remaining * 40) if r.days_remaining is not None else None,
            )
            if v is not None
        ]
        return (_STATUS_ORDER[r.status.value], min(remaining) if remaining else float("inf"))
    return sorted(out, key=sort_key)


@router.post(
    "/vehicles/{vehicle_id}/reminders",
    response_model=ReminderOut,
    status_code=status.HTTP_201_CREATED,
)
def create_reminder(
    vehicle_id: int, body: ReminderCreate, session: SessionDep, user: CurrentUser
):
    vehicle = _get_owned_vehicle(session, user, vehicle_id)
    data = body.model_dump()
    for key in ("due_date", "last_done_date"):
        if data[key] is not None:
            data[key] = normalize_date(data[key])
    reminder = ServiceReminder(vehicle_id=vehicle_id, **data)
    session.add(reminder)
    session.commit()
    session.refresh(reminder)
    return _reminder_out(session, reminder, vehicle)


def _get_owned_reminder(
    session: Session, user: CurrentUser, vehicle_id: int, reminder_id: int
) -> tuple[ServiceReminder, Vehicle]:
    vehicle = _get_owned_vehicle(session, user, vehicle_id)
    reminder = session.get(ServiceReminder, reminder_id)
    if reminder is None or reminder.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder, vehicle


@router.patch("/vehicles/{vehicle_id}/reminders/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    vehicle_id: int,
    reminder_id: int,
    body: ReminderUpdate,
    session: SessionDep,
    user: CurrentUser,
):
    reminder, vehicle = _get_owned_reminder(session, user, vehicle_id, reminder_id)
    updates = body.model_dump(exclude_unset=True)
    for key in ("due_date", "last_done_date"):
        if key in updates and updates[key] is not None:
            updates[key] = normalize_date(updates[key])
    for field, value in updates.items():
        setattr(reminder, field, value)
    session.add(reminder)
    session.commit()
    session.refresh(reminder)
    return _reminder_out(session, reminder, vehicle)


@router.post("/vehicles/{vehicle_id}/reminders/{reminder_id}/complete", response_model=ReminderOut)
def complete_reminder(
    vehicle_id: int,
    reminder_id: int,
    body: ReminderComplete,
    session: SessionDep,
    user: CurrentUser,
):
    """Mark the service as done; one-off reminders deactivate, recurring ones restart."""
    reminder, vehicle = _get_owned_reminder(session, user, vehicle_id, reminder_id)
    reminder.last_done_date = normalize_date(body.date)
    if body.odometer is not None:
        reminder.last_done_odometer = body.odometer
    if reminder.interval_miles is None and reminder.interval_months is None:
        reminder.active = False  # one-off: it happened, we're finished
    else:
        # recurring one-offs don't exist; clear any stale one-off targets
        reminder.due_date = None
        reminder.due_odometer = None
    session.add(reminder)
    session.commit()
    session.refresh(reminder)
    return _reminder_out(session, reminder, vehicle)


@router.delete("/vehicles/{vehicle_id}/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    vehicle_id: int, reminder_id: int, session: SessionDep, user: CurrentUser
) -> None:
    reminder, _ = _get_owned_reminder(session, user, vehicle_id, reminder_id)
    session.delete(reminder)
    session.commit()
