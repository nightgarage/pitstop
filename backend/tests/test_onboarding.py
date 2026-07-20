"""Tests for the first-login walkthrough flag."""

from .conftest import do_setup


def test_new_accounts_start_without_onboarding_done(client):
    user = do_setup(client)
    assert user["onboarding_done"] is False
    status = client.get("/api/auth/status").json()
    assert status["user"]["onboarding_done"] is False


def test_onboarding_flag_can_be_set(client):
    do_setup(client)
    updated = client.patch("/api/auth/me", json={"onboarding_done": True}).json()
    assert updated["onboarding_done"] is True
    # sticks across requests
    assert client.get("/api/auth/me").json()["onboarding_done"] is True


def test_demo_account_never_sees_the_walkthrough(make_client):
    client = make_client()
    from sqlmodel import Session

    from pitstop.db import get_engine
    from pitstop.seed import seed_demo_data

    with Session(get_engine()) as session:
        assert seed_demo_data(session) is True

    client.post(
        "/api/auth/login", json={"email": "demo@example.com", "password": "pitstop-demo"}
    )
    assert client.get("/api/auth/me").json()["onboarding_done"] is True
