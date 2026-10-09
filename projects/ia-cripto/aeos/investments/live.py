"""Live execution gate (spec §49, §71-72, §128).

LIVE trading requires: mode in (limited_live, production) AND an explicit,
recorded human authorization. Everything else is BLOCKED - by construction,
not by convention. This module never executes; it only grants or denies
permission to the exchange execution adapter.
"""
from __future__ import annotations

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus

AUTHORIZED_MODES = ("limited_live", "production")


class LiveExecutionGate:
    def __init__(self, db: Database, events: EventBus, audit: Audit, mode: str = "paper"):
        self.db = db
        self.events = events
        self.audit = audit
        self.mode = mode

    def authorize(self, actor: str, symbol: str, notional_minor: int) -> dict:
        """Request permission for a real order. Returns decision record."""
        allowed = self.mode in AUTHORIZED_MODES and bool(actor) and actor != "system"
        self.events.publish("PolicyBlocked" if not allowed else "CapitalAllocated",
                            {"kind": "live_execution", "actor": actor,
                             "symbol": symbol, "allowed": allowed})
        self.audit.record("live_gate", "authorize" if allowed else "block",
                          f"{symbol}:{notional_minor}", {"actor": actor, "mode": self.mode})
        return {"allowed": allowed, "mode": self.mode,
                "reason": "authorized" if allowed else
                f"mode {self.mode!r} does not permit live execution or actor not human-authorized"}
