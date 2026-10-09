"""Core substrate tests: audit hash chain, event bus, config, decisions (§112-114, §152)."""
from __future__ import annotations

import pytest

from aeos.core.audit import Audit
from aeos.core.config import load_settings
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.core.migrations import migrate


def test_audit_chain_verifies_and_detects_tampering():
    db = Database(":memory:")
    migrate(db)
    audit = Audit(db)
    audit.record("test", "a1", "t1", {"x": 1})
    audit.record("test", "a2", "t2", {"x": 2})
    assert audit.verify_chain() is True
    # direct row rewrite must be blocked by trigger
    with pytest.raises(Exception):
        db.execute("UPDATE audit_log SET action='evil' WHERE id=1")
    assert audit.verify_chain() is True


def test_event_bus_validates_types_and_persists():
    db = Database(":memory:")
    migrate(db)
    bus = EventBus(db)
    seen = []
    bus.subscribe("RevenueRecorded", lambda t, p: seen.append(p))
    eid = bus.publish("RevenueRecorded", {"amount_minor": 5})
    assert eid > 0 and seen == [{"amount_minor": 5}]
    with pytest.raises(ValueError):
        bus.publish("NotARealEvent", {})
    assert any(h["type"] == "RevenueRecorded" for h in bus.history())


def test_event_subscriber_failure_does_not_lose_events():
    db = Database(":memory:")
    migrate(db)
    bus = EventBus(db)
    def boom(t, p):
        raise RuntimeError("subscriber bug")
    bus.subscribe("AgentCreated", boom)
    eid = bus.publish("AgentCreated", {"agent_id": "a"})
    rows = bus.history("AgentCreated")
    assert len(rows) >= 1  # event survived the subscriber crash


def test_settings_env_split_and_validation():
    s = load_settings(mode="test", env={"AEOS_DB_PATH": ":memory:"})
    assert s.mode == "test"
    with pytest.raises(ValueError):
        load_settings(mode="bogus")
    s2 = load_settings(mode="paper", env={"AEOS_RESERVE_FLOOR": "0.4"})
    assert s2.reserve_floor == 0.4
    # invalid numeric falls back to default
    s3 = load_settings(mode="paper", env={"AEOS_RESERVE_FLOOR": "not-a-number"})
    assert s3.reserve_floor == 0.30


def test_decisions_roundtrip():
    from aeos.core.decisions import Decisions
    db = Database(":memory:")
    migrate(db)
    d = Decisions(db)
    did = d.record(selected="WAIT", context={"why": "no signal"}, options=["WAIT", "ACT"],
                   expected_value=0.0, risk=0.1, confidence=0.9, policy_result="APPROVE",
                   authorization="human")
    rec = d.get(did)
    assert rec["selected"] == "WAIT"
    assert rec["context"] == {"why": "no signal"}
    d.set_outcome(did, "observed: market flat")
    assert d.get(did)["outcome"].startswith("observed")


def test_migrations_are_idempotent():
    db = Database(":memory:")
    first = migrate(db)
    second = migrate(db)
    assert first and not second
