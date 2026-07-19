import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (or a .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    data_dir: Path = Path("data")
    database_url: str = ""  # empty -> sqlite file inside data_dir
    secret_key: str = ""  # empty -> generated and persisted in data_dir
    allow_registration: bool = False
    base_path: str = ""  # serve under a subpath, e.g. "/pitstop"
    cookie_secure: bool = False  # set true when served over HTTPS
    access_token_expire_days: int = 30
    frontend_dist: Path = Path("frontend/dist")
    seed_demo: bool = False  # create a demo account + garage on first start

    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{self.data_dir / 'pitstop.db'}"

    def resolved_secret_key(self) -> str:
        """Use SECRET_KEY if set; otherwise generate one once and keep it in data_dir."""
        if self.secret_key:
            return self.secret_key
        self.data_dir.mkdir(parents=True, exist_ok=True)
        key_file = self.data_dir / ".secret_key"
        if key_file.exists():
            return key_file.read_text().strip()
        key = secrets.token_urlsafe(48)
        key_file.write_text(key)
        return key


@lru_cache
def get_settings() -> Settings:
    return Settings()
