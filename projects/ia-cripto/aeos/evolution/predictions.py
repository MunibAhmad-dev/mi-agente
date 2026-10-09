"""Prediction Ledger (spec §53): predictions recorded BEFORE outcomes, resolved
afterwards with Brier score; immutable after resolution (trigger-enforced).
"""
from __future__ import annotations

import uuid

from aeos.core.db import Database
from aeos.core.events import EventBus


class AlreadyResolved(Exception):
    pass


class PredictionLedger:
    def __init__(self, db: Database, events: EventBus):
        self.db = db
        self.events = events

    def record(self, claim: str, probability: float, confidence: float,
               agent_id: str | None = None, strategy: str | None = None,
               model: str | None = None) -> str:
        if not 0.0 <= probability <= 1.0:
            raise ValueError("probability must be in [0,1]")
        pid = "prd_" + uuid.uuid4().hex[:12]
        self.db.execute(
            "INSERT INTO predictions (id, claim, probability, confidence, agent_id, strategy, model)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (pid, claim, probability, confidence, agent_id, strategy, model),
        )
        self.events.publish("PredictionCreated", {"prediction_id": pid, "claim": claim,
                                                  "probability": probability})
        return pid

    def resolve(self, prediction_id: str, actual: float) -> dict:
        row = self.db.one("SELECT * FROM predictions WHERE id=?", (prediction_id,))
        if not row:
            raise KeyError(f"unknown prediction {prediction_id!r}")
        if row["resolved_at"] is not None:
            raise AlreadyResolved(f"prediction {prediction_id} already resolved")
        # actual is binary outcome (1.0 happened / 0.0 not) for Brier scoring;
        # continuous actuals are allowed and recorded for directional accuracy.
        brier = (row["probability"] - actual) ** 2
        self.db.execute(
            "UPDATE predictions SET resolved_at=datetime('now'), actual=?, brier=? WHERE id=?",
            (actual, brier, prediction_id),
        )
        self.events.publish("PredictionResolved", {"prediction_id": prediction_id,
                                                   "actual": actual, "brier": brier})
        return {"id": prediction_id, "probability": row["probability"],
                "actual": actual, "brier": round(brier, 6)}

    def calibration(self, agent_id: str | None = None) -> dict:
        """Aggregate calibration: mean Brier (lower is better), resolved count."""
        if agent_id:
            row = self.db.one(
                "SELECT AVG(brier) AS mb, COUNT(*) AS n FROM predictions"
                " WHERE agent_id=? AND resolved_at IS NOT NULL",
                (agent_id,),
            )
        else:
            row = self.db.one(
                "SELECT AVG(brier) AS mb, COUNT(*) AS n FROM predictions WHERE resolved_at IS NOT NULL"
            )
        return {"mean_brier": round(row["mb"], 6) if row["mb"] is not None else None,
                "resolved": int(row["n"])}

    def unresolved(self, limit: int = 100) -> list[dict]:
        return [
            dict(r) for r in self.db.query(
                "SELECT * FROM predictions WHERE resolved_at IS NULL ORDER BY created_at LIMIT ?",
                (limit,),
            )
        ]
