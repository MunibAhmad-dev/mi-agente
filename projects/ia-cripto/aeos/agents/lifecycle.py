"""Agent lifecycle (spec §11): persisted state machine.

12 active states + 6 terminal states; transitions validated against the
transition table; every transition is recorded as an event and audited.
Terminal states are final - no escape.
"""
from __future__ import annotations

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus

STATES = (
    "CREATED", "INITIALIZED", "READY", "INCUBATING", "EXPERIMENTING", "ACTIVE",
    "PROMISING", "PROFITABLE", "SCALING", "DECLINING", "UNDER_REVIEW", "RETIRED",
)
TERMINAL = ("FAILED", "KILLED", "BANKRUPT", "EXPIRED", "BLOCKED", "REPLACED")

TRANSITIONS: dict[str, tuple[str, ...]] = {
    "CREATED": ("INITIALIZED",),
    "INITIALIZED": ("READY",),
    "READY": ("INCUBATING", "EXPERIMENTING", "ACTIVE"),
    "INCUBATING": ("EXPERIMENTING", "ACTIVE", "FAILED"),
    "EXPERIMENTING": ("ACTIVE", "PROMISING", "DECLINING", "FAILED", "KILLED"),
    "ACTIVE": ("PROMISING", "DECLINING", "UNDER_REVIEW", "KILLED", "EXPIRED", "REPLACED"),
    "PROMISING": ("PROFITABLE", "DECLINING", "UNDER_REVIEW", "KILLED"),
    "PROFITABLE": ("SCALING", "DECLINING", "UNDER_REVIEW", "RETIRED"),
    "SCALING": ("PROFITABLE", "DECLINING", "UNDER_REVIEW", "RETIRED"),
    "DECLINING": ("UNDER_REVIEW", "KILLED", "RETIRED", "EXPIRED"),
    "UNDER_REVIEW": ("ACTIVE", "KILLED", "RETIRED", "REPLACED"),
    "RETIRED": (),
    "FAILED": (), "KILLED": (), "BANKRUPT": (), "EXPIRED": (), "BLOCKED": (), "REPLACED": (),
}


class InvalidTransition(Exception):
    pass


class Lifecycle:
    def __init__(self, db: Database, events: EventBus, audit: Audit):
        self.db = db
        self.events = events
        self.audit = audit

    def state_of(self, agent_id: str) -> str:
        row = self.db.one("SELECT state FROM agents WHERE id=?", (agent_id,))
        if not row:
            raise KeyError(f"unknown agent {agent_id!r}")
        return row["state"]

    def transition(self, agent_id: str, to_state: str, reason: str = "",
                   authorization=None) -> str:
        if authorization is not None and not isinstance(authorization, str):
            authorization.require("MODIFY_AGENT")
        cur = self.state_of(agent_id)
        if cur in TERMINAL:
            raise InvalidTransition(f"agent {agent_id} is terminal ({cur}); no transitions")
        if to_state not in TRANSITIONS.get(cur, ()):
            raise InvalidTransition(f"illegal transition {cur} -> {to_state}")
        with self.db.transaction() as conn:
            conn.execute(
                "UPDATE agents SET state=?, updated_at=datetime('now') WHERE id=?",
                (to_state, agent_id),
            )
        etype = {
            "KILLED": "AgentKilled", "FAILED": "AgentKilled", "BANKRUPT": "AgentKilled",
            "EXPIRED": "AgentKilled", "BLOCKED": "AgentKilled", "REPLACED": "AgentKilled",
        }.get(to_state, "AgentPromoted" if to_state in ("PROMISING", "PROFITABLE", "SCALING") else "AgentStarted")
        self.events.publish(etype, {"agent_id": agent_id, "from": cur, "to": to_state, "reason": reason})
        self.audit.record("lifecycle", "transition", agent_id, {"from": cur, "to": to_state, "reason": reason})
        return to_state
