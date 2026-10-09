"""Versioned migrations (spec §117): applied once, tracked, never destructive.

Statements are executed individually (using sqlite3.complete_statement to
handle trigger bodies with internal semicolons) so the whole migration runs
inside a single transaction.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from aeos.core.db import Database

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _statements(sql: str):
    buf = ""
    for line in sql.splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            stmt = buf.strip()
            if stmt:
                yield stmt
            buf = ""
    tail = buf.strip()
    if tail:
        yield tail


def migrate(db: Database, migrations_dir: Path | None = None) -> list[str]:
    """Apply pending migrations in lexicographic order. Returns applied names."""
    mdir = Path(migrations_dir) if migrations_dir else MIGRATIONS_DIR
    db.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " migration TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    applied = {r[0] for r in db.query("SELECT migration FROM schema_migrations")}
    done: list[str] = []
    for path in sorted(mdir.glob("*.sql")):
        name = path.name
        if name in applied:
            continue
        sql = path.read_text(encoding="utf-8")
        with db.transaction() as conn:
            for stmt in _statements(sql):
                conn.execute(stmt)
            conn.execute("INSERT INTO schema_migrations (migration) VALUES (?)", (name,))
        done.append(name)
    return done
