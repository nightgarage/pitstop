from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from .models import ChargeType, DistanceUnit, EnergyType, FillType, Role, VolumeUnit
from .reminders import ReminderStatus


# ---- Auth ----

class SetupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class RegisterRequest(SetupRequest):
    pass


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    role: Role
    distance_unit: DistanceUnit
    volume_unit: VolumeUnit
    currency: str
    show_driving_conditions: bool = False
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    distance_unit: DistanceUnit | None = None
    volume_unit: VolumeUnit | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    show_driving_conditions: bool | None = None


class AuthStatus(BaseModel):
    setup_required: bool
    allow_registration: bool
    user: UserOut | None = None


# ---- Vehicles ----

class VehicleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    energy_type: EnergyType
    year: int | None = Field(default=None, ge=1886, le=2100)
    make: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=80)
    trim: str | None = Field(default=None, max_length=80)
    tank_size: float | None = Field(default=None, gt=0)
    battery_size: float | None = Field(default=None, gt=0)
    odometer_start: float | None = Field(default=None, ge=0)
    distance_unit: DistanceUnit | None = None
    volume_unit: VolumeUnit | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)


class VehicleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    energy_type: EnergyType | None = None
    year: int | None = Field(default=None, ge=1886, le=2100)
    make: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=80)
    trim: str | None = Field(default=None, max_length=80)
    tank_size: float | None = Field(default=None, gt=0)
    battery_size: float | None = Field(default=None, gt=0)
    odometer_start: float | None = Field(default=None, ge=0)
    distance_unit: DistanceUnit | None = None
    volume_unit: VolumeUnit | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    archived: bool | None = None


# ---- Fuel-ups ----

class FuelUpCreate(BaseModel):
    date: datetime
    odometer: float = Field(ge=0)
    volume: float = Field(gt=0)
    price_per_unit: float | None = Field(default=None, ge=0)
    total_cost: float | None = Field(default=None, ge=0)
    fill_type: FillType = FillType.full
    fuel_grade: str | None = Field(default=None, max_length=20)
    station: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    driving_conditions: str | None = Field(default=None, pattern="^(city|highway|mixed)$")
    notes: str | None = None
    tags: list[str] = []


class FuelUpUpdate(BaseModel):
    date: datetime | None = None
    odometer: float | None = Field(default=None, ge=0)
    volume: float | None = Field(default=None, gt=0)
    price_per_unit: float | None = Field(default=None, ge=0)
    total_cost: float | None = Field(default=None, ge=0)
    fill_type: FillType | None = None
    fuel_grade: str | None = Field(default=None, max_length=20)
    station: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    driving_conditions: str | None = Field(default=None, pattern="^(city|highway|mixed)$")
    notes: str | None = None
    tags: list[str] | None = None


class FuelUpOut(BaseModel):
    id: int
    vehicle_id: int
    date: datetime
    odometer: float
    volume: float
    price_per_unit: float | None
    total_cost: float | None
    fill_type: FillType
    fuel_grade: str | None
    station: str | None
    location: str | None
    driving_conditions: str | None = None
    notes: str | None
    tags: list[str] = []
    # computed from the chain math; None for baseline/partial/missed entries
    economy: float | None = None
    distance: float | None = None


# ---- Charge sessions ----

class ChargeCreate(BaseModel):
    date: datetime
    odometer: float = Field(ge=0)
    kwh_added: float = Field(gt=0)
    price_per_kwh: float | None = Field(default=None, ge=0)
    total_cost: float | None = Field(default=None, ge=0)
    fill_type: FillType = FillType.full
    charge_type: ChargeType = ChargeType.home
    start_pct: float | None = Field(default=None, ge=0, le=100)
    end_pct: float | None = Field(default=None, ge=0, le=100)
    station: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    tags: list[str] = []


class ChargeUpdate(BaseModel):
    date: datetime | None = None
    odometer: float | None = Field(default=None, ge=0)
    kwh_added: float | None = Field(default=None, gt=0)
    price_per_kwh: float | None = Field(default=None, ge=0)
    total_cost: float | None = Field(default=None, ge=0)
    fill_type: FillType | None = None
    charge_type: ChargeType | None = None
    start_pct: float | None = Field(default=None, ge=0, le=100)
    end_pct: float | None = Field(default=None, ge=0, le=100)
    station: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    tags: list[str] | None = None


class ChargeOut(BaseModel):
    id: int
    vehicle_id: int
    date: datetime
    odometer: float
    kwh_added: float
    price_per_kwh: float | None
    total_cost: float | None
    fill_type: FillType
    charge_type: ChargeType
    start_pct: float | None
    end_pct: float | None
    station: str | None
    location: str | None
    notes: str | None
    tags: list[str] = []
    economy: float | None = None  # mi (or km) per kWh
    distance: float | None = None


# ---- Odometer adjustments ----

class AdjustmentCreate(BaseModel):
    date: datetime
    old_odometer: float = Field(ge=0)
    new_odometer: float = Field(ge=0)
    note: str | None = None


class AdjustmentOut(BaseModel):
    id: int
    vehicle_id: int
    date: datetime
    old_odometer: float
    new_odometer: float
    note: str | None


# ---- Service records ----

class ServiceItemIn(BaseModel):
    service_type: str = Field(min_length=1, max_length=80)
    cost: float | None = Field(default=None, ge=0)
    parts: str | None = Field(default=None, max_length=200)


