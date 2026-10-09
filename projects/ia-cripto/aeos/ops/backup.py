"""Backup & restore (spec §115-116).

Backup uses SQLite's VACUUM INTO for a consistent snapshot while the system is
live, then hashes the artifact (sha256). Restore verifies integrity + the audit
hash-chain BEFORE replacing the live database - a corrupted backup is refused.
"""
from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

from aeos.core.audit import Audit
from aeos.core.db import Database


class BackupError(Exception):
    pass


def create_backup(db: Database, target: str | Path) -> dict:
    """Consistent hot backup + sha256. Returns {path, sha256, bytes}."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise BackupError(f"refusing to overwrite existing backup {target}")
    db.conn.execute("VACUUM INTO ?", (str(target),))
    data = target.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    return {"path": str(target), "sha256": digest, "bytes": len(data)}


def verify_backup(path: str | Path, expected_sha256: str) -> None:
    """Verify the artifact hash and its internal integrity + audit chain."""
    path = Path(path)
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise BackupError("backup hash mismatch: artifact corrupted or tampered")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            raise BackupError(f"backup integrity check failed: {result}")
        rows = conn.execute(
            "SELECT actor, action, target, detail_json, prev_hash, hash"
            " FROM audit_log ORDER BY id"
        ).fetchall()
    finally:
        conn.close()
    # re-verify the audit chain inside the backup
    prev = None
    for actor, action, tgt, detail, prev_hash, h in rows:
        blob = f"{prev or ''}|{actor}|{action}|{tgt}|{detail}"
        expected = hashlib.sha256(blob.encode()).hexdigest()
        if h != expected or prev_hash != prev:
            raise BackupError("backup audit chain verification failed")
        prev = h


def restore_backup(path: str | Path, expected_sha256: str, live_path: str | Path) -> dict:
    """Verify the backup, then atomically replace the live database.

    The live DB file (plus WAL/SHM) is moved aside (kept, not deleted) and the
    verified backup takes its place. Callers must stop writers first.
    """
    path, live_path = Path(path), Path(live_path)
    verify_backup(path, expected_sha256)
    if live_path.exists():
        aside = Path(str(live_path) + ".pre-restore")
        if aside.exists():
            aside.unlink()
        live_path.replace(aside)
        for suffix in ("-wal", "-shm"):
            wal = Path(str(live_path) + suffix)
            if wal.exists():
                wal.unlink()
    live_path.write_bytes(path.read_bytes())
    return {"restored_from": str(path), "live": str(live_path),
            "previous_kept_as": str(live_path) + ".pre-restore"}


def open_restored(live_path: str | Path) -> tuple[Database, bool]:
    """Open the restored database and re-verify the audit chain live."""
    db = Database(live_path)
    ok = Audit(db).verify_chain()
    return db, ok
