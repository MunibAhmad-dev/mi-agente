"""Paper trading + live execution gate tests (spec §49, §128)."""
from __future__ import annotations

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.economics.risk import RiskEngine
from aeos.investments.live import LiveExecutionGate
from aeos.investments.paper import PaperTradingEngine


def _paper(system):
    risk = RiskEngine(system["db"], system["events"], system["audit"])
    return PaperTradingEngine(system["db"], system["events"], system["audit"], risk)


def test_paper_order_fills_with_slippage(system):
    eng = _paper(system)
    ref = 50_000.0
    res = eng.submit(agent_id=None, symbol="BTC/USDT", side="buy", qty=0.1,
                     reference_price=ref)
    assert res["status"] == "filled"
    assert res["mode"] == "PAPER"
    # buy fills above reference (slippage against us)
    assert res["fill_price"] > ref
    assert res["notional_minor"] == int(round(res["fill_price"] * 0.1 * 100))


def test_paper_order_blocked_by_risk(system):
    from aeos.economics.risk import RiskLimits
    risk = RiskEngine(system["db"], system["events"], system["audit"],
                      RiskLimits(max_position_minor=100_00))
    eng = PaperTradingEngine(system["db"], system["events"], system["audit"], risk)
    res = eng.submit(agent_id=None, symbol="BTC/USDT", side="buy", qty=1.0,
                     reference_price=50_000.0)
    assert res["status"] == "BLOCKED"


def test_live_gate_blocked_in_paper_mode(system):
    gate = LiveExecutionGate(system["db"], system["events"], system["audit"], mode="paper")
    decision = gate.authorize("human-operator", "BTC/USDT", 1_000_00)
    assert decision["allowed"] is False


def test_live_gate_requires_human_even_in_live_mode(system):
    gate = LiveExecutionGate(system["db"], system["events"], system["audit"], mode="limited_live")
    assert gate.authorize("system", "BTC/USDT", 1_000_00)["allowed"] is False
    assert gate.authorize("human-operator", "BTC/USDT", 1_000_00)["allowed"] is True


def test_market_data_provenance_table_exists(system):
    # adapter writes provenance rows; table must exist even without ccxt
    system["db"].execute(
        "INSERT INTO market_data (source, symbol, ts, price, volume, meta_json)"
        " VALUES ('binance', 'BTC/USDT', '2026-01-01T00:00:00', 50000.0, 1.0, '{}')"
    )
    row = system["db"].one("SELECT price FROM market_data WHERE symbol='BTC/USDT'")
    assert row["price"] == 50000.0
