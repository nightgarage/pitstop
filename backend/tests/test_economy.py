"""Tests for the economy math — the trickiest correctness detail in the app
(docs/DESIGN.md §6). Each rule gets its own test."""

from datetime import datetime, timedelta

import pytest

from pitstop.economy import (
    Adjustment,
    Entry,
    Fill,
    blended_cost_per_distance,
    compute_intervals,
    entry_cost,
    summarize,
)

T0 = datetime(2026, 1, 1, 12, 0)


def day(n: int) -> datetime:
    return T0 + timedelta(days=n)


def entry(id: int, n: int, odometer: float, amount: float, fill: Fill = Fill.full, cost=None):
    return Entry(id=id, date=day(n), odometer=odometer, amount=amount, fill_type=fill, cost=cost)


def econ_by_id(entries, adjustments=None):
    return {i.entry_id: i.economy for i in compute_intervals(entries, adjustments)}


# ---- the basics ----

def test_first_entry_is_baseline_only():
    result = econ_by_id([entry(1, 0, 1000, 10)])
    assert result == {1: None}


def test_mpg_between_two_full_fills():
    result = econ_by_id([entry(1, 0, 1000, 10), entry(2, 7, 1300, 12)])
    assert result[1] is None
    assert result[2] == pytest.approx(300 / 12)  # 25 MPG


def test_chain_of_full_fills():
    result = econ_by_id(
        [entry(1, 0, 1000, 10), entry(2, 7, 1300, 12), entry(3, 14, 1600, 10)]
    )
    assert result[2] == pytest.approx(25.0)
    assert result[3] == pytest.approx(30.0)


# ---- partial fills accumulate ----

def test_partial_fill_gets_no_number_and_accumulates():
    result = econ_by_id(
        [
            entry(1, 0, 1000, 10),
            entry(2, 5, 1200, 5, Fill.partial),
            entry(3, 10, 1450, 10),  # 450 mi on 5 + 10 gal
        ]
    )
    assert result[2] is None
    assert result[3] == pytest.approx(450 / 15)


def test_multiple_partials_accumulate():
    result = econ_by_id(
        [
            entry(1, 0, 1000, 10),
            entry(2, 3, 1150, 4, Fill.partial),
            entry(3, 6, 1300, 3, Fill.partial),
            entry(4, 9, 1500, 8),  # 500 mi on 4+3+8 gal
        ]
    )
    assert result[4] == pytest.approx(500 / 15)


def test_partials_before_first_full_dont_pollute():
    result = econ_by_id(
        [
            entry(1, 0, 1000, 5, Fill.partial),
            entry(2, 2, 1100, 10),  # first full: baseline only
            entry(3, 9, 1400, 12),
        ]
    )
    assert result[1] is None
    assert result[2] is None  # no anchor before it — baseline
    assert result[3] == pytest.approx(300 / 12)


# ---- missed fills break the chain ----

def test_missed_fill_breaks_chain():
    result = econ_by_id(
        [
            entry(1, 0, 1000, 10),
            entry(2, 7, 1400, 12, Fill.missed),  # a fill before this wasn't logged
            entry(3, 14, 1700, 10),
        ]
    )
    assert result[2] is None  # gap: no honest number exists
    assert result[3] == pytest.approx(300 / 10)  # chain restarts from the missed entry


def test_missed_fill_discards_pending_partials():
    result = econ_by_id(
        [
            entry(1, 0, 1000, 10),
            entry(2, 3, 1150, 5, Fill.partial),
            entry(3, 7, 1400, 12, Fill.missed),
            entry(4, 14, 1700, 10),
        ]
    )
    assert result[4] == pytest.approx(30.0)  # the orphaned partial isn't counted


# ---- odometer adjustments ----

def test_odometer_reset_with_adjustment_marker():
    # cluster swap at day 5: old odo ended at 1200, new starts at 10
    adjustment = Adjustment(date=day(5), old_odometer=1200, new_odometer=10)
    result = econ_by_id(
        [entry(1, 0, 1000, 10), entry(2, 9, 110, 12)],
        [adjustment],
    )
    # (1200-1000) + (110-10) = 300 mi on 12 gal
    assert result[2] == pytest.approx(25.0)


