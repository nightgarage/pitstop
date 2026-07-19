from .conftest import do_setup


def make_vehicle(client, **overrides) -> dict:
    payload = {"name": "Tacoma", "energy_type": "gasoline", "year": 2019, "make": "Toyota"}
    payload.update(overrides)
    response = client.post("/api/vehicles", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_vehicles_require_auth(client):
    assert client.get("/api/vehicles").status_code == 401
    assert client.post("/api/vehicles", json={"name": "X", "energy_type": "gasoline"}).status_code == 401


def test_create_and_list(client):
    do_setup(client)
    vehicle = make_vehicle(client, tank_size=21.1, odometer_start=41250)
    assert vehicle["energy_type"] == "gasoline"
    assert vehicle["tank_size"] == 21.1
    assert vehicle["archived"] is False

    vehicles = client.get("/api/vehicles").json()
    assert [v["id"] for v in vehicles] == [vehicle["id"]]


def test_ev_vehicle(client):
    do_setup(client)
    vehicle = make_vehicle(client, name="Model 3", energy_type="electric", battery_size=75)
    assert vehicle["battery_size"] == 75


def test_update_vehicle(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    response = client.patch(
        f"/api/vehicles/{vehicle['id']}", json={"name": "Work Truck", "distance_unit": "km"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Work Truck"
    assert body["distance_unit"] == "km"
    assert body["make"] == "Toyota"  # untouched fields survive


def test_delete_archives_instead_of_deleting(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    response = client.delete(f"/api/vehicles/{vehicle['id']}")
    assert response.status_code == 200
    assert response.json()["archived"] is True

    # hidden from the default list, still fetchable directly
    assert client.get("/api/vehicles").json() == []
    archived = client.get("/api/vehicles?include_archived=true").json()
    assert [v["id"] for v in archived] == [vehicle["id"]]
    assert client.get(f"/api/vehicles/{vehicle['id']}").status_code == 200

    # and it can be un-archived
    restored = client.patch(f"/api/vehicles/{vehicle['id']}", json={"archived": False})
    assert restored.json()["archived"] is False


def test_vehicles_are_scoped_to_owner(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    vehicle = make_vehicle(client)

    # switch to a second account in the same client (cookie is replaced)
    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "display_name": "Other"},
    )
    assert client.get("/api/vehicles").json() == []
    assert client.get(f"/api/vehicles/{vehicle['id']}").status_code == 404
    assert (
        client.patch(f"/api/vehicles/{vehicle['id']}", json={"name": "Mine now"}).status_code == 404
    )
    assert client.delete(f"/api/vehicles/{vehicle['id']}").status_code == 404


def test_validation(client):
    do_setup(client)
    assert client.post("/api/vehicles", json={"name": "", "energy_type": "gasoline"}).status_code == 422
    assert client.post("/api/vehicles", json={"name": "X", "energy_type": "warp"}).status_code == 422
    assert client.post("/api/vehicles", json={"name": "X", "energy_type": "gasoline", "year": 1600}).status_code == 422
