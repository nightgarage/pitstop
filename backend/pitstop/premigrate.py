"""Safe upgrades: back up the database, then apply pending migrations.

Runs on every server start (Docker CMD / systemd ExecStartPre):

    python -m pitstop.premigrate

- SQLite: the database file is copied to DATA_DIR/backups/ first, so even a
  botched migration can't lose data — restore is "copy the file back". The
  last few backups are kept, older ones pruned.
- Alembic migrations are always additive-safe to re-run: upgrading an
  already-current database is a no-op, so restarts are harmless.
"""

import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config

from . import __version__
from .config import get_settings

logger = logging.getLogger(__name__)

KEEP_BACKUPS = 5


def _migrations_dir() -> Path:
    """Find the migrations folder in the layouts we ship (Docker, repo checkout)."""
    candidates = [Path(__file__).resolve().parent.parent, Path.cwd()]
    for candidate in candidates:
        if (candidate / "migrations" / "env.py").is_file():
            return candidate / "migrations"
    raise RuntimeError(
        "Can't find the migrations directory — run from the backend directory "
        "or the packaged app layout"
    )


def backup_sqlite() -> Path | None:
    """Copy the SQLite database aside before touching it. Returns the backup path."""
    settings = get_settings()
    url = settings.resolved_database_url()
    if not url.startswith("sqlite"):
        return None  # Postgres backups are the operator's job (pg_dump)
    db_path = Path(url.removeprefix("sqlite:///"))
    if not db_path.is_file():
        return None

    backups = settings.data_dir / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    target = backups / f"pitstop-{__version__}-{stamp}.db"
    shutil.copy2(db_path, target)

    # prune, oldest first
    existing = sorted(backups.glob("pitstop-*.db"))
    for old in existing[:-KEEP_BACKUPS]:
        old.unlink(missing_ok=True)
    logger.info("backed up database to %s", target)
    return target


def upgrade() -> None:
    config = Config()
    config.set_main_option("script_location", str(_migrations_dir()))
    command.upgrade(config, "head")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    backup_sqlite()
    upgrade()


if __name__ == "__main__":
    main()
