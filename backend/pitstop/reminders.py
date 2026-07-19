"""Reminder status math (docs/DESIGN.md §2.5).

A reminder fires on a mileage interval, a time interval, or both — whichever
comes first — or is a one-off with a fixed due date and/or odometer. Status is
computed from the vehicle's latest odometer and today's date:

- overdue:  past the due odometer or due date
- due:      within the "due soon" window (miles or days)
- upcoming: everything else

Pure functions, no I/O.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum

# "due soon" thresholds — how close counts as amber
DUE_SOON_MILES = 500.0
DUE_SOON_DAYS = 30


class ReminderStatus(str, Enum):
    upcoming = "upcoming"
    due = "due"
    overdue = "overdue"


@dataclass(frozen=True)
class ReminderInput:
    interval_miles: float | None = None
    interval_months: float | None = None
    due_date: datetime | None = None
    due_odometer: float | None = None
    last_done_date: datetime | None = None
    last_done_odometer: float | None = None


@dataclass(frozen=True)
class ReminderState:
    status: ReminderStatus
    next_due_odometer: float | None
    next_due_date: datetime | None
    miles_remaining: float | None  # negative = miles over
    days_remaining: int | None  # negative = days over


def add_months(date: datetime, months: float) -> datetime:
    """Calendar-aware month addition; fractional months add whole days."""
    whole = int(months)
    fraction_days = round((months - whole) * 30)
    month_index = date.month - 1 + whole
    year = date.year + month_index // 12
    month = month_index % 12 + 1
    # clamp the day for short months (Jan 31 + 1mo -> Feb 28)
    day = min(date.day, _days_in_month(year, month))
    return date.replace(year=year, month=month, day=day) + timedelta(days=fraction_days)


def _days_in_month(year: int, month: int) -> int:
    next_month = datetime(year + (month == 12), month % 12 + 1, 1)
    return (next_month - timedelta(days=1)).day


def evaluate(
    reminder: ReminderInput,
    current_odometer: float | None,
    today: datetime,
    due_soon_miles: float = DUE_SOON_MILES,
    due_soon_days: int = DUE_SOON_DAYS,
) -> ReminderState:
    # where the next service is due
    next_due_odometer: float | None = None
    if reminder.due_odometer is not None:
        next_due_odometer = reminder.due_odometer
    elif reminder.interval_miles is not None and reminder.last_done_odometer is not None:
        next_due_odometer = reminder.last_done_odometer + reminder.interval_miles

    next_due_date: datetime | None = None
    if reminder.due_date is not None:
        next_due_date = reminder.due_date
    elif reminder.interval_months is not None and reminder.last_done_date is not None:
        next_due_date = add_months(reminder.last_done_date, reminder.interval_months)

    miles_remaining = (
        next_due_odometer - current_odometer
        if next_due_odometer is not None and current_odometer is not None
        else None
    )
    days_remaining = (next_due_date - today).days if next_due_date is not None else None

    # whichever comes first decides the status
    if (miles_remaining is not None and miles_remaining < 0) or (
        days_remaining is not None and days_remaining < 0
    ):
        status = ReminderStatus.overdue
    elif (miles_remaining is not None and miles_remaining <= due_soon_miles) or (
        days_remaining is not None and days_remaining <= due_soon_days
    ):
        status = ReminderStatus.due
    else:
        status = ReminderStatus.upcoming

    return ReminderState(
        status=status,
        next_due_odometer=next_due_odometer,
        next_due_date=next_due_date,
        miles_remaining=miles_remaining,
        days_remaining=days_remaining,
    )
