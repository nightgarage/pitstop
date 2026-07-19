from .conftest import do_setup


def register(client, email="other@example.com"):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "display_name": "Other"},
    )


# ---- admin: instance settings override the env default ----

def test_admin_registration_toggle(client):
    do_setup(client)  # admin; env default is ALLOW_REGISTRATION=false

    settings = client.get("/api/admin/settings").json()
    assert settings["allow_registration"] is None
    assert settings["effective_allow_registration"] is False

    # flip it on at runtime — no env change, no restart
    updated = client.put("/api/admin/settings", json={"allow_registration": True}).json()
    assert updated["effective_allow_registration"] is True
    assert client.get("/api/auth/status").json()["allow_registration"] is True
    assert register(client, "new@example.com").status_code == 201

    # clearing the override falls back to the env default
    client.post("/api/auth/login", json={"email": "admin@example.com", "password": "hunter2hunter2"})
    cleared = client.put("/api/admin/settings", json={"allow_registration": None}).json()
    assert cleared["effective_allow_registration"] is False
    assert register(client, "later@example.com").status_code == 403


def test_admin_endpoints_require_admin(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    register(client)  # now logged in as the non-admin user
    assert client.get("/api/admin/users").status_code == 403
    assert client.get("/api/admin/settings").status_code == 403


def test_admin_user_list_and_delete(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    register(client)
    # the new user creates a vehicle with an entry
    vehicle = client.post("/api/vehicles", json={"name": "Car", "energy_type": "gasoline"}).json()
    client.post(
        f"/api/vehicles/{vehicle['id']}/fuelups",
        json={"date": "2026-07-01T12:00:00", "odometer": 1000, "volume": 10},
    )

    client.post("/api/auth/login", json={"email": "admin@example.com", "password": "hunter2hunter2"})
    users = client.get("/api/admin/users").json()
    assert len(users) == 2
    other = next(u for u in users if u["email"] == "other@example.com")
    assert other["vehicle_count"] == 1
    assert other["entry_count"] == 1

    # admins can't delete themselves
    me = next(u for u in users if u["email"] == "admin@example.com")
    assert client.delete(f"/api/admin/users/{me['id']}").status_code == 400

    assert client.delete(f"/api/admin/users/{other['id']}").status_code == 204
    assert len(client.get("/api/admin/users").json()) == 1


# ---- optional logging fields ----

def test_driving_conditions_field(client):
    do_setup(client)
    me = client.patch("/api/auth/me", json={"show_driving_conditions": True}).json()
    assert me["show_driving_conditions"] is True

    vehicle = client.post("/api/vehicles", json={"name": "Car", "energy_type": "gasoline"}).json()
    fuelup = client.post(
        f"/api/vehicles/{vehicle['id']}/fuelups",
        json={
            "date": "2026-07-01T12:00:00",
            "odometer": 1000,
            "volume": 10,
            "driving_conditions": "highway",
        },
    ).json()
    assert fuelup["driving_conditions"] == "highway"

    bad = client.post(
        f"/api/vehicles/{vehicle['id']}/fuelups",
        json={
            "date": "2026-07-02T12:00:00",
            "odometer": 1100,
            "volume": 5,
            "driving_conditions": "spirited",
        },
    )
    assert bad.status_code == 422


# ---- notification delivery ----

def test_channel_delivery_posts(client, monkeypatch):
    import pitstop.notify as notify

    sent = []
    monkeypatch.setattr(notify, "_post", lambda url, data, headers: sent.append((url, data, headers)))
    # run deliveries inline so the test can observe them
    monkeypatch.setattr(
        notify.threading,
        "Thread",
        lambda target, args, daemon: type("T", (), {"start": lambda self: target(*args)})(),
    )

    do_setup(client)
    client.put(
        "/api/notifications/channels",
        json=[
            {"kind": "ntfy", "config": {"topic": "pitstop-test"}, "enabled": True},
            {"kind": "webhook", "config": {"url": "https://example.com/hook"}, "enabled": True},
            {"kind": "gotify", "config": {"url": "https://push.example.com", "token": "t0k"}, "enabled": True},
        ],
    )
    # create an overdue reminder → notification → channel dispatch
    vehicle = client.post(
        "/api/vehicles", json={"name": "Car", "energy_type": "gasoline", "odometer_start": 90000}
    ).json()
    client.post(
        f"/api/vehicles/{vehicle['id']}/reminders",
        json={"name": "Oil change", "interval_miles": 5000, "last_done_odometer": 80000},
    )
    client.get("/api/notifications")

    urls = sorted(url for url, _, _ in sent)
    assert urls == [
        "https://example.com/hook",
        "https://ntfy.sh/pitstop-test",
        "https://push.example.com/message?token=t0k",
    ]


# ---- demo seed ----

def test_demo_seed(make_client, monkeypatch):
    client = make_client()
    from sqlmodel import Session

    from pitstop.db import get_engine
    from pitstop.seed import seed_demo_data

    with Session(get_engine()) as session:
        assert seed_demo_data(session) is True

    login = client.post(
        "/api/auth/login", json={"email": "demo@example.com", "password": "pitstop-demo"}
    )
    assert login.status_code == 200
    vehicles = client.get("/api/vehicles").json()
    assert len(vehicles) == 1
    stats = client.get(f"/api/vehicles/{vehicles[0]['id']}/stats").json()
    assert stats["fuel"]["lifetime"] is not None
    grades = client.get(f"/api/vehicles/{vehicles[0]['id']}/grades").json()
    assert grades["verdict"] is not None

    # seeding is a no-op once anyone exists
    with Session(get_engine()) as session:
        assert seed_demo_data(session) is False
