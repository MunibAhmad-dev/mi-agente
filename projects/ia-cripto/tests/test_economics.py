"""Economic invariant tests (spec §145) - the money rules are absolute."""
from __future__ import annotations

import pytest

from aeos.agents.genome import Genome
from aeos.economics.allocation import AllocationInputs, CapitalAllocationEngine
from aeos.economics.money import fmt, to_major, to_minor
from aeos.economics.treasury import TreasuryError


def test_deposit_and_balances(seeded_treasury):
    t = seeded_treasury
    # fixture seeds 3,000.00 RESERVE + 7,000.00 OPERATING = 10,000.00 (minor units)
    assert t.total() == 1_000_000
    assert t.available("OPERATING") == 700_000
    assert t.available("RESERVE") == 300_000


def test_cannot_allocate_more_than_available(seeded_treasury):
    t = seeded_treasury
    with pytest.raises(TreasuryError):
        t.allocate("OPERATING", "agt_x", 8_000_00, reason="too much", authorization="test")


def test_reserve_floor_enforced(seeded_treasury):
    t = seeded_treasury
    # withdrawing from RESERVE below the 30% floor must fail
    with pytest.raises(TreasuryError):
        t.withdraw("RESERVE", 1_00, authorization="test")


def test_allocation_capped_by_policy(seeded_treasury):
    t = seeded_treasury
    # EXPERIMENT cap is 10% of total (1,000.00); asking for more must fail
    with pytest.raises(TreasuryError):
        t.allocate("EXPERIMENT", "agt_x", 1_100_00, reason="over cap", authorization="test")


def test_allocate_and_return_roundtrip(seeded_treasury, system, genome):
    t = seeded_treasury
    aid = system["factory"].spawn(genome, 0.5, 1_00, 10_00)
    tx = t.allocate("OPERATING", aid, 1_000_00, reason="test", authorization="test")
    assert tx > 0
    assert t.available("OPERATING") == 6_000_00
    t.return_capital("OPERATING", aid, 1_000_00)
    assert t.available("OPERATING") == 7_000_00


def test_profit_settlement_semantics(seeded_treasury, system, genome):
    """Revenue is NEW external money landing in the treasury; agent cash is a
    claim backed by the bucket earmark. Revenue requires external_reference
    (§80). Claims identity: Σ agent_cash == Σ earmarks."""
    t = seeded_treasury
    aid = system["factory"].spawn(genome, 0.5, 1_00, 10_00)
    t.allocate("OPERATING", aid, 100_00, reason="test", authorization="test")
    before = t.total()
    # revenue without external_reference is rejected (synthetic profit cannot pass)
    with pytest.raises(TreasuryError):
        t.settle_profit("OPERATING", aid, 50_00, reason="revenue")
    tx = t.settle_profit("OPERATING", aid, 50_00, reason="revenue",
                         external_reference="stripe:pi_test_123")
    assert tx > 0
    assert t.total() == before + 50_00          # real money grew by revenue
    snap = system["eco"].snapshot(aid)
    assert snap["cash_minor"] == 100_00          # claim unchanged (earmark intact)
    t.validate()                                  # Σ cash == Σ earmarks


def test_global_money_conservation(seeded_treasury, system, genome):
    """Real-money conservation (the audit's F1 invariant, corrected):
    total() = injected + Σrevenue − Σloss; losses burn real money."""
    t = seeded_treasury
    injected = t.total()
    aids = []
    for i in range(3):
        g = Genome(identity=f"c{i}", generation=1)
        aid = system["factory"].spawn(g, 0.5, 1_00, 10_00)
        t.allocate("OPERATING", aid, 50_00, reason="test", authorization="test")
        aids.append(aid)
    t.settle_profit("OPERATING", aids[0], 20_00, reason="sale",
                    external_reference="order:1001")
    t.settle_loss("OPERATING", aids[1], 10_00, reason="bad spend")
    assert t.total() == injected + 20_00 - 10_00  # +rev −loss
    t.validate()


def test_ledger_is_append_only(seeded_treasury):
    t = seeded_treasury
    db = t.db
    t.deposit("OPERATING", 1_00)
    with pytest.raises(Exception):
        db.execute("UPDATE ledger_entries SET amount_minor = 1")
    with pytest.raises(Exception):
        db.execute("DELETE FROM ledger_entries")


