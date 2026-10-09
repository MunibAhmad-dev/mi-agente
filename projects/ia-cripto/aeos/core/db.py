"""SQLite connection management (WAL, FK enforcement) - spec §85."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from types import TracebackType


class Database:
    """Thin wrapper over sqlite3 with WAL + FK enforcement.

    Thread-safety (P-7 fix): the underlying connection is created with
    check_same_thread=False so the same instance CAN be used from another
    thread, and busy_timeout is set so concurrent writers wait instead of
    failing with 'database is locked'. SQLite connections are still not safe
    for CONCURRENT use from multiple threads on the same connection object:
    create one Database per thread, or serialize access externally. WAL mode
    allows one writer + many readers across separate instances.
    """

    def __init__(self, path: str | Path = ":memory:"):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(
            self.path, isolation_level=None,  # autocommit; we manage tx
            check_same_thread=False, timeout=5.0,
        )
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA busy_timeout=5000")

    def execute(self, sql: str, params: tuple | dict = ()) -> sqlite3.Cursor:
        return self.conn.execute(sql, params)

    def query(self, sql: str, params: tuple | dict = ()) -> list[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchall()

    def one(self, sql: str, params: tuple | dict = ()) -> sqlite3.Row | None:
        return self.conn.execute(sql, params).fetchone()

    def transaction(self):
        return _Tx(self.conn)

    def close(self) -> None:
        self.conn.close()


class _Tx:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def __enter__(self) -> sqlite3.Connection:
        if not self.conn.in_transaction:
            self.conn.execute("BEGIN IMMEDIATE")
            self._nested = False
        else:
            self._nested = True
        return self.conn

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._nested:
            return
        if exc_type is None:
            self.conn.execute("COMMIT")
        else:
            self.conn.execute("ROLLBACK")
