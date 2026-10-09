"""Server entrypoint: `python -m engine.main` (or `python -m engine serve`)."""

from __future__ import annotations

import uvicorn

from engine.config import Settings
from engine.kernel import Kernel
from engine.kernel.api import create_app
from engine.kernel.security import get_or_create_secret
from engine.logging_conf import setup_logging


def build_app(settings: Settings | None = None):
    settings = settings or Settings()
    kernel = Kernel(db_url=settings.db_url, storage_root=settings.storage_path, max_attempts=settings.max_attempts)
    secret = get_or_create_secret(settings.secret_path)
    return create_app(kernel, poll_interval=settings.poll_interval, secret=secret)


def main() -> None:
    settings = Settings()
    setup_logging(settings.log_level)
    app = build_app(settings)
    uvicorn.run(app, host=settings.host, port=settings.port, log_level=settings.log_level.lower())


if __name__ == "__main__":
    main()