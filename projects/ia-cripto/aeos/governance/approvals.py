"""Human approval workflow (spec §71): actions at level >= 3 stay PENDING until
an authorized human approves. ESCALATE verdicts from the policy engine land
here instead of executing.
"""
from __future__ import annotations

import json
import uuid

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus


class ApprovalRequired(Exception):
    """Raised (with the approval id) when an action needs human approval."""

    def __init__(self, approval_id: str, action: str):
        self.approval_id = approval_id
        super().__init__(f"action {action!r} requires human approval (id {approval_id})")


class ApprovalService:
    def __init__(self, db: Database, events: EventBus, audit: Audit):
        self.db = db
        self.events = events
        self.audit = audit

    def request(self, action: str, requested_by: str, required_level: int = 3,
                context: dict | None = None) -> str:
        if required_level < 3:
            # levels 0-2 execute with logging only (§71); nothing pending
            return ""
        aid = "apr_" + uuid.uuid4().hex[:12]
        self.db.execute(
            "INSERT INTO approvals (id, action, context_json, required_level, requested_by)"
            " VALUES (?, ?, ?, ?, ?)",
            (aid, action, json.dumps(context or {}, sort_keys=True, default=str),
             required_level, requested_by),
        )
        self.events.publish("PolicyBlocked", {"action": action, "rule": "approval_required",
                                              "approval_id": aid})
        self.audit.record("approvals", "request", aid, {"action": action, "level": required_level})
        return aid

    def approve(self, approval_id: str, ctx) -> None:
        """Approve a pending action; requires APPROVE_ACTIONS permission."""
        ctx.require("APPROVE_ACTIONS")
        row = self.db.one("SELECT * FROM approvals WHERE id=?", (approval_id,))
        if not row:
            raise KeyError(f"unknown approval {approval_id!r}")
        if row["status"] != "PENDING":
            raise ValueError(f"approval {approval_id} already decided ({row['status']})")
        self.db.execute(
            "UPDATE approvals SET status='APPROVED', decided_by=?, decided_at=datetime('now')"
            " WHERE id=?",
            (ctx.principal_id, approval_id),
        )
        self.audit.record("approvals", "approve", approval_id, {"by": ctx.principal_id})

    def deny(self, approval_id: str, ctx) -> None:
        ctx.require("APPROVE_ACTIONS")
        row = self.db.one("SELECT * FROM approvals WHERE id=?", (approval_id,))
        if not row:
            raise KeyError(f"unknown approval {approval_id!r}")
        if row["status"] != "PENDING":
            raise ValueError(f"approval {approval_id} already decided ({row['status']})")
        self.db.execute(
            "UPDATE approvals SET status='DENIED', decided_by=?, decided_at=datetime('now')"
            " WHERE id=?",
            (ctx.principal_id, approval_id),
        )
        self.audit.record("approvals", "deny", approval_id, {"by": ctx.principal_id})

    def require_approved(self, approval_id: str) -> None:
        """Gate: raises ApprovalRequired unless this approval id is APPROVED."""
        row = self.db.one("SELECT status FROM approvals WHERE id=?", (approval_id,))
        if not row or row["status"] != "APPROVED":
            raise ApprovalRequired(approval_id, approval_id)

    def pending(self) -> list[dict]:
        return [dict(r) for r in self.db.query(
            "SELECT * FROM approvals WHERE status='PENDING' ORDER BY created_at"
        )]
