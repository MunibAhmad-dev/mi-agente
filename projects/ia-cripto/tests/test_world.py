"""Phase 5 tests: World Brain pipeline (§24-29) and opportunity engine (§30-31).
"""
from __future__ import annotations

import pytest

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.opportunities import OpportunityEngine, OpportunityScores, ScoringWeights
from aeos.world import NoRealDataAvailable, Observation, WorldBrain


@pytest.fixture()
def world():
    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    brain = WorldBrain(db, events)
    opps = OpportunityEngine(db, events, Audit(db), brain)
    return {"db": db, "events": events, "brain": brain, "opps": opps}


def _obs(source="hackernews", title="Developers complain about X pricing", **kw):
    return Observation(source=source, title=title, body=kw.pop("body", "too expensive for teams"),
                       kind=kw.pop("kind", "review"), observed_at=kw.pop("observed_at", "2026-09-06T00:00:00"),
                       **kw)


def test_ingest_deduplicates_by_content(world):
    brain = world["brain"]
    r1 = brain.ingest(_obs(external_id="hn-1"))
    r2 = brain.ingest(_obs(external_id="hn-1"))
    r3 = brain.ingest(_obs(source="reddit"))  # same text, different source -> different hash
    assert r1["duplicate"] is False
    assert r2["duplicate"] is True            # exact duplicate acknowledged, not re-stored
    assert r3["duplicate"] is False


def test_temporal_memory_never_overwrites(world):
    """§26: a correction creates a new row; the old one remains queryable."""
    brain = world["brain"]
    brain.ingest(_obs(title="Product X costs $50", observed_at="2026-08-01T00:00:00"))
    brain.ingest(_obs(title="Product X costs $40", observed_at="2026-09-01T00:00:00"))
    old = brain.observations_as_of("2026-08-15T00:00:00")
    new = brain.observations_as_of("2026-09-05T00:00:00")
    assert any("$50" in o["title"] for o in old)
    assert any("$40" in o["title"] for o in new)
    assert len(brain.recent()) == 2


def test_entity_resolution_links_known_entities(world):
    brain = world["brain"]
    eid = brain.register_entity("Product X", aliases=["productx", "px"])
    brain.ingest(_obs(title="Product X launched a new tier"))
    rows = world["db"].query(
        "SELECT entity_id FROM observation_entities")
    assert [r["entity_id"] for r in rows] == [eid]


def test_entity_resolution_fuzzy_typo(world):
    """§27: fuzzy matching links 'Prodcut X' (typo) to 'Product X', but a
    common word like 'product' alone never does."""
    brain = world["brain"]
    eid = brain.register_entity("Product X")
    brain.ingest(_obs(title="Prodcut X raised pricing"))          # typo, no alias
    brain.ingest(_obs(title="A product launched today"))           # common word
    linked = [r["entity_id"] for r in world["db"].query(
        "SELECT o.observation_id AS oid, o.entity_id FROM observation_entities o"
        " JOIN world_observations w ON w.id=o.observation_id ORDER BY w.id")]
    assert linked == [eid]  # only the typo observation linked


def test_source_trust_updates_from_outcomes(world):
    brain = world["brain"]
    st0 = brain.source_trust("blog_a")
    assert st0["reliability"] == 0.5
    brain.update_source_trust("blog_a", confirmed=True)
    brain.update_source_trust("blog_a", confirmed=True)
    brain.update_source_trust("blog_a", contradicted=True)
    st = brain.source_trust("blog_a")
    assert st["reliability"] == pytest.approx(0.5 + 0.05 + 0.05 - 0.10)
    assert st["confirmations"] == 2 and st["contradictions"] == 1


def test_signals_require_real_data(world):
    """§139: no data -> honest error, never synthetic filler."""
    with pytest.raises(NoRealDataAvailable):
        world["brain"].signals(window_hours=24)
    for i in range(4):
        world["brain"].ingest(_obs(external_id=f"e{i}", title=f"signal {i}"))
    s = world["brain"].signals(window_hours=24 * 365 * 10)  # observations are dated 2026-09-06
    assert s["volume"] == 4 and s["source_diversity"] == 0.25  # 1 source / 4 obs


def test_opportunity_requires_real_evidence(world):
    with pytest.raises(ValueError):
        world["opps"].detect("devtools", "no evidence", [])  # no observations cited
    with pytest.raises(NoRealDataAvailable):
        world["opps"].detect("devtools", "fabricated evidence", [999])


def test_opportunity_scoring_threshold_gates(world):
    brain, opps = world["brain"], world["opps"]
    obs1 = brain.ingest(_obs())["id"]
    obs2 = brain.ingest(_obs(title="Teams churn over pricing", body="switching away"))["id"]
    opp = opps.detect("devtools", "X is overpriced for small teams", [obs1, obs2])

    good = opps.score(opp["id"], OpportunityScores(
        demand=0.9, competition_openness=0.8, margin=0.7, risk=0.2, uncertainty=0.2,
        information_value=0.5, capital_required_minor=100_00, time_to_market_days=14))
    assert good["decision"] == "APPROVED"

    weak = opps.score(opp["id"], OpportunityScores(
        demand=0.2, competition_openness=0.1, margin=0.1, risk=0.9, uncertainty=0.9,
        information_value=0.0, capital_required_minor=500_00, time_to_market_days=180))
    assert weak["decision"] == "REJECTED"  # DO NOTHING is valid (§5)
    assert opps.portfolio()["REJECTED"]["count"] == 1
