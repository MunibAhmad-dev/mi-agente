"""Domain event bus (spec §64-65): durable, ordered, idempotent inserts.

Events persist to event_log (event sourcing for critical domains) and are
dispatched to in-process subscribers. Dispatch failures never corrupt history:
the row is committed first, delivery is best-effort with error capture.
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Callable, Any

from aeos.core.db import Database

# Canonical event catalog (spec §64)
EVENTS = (
    "AgentCreated", "AgentStarted", "AgentKilled", "AgentPromoted",
    "AgentMutated", "AgentReplicated", "OpportunityDetected", "SignalCreated",
    "ExperimentStarted", "ExperimentCompleted", "PredictionCreated",
    "PredictionResolved", "RevenueRecorded", "ExpenseRecorded",
    "ProfitRecorded", "CapitalRequested", "CapitalAllocated",
    "CapitalReturned", "RiskTriggered", "PolicyBlocked", "StrategyCreated",
    "StrategyMutated", "StrategyPromoted", "DeploymentCreated",
    "DeploymentSucceeded", "DeploymentFailed", "OrderFilled", "SubscriberFailed",
)

Handler = Callable[[str, dict], Any]


class EventBus:
    def __init__(self, db: Database):
        self.db = db
        self._subs: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: Handler) -> None:
        if event_type != "*" and event_type not in EVENTS:
            raise ValueError(f"unknown event type {event_type!r}")
        self._subs[event_type].append(handler)

    def publish(self, event_type: str, payload: dict) -> int:
        if event_type not in EVENTS:
            raise ValueError(f"unknown event type {event_type!r}")
        cur = self.db.execute(
            "INSERT INTO event_log (type, payload_json) VALUES (?, ?)",
            (event_type, json.dumps(payload, sort_keys=True, default=str)),
        )
        event_id = int(cur.lastrowid)
        for h in self._subs.get(event_type, []) + self._subs.get("*", []):
            try:
                h(event_type, payload)
            except Exception as exc:  # subscriber bugs must not break the log
                # (P-13 fix: subscriber failures were miscategorized as PolicyBlocked)
                self.db.execute(
                    "INSERT INTO event_log (type, payload_json) VALUES ('SubscriberFailed', ?)",
                    (json.dumps({"event_type": event_type, "error": str(exc)}, default=str),),
                )
        return event_id

    def history(self, event_type: str | None = None, limit: int = 100) -> list[dict]:
        if event_type:
            rows = self.db.query(
                "SELECT id, ts, type, payload_json FROM event_log WHERE type=? ORDER BY id DESC LIMIT ?",
                (event_type, limit),
            )
        else:
            rows = self.db.query(
                "SELECT id, ts, type, payload_json FROM event_log ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        return [
            {"id": r["id"], "ts": r["ts"], "type": r["type"], "payload": json.loads(r["payload_json"])}
            for r in rows
        ]