def test_two_adjustments_in_one_interval():
    adjustments = [
        Adjustment(date=day(2), old_odometer=1100, new_odometer=0),
        Adjustment(date=day(4), old_odometer=150, new_odometer=5000),
    ]
    result = econ_by_id(
        [entry(1, 0, 1000, 10), entry(2, 6, 5050, 12)], adjustments
    )
    # (1100-1000) + (150-0) + (5050-5000) = 300 mi
    assert result[2] == pytest.approx(25.0)


def test_odometer_going_backwards_without_marker_gives_no_number():
    result = econ_by_id([entry(1, 0, 1000, 10), entry(2, 7, 900, 12)])
    assert result[2] is None


def test_adjustment_outside_interval_is_ignored():
    adjustment = Adjustment(date=day(30), old_odometer=2000, new_odometer=0)
    result = econ_by_id(
        [entry(1, 0, 1000, 10), entry(2, 7, 1300, 12)], [adjustment]
    )
    assert result[2] == pytest.approx(25.0)


# ---- EV / kWh: identical math, different units ----

def test_ev_miles_per_kwh():
    result = econ_by_id(
        [
            entry(1, 0, 10000, 50),  # full charge, baseline
            entry(2, 3, 10150, 45),  # 150 mi on 45 kWh
        ]
    )
    assert result[2] == pytest.approx(150 / 45)


def test_ev_partial_charges_accumulate():
    result = econ_by_id(
        [
            entry(1, 0, 10000, 50),
            entry(2, 1, 10080, 12, Fill.partial),
            entry(3, 2, 10300, 55),  # 300 mi on 12 + 55 kWh
        ]
    )
    assert result[3] == pytest.approx(300 / 67)


# ---- stats rollup ----

def test_summarize_lifetime_best_worst_last():
    stats = summarize(
        [
            entry(1, 0, 1000, 10, cost=30.0),
            entry(2, 7, 1300, 12, cost=36.0),   # 25 MPG
            entry(3, 14, 1600, 10, cost=32.0),  # 30 MPG
            entry(4, 21, 1800, 10, cost=33.0),  # 20 MPG
        ]
    )
    assert stats.best == pytest.approx(30.0)
    assert stats.worst == pytest.approx(20.0)
    assert stats.last == pytest.approx(20.0)
    # lifetime is fuel-weighted over valid intervals: 800 mi / 32 gal
    assert stats.lifetime == pytest.approx(800 / 32)
    assert stats.total_spend == pytest.approx(131.0)
    assert stats.total_distance == pytest.approx(800)
    assert stats.cost_per_distance == pytest.approx(131 / 800)


def test_summarize_empty_and_single():
    empty = summarize([])
    assert empty.lifetime is None and empty.total_spend == 0
    single = summarize([entry(1, 0, 1000, 10, cost=30.0)])
    assert single.lifetime is None
    assert single.total_distance is None
    assert single.total_spend == pytest.approx(30.0)


def test_summarize_distance_spans_adjustments():
    adjustment = Adjustment(date=day(5), old_odometer=1200, new_odometer=10)
    stats = summarize(
        [entry(1, 0, 1000, 10, cost=30.0), entry(2, 9, 110, 12, cost=36.0)],
        [adjustment],
    )
    assert stats.total_distance == pytest.approx(300)


# ---- entry cost resolution ----

def test_entry_cost_resolution():
    assert entry_cost(10, 3.50, None) == pytest.approx(35.0)
    assert entry_cost(10, 3.50, 34.0) == pytest.approx(34.0)  # stored total wins
    assert entry_cost(10, None, None) is None


# ---- PHEV blended ----

def test_phev_blended_cost_per_mile():
    fuel = [
        entry(1, 0, 5000, 8, cost=28.0),
        entry(2, 10, 5400, 9, cost=31.0),
    ]
    charges = [
        entry(10, 2, 5100, 12, cost=2.0),
        entry(11, 6, 5250, 14, cost=2.4),
    ]
    blended = blended_cost_per_distance(fuel, charges)
    # all spend / full odometer span: 63.4 / 400
    assert blended == pytest.approx(63.4 / 400)


def test_phev_blended_needs_data():
    assert blended_cost_per_distance([], []) is None
    assert blended_cost_per_distance([entry(1, 0, 5000, 8, cost=28.0)], []) is None
