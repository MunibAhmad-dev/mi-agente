"""Evolution, strategy DNA and prediction ledger tests (spec §19-22, §53)."""
from __future__ import annotations

import pytest

from aeos.agents.fitness import FitnessInputs
from aeos.agents.genome import Genome
from aeos.evolution.predictions import AlreadyResolved


def _spawn(system, genome):
    aid = system["factory"].spawn(genome, 0.5, 1_00, 10_00)
    system["dna"].extract_from_genome(aid, genome.to_json())
    return aid


def test_dna_extraction_from_genome(system, genome):
    aid = _spawn(system, genome)
    version, traits = system["dna"].latest(aid)
    assert version == 1
    assert traits["audience"] == ""  # genome had empty audience
    assert traits["model"] == []


def test_mutation_creates_new_version_and_logs(system, genome):
    aid = _spawn(system, genome)
    rec = system["dna"].mutate(aid, "price", "freemium", hypothesis="freemium converts better",
                               reason="test")
    assert rec.parent_dna_version == 1 and rec.new_dna_version == 2
    v, traits = system["dna"].latest(aid)
    assert traits["price"] == "freemium"
    # unknown trait rejected
    with pytest.raises(ValueError):
        system["dna"].mutate(aid, "not_a_trait", "x", "h", "r")


def test_recombination_unions_parent_traits(system):
    g1 = Genome(identity="p1", audience="devs", channel="reddit")
    g2 = Genome(identity="p2", pricing="freemium", retention="weekly digest")
    a1 = _spawn(system, g1)
    a2 = _spawn(system, g2)
    child = Genome(identity="child", generation=2, parents=[a1, a2])
    cid = system["factory"].spawn(child, 0.5, 1_00, 10_00)
    system["dna"].recombine(cid, [a1, a2])
    _v, traits = system["dna"].latest(cid)
    assert traits["audience"] == "devs"       # from p1
    assert traits["retention"] == "weekly digest"  # from p2


def test_prediction_scored_before_resolved_and_immutable_after(system):
    p = system["predictions"]
    pid = p.record(claim="BTC closes above X this week", probability=0.7,
                   confidence=0.8, strategy="momentum")
    res = p.resolve(pid, actual=1.0)
    assert abs(res["brier"] - 0.09) < 1e-9
    with pytest.raises(AlreadyResolved):
        p.resolve(pid, actual=0.0)
    cal = p.calibration()
    assert cal["resolved"] == 1 and cal["mean_brier"] is not None


def test_fitness_engine_components():
    f = system_fixture_fitness()
    inputs = FitnessInputs(
        profit_minor=5_000_00, growth=0.8, survival=0.9, learning=0.5,
        optionality=0.4, robustness=0.7, risk=0.2, cost_minor=100_00,
        uncertainty=0.3, capital_consumption=0.5, concentration=0.2,
    )
    scores = f.all(inputs)
    assert scores["economic_fitness"] > 0


def system_fixture_fitness():
    from aeos.agents.fitness import FitnessEngine
    return FitnessEngine()


def test_evaluate_records_and_rank_orders_by_profit(system, genome, seeded_treasury):
    evo = system["evolution"]
    eco = system["eco"]
    a1 = _spawn(system, Genome(identity="w1"))
    a2 = _spawn(system, Genome(identity="w2"))
    for aid in (a1, a2):
        seeded_treasury.allocate("OPERATING", aid, 50_00, reason="test", authorization="test")
    eco.add_revenue(a1, 40_00, synthetic_allowed=True)  # rank/fitness test fixture
    eco.add_expense(a1, 10_00)
    eco.add_revenue(a2, 5_00, synthetic_allowed=True)
    eco.add_expense(a2, 10_00)
    s = evo.evaluate(a1, FitnessInputs(
        profit_minor=30_00, growth=0.5, survival=0.9, learning=0.6, optionality=0.3,
        robustness=0.6, risk=0.1, cost_minor=10_00, uncertainty=0.2,
        capital_consumption=0.2, concentration=0.2))
    assert "economic_fitness" in s
    ranked = evo.rank()
    assert ranked[0]["agent_id"] == a1
    assert ranked[0]["profit_minor"] == 30_00


def test_economic_fitness_sign_semantics():
    """Burning agents score <= 0; strongly profitable ones score > 0 (§15)."""
    from aeos.agents.fitness import FitnessEngine
    f = FitnessEngine()
    burning = FitnessInputs(
        profit_minor=0, growth=0.5, survival=0.5, learning=0.5, optionality=0.5,
        robustness=0.5, risk=0.5, cost_minor=50_00, uncertainty=0.5,
        capital_consumption=0.8, concentration=0.3)
    assert f.economic_fitness(burning) <= 0
    winning = FitnessInputs(
        profit_minor=2_000_00, growth=0.8, survival=0.9, learning=0.6, optionality=0.4,
        robustness=0.7, risk=0.2, cost_minor=20_00, uncertainty=0.3,
        capital_consumption=0.3, concentration=0.2)
    assert f.economic_fitness(winning) > 0


def test_reallocation_rewards_winners(system, genome, seeded_treasury):
    evo, eco = system["evolution"], system["eco"]
    a1 = _spawn(system, Genome(identity="win1"))
    seeded_treasury.allocate("OPERATING", a1, 50_00, reason="test", authorization="test")
    eco.add_revenue(a1, 60_00, synthetic_allowed=True)  # reallocation test fixture
    eco.add_expense(a1, 10_00)
    ranked = evo.rank()
    moves = evo.reallocate(ranked, bucket="OPERATING", bonus_fraction=0.2)
    assert moves and moves[0]["agent_id"] == a1
    assert moves[0]["bonus_minor"] > 0


def test_generation_stats_counts_population(system, genome):
    _spawn(system, Genome(identity="g1", generation=1))
    stats = system["evolution"].generation_stats(1)
    assert stats["population"] >= 1
