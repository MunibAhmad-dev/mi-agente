"""Runtime tests (spec §63, §66, §72, §118, §133): durable execution that
survives crashes, deduplicates work, and freezes on emergency stop.
"""
from __future__ import annotations

import json

import pytest

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.runtime import Orchestrator, WorkQueue


@pytest.fixture()
def rt():
    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    queue = WorkQueue(db, lease_seconds=60)
    estop = EmergencyStop(db, events, audit)
    orch = Orchestrator(db, events, audit, queue, estop)
    return {"db": db, "events": events, "audit": audit, "queue": queue,
            "estop": estop, "orch": orch}


def test_queue_submit_claim_complete(rt):
    q = rt["queue"]
    tid = q.submit("demo", {"x": 1}, priority=2)
    task = q.claim()
    assert task.id == tid and task.payload == {"x": 1} and task.attempts == 1
    q.complete(tid)
    assert q.claim() is None
    assert q.stats().get("DONE") == 1


def test_queue_priority_order(rt):
    q = rt["queue"]
    q.submit("low", {}, priority=6)
    q.submit("high", {}, priority=1)
    q.submit("mid", {}, priority=3)
    first = q.claim()
    assert first.kind == "high"  # priority 1 = capital protection first


def test_queue_idempotency_key_deduplicates(rt):
    """§66: submitting the same idempotency key twice does not duplicate work."""
    q = rt["queue"]
    t1 = q.submit("cycle", {}, idempotency_key="economic_cycle:cyc_1")
    t2 = q.submit("cycle", {}, idempotency_key="economic_cycle:cyc_1")
    assert t1 == t2
    assert q.claim() is not None
    assert q.claim() is None  # no duplicate task was created


def test_queue_retry_then_dead_letter(rt):
    q = rt["queue"]
    tid = q.submit("flaky", {}, max_attempts=2)
    task = q.claim()
    assert q.fail(task.id, "boom") is True       # attempt 1 of 2 -> retry
    task2 = q.claim()
    assert task2.id == tid and task2.attempts == 2
    assert q.fail(task2.id, "boom again") is False  # exhausted -> DEAD
    assert q.stats().get("DEAD") == 1
    assert any(d["id"] == tid for d in q.dead_letters())


def test_queue_work_queue_rows_cannot_be_deleted(rt):
    q = rt["queue"]
    tid = q.submit("x", {})
    with pytest.raises(Exception):
        rt["db"].execute("DELETE FROM work_queue WHERE id=?", (tid,))


def test_orchestrator_runs_registered_phases_in_order(rt):
    orch = rt["orch"]
    order: list[str] = []
    for name in ("observe", "measure", "evaluate"):
        orch.register_phase(name, lambda ctx, n=name: (order.append(n), {"seen": n})[1])
    cycle_id = orch.submit_cycle()
    result = orch.run_cycle(cycle_id)
    assert result["status"] == "COMPLETED"
    assert order == ["observe", "measure", "evaluate"]
    # unregistered phases are recorded as skipped, never silently lost
    row = rt["db"].one("SELECT context_json FROM workflow_runs WHERE id=?", (f"run_{cycle_id}",))
    skipped = json.loads(row["context_json"])["skipped_phases"]
    assert set(skipped) == {"experiment", "account", "select", "kill", "mutate", "spawn", "allocate"}


def test_orchestrator_resumes_after_crash(rt):
    """§147: a crash mid-cycle resumes from the checkpoint without redoing
    completed phases."""
    orch = rt["orch"]
    calls: list[str] = []

    def crash_on_measure(ctx):
        calls.append("measure")
        raise RuntimeError("simulated crash mid-cycle")

    orch.register_phase("observe", lambda ctx: calls.append("observe") or {})
    orch.register_phase("measure", crash_on_measure)
    cycle_id = orch.submit_cycle()
    with pytest.raises(RuntimeError):
        orch.run_cycle(cycle_id)
    # crash happened after observe was checkpointed
    assert calls == ["observe", "measure"]

    # process "restarts": new orchestrator over the same DB resumes the cycle
    orch2 = Orchestrator(rt["db"], rt["events"], rt["audit"], rt["queue"], rt["estop"])
    orch2.register_phase("observe", lambda ctx: calls.append("observe-again") or {})
    orch2.register_phase("measure", lambda ctx: calls.append("measure-2") or {})
    result = orch2.run_cycle(cycle_id)
    assert result["status"] == "COMPLETED"
    # observe was NOT re-executed (checkpoint), measure was retried once
    assert calls == ["observe", "measure", "measure-2"]


def test_orchestrator_completed_cycle_is_idempotent(rt):
    orch = rt["orch"]
    cycle_id = orch.submit_cycle()
    r1 = orch.run_cycle(cycle_id)
    r2 = orch.run_cycle(cycle_id)
    assert r1["status"] == "COMPLETED"
    assert r2["status"] == "COMPLETED" and r2.get("resumed") is True


def test_emergency_stop_aborts_financial_phases(rt):
    """§72: with EMERGENCY STOP set, financial phases freeze the run."""
    orch, estop = rt["orch"], rt["estop"]
    executed: list[str] = []
    orch.register_phase("observe", lambda ctx: executed.append("observe") or {})
    orch.register_phase("allocate", lambda ctx: executed.append("allocate") or {})
    estop.set("market panic")
    cycle_id = orch.submit_cycle()
    result = orch.run_cycle(cycle_id)
    assert result["status"] == "ABORTED" and result["phase"] == "experiment"
    assert executed == ["observe"]  # observe ran (not financial), experiment blocked
    row = rt["db"].one("SELECT status, phase FROM workflow_runs WHERE id=?", (f"run_{cycle_id}",))
    assert row["status"] == "ABORTED"


def test_worker_tick_executes_queued_cycle(rt):
    orch = rt["orch"]
    calls: list[str] = []
    orch.register_phase("observe", lambda ctx: calls.append("observe") or {})
    orch.submit_cycle("cyc_tick")
    result = orch.tick()
    assert result and result["status"] == "COMPLETED"
    assert calls == ["observe"]
    assert orch.tick() is None  # queue empty


def test_orchestrator_status(rt):
    orch = rt["orch"]
    orch.submit_cycle("cyc_s1")
    orch.run_cycle("cyc_s1")
    st = orch.status()
    assert st["runs"].get("COMPLETED") == 1