class ServiceItemOut(ServiceItemIn):
    id: int


class AttachmentOut(BaseModel):
    id: int
    filename: str
    content_type: str
    size: int
    kind: str


class ServiceRecordCreate(BaseModel):
    date: datetime
    odometer: float | None = Field(default=None, ge=0)
    shop: str | None = Field(default=None, max_length=120)
    is_diy: bool = False
    total_cost: float | None = Field(default=None, ge=0)  # None -> sum of items
    notes: str | None = None
    items: list[ServiceItemIn] = Field(min_length=1)


class ServiceRecordUpdate(BaseModel):
    date: datetime | None = None
    odometer: float | None = Field(default=None, ge=0)
    shop: str | None = Field(default=None, max_length=120)
    is_diy: bool | None = None
    total_cost: float | None = Field(default=None, ge=0)
    notes: str | None = None
    items: list[ServiceItemIn] | None = Field(default=None, min_length=1)


class ServiceRecordOut(BaseModel):
    id: int
    vehicle_id: int
    vehicle_name: str | None = None
    date: datetime
    odometer: float | None
    shop: str | None
    is_diy: bool
    total_cost: float | None  # resolved: stored override or sum of items
    notes: str | None
    items: list[ServiceItemOut]
    attachments: list[AttachmentOut] = []


# ---- Service reminders ----

class ReminderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    interval_miles: float | None = Field(default=None, gt=0)
    interval_months: float | None = Field(default=None, gt=0)
    due_date: datetime | None = None
    due_odometer: float | None = Field(default=None, ge=0)
    last_done_date: datetime | None = None
    last_done_odometer: float | None = Field(default=None, ge=0)
    active: bool = True

    @model_validator(mode="after")
    def _needs_a_trigger(self):
        if not any(
            v is not None
            for v in (self.interval_miles, self.interval_months, self.due_date, self.due_odometer)
        ):
            raise ValueError(
                "A reminder needs a mileage interval, a time interval, or a one-off due date/odometer"
            )
        return self


class ReminderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    interval_miles: float | None = Field(default=None, gt=0)
    interval_months: float | None = Field(default=None, gt=0)
    due_date: datetime | None = None
    due_odometer: float | None = Field(default=None, ge=0)
    last_done_date: datetime | None = None
    last_done_odometer: float | None = Field(default=None, ge=0)
    active: bool | None = None


class ReminderComplete(BaseModel):
    date: datetime
    odometer: float | None = Field(default=None, ge=0)


class ReminderOut(BaseModel):
    id: int
    vehicle_id: int
    vehicle_name: str | None = None
    name: str
    interval_miles: float | None
    interval_months: float | None
    due_date: datetime | None
    due_odometer: float | None
    last_done_date: datetime | None
    last_done_odometer: float | None
    active: bool
    # computed
    status: ReminderStatus
    next_due_odometer: float | None
    next_due_date: datetime | None
    miles_remaining: float | None
    days_remaining: int | None


# ---- Notifications ----

class NotificationOut(BaseModel):
    id: int
    title: str
    body: str | None
    kind: str
    read: bool
    created_at: datetime


class NotificationList(BaseModel):
    unread_count: int
    notifications: list[NotificationOut]


class ChannelIn(BaseModel):
    kind: str = Field(pattern="^(email|ntfy|gotify|webhook)$")
    config: dict = {}
    enabled: bool = False


class ChannelOut(ChannelIn):
    id: int


# ---- Fuel-grade comparison ----

class GradeStatsOut(BaseModel):
    grade: str
    tank_count: int
    avg_economy: float | None
    avg_price: float | None
    cost_per_distance: float | None
    enough_data: bool  # tank_count >= min_tanks


class GradeVerdict(BaseModel):
    best_grade: str
    vs_grade: str
    per_1000_savings: float  # money saved per 1,000 mi/km by running best_grade
    yearly_savings: float
    annual_distance: float
    annual_distance_estimated: bool  # True when we fell back to the default


class GradeComparison(BaseModel):
    vehicle_id: int
    min_tanks: int
    grades: list[GradeStatsOut]
    verdict: GradeVerdict | None = None


# ---- Vehicle stats (dashboard) ----

class EnergyStats(BaseModel):
    lifetime: float | None
    best: float | None
    worst: float | None
    last: float | None
    total_energy: float
    total_spend: float
    cost_per_distance: float | None


class VehicleStats(BaseModel):
    vehicle_id: int
    latest_odometer: float | None
    entry_count: int
    month_spend: float
    fuel: EnergyStats | None = None      # gas/diesel/hybrid/PHEV
    electric: EnergyStats | None = None  # EV/PHEV
    blended_cost_per_distance: float | None = None  # PHEV only


class VehicleStatsSummary(BaseModel):
    """Lightweight per-vehicle numbers for the garage cards."""

    vehicle_id: int
    latest_odometer: float | None
    avg_economy: float | None  # MPG for gas vehicles, distance/kWh for EVs
    month_spend: float
    last_entry_date: datetime | None = None


class VehicleOut(BaseModel):
    id: int
    owner_id: int
    name: str
    energy_type: EnergyType
    year: int | None
    make: str | None
    model: str | None
    trim: str | None
    tank_size: float | None
    battery_size: float | None
    odometer_start: float | None
    photo_path: str | None
    distance_unit: DistanceUnit | None
    volume_unit: VolumeUnit | None
    currency: str | None
    archived: bool
    created_at: datetime
    updated_at: datetime
