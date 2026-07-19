"""Tests for reminder status math (upcoming / due / overdue)."""

from datetime import datetime

from pitstop.reminders import ReminderInput, ReminderStatus, add_months, evaluate

TODAY = datetime(2026, 7, 17)


def check(reminder: ReminderInput, odometer: float | None = None):
    return evaluate(reminder, odometer, TODAY)


# ---- mileage interval ----

def test_mileage_upcoming():
    state = check(
        ReminderInput(interval_miles=5000, last_done_odometer=80000), odometer=81000
    )
    assert state.status == ReminderStatus.upcoming
    assert state.next_due_odometer == 85000
    assert state.miles_remaining == 4000


def test_mileage_due_soon():
    state = check(
        ReminderInput(interval_miles=5000, last_done_odometer=80000), odometer=84680
    )
    assert state.status == ReminderStatus.due
    assert state.miles_remaining == 320


def test_mileage_overdue():
    state = check(
        ReminderInput(interval_miles=5000, last_done_odometer=80000), odometer=85600
    )
    assert state.status == ReminderStatus.overdue
    assert state.miles_remaining == -600


def test_mileage_without_last_done_has_no_odometer_target():
    state = check(ReminderInput(interval_miles=5000), odometer=84000)
    assert state.next_due_odometer is None
    assert state.status == ReminderStatus.upcoming


# ---- time interval ----

def test_time_upcoming():
    state = check(ReminderInput(interval_months=6, last_done_date=datetime(2026, 5, 1)))
    assert state.status == ReminderStatus.upcoming
    assert state.next_due_date == datetime(2026, 11, 1)


def test_time_due_soon():
    state = check(ReminderInput(interval_months=6, last_done_date=datetime(2026, 2, 1)))
    assert state.status == ReminderStatus.due  # due Aug 1, 15 days out
    assert state.days_remaining == 15


def test_time_overdue():
    state = check(ReminderInput(interval_months=6, last_done_date=datetime(2025, 12, 1)))
    assert state.status == ReminderStatus.overdue
    assert state.days_remaining < 0


# ---- both intervals: whichever comes first ----

def test_both_intervals_mileage_hits_first():
    state = check(
        ReminderInput(
            interval_miles=5000,
            interval_months=12,
            last_done_odometer=80000,
            last_done_date=datetime(2026, 1, 1),
        ),
        odometer=85600,  # mileage overdue, time side fine until 2027
    )
    assert state.status == ReminderStatus.overdue


def test_both_intervals_time_hits_first():
    state = check(
        ReminderInput(
            interval_miles=5000,
            interval_months=3,
            last_done_odometer=80000,
            last_done_date=datetime(2026, 1, 1),  # due Apr 1 — long past
        ),
        odometer=80500,  # mileage side barely used
    )
    assert state.status == ReminderStatus.overdue


# ---- one-off reminders ----

def test_one_off_date_upcoming():
    state = check(ReminderInput(due_date=datetime(2026, 9, 30)))
    assert state.status == ReminderStatus.upcoming
    assert state.next_due_date == datetime(2026, 9, 30)


def test_one_off_date_due_soon():
    state = check(ReminderInput(due_date=datetime(2026, 8, 1)))
    assert state.status == ReminderStatus.due


def test_one_off_date_overdue():
    state = check(ReminderInput(due_date=datetime(2026, 7, 1)))
    assert state.status == ReminderStatus.overdue


def test_one_off_odometer():
    far = check(ReminderInput(due_odometer=85000), odometer=84300)
    assert far.status == ReminderStatus.upcoming
    assert far.miles_remaining == 700

    close = check(ReminderInput(due_odometer=85000), odometer=84600)
    assert close.status == ReminderStatus.due
    assert close.miles_remaining == 400


def test_one_off_without_current_odometer_is_upcoming():
    state = check(ReminderInput(due_odometer=85000), odometer=None)
    assert state.status == ReminderStatus.upcoming
    assert state.miles_remaining is None


# ---- month addition edge cases ----

def test_add_months_clamps_short_months():
    assert add_months(datetime(2026, 1, 31), 1) == datetime(2026, 2, 28)


def test_add_months_year_rollover():
    assert add_months(datetime(2026, 11, 15), 3) == datetime(2027, 2, 15)


def test_add_months_fractional():
    assert add_months(datetime(2026, 1, 1), 0.5) == datetime(2026, 1, 16)
