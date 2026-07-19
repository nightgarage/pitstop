from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EnergyType(str, Enum):
    gasoline = "gasoline"
    diesel = "diesel"
    hybrid = "hybrid"
    plug_in_hybrid = "plug_in_hybrid"
    electric = "electric"


class DistanceUnit(str, Enum):
    mi = "mi"
    km = "km"


class VolumeUnit(str, Enum):
    us_gal = "us_gal"
    uk_gal = "uk_gal"
    liter = "l"


class Role(str, Enum):
    admin = "admin"
    user = "user"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    display_name: str
    role: Role = Field(default=Role.user)
    distance_unit: DistanceUnit = Field(default=DistanceUnit.mi)
    volume_unit: VolumeUnit = Field(default=VolumeUnit.us_gal)
    currency: str = Field(default="USD", max_length=3)
    # optional logging fields (driving conditions etc.) are hidden by default
    show_driving_conditions: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class FillType(str, Enum):
    full = "full"
    partial = "partial"
    missed = "missed"


class ChargeType(str, Enum):
    home = "home"
    public_l2 = "public_l2"
    dc_fast = "dc_fast"


class Vehicle(SQLModel, table=True):
    __tablename__ = "vehicles"

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id", index=True)
    name: str
    year: int | None = None
    make: str | None = None
    model: str | None = None
    trim: str | None = None
    energy_type: EnergyType
    tank_size: float | None = None  # gallons/liters, in the vehicle's volume unit
    battery_size: float | None = None  # kWh
    odometer_start: float | None = None
    photo_path: str | None = None
    # Per-vehicle unit overrides; None means "use the owner's preference"
    distance_unit: DistanceUnit | None = None
    volume_unit: VolumeUnit | None = None
    currency: str | None = Field(default=None, max_length=3)
    archived: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Tag(SQLModel, table=True):
    __tablename__ = "tags"

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=40)


class FuelUpTag(SQLModel, table=True):
    __tablename__ = "fuelup_tags"

    fuelup_id: int = Field(foreign_key="fuelups.id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.id", primary_key=True)


class ChargeSessionTag(SQLModel, table=True):
    __tablename__ = "charge_session_tags"

    charge_session_id: int = Field(foreign_key="charge_sessions.id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.id", primary_key=True)


class FuelUp(SQLModel, table=True):
    __tablename__ = "fuelups"

    id: int | None = Field(default=None, primary_key=True)
    vehicle_id: int = Field(foreign_key="vehicles.id", index=True)
    date: datetime = Field(index=True)
    odometer: float
    volume: float  # in the vehicle's volume unit
    price_per_unit: float | None = None
    total_cost: float | None = None
    fill_type: FillType = Field(default=FillType.full)
    fuel_grade: str | None = Field(default=None, max_length=20)  # e.g. "87", "91", "diesel"
    station: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    driving_conditions: str | None = Field(default=None, max_length=20)  # city|highway|mixed
    notes: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class InstanceSetting(SQLModel, table=True):
    """Admin-editable instance settings; a row overrides the env default."""

    __tablename__ = "instance_settings"

    key: str = Field(primary_key=True, max_length=40)
    value: str = Field(max_length=200)


class ChargeSession(SQLModel, table=True):
    __tablename__ = "charge_sessions"

    id: int | None = Field(default=None, primary_key=True)
    vehicle_id: int = Field(foreign_key="vehicles.id", index=True)
    date: datetime = Field(index=True)
    odometer: float
    kwh_added: float
    price_per_kwh: float | None = None
    total_cost: float | None = None
    # full/partial/missed drives the same chain math as fuel fills (a charge to
    # 100% is "full"; skipping an unlogged charge is "missed")
    fill_type: FillType = Field(default=FillType.full)
    charge_type: ChargeType = Field(default=ChargeType.home)
    start_pct: float | None = Field(default=None, ge=0, le=100)
    end_pct: float | None = Field(default=None, ge=0, le=100)
    station: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ServiceRecord(SQLModel, table=True):
    __tablename__ = "service_records"

    id: int | None = Field(default=None, primary_key=True)
    vehicle_id: int = Field(foreign_key="vehicles.id", index=True)
    date: datetime = Field(index=True)
    odometer: float | None = None
    shop: str | None = Field(default=None, max_length=120)  # None/empty when DIY
    is_diy: bool = Field(default=False)
    total_cost: float | None = None  # None -> sum of item costs
    notes: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ServiceItem(SQLModel, table=True):
    __tablename__ = "service_items"

    id: int | None = Field(default=None, primary_key=True)
    record_id: int = Field(foreign_key="service_records.id", index=True)
    service_type: str = Field(max_length=80)  # predefined suggestion or custom text
    cost: float | None = None
    parts: str | None = Field(default=None, max_length=200)


class ServiceReminder(SQLModel, table=True):
    __tablename__ = "service_reminders"

    id: int | None = Field(default=None, primary_key=True)
    vehicle_id: int = Field(foreign_key="vehicles.id", index=True)
    name: str = Field(max_length=80)
    # recurring: either or both intervals; due when the first one hits
    interval_miles: float | None = None
    interval_months: float | None = None
    # one-off: a fixed date and/or odometer instead of intervals
    due_date: datetime | None = None
    due_odometer: float | None = None
    last_done_date: datetime | None = None
    last_done_odometer: float | None = None
    active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)


class Attachment(SQLModel, table=True):
    """A photo or receipt file. Attached to service records now; the parent
    columns stay nullable so other parents (fuel-ups) can join later."""

    __tablename__ = "attachments"

    id: int | None = Field(default=None, primary_key=True)
    service_record_id: int | None = Field(
        default=None, foreign_key="service_records.id", index=True
    )
    filename: str = Field(max_length=200)  # original name, for display/download
    stored_name: str = Field(max_length=80)  # uuid-based name on disk
    content_type: str = Field(max_length=80)
    size: int = 0
    kind: str = Field(default="receipt", max_length=20)  # receipt | photo
    created_at: datetime = Field(default_factory=utcnow)


class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    title: str = Field(max_length=200)
    body: str | None = None
    kind: str = Field(default="reminder", max_length=40)
    # stops the same event from being re-notified (e.g. "reminder:3:overdue")
    dedupe_key: str | None = Field(default=None, index=True, max_length=120)
    read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class NotificationChannel(SQLModel, table=True):
    """Optional per-user delivery channels (email / ntfy / Gotify / webhook).
    In-app notifications always work; these are extras, disabled by default."""

    __tablename__ = "notification_channels"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    kind: str = Field(max_length=20)  # email | ntfy | gotify | webhook
    config: str = Field(default="{}")  # JSON blob: url/topic/token/address per kind
    enabled: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class OdometerAdjustment(SQLModel, table=True):
    """Marks an odometer reset/swap: readings before `date` are on the old
    scale (ending at old_odometer), readings after start at new_odometer."""

    __tablename__ = "odometer_adjustments"

    id: int | None = Field(default=None, primary_key=True)
    vehicle_id: int = Field(foreign_key="vehicles.id", index=True)
    date: datetime = Field(index=True)
    old_odometer: float
    new_odometer: float
    note: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
