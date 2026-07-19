from datetime import datetime, timedelta

import pytest

from .conftest import do_setup

T0 = datetime(2026, 1, 1, 12, 0)


def make_vehicle(client) -> dict:
    return client.post(
        "/api/vehicles", json={"name": "Truck", "energy_type": "gasoline"}
    ).json()


def fill(client, vehicle_id, day, odometer, volume, grade, price, station=None):
    response = client.post(
        f"/api/vehicles/{vehicle_id}/fuelups",
        json={
            "date": (T0 + timedelta(days=day)).isoformat(),
            "odometer": odometer,
            "volume": volume,
            "fuel_grade": grade,
            "price_per_unit": price,
            "station": station,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def seed_alternating_history(client, vehicle_id):
    """3 clean tanks each of 87 (25 MPG @ $3.29) and 91 (26 MPG @ $3.69)."""
    odometer = 1000.0
    day = 0
    for _ in range(3):
        fill(client, vehicle_id, day, odometer, 10, "87", 3.29, station="North Fuel Stop")
        odometer += 250
        day += 14
        fill(client, vehicle_id, day, odometer, 10, "91", 3.69, station="North Fuel Stop")
        odometer += 260
        day += 14
    fill(client, vehicle_id, day, odometer, 10, "87", 3.19, station="Hilltop Gas")


def test_grade_comparison_with_verdict(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    seed_alternating_history(client, vehicle["id"])

    comparison = client.get(f"/api/vehicles/{vehicle['id']}/grades").json()
    grades = {g["grade"]: g for g in comparison["grades"]}

    assert grades["87"]["tank_count"] == 3
    assert grades["87"]["avg_economy"] == pytest.approx(25.0)
    assert grades["87"]["enough_data"] is True
    assert grades["91"]["tank_count"] == 3
    assert grades["91"]["avg_economy"] == pytest.approx(26.0)

    verdict = comparison["verdict"]
    assert verdict["best_grade"] == "87"
    assert verdict["vs_grade"] == "91"
    assert verdict["yearly_savings"] > 0
    # ~84 days of history covering 1530 mi -> annualized, not the default
    assert verdict["annual_distance_estimated"] is False
    assert verdict["annual_distance"] == pytest.approx(1530 / (84 / 365.25), rel=0.01)


def test_no_verdict_until_two_grades_have_a_tank(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    # one 87 tank completes (closed by the 91 fill); 91's own tank is still open
    fill(client, vehicle["id"], 0, 1000, 10, "87", 3.29)
    fill(client, vehicle["id"], 7, 1250, 10, "91", 3.69)
    comparison = client.get(f"/api/vehicles/{vehicle['id']}/grades").json()
    assert comparison["verdict"] is None
    grades = {g["grade"]: g for g in comparison["grades"]}
    assert grades["87"]["enough_data"] is True  # one tank is enough to count
    assert grades["91"]["enough_data"] is False

    # closing the 91 tank produces a verdict from one tank of each
    fill(client, vehicle["id"], 14, 1510, 10, "87", 3.29)
    comparison = client.get(f"/api/vehicles/{vehicle['id']}/grades").json()
    assert comparison["verdict"] is not None
    assert comparison["min_tanks"] == 1


def test_grades_scoped_to_owner(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    vehicle = make_vehicle(client)
    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "display_name": "Other"},
    )
    assert client.get(f"/api/vehicles/{vehicle['id']}/grades").status_code == 404
