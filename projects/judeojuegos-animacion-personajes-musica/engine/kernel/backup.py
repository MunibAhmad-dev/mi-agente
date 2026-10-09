"""Backup / verify for the kernel's two stores (audit item: no backup = data risk).

- `create_backup`: consistent SQLite copy via the sqlite3 backup API + every blob
  copied with its sha256 recorded in a manifest.
- `verify_backup`: recompute every manifest hash (DB file and blobs). A backup
  that cannot be verified is a failed backup.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
from pathlib import Path

from engine.logging_conf import get_logger

logger = get_logger("backup")

MANIFEST_NAME = "manifest.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create_backup(db_path: Path, storage_root: Path, out_dir: Path) -> dict:
    db_path = Path(db_path)
    storage_root = Path(storage_root)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    db_out = out_dir / "freebuff.db"
    if db_path.exists():
        src = sqlite3.connect(str(db_path))
        dst = sqlite3.connect(str(db_out))
        try:
            src.backup(dst)  # consistent snapshot, safe while the server is running (WAL)
        finally:
            src.close()
            dst.close()

    blobs_out = out_dir / "blobs"
    blobs_out.mkdir(exist_ok=True)
    entries: list[dict] = []
    blobs_dir = storage_root / "blobs"
    if blobs_dir.exists():
        for blob in sorted(blobs_dir.iterdir()):
            if blob.name.endswith(".tmp"):
                continue
            shutil.copy2(blob, blobs_out / blob.name)
            entries.append({"sha256": blob.name, "size": blob.stat().st_size})

    manifest = {
        "db_sha256": _sha256(db_out) if db_out.exists() else None,
        "blobs": entries,
    }
    (out_dir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    logger.info("backup written to %s (%d blobs)", out_dir, len(entries))
    return {"out_dir": str(out_dir), "blobs": len(entries), "db_backed_up": db_out.exists()}


def verify_backup(out_dir: Path) -> dict:
    out_dir = Path(out_dir)
    manifest = json.loads((out_dir / MANIFEST_NAME).read_text(encoding="utf-8"))
    problems: list[str] = []
    db_out = out_dir / "freebuff.db"
    if manifest.get("db_sha256"):
        if not db_out.exists() or _sha256(db_out) != manifest["db_sha256"]:
            problems.append("db hash mismatch")
    for entry in manifest.get("blobs", []):
        blob = out_dir / "blobs" / entry["sha256"]
        if not blob.exists() or _sha256(blob) != entry["sha256"]:
            problems.append(f"blob {entry['sha256'][:12]}… mismatch")
    return {"ok": not problems, "checked": 1 + len(manifest.get("blobs", [])), "problems": problems}
