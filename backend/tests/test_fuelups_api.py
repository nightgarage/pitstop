from .conftest import do_setup


def make_vehicle(client, **overrides) -> dict:
    payload = {"name": "Truck", "energy_type": "gasoline"}
    payload.update(overrides)
    return client.post("/api/vehicles", json=payload).json()


def add_fuelup(client, vehicle_id, date, odometer, volume, **extra):
    payload = {"date": date, "odometer": odometer, "volume": volume, **extra}
    response = client.post(f"/api/vehicles/{vehicle_id}/fuelups", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_fuelup_crud_and_economy_chain(client):
    do_setup(client)
    vehicle = make_vehicle(client)

    first = add_fuelup(client, vehicle["id"], "2026-01-01T12:00:00", 1000, 10, price_per_unit=3.00)
    assert first["economy"] is None  # baseline
    assert first["total_cost"] == 30.0  # completed from price × volume

    second = add_fuelup(client, vehicle["id"], "2026-01-08T12:00:00", 1300, 12, total_cost=42.0)
    assert second["economy"] == 300 / 12
    assert second["price_per_unit"] == 3.5  # completed from total ÷ volume
    assert second["distance"] == 300

    entries = client.get(f"/api/vehicles/{vehicle['id']}/fuelups").json()
    assert [e["id"] for e in entries] == [second["id"], first["id"]]  # newest first

    # edit the odometer; economy recomputes
    patched = client.patch(
        f"/api/vehicles/{vehicle['id']}/fuelups/{second['id']}", json={"odometer": 1240}
    )
    assert patched.json()["economy"] == 240 / 12

    # delete restores the single-entry state
    assert (
        client.delete(f"/api/vehicles/{vehicle['id']}/fuelups/{second['id']}").status_code == 204
    )
    assert len(client.get(f"/api/vehicles/{vehicle['id']}/fuelups").json()) == 1


def test_partial_and_missed_flow_through_api(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    add_fuelup(client, vehicle["id"], "2026-01-01T12:00:00", 1000, 10)
    add_fuelup(client, vehicle["id"], "2026-01-04T12:00:00", 1200, 5, fill_type="partial")
    full = add_fuelup(client, vehicle["id"], "2026-01-08T12:00:00", 1450, 10)
    assert full["economy"] == 450 / 15

    missed = add_fuelup(client, vehicle["id"], "2026-01-15T12:00:00", 1700, 11, fill_type="missed")
    assert missed["economy"] is None
    after = add_fuelup(client, vehicle["id"], "2026-01-22T12:00:00", 2000, 10)
    assert after["economy"] == 300 / 10


def test_fuelup_tags_roundtrip(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    created = add_fuelup(
        client, vehicle["id"], "2026-01-01T12:00:00", 1000, 10, tags=["road trip", "costco"]
    )
    assert sorted(created["tags"]) == ["costco", "road trip"]

    patched = client.patch(
        f"/api/vehicles/{vehicle['id']}/fuelups/{created['id']}", json={"tags": ["commute"]}
    ).json()
    assert patched["tags"] == ["commute"]


def test_fuelups_scoped_to_owner(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    vehicle = make_vehicle(client)
    fuelup = add_fuelup(client, vehicle["id"], "2026-01-01T12:00:00", 1000, 10)

    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "display_name": "Other"},
    )
    assert client.get(f"/api/vehicles/{vehicle['id']}/fuelups").status_code == 404
    assert (
        client.delete(f"/api/vehicles/{vehicle['id']}/fuelups/{fuelup['id']}").status_code == 404
    )


def test_adjustment_bridges_odometer_reset(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    add_fuelup(client, vehicle["id"], "2026-01-01T12:00:00", 1000, 10)
    response = client.post(
        f"/api/vehicles/{vehicle['id']}/adjustments",
        json={"date": "2026-01-05T12:00:00", "old_odometer": 1200, "new_odometer": 10},
    )
    assert response.status_code == 201
    bridged = add_fuelup(client, vehicle["id"], "2026-01-09T12:00:00", 110, 12)
    assert bridged["economy"] == 300 / 12


def test_ev_charges_and_stats(client):
    do_setup(client)
    vehicle = make_vehicle(client, name="EV", energy_type="electric", battery_size=75)

    charge = client.post(
        f"/api/vehicles/{vehicle['id']}/charges",
        json={
            "date": "2026-01-01T20:00:00",
            "odometer": 10000,
            "kwh_added": 50,
            "price_per_kwh": 0.12,
            "charge_type": "home",
            "end_pct": 100,
        },
    ).json()
    assert charge["total_cost"] == 6.0

    second = client.post(
        f"/api/vehicles/{vehicle['id']}/charges",
        json={"date": "2026-01-04T20:00:00", "odometer": 10150, "kwh_added": 45, "total_cost": 5.4},
    ).json()
    assert second["economy"] == 150 / 45

    stats = client.get(f"/api/vehicles/{vehicle['id']}/stats").json()
    assert stats["fuel"] is None
    assert stats["electric"]["lifetime"] == 150 / 45
    assert stats["latest_odometer"] == 10150
    assert stats["entry_count"] == 2


def test_vehicle_stats_and_garage_summary(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    add_fuelup(client, vehicle["id"], "2026-01-01T12:00:00", 1000, 10, total_cost=30.0)
    add_fuelup(client, vehicle["id"], "2026-01-08T12:00:00", 1300, 12, total_cost=42.0)

    stats = client.get(f"/api/vehicles/{vehicle['id']}/stats").json()
    assert stats["fuel"]["lifetime"] == 300 / 12
    assert stats["fuel"]["total_spend"] == 72.0
    assert stats["electric"] is None
    assert stats["latest_odometer"] == 1300

    summary = client.get("/api/vehicles/stats-summary").json()
    assert len(summary) == 1
    assert summary[0]["vehicle_id"] == vehicle["id"]
    assert summary[0]["latest_odometer"] == 1300
    assert summary[0]["avg_economy"] == 300 / 12


def test_phev_gets_blended_cost(client):
    do_setup(client)
    vehicle = make_vehicle(client, name="PHEV", energy_type="plug_in_hybrid")
    add_fuelup(client, vehicle["id"], "2026-01-01T12:00:00", 5000, 8, total_cost=28.0)
    client.post(
        f"/api/vehicles/{vehicle['id']}/charges",
        json={"date": "2026-01-03T20:00:00", "odometer": 5100, "kwh_added": 12, "total_cost": 2.0},
    )
    add_fuelup(client, vehicle["id"], "2026-01-10T12:00:00", 5400, 9, total_cost=31.0)

    stats = client.get(f"/api/vehicles/{vehicle['id']}/stats").json()
    assert stats["fuel"] is not None
    assert stats["electric"] is not None
    assert stats["blended_cost_per_distance"] == (28.0 + 2.0 + 31.0) / 400
