"""Agent lifecycle / spawn control / cemetery tests (spec §11-13, §119, §135)."""
from __future__ import annotations

import pytest

from aeos.agents.cemetery import Cemetery
from aeos.agents.factory import SpawnDenied
from aeos.agents.genome import Genome
from aeos.agents.lifecycle import InvalidTransition


def test_spawn_creates_agent_and_genome_version(system, genome):
    f = system["factory"]
    aid = f.spawn(genome, expected_information_gain=0.5,
                  compute_cost_minor=1_00, capital_cost_minor=10_00)
    a = f.get(aid)
    assert a["state"] == "CREATED"
    version, g = system["factory"].genomes.latest(aid)
    assert version == 1 and g.identity == "test-agent"


def test_spawn_control_rejects_low_information_gain(system, genome):
    with pytest.raises(SpawnDenied):
        system["factory"].spawn(genome, expected_information_gain=0.0,
                                compute_cost_minor=1_00, capital_cost_minor=10_00)


def test_spawn_control_rejects_population_overflow(system, genome):
    f = system["factory"]
    f.max_population = 2
    f.spawn(genome, 0.5, 1_00, 10_00)
    g2 = Genome(identity="test-agent-2", generation=1)
    f.spawn(g2, 0.5, 1_00, 10_00)
    g3 = Genome(identity="test-agent-3", generation=1)
    with pytest.raises(SpawnDenied):
        f.spawn(g3, 0.5, 1_00, 10_00)


def test_lifecycle_happy_path(system, genome):
    f, lc = system["factory"], system["lifecycle"]
    aid = f.spawn(genome, 0.5, 1_00, 10_00)
    lc.transition(aid, "INITIALIZED")
    lc.transition(aid, "READY")
    lc.transition(aid, "EXPERIMENTING")
    lc.transition(aid, "ACTIVE")
    lc.transition(aid, "PROMISING")
    assert lc.state_of(aid) == "PROMISING"


def test_lifecycle_rejects_illegal_jump(system, genome):
    f, lc = system["factory"], system["lifecycle"]
    aid = f.spawn(genome, 0.5, 1_00, 10_00)
    with pytest.raises(InvalidTransition):
        lc.transition(aid, "SCALING")  # CREATED -> SCALING is illegal


def test_terminal_is_final(system, genome):
    f, lc = system["factory"], system["lifecycle"]
    aid = f.spawn(genome, 0.5, 1_00, 10_00)
    lc.transition(aid, "INITIALIZED")
    lc.transition(aid, "READY")
    lc.transition(aid, "INCUBATING")
    # force terminal via lifecycle illegal path is prevented; use cemetery kill:
    system["cemetery"] = Cemetery(system["db"], system["events"], system["audit"], lc)
    system["cemetery"].bury(aid, failure_category="TECHNICAL", failure_reason="test crash")
    with pytest.raises(InvalidTransition):
        lc.transition(aid, "ACTIVE")


def test_bury_writes_death_record_and_terminal_state(system, genome):
    f, lc = system["factory"], system["lifecycle"]
    cemetery = Cemetery(system["db"], system["events"], system["audit"], lc)
    aid = f.spawn(genome, 0.5, 1_00, 10_00)
    rec = cemetery.bury(aid, failure_category="NO_DEMAND",
                        failure_reason="no signups in experiment",
                        lessons=["landing page message did not resonate"],
                        unknowns=["price sensitivity"])
    assert rec["failure_category"] == "NO_DEMAND"
    assert lc.state_of(aid) == "FAILED"
    # double burial forbidden
    with pytest.raises(ValueError):
        cemetery.bury(aid, "TECHNICAL", "again")
    assert cemetery.lessons_for("NO_DEMAND") == ["landing page message did not resonate"]


def test_agent_economics_derivations(system, genome, seeded_treasury):
    f, eco = system["factory"], system["eco"]
    aid = f.spawn(genome, 0.5, 1_00, 10_00)
    seeded_treasury.allocate("OPERATING", aid, 100_00, reason="test", authorization="test")
    with pytest.raises(ValueError):
        eco.add_revenue(aid, 30_00)  # §80: no synthetic revenue without opt-in
    eco.add_revenue(aid, 30_00, external_reference="order:t-1")
    eco.add_expense(aid, 10_00)
    snap = eco.snapshot(aid)
    assert snap["revenue_minor"] == 30_00
    assert snap["profit_minor"] == 20_00
    assert snap["roi"] == round(20_00 / 100_00, 4)
    assert snap["runway_ticks"] is None or snap["runway_ticks"] >= 0


def test_events_recorded(system, genome):
    f = system["factory"]
    f.spawn(genome, 0.5, 1_00, 10_00)
    history = system["events"].history("AgentCreated")
    assert any(h["payload"]["agent_id"] for h in history)
