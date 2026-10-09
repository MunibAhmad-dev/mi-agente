"""Append-only, hash-chained audit log (spec §114). SQLite triggers block
UPDATE/DELETE; each entry carries the hash of the previous one so tampering is
detectable (§3: real audit).
"""
from __future__ import annotations

import hashlib
import json

from aeos.core.db import Database


def _h(prev: str | None, actor: str, action: str, target: str, detail: str) -> str:
    blob = f"{prev or ''}|{actor}|{action}|{target}|{detail}"
    return hashlib.sha256(blob.encode()).hexdigest()


class Audit:
    def __init__(self, db: Database):
        self.db = db

    def record(self, actor: str, action: str, target: str, detail: dict | None = None) -> str:
        d = json.dumps(detail or {}, sort_keys=True, default=str)
        prev = self.db.one("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")
        prev_hash = prev["hash"] if prev else None
        h = _h(prev_hash, actor, action, target, d)
        self.db.execute(
            "INSERT INTO audit_log (actor, action, target, detail_json, prev_hash, hash)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (actor, action, target, d, prev_hash, h),
        )
        return h

    def verify_chain(self) -> bool:
        """Recompute the chain; returns False if any entry was tampered with."""
        rows = self.db.query("SELECT actor, action, target, detail_json, prev_hash, hash FROM audit_log ORDER BY id")
        prev = None
        for r in rows:
            expected = _h(prev, r["actor"], r["action"], r["target"], r["detail_json"])
            if r["hash"] != expected or r["prev_hash"] != prev:
                return False
            prev = r["hash"]
        return True

    def entries(self, limit: int = 100) -> list[dict]:
        return [
            dict(r) for r in self.db.query(
                "SELECT id, ts, actor, action, target, detail_json FROM audit_log ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        ]
