"""Admin-created accounts: temp password, closed-registration bypass, permissions."""

from .conftest import do_setup


def test_admin_creates_user_with_temp_password(make_client):
    client = make_client()  # registration closed
    do_setup(client)

    response = client.post(
        "/api/admin/users", json={"email": "Friend@Example.com", "display_name": "Friend"}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user"]["email"] == "friend@example.com"
    assert body["user"]["role"] == "user"
    temp_password = body["temp_password"]
    assert len(temp_password) >= 8

    # the temp password works even though registration is closed,
    # and the new account still gets the first-login walkthrough
    client.post("/api/auth/logout")
    login = client.post(
        "/api/auth/login", json={"email": "friend@example.com", "password": temp_password}
    )
    assert login.status_code == 200, login.text
    assert login.json()["onboarding_done"] is False


def test_admin_create_rejects_duplicate_email(make_client):
    client = make_client()
    do_setup(client)
    first = client.post("/api/admin/users", json={"email": "dup@example.com", "display_name": "A"})
    assert first.status_code == 201
    second = client.post("/api/admin/users", json={"email": "DUP@example.com", "display_name": "B"})
    assert second.status_code == 409


def test_non_admin_cannot_create_users(make_client):
    client = make_client()
    do_setup(client)
    created = client.post(
        "/api/admin/users", json={"email": "plain@example.com", "display_name": "Plain"}
    )
    temp_password = created.json()["temp_password"]

    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "plain@example.com", "password": temp_password})
    response = client.post(
        "/api/admin/users", json={"email": "sneaky@example.com", "display_name": "Sneaky"}
    )
    assert response.status_code == 403
