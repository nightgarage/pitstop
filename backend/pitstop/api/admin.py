from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..config import get_settings
from ..deps import AdminUser, SessionDep
from ..models import (
    Attachment,
    ChargeSession,
    ChargeSessionTag,
    FuelUp,
    FuelUpTag,
    InstanceSetting,
    Notification,
    NotificationChannel,
    OdometerAdjustment,
    ServiceItem,
    ServiceRecord,
    ServiceReminder,
    Tag,
    User,
    Vehicle,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

REGISTRATION_KEY = "allow_registration"


def registration_allowed(session: Session) -> bool:
    """Instance setting overrides the env default when present."""
    row = session.get(InstanceSetting, REGISTRATION_KEY)
    if row is not None:
        return row.value == "true"
    return get_settings().allow_registration


class AdminUserOut(BaseModel):
    id: int
    email: str
    display_name: str
    role: str
    created_at: str
    vehicle_count: int
    entry_count: int


class AdminSettings(BaseModel):
    # None = follow the ALLOW_REGISTRATION env default
    allow_registration: bool | None
    effective_allow_registration: bool
    env_default: bool


@router.get("/users", response_model=list[AdminUserOut])
def list_users(session: SessionDep, admin: AdminUser) -> list[AdminUserOut]:
    users = session.exec(select(User).order_by(User.created_at)).all()
    out = []
    for user in users:
        vehicle_ids = session.exec(select(Vehicle.id).where(Vehicle.owner_id == user.id)).all()
        entries = 0
        if vehicle_ids:
            entries = session.exec(
                select(func.count()).select_from(FuelUp).where(FuelUp.vehicle_id.in_(vehicle_ids))  # type: ignore[attr-defined]
            ).one() + session.exec(
                select(func.count())
                .select_from(ChargeSession)
                .where(ChargeSession.vehicle_id.in_(vehicle_ids))  # type: ignore[attr-defined]
            ).one()
        out.append(
            AdminUserOut(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                role=user.role.value,
                created_at=user.created_at.isoformat(),
                vehicle_count=len(vehicle_ids),
                entry_count=entries,
            )
        )
    return out


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, session: SessionDep, admin: AdminUser) -> None:
    """Remove a user and everything they own. Admins can't delete themselves."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    vehicle_ids = list(session.exec(select(Vehicle.id).where(Vehicle.owner_id == user.id)).all())
    if vehicle_ids:
        for fuelup in session.exec(select(FuelUp).where(FuelUp.vehicle_id.in_(vehicle_ids))).all():  # type: ignore[attr-defined]
            for link in session.exec(select(FuelUpTag).where(FuelUpTag.fuelup_id == fuelup.id)).all():
                session.delete(link)
            session.delete(fuelup)
        for charge in session.exec(
            select(ChargeSession).where(ChargeSession.vehicle_id.in_(vehicle_ids))  # type: ignore[attr-defined]
        ).all():
            for link in session.exec(
                select(ChargeSessionTag).where(ChargeSessionTag.charge_session_id == charge.id)
            ).all():
                session.delete(link)
            session.delete(charge)
        for record in session.exec(
            select(ServiceRecord).where(ServiceRecord.vehicle_id.in_(vehicle_ids))  # type: ignore[attr-defined]
        ).all():
            for item in session.exec(select(ServiceItem).where(ServiceItem.record_id == record.id)).all():
                session.delete(item)
            for attachment in session.exec(
                select(Attachment).where(Attachment.service_record_id == record.id)
            ).all():
                from .attachments import attachments_dir

                (attachments_dir() / attachment.stored_name).unlink(missing_ok=True)
                session.delete(attachment)
            session.delete(record)
        for model in (ServiceReminder, OdometerAdjustment):
            for row in session.exec(select(model).where(model.vehicle_id.in_(vehicle_ids))).all():  # type: ignore[attr-defined]
                session.delete(row)
        for vehicle in session.exec(select(Vehicle).where(Vehicle.owner_id == user.id)).all():
            session.delete(vehicle)
    for row in session.exec(select(Tag).where(Tag.owner_id == user.id)).all():
        session.delete(row)
    for model in (Notification, NotificationChannel):
        for row in session.exec(select(model).where(model.user_id == user.id)).all():  # type: ignore[attr-defined]
            session.delete(row)
    session.delete(user)
    session.commit()


@router.get("/settings", response_model=AdminSettings)
def get_admin_settings(session: SessionDep, admin: AdminUser) -> AdminSettings:
    row = session.get(InstanceSetting, REGISTRATION_KEY)
    return AdminSettings(
        allow_registration=None if row is None else row.value == "true",
        effective_allow_registration=registration_allowed(session),
        env_default=get_settings().allow_registration,
    )


class AdminSettingsUpdate(BaseModel):
    allow_registration: bool | None = None  # None clears the override


@router.put("/settings", response_model=AdminSettings)
def update_admin_settings(
    body: AdminSettingsUpdate, session: SessionDep, admin: AdminUser
) -> AdminSettings:
    row = session.get(InstanceSetting, REGISTRATION_KEY)
    if body.allow_registration is None:
        if row is not None:
            session.delete(row)
    else:
        if row is None:
            row = InstanceSetting(key=REGISTRATION_KEY, value="")
        row.value = "true" if body.allow_registration else "false"
        session.add(row)
    session.commit()
    return get_admin_settings(session, admin)