def test_ledger_rejects_zero_and_negative(seeded_treasury):
    t = seeded_treasury
    with pytest.raises(ValueError):
        t.ledger.post("revenue", "a", "b", 0)


def test_dead_agent_cannot_receive_capital(seeded_treasury, system, genome):
    """§145: dead_agent_spend == 0 - enforced, not just asserted."""
    from aeos.agents.cemetery import Cemetery
    from aeos.agents.lifecycle import Lifecycle
    from aeos.economics.treasury import TreasuryError

    lc = Lifecycle(seeded_treasury.db, system["events"], system["audit"])
    cemetery = Cemetery(seeded_treasury.db, system["events"], system["audit"], lc)
    aid = system["factory"].spawn(genome, 0.5, 1_00, 10_00)
    cemetery.bury(aid, failure_category="NO_DEMAND", failure_reason="no demand")
    with pytest.raises(TreasuryError):
        seeded_treasury.allocate("OPERATING", aid, 10_00, reason="late", authorization="test")


def test_money_helpers():
    assert to_minor(2.675) == 268  # ROUND_HALF_UP (probe F4 regression)
    assert to_minor(10.005) == 1001
    assert to_major(1234) == 12.34
    assert fmt(1234) == "12.34"
    assert fmt(-1234) == "-12.34"
    with pytest.raises(ValueError):
        to_minor(-1)


def test_deposit_is_capital_injection_not_revenue(seeded_treasury):
    """Owner deposits are capital_injection/reserve_move, never revenue (§16)."""
    row = seeded_treasury.db.one(
        "SELECT category FROM ledger_entries WHERE category IN"
        " ('revenue','capital_injection','reserve_move') ORDER BY tx_id"
    )
    assert row["category"] in ("capital_injection", "reserve_move")


def test_settle_loss_burns_real_money(seeded_treasury, system, genome):
    """The corrected F1: a loss must NOT leave phantom money in the treasury.
    Before the fix, treasury total stayed constant across a realized loss."""
    t = seeded_treasury
    aid = system["factory"].spawn(genome, 0.5, 1_00, 10_00)
    t.allocate("OPERATING", aid, 50_00, reason="test", authorization="test")
    before = t.total()
    t.settle_loss("OPERATING", aid, 20_00, reason="burned on ads with zero conversions")
    assert t.total() == before - 20_00
    assert system["eco"].snapshot(aid)["cash_minor"] == 30_00


def test_bury_releases_unspent_capital(system, genome, seeded_treasury):
    """Probe F2 regression: burial returns unspent allocated capital to the
    originating bucket (dead agents hold no capital, §145)."""
    from aeos.agents.cemetery import Cemetery
    lc = system["lifecycle"]
    cemetery = Cemetery(system["db"], system["events"], system["audit"], lc, treasury=seeded_treasury)
    aid = system["factory"].spawn(genome, 0.5, 1_00, 10_00)
    seeded_treasury.allocate("OPERATING", aid, 50_00, reason="test", authorization="test")
    rec = cemetery.bury(aid, failure_category="NO_DEMAND", failure_reason="x")
    assert rec["capital_released_minor"] == 50_00
    assert seeded_treasury.buckets()["OPERATING"]["allocated"] == 0
    seeded_treasury.validate()


def test_predictions_cannot_unresolve(system):
    """Probe F3 regression: a resolved prediction can never go back to NULL
    (§53 immutability, trigger-enforced)."""
    import sqlite3
    p = system["predictions"]
    pid = p.record(claim="x", probability=0.6, confidence=0.5)
    p.resolve(pid, actual=1.0)
    with pytest.raises(sqlite3.DatabaseError):
        system["db"].execute(
            "UPDATE predictions SET resolved_at=NULL, actual=NULL, brier=NULL WHERE id=?",
            (pid,),
        )


def test_genome_strict_deserialization():
    """P-14: strict from_json surfaces unknown fields instead of dropping them."""
    g = Genome(identity="gx", generation=1)
    raw = g.to_json()
    import json as _json
    corrupted = _json.loads(raw)
    corrupted["hacker_field"] = "injected"
    from aeos.agents.genome import Genome as G
    G.from_json(_json.dumps(corrupted))  # lenient: tolerated (legacy data)
    with pytest.raises(ValueError, match="hacker_field"):
        G.from_json(_json.dumps(corrupted), strict=True)


