"""Fuel/energy economy math.

The rules (see docs/DESIGN.md §6):

- Economy is only computed at a FULL fill, as distance since the previous
  anchor full fill divided by all fuel added since it (partials accumulate).
- A PARTIAL fill never gets its own number; its volume rolls into the next
  full fill's calculation.
- A MISSED entry means one or more fill-ups before it weren't logged: no
  number can be computed for it, and the chain restarts with it as the new
  anchor (the tank is assumed full after it).
- The FIRST entry is a baseline only.
- OdometerAdjustment markers absorb odometer resets/swaps so distance math
  stays correct across them.

The same math applies to EV charge sessions with kWh in place of volume.
Everything here is pure functions over plain data, so it's easy to test.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class Fill(str, Enum):
    full = "full"
    partial = "partial"
    missed = "missed"


@dataclass(frozen=True)
class Entry:
    """A fuel-up or charge session reduced to what economy math needs."""

    id: int
    date: datetime
    odometer: float
    amount: float  # volume (gal/L) or energy (kWh)
    fill_type: Fill
    cost: float | None = None  # resolved total cost of this entry
    grade: str | None = None  # fuel grade ("87", "91", "diesel", …)


@dataclass(frozen=True)
class Adjustment:
    """Odometer reset marker: readings before `date` end at old_odometer,
    readings after it start at new_odometer."""

    date: datetime
    old_odometer: float
    new_odometer: float


@dataclass(frozen=True)
class Interval:
    """The computed economy for one full fill (None economy = baseline/broken chain)."""

    entry_id: int
    distance: float | None
    energy: float | None
    economy: float | None  # distance per unit energy (MPG, mi/kWh, km/L…)
    # grade attribution: the fuel burned over this interval is the fuel added
    # at its START (the anchor fill), so the MPG is credited to that grade.
    # A mid-interval fill of a different grade makes the tank "mixed".
    grade: str | None = None
    mixed: bool = False


def sort_entries(entries: list[Entry]) -> list[Entry]:
    return sorted(entries, key=lambda e: (e.date, e.odometer))


def adjusted_distance(
    start_odometer: float,
    start_date: datetime,
    end_odometer: float,
    end_date: datetime,
    adjustments: list[Adjustment],
) -> float:
    """Distance between two readings, walking through any odometer resets between them."""
    distance = 0.0
    current = start_odometer
    for adjustment in sorted(adjustments, key=lambda a: a.date):
        if start_date < adjustment.date <= end_date:
            distance += adjustment.old_odometer - current
            current = adjustment.new_odometer
    distance += end_odometer - current
    return distance


def compute_intervals(
    entries: list[Entry], adjustments: list[Adjustment] | None = None
) -> list[Interval]:
    """Per-entry economy following the chain rules. Returns one Interval per entry,
    in chronological order; partial/missed/baseline entries have economy None."""
    adjustments = adjustments or []
    results: list[Interval] = []
    anchor: Entry | None = None
    pending_energy = 0.0
    pending_grades: set[str | None] = set()

    for entry in sort_entries(entries):
        if entry.fill_type == Fill.missed:
            # gap in the log: no number, chain restarts here
            results.append(Interval(entry.id, None, None, None))
            anchor = entry
            pending_energy = 0.0
            pending_grades = set()
        elif entry.fill_type == Fill.partial:
            results.append(Interval(entry.id, None, None, None))
            pending_energy += entry.amount
            pending_grades.add(entry.grade)
        else:  # full
            if anchor is None:
                results.append(Interval(entry.id, None, None, None))  # first entry: baseline
            else:
                distance = adjusted_distance(
                    anchor.odometer, anchor.date, entry.odometer, entry.date, adjustments
                )
                energy = pending_energy + entry.amount
                if distance > 0 and energy > 0:
                    mixed = any(g != anchor.grade for g in pending_grades)
                    results.append(
                        Interval(
                            entry.id,
                            distance,
                            energy,
                            distance / energy,
                            grade=anchor.grade if not mixed else None,
                            mixed=mixed,
                        )
                    )
                else:
                    # nonsensical data (odometer went backwards with no
                    # adjustment marker) — never show a bogus number
                    results.append(Interval(entry.id, None, None, None))
            anchor = entry
            pending_energy = 0.0
            pending_grades = set()

    return results


@dataclass(frozen=True)
class Stats:
    lifetime: float | None  # total valid distance / total energy over valid intervals
    best: float | None
    worst: float | None
    last: float | None  # most recent computed interval
    total_energy: float  # all logged volume/kWh
    total_spend: float  # all resolved entry costs
    total_distance: float | None  # first-to-last odometer, adjustment-aware
    cost_per_distance: float | None  # total_spend / total_distance


def entry_cost(amount: float, price_per_unit: float | None, total_cost: float | None) -> float | None:
    """Resolve an entry's cost: stored total wins, else price × amount."""
    if total_cost is not None:
        return total_cost
    if price_per_unit is not None:
        return price_per_unit * amount
    return None


