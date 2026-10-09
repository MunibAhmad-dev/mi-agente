"""Decision records (spec §113): verifiable operational summaries of important
decisions - no private chain-of-thought, only facts, options, selection, value,
risk, policy and outcome.
"""
from __future__ import annotations

import json
import uuid

from aeos.core.db import Database


class Decisions:
    def __init__(self, db: Database):
        self.db = db

    def record(
        self,
        selected: str,
        agent_id: str | None = None,
        context: dict | None = None,
        options: list[str] | None = None,
        expected_value: float | None = None,
        risk: float | None = None,
        confidence: float | None = None,
        policy_result: str | None = None,
        authorization: str | None = None,
    ) -> str:
        decision_id = uuid.uuid4().hex[:16]
        self.db.execute(
            "INSERT INTO decisions (id, agent_id, context_json, options_json, selected,"
            " expected_value, risk, confidence, policy_result, authorization)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                decision_id, agent_id,
                json.dumps(context or {}, sort_keys=True, default=str),
                json.dumps(options or [], default=str),
                selected, expected_value, risk, confidence, policy_result, authorization,
            ),
        )
        return decision_id

    def set_outcome(self, decision_id: str, outcome: str) -> None:
        self.db.execute("UPDATE decisions SET outcome=? WHERE id=?", (outcome, decision_id))

    def get(self, decision_id: str) -> dict | None:
        row = self.db.one("SELECT * FROM decisions WHERE id=?", (decision_id,))
        if not row:
            return None
        d = dict(row)
        d["context"] = json.loads(d.pop("context_json"))
        d["options"] = json.loads(d.pop("options_json"))
        return d
