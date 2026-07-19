"""Update-safety tests: the migration chain must always be able to build the
current schema from nothing, and must never drift from the models. Together
these make "pull the new version, restart" a safe operation."""

from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine


def _fresh_settings(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", (tmp_path / "data").as_posix())
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-0123456789abcdef0123456789abcdef")
    from pitstop import db
    from pitstop.config import get_settings

    get_settings.cache_clear()
    db.reset_engine()
    return get_settings()


def test_migrations_build_schema_from_scratch_and_match_models(tmp_path, monkeypatch):
    settings = _fresh_settings(tmp_path, monkeypatch)
    from pitstop.premigrate import upgrade

    upgrade()  # empty file -> head, exercising every migration in order

    # the migrated schema must match what the models expect — a model change
    # without a migration fails here before it can ever break an upgrade
    import pitstop.models  # noqa: F401
    from sqlmodel import SQLModel

    engine = create_engine(settings.resolved_database_url())
    with engine.connect() as connection:
        context = MigrationContext.configure(connection)
        diffs = compare_metadata(context, SQLModel.metadata)
    assert diffs == [], f"models drifted from migrations: {diffs}"


def test_upgrade_is_idempotent_and_backs_up_first(tmp_path, monkeypatch):
    _fresh_settings(tmp_path, monkeypatch)
    from pitstop.config import get_settings
    from pitstop.premigrate import backup_sqlite, upgrade

    upgrade()
    # a second upgrade on a current database is a harmless no-op (restart safety)
    upgrade()

    backup = backup_sqlite()
    assert backup is not None and backup.is_file()
    assert backup.parent == Path(get_settings().data_dir) / "backups"
    original = Path(get_settings().resolved_database_url().removeprefix("sqlite:///"))
    assert backup.stat().st_size == original.stat().st_size
