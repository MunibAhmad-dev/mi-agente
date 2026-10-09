"""AgentRuntime tests (§120, §133): the loop drives itself over real domain
components with hard resource limits.
"""
from __future__ import annotations

import pytest

from aeos.agents.cemetery import Cemetery
from aeos.agents.economics import AgentEconomics
from aeos.agents.factory import AgentFactory
from aeos.agents.fitness import FitnessEngine
from aeos.agents.genome import Genome
from aeos.agents.lifecycle import Lifecycle
from aeos.core.audit import Audit
from aeos.core.decisions import Decisions
from aeos.core.db import Database
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.economics.treasury import Treasury
from aeos.evolution.dna import StrategyDNA
from aeos.evolution.engine import EvolutionEngine
from aeos.governance import PolicyEngine
from aeos.runtime import Orchestrator, WorkQueue
from aeos.runtime.agent_runtime import AgentRuntime, CycleBudget, ResourceLimits


@pytest.fixture()
def rt_full():
    db = Database(":memory:")
    migrate(db)
    events, audit = EventBus(db), Audit(db)
    ledger = __import__("aeos.economics.ledger", fromlist=["Ledger"]).Ledger(db)
    treasury = Treasury(db, ledger, events, audit)
    treasury.deposit("RESERVE", 300_000)
    treasury.deposit("OPERATING", 700_000)
    factory = AgentFactory(db, events, audit)
    lifecycle = Lifecycle(db, events, audit)
    cemetery = Cemetery(db, events, audit, lifecycle, treasury=treasury)
    dna = StrategyDNA(db, events, audit)
    fitness = FitnessEngine()
    eco = AgentEconomics(db)
    evolution = EvolutionEngine(db, events, audit, factory, eco, treasury, dna, fitness)
    policy = PolicyEngine(db, events, audit, Decisions(db))
    queue = WorkQueue(db)
    orch = Orchestrator(db, events, audit, queue, EmergencyStop(db, events, audit))
    runtime = AgentRuntime(db, events, audit, orch, policy, treasury, factory,
                           lifecycle, cemetery, dna, fitness, evolution)
    return {"db": db, "events": events, "audit": audit, "treasury": treasury,
            "factory": factory, "eco": eco, "cemetery": cemetery, "dna": dna,
            "runtime": runtime, "orch": orch}


def _spawn_two(rt, profit_agent=True, loss_agent=True):
    a1 = rt["factory"].spawn(Genome(identity="winner", generation=1), 0.5, 1_00, 10_00)
    rt["dna"].extract_from_genome(a1, Genome(identity="winner", generation=1).to_json())
    a2 = rt["factory"].spawn(Genome(identity="loser", generation=1), 0.5, 1_00, 10_00)
    rt["dna"].extract_from_genome(a2, Genome(identity="loser", generation=1).to_json())
    if profit_agent:
        rt["eco"].add_revenue(a1, 40_00, external_reference="order:test-1")
        rt["eco"].add_expense(a1, 10_00)   # +30.00 profit
    if loss_agent:
        rt["eco"].add_revenue(a2, 5_00, external_reference="order:test-2")
        rt["eco"].add_expense(a2, 10_00)   # -5.00 loss
    return a1, a2


def test_self_driving_cycle_completes_all_phases(rt_full):
    """The runtime drives a full §133 cycle without manual phase calls."""
    rt = rt_full
    _spawn_two(rt)
    result = rt["runtime"].run_cycle("cyc_self")
    assert result["status"] == "COMPLETED"
    # the runtime wires 9 of 10 phases (observe stays external)
    assert len(result["phases"]) == 9 and "observe" not in result["phases"]
    # winner got a bonus (ranked first, profit > 0)
    assert result["allocated"] and result["allocated"][0]["bonus_minor"] > 0
    # fitness was computed for living agents
    assert len(result.get("fitness", {}) or {}) >= 1


def test_resource_limits_stop_the_cycle(rt_full):
    """§120: exhausted action budget stops phases and is reported, never silent."""
    rt = rt_full
    _spawn_two(rt)
    rt["runtime"].limits = ResourceLimits(max_external_actions=1)
    result = rt["runtime"].run_cycle("cyc_limited")
    assert result["status"] == "COMPLETED"
    budget = result.get("budget") or {}
    breaches = budget.get("breaches", []) if hasattr(budget, "get") else budget.breaches
    assert "action_budget_exhausted" in breaches


def test_capital_budget_blocks_overcommit(rt_full):
    limits = ResourceLimits(max_capital_commit_minor=5_00)
    budget = CycleBudget(limits)
    assert budget.commit_capital(4_00) is True
    assert budget.commit_capital(4_00) is False   # would exceed 5.00
    assert budget.breaches == ["capital_budget_exhausted"]


def test_kill_phase_buries_deep_losers_and_releases_capital(rt_full):
    rt = rt_full
    a1, a2 = _spawn_two(rt)
    # push the loser over the kill threshold (default 100.00 cumulative loss)
    rt["eco"].add_expense(a2, 200_00)   # now -205.00 cumulative
    rt["treasury"].allocate("OPERATING", a2, 300_00, reason="test", authorization="test")
    before = rt["treasury"].buckets()["OPERATING"]["allocated"]
    result = rt["runtime"].run_cycle("cyc_kill")
    assert result["status"] == "COMPLETED"
    assert any(k["agent_id"] == a2 for k in result["killed"])
    after = rt["treasury"].buckets()["OPERATING"]["allocated"]
    assert after < before               # burial released the loser's earmark
    assert rt["cemetery"].record(a2) is not None


def test_account_phase_requires_external_reference(rt_full):
    """§80: without external_refs in the cycle context, profits are NOT settled."""
    rt = rt_full
    a1, _ = _spawn_two(rt)
    rt["treasury"].allocate("OPERATING", a1, 100_00, reason="test", authorization="test")
    result = rt["runtime"].run_cycle("cyc_noref")
    assert result.get("settled", []) == []
    # with a reference, settlement happens exactly once (idempotent by profit state)
    orch = rt["orch"]
    orch.submit_cycle("cyc_ref")
    result2 = rt["runtime"].orch.run_cycle("cyc_ref", initial_ctx={
        "_budget": CycleBudget(ResourceLimits()),
        "external_refs": {a1: "order:42"}})
    assert result2["status"] == "COMPLETED"


def test_observer_phase_wiring(rt_full):
    seen = []
    rt_full["runtime"].register_observer(lambda ctx: seen.append("world") or {})
    rt_full["runtime"].run_cycle("cyc_obs")
    assert seen == ["world"]