def test_paper_symbol_validation():
    from aeos.core.events import EventBus
    from aeos.core.audit import Audit
    from aeos.core.db import Database
    from aeos.core.migrations import migrate
    from aeos.economics.risk import RiskEngine
    from aeos.investments.paper import PaperTradingEngine
    db = Database(":memory:")
    migrate(db)
    eng = PaperTradingEngine(db, EventBus(db), Audit(db),
                             RiskEngine(db, EventBus(db), Audit(db)))
    with pytest.raises(ValueError, match="invalid symbol"):
        eng.submit(agent_id=None, symbol="BTCUSDT", side="buy", qty=0.1,
                   reference_price=50_000.0)
    with pytest.raises(ValueError, match="invalid symbol"):
        eng.submit(agent_id=None, symbol="BTC/<script>", side="buy", qty=0.1,
                   reference_price=50_000.0)


def test_allocation_engine_verdicts():
    eng = CapitalAllocationEngine(available_minor=1_000_00)
    good = AllocationInputs(
        expected_return=0.5, historical_return=0.2, risk=0.1, uncertainty=0.1,
        capital_requirement=100_00, information_gain=0.8, liquidity=0.9,
        correlation=0.1, strategy_quality=0.8, agent_quality=0.8, resource_cost=1_00,
    )
    v = eng.evaluate(good)
    assert v.decision in ("APPROVE", "PARTIAL_APPROVE")
    assert v.amount_minor > 0

    low_info = AllocationInputs(
        expected_return=0.5, historical_return=0.2, risk=0.1, uncertainty=0.1,
        capital_requirement=100_00, information_gain=0.05, liquidity=0.9,
        correlation=0.1, strategy_quality=0.8, agent_quality=0.8, resource_cost=1_00,
    )
    assert eng.evaluate(low_info).decision == "REJECT"

    weak = AllocationInputs(
        expected_return=0.01, historical_return=0.0, risk=0.9, uncertainty=0.9,
        capital_requirement=100_00, information_gain=0.2, liquidity=0.3,
        correlation=0.9, strategy_quality=0.1, agent_quality=0.1, resource_cost=10_00,
    )
    assert eng.evaluate(weak).decision in ("DEFER", "REJECT")


def test_risk_engine_blocks_exposure():
    from aeos.core.audit import Audit
    from aeos.core.db import Database
    from aeos.core.events import EventBus
    from aeos.core.migrations import migrate
    from aeos.economics.risk import RiskEngine, RiskLimits

    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    limits = RiskLimits(max_position_minor=1_000_00, max_exposure_minor=2_000_00,
                        max_concentration=0.6)
    risk = RiskEngine(db, events, audit, limits)
    ok = risk.check_order(notional_minor=900_00, symbol="BTC/USDT", fee_bps=10,
                          slippage_bps=10, current_exposure_by_symbol={}, strategy_exposure=0)
    assert ok.allowed
    blocked = risk.check_order(notional_minor=1_500_00, symbol="BTC/USDT", fee_bps=10,
                               slippage_bps=10, current_exposure_by_symbol={}, strategy_exposure=0)
    assert not blocked.allowed and blocked.limit == "max_position"
    conc = risk.check_order(notional_minor=900_00, symbol="ETH/USDT", fee_bps=10,
                            slippage_bps=10, current_exposure_by_symbol={"ETH/USDT": 900_00},
                            strategy_exposure=0)
    assert not conc.allowed and conc.limit == "max_concentration"
    daily = risk.check_order(notional_minor=10_00, symbol="BTC/USDT", fee_bps=10,
                             slippage_bps=10, current_exposure_by_symbol={}, strategy_exposure=0)
    risk.record_loss(50_000_00)
    after_loss = risk.check_order(notional_minor=10_00, symbol="BTC/USDT", fee_bps=10,
                                  slippage_bps=10, current_exposure_by_symbol={},
                                  strategy_exposure=0)
    assert not after_loss.allowed and after_loss.limit == "max_daily_loss"
