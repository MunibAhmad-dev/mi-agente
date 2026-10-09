"""Autonomous orchestrator (spec §4, §133, §134): the economic loop runs itself.

The loop is a durable workflow: each cycle is a task on the durable queue and
each phase checkpoint is persisted, so a crash at any point resumes without
duplicating external actions (§66 idempotency). Before every phase the
orchestrator consults the EMERGENCY STOP flag (§72) - financial phases freeze
while it is active, and the run is marked ABORTED.
"""
from __future__ import annotations

import json
import uuid
from typing import Callable

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.runtime.queue import WorkQueue

# The economic cycle (§133) as an ordered, idempotent phase list.
# Financial phases are frozen by EMERGENCY STOP; observation phases are not.
PHASES: list[tuple[str, bool]] = [
    ("observe", False),          # world → signals (never blocked)
    ("experiment", True),        # spend capital on experiments
    ("measure", False),          # read real outcomes
    ("account", True),           # settle profit/loss into treasury
    ("evaluate", False),         # fitness over realized outcomes
    ("select", False),           # rank, choose survivors
    ("kill", True),              # bury failures (capital release)
    ("mutate", False),           # strategy DNA mutations
    ("spawn", True),             # create next generation (needs capital)
    ("allocate", True),          # capital reallocation to winners
]


class Orchestrator:
    """Executes the economic loop cycle-by-cycle on the durable queue."""

    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 queue: WorkQueue, estop: EmergencyStop):
        self.db = db
        self.events = events
        self.audit = audit
        self.queue = queue
        self.estop = estop
        self._phase_handlers: dict[str, Callable[[dict], dict]] = {}

    # ---- phase registration ---------------------------------------------
    def register_phase(self, name: str, handler: Callable[[dict], dict]) -> None:
        """Register the domain logic for a phase. Handlers receive the run
        context and return updates to merge into it. Idempotency is expected:
        handlers must tolerate being re-run after a crash (§66)."""
        if name not in dict(PHASES):
            raise ValueError(f"unknown phase {name!r}; expected one of {dict(PHASES).keys()}")
        self._phase_handlers[name] = handler

    # ---- cycle submission -------------------------------------------------
    def submit_cycle(self, cycle_id: str | None = None) -> str:
        """Submit one economic cycle. Idempotent per cycle_id."""
        cycle_id = cycle_id or "cyc_" + uuid.uuid4().hex[:12]
        task_id = self.queue.submit(
            kind="economic_cycle", payload={"cycle_id": cycle_id},
            priority=2, idempotency_key=f"economic_cycle:{cycle_id}",
        )
        self.audit.record("orchestrator", "submit_cycle", cycle_id, {"task_id": task_id})
        return cycle_id

    # ---- execution ---------------------------------------------------------
    def run_cycle(self, cycle_id: str, initial_ctx: dict | None = None) -> dict:
        """Execute (or resume) one economic cycle phase-by-phase.

        initial_ctx seeds the checkpoint context (e.g. the runtime's cycle
        budget) on first run; on resume it is ignored - the checkpoint wins.
        The returned dict includes the final context (phases_done, skipped,
        and whatever handlers produced).
        """
        run_id = f"run_{cycle_id}"
        row = self.db.one("SELECT * FROM workflow_runs WHERE id=?", (run_id,))
        if row and row["status"] in ("COMPLETED", "ABORTED"):
            final = json.loads(row["context_json"] or "{}")
            return {"run_id": run_id, "status": row["status"], "resumed": True,
                    **{"killed": final.get("killed", []),
                       "allocated": final.get("allocated", []),
                       "phases": final.get("phases_done", [])}}

        if not row:
            self.db.execute(
                "INSERT INTO workflow_runs (id, workflow, phase, context_json)"
                " VALUES (?, 'economic_loop', 'observe', '{}')",
                (run_id,),
            )
        ctx = json.loads(self.db.one(
            "SELECT context_json FROM workflow_runs WHERE id=?", (run_id,)
        )["context_json"] or "{}")
        if initial_ctx:
            ctx.update(initial_ctx)
        done = set(ctx.get("phases_done", []))

        for phase, financial in PHASES:
            if phase in done:
                continue
            if self.estop.is_active() and financial:
                self.db.execute(
                    "UPDATE workflow_runs SET status='ABORTED', phase=?, context_json=?,"
                    " updated_at=datetime('now') WHERE id=?",
                    (phase, json.dumps(ctx, default=str), run_id),
                )
                self.events.publish("PolicyBlocked", {
                    "action": "economic_cycle", "rule": "emergency_stop",
                    "run_id": run_id, "phase": phase})
                self.audit.record("orchestrator", "aborted_emergency_stop", run_id,
                                  {"phase": phase})
                return {"run_id": run_id, "status": "ABORTED", "phase": phase,
                        "reason": "EMERGENCY STOP active"}

            handler = self._phase_handlers.get(phase)
            if handler is None:
                # phase not wired yet: record and continue (observable, not silent)
                ctx.setdefault("skipped_phases", []).append(phase)
                self._checkpoint(run_id, phase, ctx)
                continue
            updates = handler(ctx) or {}
            ctx.update(updates)
            ctx.setdefault("phases_done", []).append(phase)
            self._checkpoint(run_id, phase, ctx)

        self.db.execute(
            "UPDATE workflow_runs SET status='COMPLETED', phase='done', context_json=?,"
            " updated_at=datetime('now') WHERE id=?",
            (json.dumps(ctx, default=str), run_id),
        )
        self.audit.record("orchestrator", "cycle_completed", run_id, {})
        return {"run_id": run_id, "status": "COMPLETED",
                "phases": ctx.get("phases_done", []),
                "killed": ctx.get("killed", []),
                "allocated": ctx.get("allocated", []),
                "settled": ctx.get("settled", []),
                "mutations": ctx.get("mutations", []),
                "fitness": ctx.get("fitness", {}),
                "ranked": ctx.get("ranked", []),
                "budget": ctx.get("_budget", {})}

    def _checkpoint(self, run_id: str, phase: str, ctx: dict) -> None:
        self.db.execute(
            "UPDATE workflow_runs SET phase=?, context_json=?, updated_at=datetime('now')"
            " WHERE id=?",
            (phase, json.dumps(ctx, default=str), run_id),
        )

    # ---- worker integration --------------------------------------------------
    def tick(self) -> dict | None:
        """Claim and execute one queued cycle (called by the worker loop)."""
        task = self.queue.claim(kinds=["economic_cycle"])
        if task is None:
            return None
        try:
            result = self.run_cycle(task.payload["cycle_id"])
            self.queue.complete(task.id)
            return result
        except Exception as exc:
            will_retry = self.queue.fail(task.id, str(exc))
            self.audit.record("orchestrator", "cycle_failed", task.payload.get("cycle_id", "?"),
                              {"error": str(exc)[:500], "will_retry": will_retry})
            return {"status": "FAILED", "error": str(exc), "will_retry": will_retry}

    def status(self) -> dict:
        runs = self.db.query(
            "SELECT status, COUNT(*) AS n FROM workflow_runs GROUP BY status"
        )
        return {"runs": {r["status"]: r["n"] for r in runs}, "queue": self.queue.stats()}
