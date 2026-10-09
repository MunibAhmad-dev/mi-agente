"""Agent Cemetery (spec §13, §135): dead agents are never deleted.

DeathRecord preserves genome version, strategy DNA, capital in/spent, revenue,
profit, experiments, customers, failure category/reason, lessons and unknowns.
The agents row state becomes terminal; the record itself is append-only.
"""
from __future__ import annotations

import json

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.agents.lifecycle import TERMINAL, Lifecycle

FAILURE_CATEGORIES = (
    "NO_DEMAND", "BAD_PRICING", "HIGH_CAC", "LOW_RETENTION", "COMPETITION",
    "BAD_CHANNEL", "BAD_PRODUCT", "TECHNICAL", "EXECUTION", "MODEL",
    "RESOURCE", "TIMING", "RISK", "POLICY", "REGULATORY", "UNKNOWN",
)

_TERMINAL_STATE_FOR = {
    "NO_DEMAND": "FAILED", "BAD_PRICING": "FAILED", "HIGH_CAC": "FAILED",
    "LOW_RETENTION": "FAILED", "COMPETITION": "FAILED", "BAD_CHANNEL": "FAILED",
    "BAD_PRODUCT": "FAILED", "TECHNICAL": "FAILED", "EXECUTION": "FAILED",
    "MODEL": "FAILED", "RESOURCE": "FAILED", "TIMING": "FAILED",
    "RISK": "KILLED", "POLICY": "BLOCKED", "REGULATORY": "BLOCKED",
    "UNKNOWN": "KILLED",
}


class Cemetery:
    def __init__(self, db: Database, events: EventBus, audit: Audit, lifecycle: Lifecycle,
                 treasury=None):
        self.db = db
        self.events = events
        self.audit = audit
        self.lifecycle = lifecycle
        self.treasury = treasury  # optional; enables capital release on burial

    def bury(self, agent_id: str, failure_category: str, failure_reason: str,
             lessons: list[str] | None = None, unknowns: list[str] | None = None,
             experiments: int = 0, customers: int = 0) -> dict:
        if failure_category not in FAILURE_CATEGORIES:
            raise ValueError(f"unknown failure category {failure_category!r}")
        agent = self.db.one("SELECT * FROM agents WHERE id=?", (agent_id,))
        if not agent:
            raise KeyError(f"unknown agent {agent_id!r}")
        if self.db.one("SELECT 1 FROM cemetery WHERE agent_id=?", (agent_id,)):
            raise ValueError(f"agent {agent_id} already buried")
        eco = self.db.one("SELECT * FROM agent_economics WHERE agent_id=?", (agent_id,))
        dna = self.db.one(
            "SELECT traits_json FROM strategy_dna WHERE agent_id=? ORDER BY version DESC LIMIT 1",
            (agent_id,),
        )
        capital_in = eco["allocated_minor"] if eco else 0
        capital_spent = (eco["expenses_minor"] if eco else 0)
        revenue = eco["revenue_minor"] if eco else 0
        profit = revenue - capital_spent
        terminal_state = _TERMINAL_STATE_FOR.get(failure_category, "KILLED")

        with self.db.transaction() as conn:
            conn.execute(
                """INSERT INTO cemetery (agent_id, generation, parent_id, genome_version,
                    strategy_dna, capital_in_minor, capital_spent_minor, revenue_minor,
                    profit_minor, experiments, customers, failure_category, failure_reason,
                    lessons, unknowns)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    agent_id, agent["generation"], agent["parent_id"], agent["genome_version"],
                    dna["traits_json"] if dna else "{}",
                    capital_in, min(capital_spent, capital_in), revenue, profit,
                    experiments, customers, failure_category, failure_reason,
                    json.dumps(lessons or []), json.dumps(unknowns or []),
                ),
            )
            conn.execute(
                "UPDATE agents SET state=?, updated_at=datetime('now') WHERE id=?",
                (terminal_state, agent_id),
            )
        # §13: death freezes the agent but must NOT freeze its unspent capital.
        # Probe F2: allocated bucket stayed frozen after death. Release whatever
        # cash the agent still holds back to the treasury (bucket inferred from
        # ledger; falls back to EXPERIMENT then OPERATING).
        # dead agents can never spend again (§145: dead_agent_spend == 0)
        self.events.publish("AgentKilled", {"agent_id": agent_id, "failure_category": failure_category,
                                            "reason": failure_reason})
        self.audit.record("cemetery", "bury", agent_id,
                          {"failure_category": failure_category, "terminal_state": terminal_state})
        released = self._release_unused_capital(agent_id)
        return {**dict(self.db.one("SELECT * FROM cemetery WHERE agent_id=?", (agent_id,))),
                "capital_released_minor": released}

    def _release_unused_capital(self, agent_id: str) -> int:
        """Return the agent's unspent cash to the treasury bucket it was drawn
        from (probe F2 fix). Dead agents hold no capital (§145)."""
        if self.treasury is None:
            return 0
        eco = self.db.one("SELECT cash_minor, allocated_minor FROM agent_economics WHERE agent_id=?",
                          (agent_id,))
        if not eco or eco["cash_minor"] <= 0:
            return 0
        amount = eco["cash_minor"]
        bucket = self._origin_bucket(agent_id) or "EXPERIMENT"
        try:
            self.treasury.return_capital(bucket, agent_id, amount,
                                         reason="burial: release unspent allocated capital")
        except Exception as exc:
            # Never silently swallow: surface it on the death event stream.
            self.events.publish("RiskTriggered", {
                "kind": "burial_capital_release_failed", "agent_id": agent_id,
                "bucket": bucket, "amount_minor": amount, "reason": str(exc)})
            return 0
        self.audit.record("cemetery", "capital_released", agent_id,
                          {"bucket": bucket, "amount_minor": amount})
        return amount

    def _origin_bucket(self, agent_id: str) -> str | None:
        row = self.db.one(
            "SELECT source FROM ledger_entries WHERE destination=? AND category='capital_allocation'"
            " ORDER BY tx_id DESC LIMIT 1",
            (f"agent:{agent_id}",),
        )
        if row and row["source"].startswith("treasury:"):
            return row["source"].split(":", 1)[1]
        return None

    def record(self, agent_id: str) -> dict | None:
        row = self.db.one("SELECT * FROM cemetery WHERE agent_id=?", (agent_id,))
        return dict(row) if row else None

    def lessons_for(self, failure_category: str) -> list[str]:
        rows = self.db.query(
            "SELECT lessons FROM cemetery WHERE failure_category=?", (failure_category,)
        )
        out: list[str] = []
        for r in rows:
            out.extend(json.loads(r["lessons"]))
        return out
