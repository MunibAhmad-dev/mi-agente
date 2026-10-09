"""Lightweight versioned schema migrations.

Alembic was evaluated and rejected for now: it adds a dependency and a CLI
surface the kernel does not need for its single-file deployment. This runner
gives the same guarantees with stdlib + SQLAlchemy:

- migrations live in engine/kernel/migrations.py as ordered (version, sql) pairs
- the applied version is stored in schema_version (created on first run)
- every migration runs inside one transaction; a failure aborts startup loudly
  (never half-migrated — Master Prompt §71 spirit)
- create_all runs FIRST for fresh databases (idempotent), then migrations bring
  older databases forward
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from engine.logging_conf import get_logger

logger = get_logger("db")

# Ordered, append-only. NEVER edit an applied migration — add a new one.
MIGRATIONS: list[tuple[int, str, str]] = [
    # (version, name, sql). Version 1 is the baseline: everything create_all
    # already produces for databases initialised at v0.1+.
    (1, "baseline", ""),
]
LATEST_VERSION = MIGRATIONS[-1][0]


def _table_exists(engine: Engine, name: str) -> bool:
    from sqlalchemy import inspect

    return name in inspect(engine).get_table_names()


def run_migrations(engine: Engine) -> int:
    """Bring the schema to LATEST_VERSION. Returns the final applied version."""
    if not _table_exists(engine, "schema_version"):
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE schema_version (version INTEGER NOT NULL)"))
            applied = 0
            is_fresh = not _table_exists(engine, "jobs")
            conn.execute(text("INSERT INTO schema_version (version) VALUES (:v)"), {"v": LATEST_VERSION if is_fresh else 0})
    with engine.begin() as conn:
        applied = int(conn.execute(text("SELECT version FROM schema_version")).scalar() or 0)
    if applied > LATEST_VERSION:
        raise RuntimeError(
            f"database schema v{applied} is newer than this code (v{LATEST_VERSION}) — refusing to start"
        )
    for version, name, sql in MIGRATIONS:
        if version <= applied:
            continue  # empty-sql entries are markers that still advance the version
        logger.info("applying migration %s: %s", version, name)
        with engine.begin() as conn:
            for statement in sql.split(";"):
                if statement.strip():
                    conn.execute(text(statement))
            conn.execute(text("UPDATE schema_version SET version = :v"), {"v": version})
            applied = version
    return applied
