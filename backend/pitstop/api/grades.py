from fastapi import APIRouter
from sqlmodel import select

from ..deps import CurrentUser, SessionDep
from ..economy import per_grade_stats, summarize
from ..models import FuelUp
from ..schemas import GradeComparison, GradeStatsOut, GradeVerdict
from .entries import fuelups_as_entries, load_adjustments
from .vehicles import _get_owned_vehicle

router = APIRouter(prefix="/api/vehicles/{vehicle_id}/grades", tags=["fuel grades"])

MIN_TANKS = 1  # one clean full tank puts a grade on the board; more sharpens it
DEFAULT_ANNUAL_DISTANCE = 12_000.0
MIN_SPAN_DAYS = 60  # need this much history to annualize real mileage


@router.get("", response_model=GradeComparison)
def grade_comparison(vehicle_id: int, session: SessionDep, user: CurrentUser) -> GradeComparison:
    """Backward-looking comparison: which grade has been cheaper per mile."""
    _get_owned_vehicle(session, user, vehicle_id)
    fuelups = list(session.exec(select(FuelUp).where(FuelUp.vehicle_id == vehicle_id)).all())
    entries = fuelups_as_entries(fuelups)
    adjustments = load_adjustments(session, vehicle_id)

    stats = per_grade_stats(entries, adjustments)
    grades = [
        GradeStatsOut(
            grade=s.grade,
            tank_count=s.tank_count,
            avg_economy=s.avg_economy,
            avg_price=s.avg_price,
            cost_per_distance=s.cost_per_distance,
            enough_data=s.tank_count >= MIN_TANKS,
        )
        for s in stats
    ]

    return GradeComparison(
        vehicle_id=vehicle_id,
        min_tanks=MIN_TANKS,
        grades=grades,
        verdict=_verdict(entries, adjustments, grades),
    )


def _verdict(entries, adjustments, grades: list[GradeStatsOut]) -> GradeVerdict | None:
    ranked = sorted(
        (g for g in grades if g.enough_data and g.cost_per_distance is not None),
        key=lambda g: g.cost_per_distance,
    )
    if len(ranked) < 2:
        return None
    best, versus = ranked[0], ranked[1]

    overall = summarize(entries, adjustments)
    annual = DEFAULT_ANNUAL_DISTANCE
    estimated = True
    if overall.total_distance and len(entries) >= 2:
        ordered = sorted(entries, key=lambda e: e.date)
        span_days = (ordered[-1].date - ordered[0].date).days
        if span_days >= MIN_SPAN_DAYS:
            annual = overall.total_distance / (span_days / 365.25)
            estimated = False

    delta = versus.cost_per_distance - best.cost_per_distance
    return GradeVerdict(
        best_grade=best.grade,
        vs_grade=versus.grade,
        per_1000_savings=delta * 1000,
        yearly_savings=delta * annual,
        annual_distance=annual,
        annual_distance_estimated=estimated,
    )