def summarize(
    entries: list[Entry], adjustments: list[Adjustment] | None = None
) -> Stats:
    ordered = sort_entries(entries)
    intervals = compute_intervals(ordered, adjustments)
    valid = [i for i in intervals if i.economy is not None]

    total_valid_distance = sum(i.distance for i in valid)
    total_valid_energy = sum(i.energy for i in valid)
    lifetime = total_valid_distance / total_valid_energy if total_valid_energy > 0 else None

    economies = [i.economy for i in valid]
    total_spend = sum(c for c in (e.cost for e in ordered) if c is not None)

    total_distance = None
    if len(ordered) >= 2:
        span = adjusted_distance(
            ordered[0].odometer, ordered[0].date, ordered[-1].odometer, ordered[-1].date,
            adjustments or [],
        )
        if span > 0:
            total_distance = span

    return Stats(
        lifetime=lifetime,
        best=max(economies) if economies else None,
        worst=min(economies) if economies else None,
        last=economies[-1] if economies else None,
        total_energy=sum(e.amount for e in ordered),
        total_spend=total_spend,
        total_distance=total_distance,
        cost_per_distance=(
            total_spend / total_distance if total_distance and total_spend > 0 else None
        ),
    )


@dataclass(frozen=True)
class GradeStats:
    """Per-fuel-grade rollup for the cost-per-mile comparison."""

    grade: str
    tank_count: int  # cleanly attributed full tanks (mixed excluded)
    avg_economy: float | None  # energy-weighted MPG over those tanks
    avg_price: float | None  # volume-weighted price per unit across this grade's fills
    cost_per_distance: float | None  # avg_price / avg_economy


def per_grade_stats(
    entries: list[Entry], adjustments: list[Adjustment] | None = None
) -> list[GradeStats]:
    """Economy and price per fuel grade. A tank's MPG is credited to the grade
    added at its start; mixed tanks are excluded entirely (see DESIGN §6)."""
    intervals = compute_intervals(entries, adjustments)
    distance_by_grade: dict[str, float] = {}
    energy_by_grade: dict[str, float] = {}
    tanks_by_grade: dict[str, int] = {}
    for interval in intervals:
        if interval.economy is None or interval.mixed or interval.grade is None:
            continue
        distance_by_grade[interval.grade] = distance_by_grade.get(interval.grade, 0.0) + interval.distance
        energy_by_grade[interval.grade] = energy_by_grade.get(interval.grade, 0.0) + interval.energy
        tanks_by_grade[interval.grade] = tanks_by_grade.get(interval.grade, 0) + 1

    # volume-weighted average pump price per grade, over every priced fill
    cost_by_grade: dict[str, float] = {}
    volume_by_grade: dict[str, float] = {}
    for entry in entries:
        if entry.grade is None or entry.cost is None or entry.amount <= 0:
            continue
        cost_by_grade[entry.grade] = cost_by_grade.get(entry.grade, 0.0) + entry.cost
        volume_by_grade[entry.grade] = volume_by_grade.get(entry.grade, 0.0) + entry.amount

    grades = sorted(set(tanks_by_grade) | set(volume_by_grade))
    stats = []
    for grade in grades:
        avg_economy = (
            distance_by_grade[grade] / energy_by_grade[grade]
            if energy_by_grade.get(grade)
            else None
        )
        avg_price = (
            cost_by_grade[grade] / volume_by_grade[grade] if volume_by_grade.get(grade) else None
        )
        cost_per_distance = (
            avg_price / avg_economy if avg_price is not None and avg_economy else None
        )
        stats.append(
            GradeStats(
                grade=grade,
                tank_count=tanks_by_grade.get(grade, 0),
                avg_economy=avg_economy,
                avg_price=avg_price,
                cost_per_distance=cost_per_distance,
            )
        )
    return stats


def blended_cost_per_distance(
    fuel_entries: list[Entry],
    charge_entries: list[Entry],
    adjustments: list[Adjustment] | None = None,
) -> float | None:
    """PHEV all-in cost per mile/km: (gas spend + electricity spend) over the
    odometer span covered by BOTH kinds of entries together."""
    combined = sort_entries([*fuel_entries, *charge_entries])
    if len(combined) < 2:
        return None
    spend = sum(c for c in (e.cost for e in combined) if c is not None)
    span = adjusted_distance(
        combined[0].odometer, combined[0].date, combined[-1].odometer, combined[-1].date,
        adjustments or [],
    )
    if span <= 0 or spend <= 0:
        return None
    return spend / span
