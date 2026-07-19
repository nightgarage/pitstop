from .conftest import ADMIN, do_setup


def test_fresh_instance_requires_setup(client):
    status = client.get("/api/auth/status").json()
    assert status == {"setup_required": True, "allow_registration": False, "user": None}


def test_setup_creates_admin_and_logs_in(client):
    user = do_setup(client)
    assert user["role"] == "admin"
    assert user["email"] == ADMIN["email"]

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == user["id"]

    status = client.get("/api/auth/status").json()
    assert status["setup_required"] is False
    assert status["user"]["id"] == user["id"]


def test_setup_only_works_once(client):
    do_setup(client)
    again = client.post(
        "/api/auth/setup",
        json={"email": "sneaky@example.com", "password": "password123", "display_name": "Sneaky"},
    )
    assert again.status_code == 403


def test_login_and_logout(client):
    do_setup(client)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401

    bad = client.post(
        "/api/auth/login", json={"email": ADMIN["email"], "password": "wrong-password"}
    )
    assert bad.status_code == 401

    good = client.post(
        "/api/auth/login", json={"email": ADMIN["email"], "password": ADMIN["password"]}
    )
    assert good.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_email_is_case_insensitive(client):
    do_setup(client)
    client.post("/api/auth/logout")
    response = client.post(
        "/api/auth/login", json={"email": "ADMIN@Example.COM", "password": ADMIN["password"]}
    )
    assert response.status_code == 200


def test_registration_disabled_by_default(client):
    do_setup(client)
    response = client.post(
        "/api/auth/register",
        json={"email": "new@example.com", "password": "password123", "display_name": "New"},
    )
    assert response.status_code == 403


def test_registration_when_enabled(make_client):
    client = make_client(allow_registration=True)
    do_setup(client)
    response = client.post(
        "/api/auth/register",
        json={"email": "new@example.com", "password": "password123", "display_name": "New"},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "user"

    duplicate = client.post(
        "/api/auth/register",
        json={"email": "New@Example.com", "password": "password123", "display_name": "Dup"},
    )
    assert duplicate.status_code == 409


def test_register_before_setup_is_rejected(make_client):
    client = make_client(allow_registration=True)
    response = client.post(
        "/api/auth/register",
        json={"email": "new@example.com", "password": "password123", "display_name": "New"},
    )
    assert response.status_code == 403


def test_short_password_rejected(client):
    response = client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "password": "short", "display_name": "A"},
    )
    assert response.status_code == 422


def test_update_preferences(client):
    do_setup(client)
    response = client.patch(
        "/api/auth/me", json={"distance_unit": "km", "volume_unit": "l", "currency": "EUR"}
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["distance_unit"], body["volume_unit"], body["currency"]) == ("km", "l", "EUR")


def test_change_password(client):
    do_setup(client)
    wrong = client.post(
        "/api/auth/change-password",
        json={"current_password": "nope", "new_password": "newpassword123"},
    )
    assert wrong.status_code == 401

    ok = client.post(
        "/api/auth/change-password",
        json={"current_password": ADMIN["password"], "new_password": "newpassword123"},
    )
    assert ok.status_code == 204

    client.post("/api/auth/logout")
    login = client.post(
        "/api/auth/login", json={"email": ADMIN["email"], "password": "newpassword123"}
    )
    assert login.status_code == 200
