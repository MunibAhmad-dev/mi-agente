"""Phase 4 tests: DB concurrency semantics (P-7) and backup/restore (§115-116).
"""
from __future__ import annotations

import threading

import pytest

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.migrations import migrate
from aeos.ops import BackupError, create_backup, open_restored, restore_backup, verify_backup


def test_cross_thread_query_same_connection():
    """check_same_thread=False allows cross-thread use of one connection
    (serialized); the previous ProgrammingError is gone (P-7)."""
    db = Database(":memory:")
    migrate(db)
    db.execute("CREATE TABLE t (x INTEGER)")
    results = []

    def worker():
        results.append(db.one("SELECT COUNT(*) AS n FROM t")["n"])

    th = threading.Thread(target=worker)
    th.start()
    th.join()
    assert results == [0]


def test_busy_timeout_set():
    db = Database(":memory:")
    assert db.conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000


def test_two_instances_wal_concurrent_writes(tmp_path):
    """Two connections to the same file DB can both write (WAL + busy_timeout)."""
    path = tmp_path / "wal.db"
    db1 = Database(path)
    migrate(db1)
    db2 = Database(path)
    db1.execute("CREATE TABLE IF NOT EXISTS t (x INTEGER)")
    db1.execute("INSERT INTO t VALUES (1)")
    db2.execute("INSERT INTO t VALUES (2)")
    assert db1.one("SELECT COUNT(*) AS n FROM t")["n"] == 2
    db1.close(); db2.close()


def test_backup_restore_roundtrip(tmp_path):
    """Full §116 cycle: backup → destroy → restore → verified resume."""
    live = tmp_path / "live.db"
    db = Database(live)
    migrate(db)
    audit = Audit(db)
    audit.record("test", "op1", "t", {"v": 1})
    audit.record("test", "op2", "t", {"v": 2})

    info = create_backup(db, tmp_path / "backup.db")
    assert info["bytes"] > 0
    verify_backup(info["path"], info["sha256"])  # backup itself is sound
    db.close()

    # catastrophic corruption of the live db
    live.write_bytes(b"corrupted garbage")

    restore_backup(info["path"], info["sha256"], live)
    rdb, chain_ok = open_restored(live)
    assert chain_ok is True
    assert rdb.one("SELECT COUNT(*) AS n FROM audit_log")["n"] == 2
    rdb.close()
    # the corrupted original was kept aside, not deleted (forensics)
    assert (tmp_path / "live.db.pre-restore").exists()


def test_restore_rejects_tampered_backup(tmp_path):
    """A modified backup artifact is refused before touching the live DB."""
    live = tmp_path / "live.db"
    db = Database(live)
    migrate(db)
    Audit(db).record("t", "a", "t", {})
    info = create_backup(db, tmp_path / "b.db")
    db.close()

    # tamper: append junk to the backup
    bp = tmp_path / "b.db"
    bp.write_bytes(bp.read_bytes() + b"junk")

    with pytest.raises(BackupError):
        verify_backup(str(bp), info["sha256"])
    with pytest.raises(BackupError):
        restore_backup(str(bp), info["sha256"], live)
    # live db untouched
    assert Database(live).one("SELECT COUNT(*) AS n FROM audit_log")["n"] == 1
