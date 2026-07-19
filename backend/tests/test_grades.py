"""Tests for fuel-grade attribution and per-grade stats (DESIGN §2.3/§6)."""

from datetime import datetime, timedelta

import pytest

from pitstop.economy import Entry, Fill, compute_intervals, per_grade_stats

T0 = datetime(2026, 1, 1, 12, 0)


def entry(id, day, odometer, amount, fill=Fill.full, grade=None, cost=None):
    return Entry(
        id=id, date=T0 + timedelta(days=day), odometer=odometer, amount=amount,
        fill_type=fill, grade=grade, cost=cost,
    )


def by_id(entries):
    return {i.entry_id: i for i in compute_intervals(entries)}


# ---- attribution ----

def test_interval_credited_to_anchor_grade():
    # you burn what was in the tank at the start — the 87 — even though the
    # closing fill bought 91
    result = by_id(
        [
            entry(1, 0, 1000, 10, grade="87"),
            entry(2, 7, 1300, 12, grade="91"),
        ]
    )
    assert result[2].economy == pytest.approx(25.0)
    assert result[2].grade == "87"
    assert result[2].mixed is False


def test_chain_attribution_follows_each_anchor():
    result = by_id(
        [
            entry(1, 0, 1000, 10, grade="87"),
            entry(2, 7, 1300, 12, grade="91"),  # interval credited to 87
            entry(3, 14, 1600, 10, grade="87"),  # interval credited to 91
        ]
    )
    assert result[2].grade == "87"
    assert result[3].grade == "91"


def test_mid_tank_grade_change_is_mixed_and_excluded():
    result = by_id(
        [
            entry(1, 0, 1000, 10, grade="87"),
            entry(2, 3, 1150, 5, Fill.partial, grade="91"),  # different grade mid-tank
            entry(3, 7, 1450, 10, grade="87"),
        ]
    )
    assert result[3].economy is not None  # MPG still computes…
    assert result[3].mixed is True  # …but the tank is excluded from grade stats
    assert result[3].grade is None

    stats = per_grade_stats(
        [
            entry(1, 0, 1000, 10, grade="87"),
            entry(2, 3, 1150, 5, Fill.partial, grade="91"),
            entry(3, 7, 1450, 10, grade="87"),
        ]
    )
    # the mixed tank credits no grade at all
    assert all(s.tank_count == 0 for s in stats)


def test_same_grade_partial_is_not_mixed():
    result = by_id(
        [
            entry(1, 0, 1000, 10, grade="87"),
            entry(2, 3, 1150, 5, Fill.partial, grade="87"),
            entry(3, 7, 1450, 10, grade="87"),
        ]
    )
    assert result[3].mixed is False
    assert result[3].grade == "87"


def test_ungraded_anchor_gives_unattributed_interval():
    result = by_id([entry(1, 0, 1000, 10), entry(2, 7, 1300, 12)])
    assert result[2].economy is not None
    assert result[2].grade is None
    assert result[2].mixed is False


# ---- per-grade stats ----

def sample_history():
    """Alternating 87/91 tanks: 87 does 25 MPG at $3.29, 91 does 26 MPG at $3.69."""
    entries = []
    odometer = 1000.0
    id = 1
    for round_number in range(3):
        # an 87 anchor: the NEXT interval burns 87
        entries.append(entry(id, len(entries) * 7, odometer, 10, grade="87", cost=32.9))
        id += 1
        odometer += 250  # 25 MPG on the 10 gal of 87
        # a 91 anchor closing the 87 interval; next interval burns 91
        entries.append(entry(id, len(entries) * 7, odometer, 10, grade="91", cost=36.9))
        id += 1
        odometer += 260  # 26 MPG on the 10 gal of 91
    entries.append(entry(id, len(entries) * 7, odometer, 10, grade="87", cost=32.9))
    return entries


def test_per_grade_stats_rollup():
    stats = {s.grade: s for s in per_grade_stats(sample_history())}

    assert stats["87"].tank_count == 3
    assert stats["87"].avg_economy == pytest.approx(25.0)
    assert stats["87"].avg_price == pytest.approx(3.29)
    assert stats["87"].cost_per_distance == pytest.approx(3.29 / 25.0)

    assert stats["91"].tank_count == 3
    assert stats["91"].avg_economy == pytest.approx(26.0)
    assert stats["91"].avg_price == pytest.approx(3.69)
    assert stats["91"].cost_per_distance == pytest.approx(3.69 / 26.0)

    # the whole point: 87 is cheaper per mile despite worse MPG
    assert stats["87"].cost_per_distance < stats["91"].cost_per_distance


def test_grade_with_prices_but_no_tanks_yet():
    stats = {s.grade: s for s in per_grade_stats([entry(1, 0, 1000, 10, grade="93", cost=40.0)])}
    assert stats["93"].tank_count == 0
    assert stats["93"].avg_price == pytest.approx(4.0)
    assert stats["93"].avg_economy is None
    assert stats["93"].cost_per_distance is None
