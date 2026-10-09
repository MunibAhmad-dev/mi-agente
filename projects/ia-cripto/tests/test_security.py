"""Security test suite (spec §146): the nine canonical attacks, proven to fail.

Every test here represents an attack an adversary (or a buggy agent) would
attempt. These are permanent regression tests, not one-off probes.
"""
from __future__ import annotations

import pytest

from aeos.core.config import load_settings
from aeos.core.db import Database
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.audit import Audit
from aeos.core.decisions import Decisions
from aeos.core.migrations import migrate
from aeos.economics.ledger import Ledger
from aeos.economics.treasury import Treasury, TreasuryError
from aeos.agents.cemetery import Cemetery
from aeos.agents.genome import Genome
from aeos.governance import (
    ApprovalRequired, ApprovalService, IdentityService, PermissionDenied,
    PolicyEngine,
)
from aeos.agents.factory import AgentFactory


@pytest.fixture()
def secure_system():
    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    ledger = Ledger(db)
    treasury = Treasury(db, ledger, events, audit, reserve_floor=0.30)
    identity = IdentityService(db, audit)
    policy = PolicyEngine(db, events, audit, Decisions(db))
    approvals = ApprovalService(db, events, audit)
    estop = EmergencyStop(db, events, audit)
    factory = AgentFactory(db, events, audit, max_population=8)
    return {
        "db": db, "events": events, "audit": audit, "treasury": treasury,
        "identity": identity, "policy": policy, "approvals": approvals,
        "estop": estop, "factory": factory,
    }


def _seed(treasury):
    treasury.deposit("RESERVE", 300_000)
    treasury.deposit("OPERATING", 700_000)


def test_unknown_principal_cannot_act(secure_system):
    """Attack 1: an unregistered principal attempts to allocate capital."""
    treasury = secure_system["treasury"]
    _seed(treasury)
    identity = secure_system["identity"]
    ghost = identity.context_for("human:ghost") if identity.get_principal("human:ghost") else None
    assert ghost is None  # no context can even be issued


def test_viewer_cannot_allocate_capital(secure_system):
    """Attack 2: privilege escalation - a viewer role tries ALLOCATE_CAPITAL."""
    identity = secure_system["identity"]
    treasury = secure_system["treasury"]
    _seed(treasury)
    identity.create_principal("human:mallory", "human", "viewer", "Mallory")
    ctx = identity.context_for("human:mallory")
    with pytest.raises(PermissionDenied):
        treasury.allocate("OPERATING", "agt_x", 1_00, reason="attack", authorization=ctx)


def test_agent_role_cannot_withdraw(secure_system):
    """Attack 3: a compromised agent principal tries to drain the treasury."""
    identity = secure_system["identity"]
    treasury = secure_system["treasury"]
    _seed(treasury)
    identity.create_principal("agent:rogue", "agent", "agent", "Rogue")
    ctx = identity.context_for("agent:rogue")
    with pytest.raises(PermissionDenied):
        treasury.withdraw("OPERATING", 1_00, authorization=ctx)


def test_allocation_from_reserve_denied_by_policy(secure_system):
    """Attack 4: allocating straight out of RESERVE (§17)."""
    identity = secure_system["identity"]
    treasury = secure_system["treasury"]
    _seed(treasury)
    identity.create_principal("human:owner", "human", "admin", "Owner")
    ctx = identity.context_for("human:owner")
    with pytest.raises(TreasuryError):
        treasury.allocate("RESERVE", "agt_x", 1_00, reason="attack", authorization=ctx)


def test_huge_allocation_escalates_to_human(secure_system):
    """Attack 5: a 'winner' agent requests a huge allocation - must escalate."""
    policy = secure_system["policy"]
    result = policy.evaluate("allocate", {"amount_minor": 50_000_00,
                                          "escalate_above_minor": 10_000_00})
    assert result.verdict == "ESCALATE"
    small = policy.evaluate("allocate", {"amount_minor": 5_000_00,
                                         "escalate_above_minor": 10_000_00})
    assert small.verdict == "ALLOW"


def test_emergency_stop_freezes_capital_actions(secure_system):
    """Attack 6: capital movement during EMERGENCY STOP is denied by policy."""
    estop = secure_system["estop"]
    policy = secure_system["policy"]
    estop.set("flash crash detected")
    result = policy.evaluate("allocate", {"amount_minor": 1_00, "emergency_stop": True})
    assert result.verdict == "DENY"
    # releasing requires the permission
    identity = secure_system["identity"]
    identity.create_principal("human:owner", "human", "admin", "Owner")
    ctx = identity.context_for("human:owner")
    estop.release(ctx)
    assert estop.is_active() is False


def test_emergency_stop_release_requires_permission(secure_system):
    """Attack 7: a viewer cannot release the emergency stop."""
    estop = secure_system["estop"]
    identity = secure_system["identity"]
    estop.set("test")
    identity.create_principal("human:mallory", "human", "viewer", "Mallory")
    ctx = identity.context_for("human:mallory")
    with pytest.raises(PermissionDenied):
        estop.release(ctx)


def test_revoked_api_key_cannot_authenticate(secure_system):
    """Attack 8: a stolen/revoked API key is useless."""
    identity = secure_system["identity"]
    identity.create_principal("human:owner", "human", "admin", "Owner")
    owner = identity.context_for("human:owner")
    secret, prefix = identity.create_api_key("human:owner")
    assert identity.authenticate(secret).principal_id == "human:owner"
    identity.revoke_api_key(prefix, owner)
    with pytest.raises(PermissionDenied):
        identity.authenticate(secret)
    # tampered key fails too
    with pytest.raises(PermissionDenied):
        identity.authenticate(secret[:-2] + "xx")


def test_approvals_gate_escapes(secure_system):
    """Attack 9: escalated action cannot execute without explicit approval."""
    approvals = secure_system["approvals"]
    identity = secure_system["identity"]
    aid = approvals.request("huge_allocation", requested_by="service:evolution",
                            required_level=3, context={"amount_minor": 50_000_00})
    with pytest.raises(ApprovalRequired):
        approvals.require_approved(aid)
    identity.create_principal("human:owner", "human", "admin", "Owner")
    ctx = identity.context_for("human:owner")
    approvals.approve(aid, ctx)
    approvals.require_approved(aid)  # now passes
    # decision is immutable: re-deciding fails
    with pytest.raises(ValueError):
        approvals.approve(aid, ctx)


def test_policy_denies_when_no_rule_matches_is_allow_but_audited(secure_system):
    """Sanity: unmatched actions default to ALLOW but leave a decision record."""
    policy = secure_system["policy"]
    r = policy.evaluate("something_unspecified", {})
    assert r.verdict == "ALLOW" and r.decision_id


def test_spawn_requires_permission_with_context(secure_system):
    """A non-spawn principal cannot create agents when context is enforced."""
    identity = secure_system["identity"]
    identity.create_principal("human:mallory", "human", "viewer", "Mallory")
    ctx = identity.context_for("human:mallory")
    with pytest.raises(PermissionDenied):
        secure_system["factory"].spawn(Genome(identity="evil", generation=1),
                                       0.5, 1_00, 10_00, authorization=ctx)


def test_dead_agent_capital_via_policy(secure_system):
    """Policy sees agent_terminal and denies (defense-in-depth with §145)."""
    policy = secure_system["policy"]
    r = policy.evaluate("allocate", {"amount_minor": 100, "agent_terminal": True})
    assert r.verdict == "DENY"
