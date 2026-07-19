"""Demo mode: SEED_DEMO=true creates a demo account with a realistic garage on
first start (only when the instance has no users), so a fresh install or a
public demo has something to show."""

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, func, select

from .models import (
    ChargeSession,
    ChargeType,
    FillType,
    FuelUp,
    Role,
    ServiceItem,
    ServiceRecord,
    ServiceReminder,
    User,
    Vehicle,
)
from .security import hash_password

logger = logging.getLogger(__name__)

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "pitstop-demo"


def seed_demo_data(session: Session) -> bool:
    """Create the demo user + garage. No-op unless the instance is empty."""
    if session.exec(select(func.count()).select_from(User)).one() > 0:
        return False

    user = User(
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD),
        display_name="Demo Driver",
        role=Role.admin,
    )
    session.add(user)
    session.flush()

    truck = Vehicle(
        owner_id=user.id, name="Daily Driver", year=2019, make="GMC", model="Sierra",
        energy_type="gasoline", tank_size=24, odometer_start=80000,
    )
    session.add(truck)
    session.flush()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    odometer = 80000.0
    date = now - timedelta(days=180)
    grades = ["87", "87", "91", "87", "91", "87", "87", "91", "87", "87", "91", "87"]
    prices = {"87": 3.29, "91": 3.69}
    mpg = {"87": 21.5, "91": 22.3}
    for index, grade in enumerate(grades):
        volume = 18.0 + (index % 3)
        session.add(
            FuelUp(
                vehicle_id=truck.id,
                date=date,
                odometer=odometer,
                volume=volume,
                price_per_unit=round(prices[grade] + 0.02 * (index % 5 - 2), 2),
                total_cost=None,
                fill_type=FillType.full,
                fuel_grade=grade,
                station="North Fuel Stop" if index % 3 else "Hilltop Gas",
            )
        )
        odometer += volume * mpg[grade] * (0.94 + 0.04 * (index % 4))
        date += timedelta(days=15)

    # a second vehicle so the garage shows more than one energy type
    ev = Vehicle(
        owner_id=user.id, name="Commuter", year=2024, make="Tesla", model="Model 3",
        energy_type="electric", battery_size=75, odometer_start=12000,
    )
    session.add(ev)
    session.flush()

    ev_odometer = 12000.0
    ev_date = now - timedelta(days=120)
    for index in range(10):
        kwh = 42.0 + (index % 4) * 3
        session.add(
            ChargeSession(
                vehicle_id=ev.id,
                date=ev_date,
                odometer=ev_odometer,
                kwh_added=kwh,
                price_per_kwh=0.14 if index % 3 else 0.38,
                fill_type=FillType.full,
                charge_type=ChargeType.home if index % 3 else ChargeType.dc_fast,
            )
        )
        ev_odometer += kwh * (3.5 + 0.1 * (index % 3))
        ev_date += timedelta(days=12)

    service = ServiceRecord(
        vehicle_id=truck.id, date=now - timedelta(days=60), odometer=82600,
        shop="Main Street Auto", total_cost=None,
    )
    session.add(service)
    session.flush()
    session.add(ServiceItem(record_id=service.id, service_type="Oil & filter change", cost=89.99))
    session.add(ServiceItem(record_id=service.id, service_type="Tire rotation", cost=25.00))

    # reminders spanning all three states, so the service screen shows the
    # overdue / due-soon / upcoming grouping a real garage produces
    session.add(
        ServiceReminder(
            vehicle_id=truck.id, name="Tire rotation",
            interval_miles=5000,
            last_done_date=now - timedelta(days=210), last_done_odometer=78200,
        )
    )
    session.add(
        ServiceReminder(
            vehicle_id=truck.id, name="Oil & filter change",
            interval_miles=5000, interval_months=6,
            last_done_date=now - timedelta(days=60), last_done_odometer=79800,
        )
    )
    session.add(
        ServiceReminder(
            vehicle_id=ev.id, name="Tire rotation",
            interval_miles=10000,
            last_done_date=now - timedelta(days=90), last_done_odometer=13500,
        )
    )
    session.add(
        ServiceReminder(
            vehicle_id=truck.id, name="Registration renewal",
            due_date=now + timedelta(days=75),
        )
    )
    session.commit()
    logger.info("seeded demo data (%s / %s)", DEMO_EMAIL, DEMO_PASSWORD)
    return True
