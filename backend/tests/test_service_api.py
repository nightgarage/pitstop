from datetime import datetime, timedelta, timezone

from .conftest import do_setup


def make_vehicle(client, **overrides) -> dict:
    payload = {"name": "Truck", "energy_type": "gasoline", "odometer_start": 80000}
    payload.update(overrides)
    return client.post("/api/vehicles", json=payload).json()


def add_fuelup(client, vehicle_id, date, odometer, volume=10):
    response = client.post(
        f"/api/vehicles/{vehicle_id}/fuelups",
        json={"date": date, "odometer": odometer, "volume": volume},
    )
    assert response.status_code == 201
    return response.json()


def days_from_now(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


# ---- service records ----

def test_service_record_crud(client):
    do_setup(client)
    vehicle = make_vehicle(client)

    created = client.post(
        f"/api/vehicles/{vehicle['id']}/services",
        json={
            "date": "2026-07-01T10:00:00",
            "odometer": 84000,
            "shop": "Main Street Auto",
            "items": [
                {"service_type": "Oil change", "cost": 89.99},
                {"service_type": "Tire rotation", "cost": 25.00, "parts": "N/A"},
            ],
            "notes": "Synthetic oil",
        },
    )
    assert created.status_code == 201, created.text
    record = created.json()
    assert record["total_cost"] == 114.99  # summed from items
    assert len(record["items"]) == 2

    # explicit total overrides the sum
    patched = client.patch(
        f"/api/vehicles/{vehicle['id']}/services/{record['id']}", json={"total_cost": 120.0}
    ).json()
    assert patched["total_cost"] == 120.0

    # replace items
    patched = client.patch(
        f"/api/vehicles/{vehicle['id']}/services/{record['id']}",
        json={"items": [{"service_type": "Brakes", "cost": 300.0}]},
    ).json()
    assert [i["service_type"] for i in patched["items"]] == ["Brakes"]

    listed = client.get(f"/api/vehicles/{vehicle['id']}/services").json()
    assert len(listed) == 1

    assert (
        client.delete(f"/api/vehicles/{vehicle['id']}/services/{record['id']}").status_code == 204
    )
    assert client.get(f"/api/vehicles/{vehicle['id']}/services").json() == []


def test_diy_record_and_cross_vehicle_list(client):
    do_setup(client)
    truck = make_vehicle(client)
    car = make_vehicle(client, name="Car")
    client.post(
        f"/api/vehicles/{truck['id']}/services",
        json={
            "date": "2026-07-01T10:00:00",
            "is_diy": True,
            "items": [{"service_type": "Air filter", "cost": 24.0}],
        },
    )
    client.post(
        f"/api/vehicles/{car['id']}/services",
        json={"date": "2026-07-10T10:00:00", "items": [{"service_type": "Oil change"}]},
    )
    all_services = client.get("/api/services").json()
    assert len(all_services) == 2
    assert all_services[0]["vehicle_name"] == "Car"  # newest first
    assert all_services[1]["is_diy"] is True
    assert all_services[1]["total_cost"] == 24.0
    assert all_services[0]["total_cost"] is None  # no costs given


def test_service_requires_at_least_one_item(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    response = client.post(
        f"/api/vehicles/{vehicle['id']}/services",
        json={"date": "2026-07-01T10:00:00", "items": []},
    )
    assert response.status_code == 422


# ---- reminders ----

def test_reminder_status_from_latest_odometer(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    add_fuelup(client, vehicle["id"], "2026-07-01T10:00:00", 84600)

    created = client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Oil change", "interval_miles": 5000, "last_done_odometer": 80000},
    )
    assert created.status_code == 201, created.text
    reminder = created.json()
    assert reminder["status"] == "due"  # 85000 due, 400 mi away
    assert reminder["miles_remaining"] == 400
    assert reminder["next_due_odometer"] == 85000


def test_reminder_needs_some_trigger(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    response = client.post(
        f"/api/vehicles/{vehicle['id']}/reminders", json={"name": "Vibes only"}
    )
    assert response.status_code == 422


def test_reminders_sorted_by_urgency(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    add_fuelup(client, vehicle["id"], "2026-07-01T10:00:00", 84000)

    client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Upcoming thing", "interval_miles": 5000, "last_done_odometer": 83000},
    )
    client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Overdue thing", "interval_miles": 3000, "last_done_odometer": 80000},
    )
    client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Due thing", "interval_miles": 4300, "last_done_odometer": 80000},
    )
    names = [r["name"] for r in client.get("/api/reminders").json()]
    assert names == ["Overdue thing", "Due thing", "Upcoming thing"]


def test_complete_recurring_reminder_restarts(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    add_fuelup(client, vehicle["id"], "2026-07-01T10:00:00", 85600)
    reminder = client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Oil change", "interval_miles": 5000, "last_done_odometer": 80000},
    ).json()
    assert reminder["status"] == "overdue"

    done = client.post(
        f"/api/vehicles/{vehicle['id']}/reminders/{reminder['id']}/complete",
        json={"date": "2026-07-17T12:00:00", "odometer": 85600},
    ).json()
    assert done["active"] is True
    assert done["status"] == "upcoming"
    assert done["next_due_odometer"] == 90600


def test_complete_one_off_deactivates(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    reminder = client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Registration", "due_date": days_from_now(10)},
    ).json()
    assert reminder["status"] == "due"

    done = client.post(
        f"/api/vehicles/{vehicle['id']}/reminders/{reminder['id']}/complete",
        json={"date": days_from_now(0)},
    ).json()
    assert done["active"] is False
    assert client.get("/api/reminders").json() == []  # inactive hidden by default


def test_reminders_scoped_to_owner(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    vehicle = make_vehicle(client)
    reminder = client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Oil change", "interval_miles": 5000},
    ).json()

    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "display_name": "Other"},
    )
    assert client.get("/api/reminders").json() == []
    assert (
        client.patch(
            f"/api/vehicles/{vehicle['id']}/reminders/{reminder['id']}", json={"name": "Mine"}
        ).status_code
        == 404
    )


