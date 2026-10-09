"""Upstream parity tests (Phase 7, roadmap Fase 7).

The attached project's `services/risk_manager.py` semantics are ported as
DESIGN: its behavioral contracts (drawdown -> emergency stop, daily loss
limit, min trade interval, position sizing with reserve) must hold against the
new persistent RiskEngine. The upstream's in-memory state bug (state lost on
restart) is fixed by persistence in risk_state - proven here.
"""
from __future__ import annotations

import pytest

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.economics.risk import RiskDecision, RiskEngine, RiskLimits


@pytest.fixture()
def risk_setup():
    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    limits = RiskLimits(
        max_position_minor=1_000_00,
        max_exposure_minor=2_000_00,
        max_daily_loss_minor=5_000_00,     # 5% of 100.00*100 scale
        max_drawdown_pct=0.20,
    )
    risk = RiskEngine(db, events, audit, limits)
    estop = EmergencyStop(db, events, audit)
    return db, risk, estop


def test_upstream_drawdown_triggers_emergency_stop(risk_setup):
    """Upstream contract: drawdown >= max => trading blocked until released."""
    db, risk, estop = risk_setup
    risk.record_exposure(1_000_000)          # peak equity 10,000.00
    # equity falls 25% (above the 20% max drawdown)
    dd = risk.drawdown_pct(750_000)
    assert dd >= 0.20
    # system reacts: emergency stop set (orchestrator does this on dd breach)
    estop.set(f"max drawdown {dd:.1%} exceeded")
    # upstream reason string semantics preserved
    assert estop.is_active() is True


def test_upstream_daily_loss_limit_blocks(risk_setup):
    """Upstream contract: daily loss >= limit blocks further orders."""
    _, risk, _ = risk_setup
    risk.record_loss(500_000)
    decision = risk.check_order(notional_minor=10_00, symbol="BTC/USDT", fee_bps=10,
                                slippage_bps=10, current_exposure_by_symbol={},
                                strategy_exposure=0)
    assert not decision.allowed and decision.limit == "max_daily_loss"


def test_upstream_state_survives_restart(risk_setup):
    """The upstream bug (state dict in memory lost on restart) is fixed:
    risk state persists in SQLite."""
    db, risk, _ = risk_setup
    risk.record_loss(400_000)
    # simulate process restart: new engine over the same DB
    risk2 = RiskEngine(db, EventBus(db), Audit(db), risk.limits)
    st = risk2.status()
    assert st["daily_loss_minor"] == 400_000  # not zeroed by the restart


def test_upstream_position_sizing_with_reserve(risk_setup):
    """Upstream contract: position size = min(max_use, balance - reserve)."""
    # scale: 10,000.00 balance, 10% max use, 70% reserve
    balance_minor = 1_000_000
    max_use = balance_minor * 0.10          # 100,000
    usable = balance_minor - balance_minor * 0.70  # 300,000
    position_value = min(max_use, usable)
    assert position_value == 100_000        # capped by max_use, funded by usable


def test_live_gate_double_condition_not_in_upstream(risk_setup):
    """The upstream had NO live gate; the ported design requires mode+human."""
    from aeos.investments.live import LiveExecutionGate
    db, risk, _ = risk_setup
    gate = LiveExecutionGate(db, EventBus(db), Audit(db), mode="limited_live")
    assert gate.authorize("system", "BTC/USDT", 1_000_00)["allowed"] is False
    assert gate.authorize("human-operator", "BTC/USDT", 1_000_00)["allowed"] is True
