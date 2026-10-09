"""Runtime configuration.

Environment variables (all optional, prefix UCE_):
  UCE_DB_URL         SQLAlchemy URL for the kernel database (default: sqlite:///<data>/freebuff.db)
  UCE_STORAGE_ROOT   Root directory for the content-addressed asset store (default: <data>/assets)
  UCE_DATA_DIR       Directory for DB, assets, and secrets (default: ./data)
  UCE_SECRET_PATH    File holding the token-signing secret (default: <data>/.secret)
  UCE_HOST / UCE_PORT  API bind address (default 127.0.0.1:8765)
  UCE_MAX_ATTEMPTS   Task retry budget before FAILED (default 2)
  UCE_LOG_LEVEL      DEBUG/INFO/WARNING/ERROR (default INFO)
  UCE_ENABLE_GPU     Hardware acceleration flag — DISABLED (False) by user decision 2026-09-07;
                     the system runs CPU-only until this is intentionally re-enabled.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="UCE_", env_file=".env", extra="ignore")

    data_dir: Path = Path("./data")
    db_url: str = ""  # derived from data_dir unless explicitly set
    storage_root: Path | None = None  # derived from data_dir unless explicitly set
    secret_path: Path | None = None  # derived from data_dir unless explicitly set
    host: str = "127.0.0.1"
    port: int = 8765
    max_attempts: int = 2
    task_timeout_s: float = 600.0  # wall-clock worker budget; override per task via params.timeout_s
    max_parallel: int = 2  # independent tasks dispatched per tick
    poll_interval: float = 0.2
    log_level: str = "INFO"
    enable_gpu: bool = False  # CPU-only for now (user decision 2026-09-07)

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        data = Path(self.data_dir)
        if not self.db_url:
            self.db_url = f"sqlite:///{data / 'freebuff.db'}"
        if self.storage_root is None:
            self.storage_root = data / "assets"
        if self.secret_path is None:
            self.secret_path = data / ".secret"

    @property
    def storage_path(self) -> Path:
        return Path(self.storage_root)