from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def make_client(tmp_path, monkeypatch) -> Callable[..., TestClient]:
    """Build a TestClient against a fresh SQLite database in tmp_path."""
    created: list[TestClient] = []

    def _make(allow_registration: bool = False) -> TestClient:
        monkeypatch.setenv("DATA_DIR", (tmp_path / "data").as_posix())
        monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
        monkeypatch.setenv("SECRET_KEY", "test-secret-key-0123456789abcdef0123456789abcdef")
        monkeypatch.setenv("ALLOW_REGISTRATION", "true" if allow_registration else "false")

        from sqlmodel import SQLModel

        import pitstop.models  # noqa: F401  (register tables on the metadata)
        from pitstop import db
        from pitstop.config import get_settings
        from pitstop.main import create_app

        get_settings.cache_clear()
        db.reset_engine()
        SQLModel.metadata.create_all(db.get_engine())
        client = TestClient(create_app())
        created.append(client)
        return client

    yield _make

    from pitstop import db
    from pitstop.config import get_settings

    for client in created:
        client.close()
    db.reset_engine()
    get_settings.cache_clear()


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


ADMIN = {"email": "admin@example.com", "password": "hunter2hunter2", "display_name": "Admin"}


def do_setup(client: TestClient) -> dict:
    response = client.post("/api/auth/setup", json=ADMIN)
    assert response.status_code == 201, response.text
    return response.json()