# ---- notifications ----

def test_due_reminder_creates_notification_once(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    add_fuelup(client, vehicle["id"], "2026-07-01T10:00:00", 85600)
    client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Oil change", "interval_miles": 5000, "last_done_odometer": 80000},
    )

    first = client.get("/api/notifications").json()
    assert first["unread_count"] == 1
    assert "Oil change" in first["notifications"][0]["title"]
    assert "overdue" in first["notifications"][0]["title"]

    # reading again must not duplicate
    second = client.get("/api/notifications").json()
    assert len(second["notifications"]) == 1

    # mark read clears the badge
    client.post(f"/api/notifications/{first['notifications'][0]['id']}/read")
    assert client.get("/api/notifications").json()["unread_count"] == 0


PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6260f8cfc0000000030001f43f7dbc0000000049454e44ae426082"
)


def make_service(client, vehicle_id) -> dict:
    return client.post(
        f"/api/vehicles/{vehicle_id}/services",
        json={"date": "2026-07-01T12:00:00", "items": [{"service_type": "Oil change", "cost": 50}]},
    ).json()


def test_attachment_upload_serve_delete(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    record = make_service(client, vehicle["id"])

    uploaded = client.post(
        f"/api/vehicles/{vehicle['id']}/services/{record['id']}/attachments",
        files={"file": ("receipt.png", PNG_BYTES, "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment = uploaded.json()
    assert attachment["filename"] == "receipt.png"
    assert attachment["kind"] == "photo"

    # appears on the record
    records = client.get(f"/api/vehicles/{vehicle['id']}/services").json()
    assert [a["id"] for a in records[0]["attachments"]] == [attachment["id"]]

    # serves the exact bytes back
    served = client.get(f"/api/attachments/{attachment['id']}")
    assert served.status_code == 200
    assert served.content == PNG_BYTES
    assert served.headers["content-type"] == "image/png"

    # delete removes it
    assert client.delete(f"/api/attachments/{attachment['id']}").status_code == 204
    assert client.get(f"/api/attachments/{attachment['id']}").status_code == 404


def test_attachment_type_rejected(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    record = make_service(client, vehicle["id"])
    response = client.post(
        f"/api/vehicles/{vehicle['id']}/services/{record['id']}/attachments",
        files={"file": ("evil.exe", b"MZ...", "application/x-msdownload")},
    )
    assert response.status_code == 415


def test_attachments_scoped_to_owner(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    vehicle = make_vehicle(client)
    record = make_service(client, vehicle["id"])
    attachment = client.post(
        f"/api/vehicles/{vehicle['id']}/services/{record['id']}/attachments",
        files={"file": ("receipt.png", PNG_BYTES, "image/png")},
    ).json()

    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "display_name": "Other"},
    )
    assert client.get(f"/api/attachments/{attachment['id']}").status_code == 404
    assert client.delete(f"/api/attachments/{attachment['id']}").status_code == 404


def test_deleting_record_deletes_attachments(client):
    do_setup(client)
    vehicle = make_vehicle(client)
    record = make_service(client, vehicle["id"])
    attachment = client.post(
        f"/api/vehicles/{vehicle['id']}/services/{record['id']}/attachments",
        files={"file": ("receipt.png", PNG_BYTES, "image/png")},
    ).json()
    client.delete(f"/api/vehicles/{vehicle['id']}/services/{record['id']}")
    assert client.get(f"/api/attachments/{attachment['id']}").status_code == 404


def test_notification_channels_scaffold(client):
    do_setup(client)
    channels = client.put(
        "/api/notifications/channels",
        json=[
            {"kind": "ntfy", "config": {"url": "https://ntfy.sh", "topic": "pitstop"}, "enabled": True},
            {"kind": "webhook", "config": {"url": "https://example.com/hook"}, "enabled": False},
        ],
    )
    assert channels.status_code == 200, channels.text
    listed = client.get("/api/notifications/channels").json()
    assert len(listed) == 2
    assert listed[0]["config"]["topic"] == "pitstop"

    bad = client.put("/api/notifications/channels", json=[{"kind": "carrier-pigeon"}])
    assert bad.status_code == 422
