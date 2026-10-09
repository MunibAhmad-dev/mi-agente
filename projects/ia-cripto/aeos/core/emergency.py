"""Emergency stop (spec §72): a persistent system flag that freezes all
financial and external actions while set. Nothing bypasses it; releasing it is
an audited, permission-gated action.
"""
from __future__ import annotations

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus


class EmergencyStop:
    def __init__(self, db: Database, events: EventBus, audit: Audit):
        self.db = db
        self.events = events
        self.audit = audit

    def is_active(self) -> bool:
        row = self.db.one("SELECT value FROM system_flags WHERE name='emergency_stop'")
        return bool(row and row["value"] == "1")

    def set(self, reason: str) -> None:
        self.db.execute(
            "INSERT INTO system_flags (name, value) VALUES ('emergency_stop', '1')"
            " ON CONFLICT(name) DO UPDATE SET value='1', updated_at=datetime('now')"
        )
        self.events.publish("PolicyBlocked", {"action": "emergency_stop", "reason": reason})
        self.audit.record("system", "emergency_stop_set", "system_flags", {"reason": reason})

    def release(self, ctx) -> None:
        """Releasing requires EMERGENCY_STOP permission and is audited."""
        ctx.require("EMERGENCY_STOP")
        self.db.execute(
            "INSERT INTO system_flags (name, value) VALUES ('emergency_stop', '0')"
            " ON CONFLICT(name) DO UPDATE SET value='0', updated_at=datetime('now')"
        )
        self.audit.record("system", "emergency_stop_released", "system_flags",
                          {"by": ctx.principal_id})
