"""Recovery suite (spec §147): the system survives crashes, restarts, provider
timeouts and duplicate executions without corrupting state or double-spending.
"""
from __future__ import annotations

import pytest

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.economics.ledger import Ledger
from aeos.economics.treasury import Treasury, TreasuryError
from aeos.governance import IdentityService
from aeos.runtime import Orchestrator, WorkQueue


@pytest.fixture()
def rec(tmp_path):
    db = Database(tmp_path / "rec.db")   # file DB: survives a "restart"
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    ledger = Ledger(db)
    treasury = Treasury(db, ledger, events, audit, reserve_floor=0.30)
    return {"db": db, "events": events, "audit": audit, "ledger": ledger,
            "treasury": treasury, "path": tmp_path / "rec.db"}


def test_transaction_rollback_on_crash(rec):
    """An exception inside a transaction rolls back fully - no partial money."""
    t, db = rec["treasury"], rec["db"]
    t.deposit("RESERVE", 300_000)
    t.deposit("OPERATING", 700_000)
    with pytest.raises(RuntimeError):
        with db.transaction() as conn:
            conn.execute("UPDATE treasury SET balance_minor = balance_minor + 999"
                         " WHERE bucket='OPERATING'")
            raise RuntimeError("crash mid-transaction")
    assert t.total() == 1_000_000  # the +999 was rolled back


def test_deposit_replay_and_invariant_check(rec):
    """A replayed deposit is two real deposits (idempotency duty is on external
    calls, not on capital injection); the treasury identity still holds."""
    t = rec["treasury"]
    t.deposit("RESERVE", 300_000)
    t.deposit("OPERATING", 100_00)
    t.deposit("OPERATING", 100_00)  # replay
    t.validate()                     # Σclaims(0) == Σearmarks(0)
    assert t.total() == 300_000 + 200_00  # both deposits are real money


def test_migrations_reapply_after_restart(rec):
    """Restarting the process re-applies zero migrations (already tracked)."""
    db = Database(rec["path"])
    assert migrate(db) == []
    db.close()


def test_queue_lease_expiry_lets_survivor_claim_crashed_task(tmp_path):
    """A worker dies holding a lease; after expiry another worker claims it."""
    db = Database(tmp_path / "q.db")
    migrate(db)
    q1 = WorkQueue(db, lease_seconds=1)
    tid = q1.submit("job", {"n": 1})
    task = q1.claim()
    assert task.id == tid
    # worker 1 "crashes" without completing; simulate lease expiry by backdating
    db.execute("UPDATE work_queue SET lease_until=datetime('now', '-1 second') WHERE id=?", (tid,))
    q2 = WorkQueue(db, lease_seconds=60)
    task2 = q2.claim()
    assert task2 is not None and task2.id == tid  # survivor picked it up
    q2.complete(tid)


def test_orchestrator_full_crash_restart_resume(rec):
    """Kill the orchestrator mid-cycle; a fresh process completes the cycle
    from checkpoints without redoing finished phases."""
    db, events, audit = rec["db"], rec["events"], rec["audit"]
    queue = WorkQueue(db)
    estop = EmergencyStop(db, events, audit)
    orch = Orchestrator(db, events, audit, queue, estop)
    calls: list[str] = []
    orch.register_phase("observe", lambda ctx: calls.append("observe") or {})

    def explode(ctx):
        calls.append("experiment")
        raise RuntimeError("worker killed mid-experiment")

    orch.register_phase("experiment", explode)
    cycle_id = orch.submit_cycle()
    with pytest.raises(RuntimeError):
        orch.run_cycle(cycle_id)
    assert calls == ["observe", "experiment"]

    # process restart: new everything, same DB
    db2 = Database(rec["path"])
    migrate(db2)
    orch2 = Orchestrator(db2, EventBus(db2), Audit(db2), WorkQueue(db2),
                         EmergencyStop(db2, EventBus(db2), Audit(db2)))
    orch2.register_phase("observe", lambda ctx: calls.append("observe-again") or {})
    orch2.register_phase("experiment", lambda ctx: calls.append("experiment-2") or {})
    result = orch2.run_cycle(cycle_id)
    assert result["status"] == "COMPLETED"
    assert calls == ["observe", "experiment", "experiment-2"]  # observe not redone


def test_provider_timeout_retries_then_unknown_resolves_via_provider(rec):
    """§68: transient timeouts retry; an ambiguous outcome is never retried -
    the provider is queried, and reconciliation records the truth."""
    from aeos.core.resilience import CircuitBreaker, RetryPolicy, call_with_resilience
    from aeos.reconciliation import ReconciliationEngine

    recon = ReconciliationEngine(rec["db"], rec["events"], rec["audit"])
    breaker = CircuitBreaker(rec["db"], rec["events"], rec["audit"])
    attempts = {"n": 0}

    def provider_submit():
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise TimeoutError("provider timed out after order submit")  # TRANSIENT
        raise RuntimeError("ambiguous outcome: order state indeterminate")  # UNKNOWN

    def resolve_with_provider(exc):
        # §68: query the provider instead of re-executing the order
        recon.record_external("binance", "ord_1", "order", amount_minor=5000)
        return {"order_id": "ord_1", "filled": True, "resolved": True}

    result = call_with_resilience(
        "binance", provider_submit, breaker,
        RetryPolicy(max_attempts=3, base_delay=0.001),
        on_unknown=resolve_with_provider,
    )
    assert result["resolved"] is True
    assert attempts["n"] == 2  # timeout retried once; UNKNOWN never retried
    assert recon.is_confirmed("binance", "ord_1") is False  # PENDING compare, honest


def test_restart_reapplies_migrations_once(rec):
    """A restarted process over the same DB applies no migrations again."""
    db2 = Database(rec["path"])
    assert migrate(db2) == []
    db2.close()


def test_dead_agent_and_burial_survive_restart(rec):
    """Burial + capital release persist; a restarted DB refuses dead-agent spend."""
    from aeos.agents.cemetery import Cemetery
    from aeos.agents.factory import AgentFactory
    from aeos.agents.genome import Genome

    db, t = rec["db"], rec["treasury"]
    t.deposit("RESERVE", 300_000)
    t.deposit("OPERATING", 700_000)
    factory = AgentFactory(db, rec["events"], rec["audit"])
    lc = __import__("aeos.agents.lifecycle", fromlist=["Lifecycle"]).Lifecycle(
        db, rec["events"], rec["audit"])
    cemetery = Cemetery(db, rec["events"], rec["audit"], lc, treasury=t)
    aid = factory.spawn(Genome(identity="doomed", generation=1), 0.5, 1_00, 10_00)
    t.allocate("OPERATING", aid, 50_00, reason="test", authorization="test")
    rec_ = cemetery.bury(aid, failure_category="NO_DEMAND", failure_reason="none")
    assert rec_["capital_released_minor"] == 50_00

    # restart: dead agent still cannot spend
    db2 = Database(rec["path"])
    migrate(db2)
    t2 = Treasury(db2, Ledger(db2), EventBus(db2), Audit(db2))
    from aeos.economics.treasury import TERMINAL_STATES
    state = db2.one("SELECT state FROM agents WHERE id=?", (aid,))["state"]
    assert state in TERMINAL_STATES
    with pytest.raises(TreasuryError):
        t2.allocate("OPERATING", aid, 10_00, reason="post-mortem", authorization="test")
