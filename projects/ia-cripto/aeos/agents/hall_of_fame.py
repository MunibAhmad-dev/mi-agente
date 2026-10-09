"""Hall of Fame (spec §14): permanent record of winners with WHY explanations."""
from __future__ import annotations

import json

from aeos.core.audit import Audit
from aeos.core.db import Database

KINDS = ("agent", "strategy", "mutation", "product", "campaign", "experiment")


class HallOfFame:
    def __init__(self, db: Database, audit: Audit):
        self.db = db
        self.audit = audit

    def induct(self, kind: str, ref_id: str, metrics: dict, why: str) -> int:
        if kind not in KINDS:
            raise ValueError(f"unknown hall-of-fame kind {kind!r}")
        if not why or len(why) < 10:
            raise ValueError("a Hall of Fame entry requires a substantive WHY explanation")
        cur = self.db.execute(
            "INSERT INTO hall_of_fame (kind, ref_id, metrics_json, why) VALUES (?, ?, ?, ?)",
            (kind, ref_id, json.dumps(metrics, sort_keys=True, default=str), why),
        )
        self.audit.record("hall_of_fame", "induct", f"{kind}:{ref_id}", {"why": why})
        return int(cur.lastrowid)

    def top(self, kind: str | None = None, limit: int = 10) -> list[dict]:
        if kind:
            rows = self.db.query(
                "SELECT * FROM hall_of_fame WHERE kind=? ORDER BY inducted_at DESC LIMIT ?",
                (kind, limit),
            )
        else:
            rows = self.db.query("SELECT * FROM hall_of_fame ORDER BY inducted_at DESC LIMIT ?", (limit,))
        out = []
        for r in rows:
            d = dict(r)
            d["metrics"] = json.loads(d.pop("metrics_json"))
            out.append(d)
        return out
