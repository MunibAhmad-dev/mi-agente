"""Live trading tests (spec §48-49, §66, §68, §71, §80, §121-122, §128):
the last 10% — real exchange execution, testnet-first, behind the human gate.

The FakeExchange below is a TEST FIXTURE (allowed by §2: simulation lives in
tests). It mimics ccxt's exact surface (create_order/fetch_open_orders/
fetch_closed_orders/fetch_balance/fetch_ticker/amount_to_precision) so the
real adapter and engine code paths are exercised without network access.
"""
from __future__ import annotations

import pytest

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.core.resilience import CircuitOpen
from aeos.economics.risk import RiskEngine, RiskLimits
from aeos.governance.approvals import ApprovalRequired, ApprovalService
from aeos.governance.permissions import IdentityService
from aeos.investments.ccxt_adapter import CcxtExchangeAdapter, ExchangeAdapterError
from aeos.investments.execution import (
    LiveExecutionEngine, LiveOrderAmbiguous, LiveOrderRejected,
)
from aeos.investments.live import LiveExecutionGate
from aeos.reconciliation.engine import ReconciliationEngine

PRICE = 50_000.0          # BTC/USDT
QTY = 0.001               # -> 50.00 notional -> 5_000 minor


class RequestTimeout(Exception):
    """Named like the ccxt ambiguous exception to exercise §121 mapping."""


class FakeExchange:
    """ccxt-shaped fake with venue-side state."""

    id = "binance"

    def __init__(self, fail_first_with: Exception | None = None,
                 cost_multiplier: float = 1.0):
        self.orders: dict[str, dict] = {}
        self.create_calls = 0
        self._next_id = 1000
        self._fail_first = fail_first_with
        self._failed_once = False
        self.cost_multiplier = cost_multiplier

    # ---- venue side ------------------------------------------------------
    def create_order(self, symbol, type_, side, amount, price=None, params=None):
        self.create_calls += 1
        if self._fail_first and not self._failed_once:
            self._failed_once = True
            # venue RECEIVED the order, response was lost (realistic timeout)
            self._record(symbol, side, amount, params or {})
            raise self._fail_first
        return self._record(symbol, side, amount, params or {})

    def _record(self, symbol, side, amount, params) -> dict:
        oid = f"ex-{self._next_id}"
        self._next_id += 1
        order = {
            "id": oid,
            "clientOrderId": str(params.get("clientOrderId") or ""),
            "symbol": symbol, "type": "market", "side": side,
            "amount": float(amount), "price": PRICE,
            "average": PRICE, "filled": float(amount),
            "status": "closed",
            "cost": PRICE * float(amount) * self.cost_multiplier,
            "fee": {"cost": PRICE * float(amount) * 0.001, "currency": "USDT"},
        }
        self.orders[oid] = order
        return dict(order)

    def fetch_order(self, order_id, symbol=None):
        if order_id not in self.orders:
            raise LookupError(f"OrderNotFound {order_id}")
        return dict(self.orders[order_id])

    def fetch_open_orders(self, symbol=None):
        return [dict(o) for o in self.orders.values() if o["status"] == "open"]

    def fetch_closed_orders(self, symbol=None, since=None, limit=20):
        return [dict(o) for o in self.orders.values() if o["status"] != "open"][:limit]

    def fetch_balance(self):
        return {"USDT": {"free": 10_000.0, "used": 0.0, "total": 10_000.0}}

    def fetch_ticker(self, symbol):
        return {"symbol": symbol, "last": PRICE, "close": PRICE}

    def amount_to_precision(self, symbol, amount):
        return f"{float(amount):.8f}"

    def price_to_precision(self, symbol, price):
        return f"{float(price):.2f}"


@pytest.fixture()
def setup():
    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    identity = IdentityService(db, audit)
    owner = identity.bootstrap_owner()  # human:owner, admin role
    approvals = ApprovalService(db, events, audit)
    risk = RiskEngine(db, events, audit, RiskLimits(max_position_minor=1_000_00))
    estop = EmergencyStop(db, events, audit)
    gate = LiveExecutionGate(db, events, audit, mode="limited_live")
    engine = LiveExecutionEngine(db, events, audit, gate, risk, approvals, estop)
    fake = FakeExchange()
    adapter = CcxtExchangeAdapter(fake, venue_label="binance-testnet")
    engine.register_venue(adapter.venue, adapter)
    return {"db": db, "audit": audit, "identity": identity, "owner": owner,
            "approvals": approvals, "risk": risk, "estop": estop,
            "gate": gate, "engine": engine, "fake": fake, "adapter": adapter}


def _approved(setup, ctx, *, venue="binance-testnet", symbol="BTC/USDT",
              side="buy", qty=QTY) -> str:
    """Request + human-approve an order with an exact matching context."""
    aid = setup["approvals"].request(
        "live_order", requested_by=ctx.principal_id, required_level=3,
        context={"kind": "live_order", "venue": venue, "symbol": symbol,
                 "side": side, "qty": qty, "requested_by": ctx.principal_id})
    setup["approvals"].approve(aid, setup["owner"])
    return aid


# ---- §71 gate chain -------------------------------------------------------

def test_pending_approval_blocks_execution(setup):
    ctx = setup["owner"]
    aid = setup["approvals"].request(
        "live_order", requested_by=ctx.principal_id, required_level=3,
        context={"kind": "live_order", "venue": "binance-testnet",
                 "symbol": "BTC/USDT", "side": "buy", "qty": QTY,
                 "requested_by": ctx.principal_id})
    with pytest.raises(ApprovalRequired):
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
            side="buy", qty=QTY, approval_id=aid)
    assert setup["fake"].create_calls == 0


def test_paper_mode_blocks_even_with_approval(setup):
    setup["gate"].mode = "paper"  # downgrade: no live execution allowed
    ctx = setup["owner"]
    aid = _approved(setup, ctx)
    with pytest.raises(LiveOrderRejected):
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
            side="buy", qty=QTY, approval_id=aid)
    assert setup["fake"].create_calls == 0


def test_missing_execute_trade_permission_blocks(setup):
    # demote the role: same principal, no EXECUTE_TRADE
    setup["db"].execute("UPDATE principals SET role='viewer' WHERE id='human:owner'")
    viewer = setup["identity"].context_for("human:owner")
    aid = _approved(setup, viewer)
    with pytest.raises(Exception) as excinfo:
        setup["engine"].submit_live_order(
            ctx=viewer, agent_id=None, venue="binance-testnet",
            symbol="BTC/USDT", side="buy", qty=QTY, approval_id=aid)
    assert "EXECUTE_TRADE" in str(excinfo.value)
    assert setup["fake"].create_calls == 0


def test_emergency_stop_freezes_live_trading(setup):
    ctx = setup["owner"]
    aid = _approved(setup, ctx)
    setup["estop"].set("manual test stop")
    with pytest.raises(LiveOrderRejected) as excinfo:
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
            side="buy", qty=QTY, approval_id=aid)
    assert "EMERGENCY STOP" in str(excinfo.value)
    assert setup["fake"].create_calls == 0


def test_approval_context_mismatch_rejected(setup):
    ctx = setup["owner"]
    aid = _approved(setup, ctx, qty=QTY)
    with pytest.raises(LiveOrderRejected) as excinfo:
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
            side="buy", qty=QTY * 10,  # different from the approved qty
            approval_id=aid)
    assert "does not match" in str(excinfo.value)
    assert setup["fake"].create_calls == 0


def test_approval_requester_mismatch_rejected(setup):
    ctx = setup["owner"]
    # create a second human operator
    setup["identity"].create_principal("human:op2", "human", "admin", "Op 2")
    other = setup["identity"].context_for("human:op2")
    aid = _approved(setup, other)  # approved FOR op2
    with pytest.raises(LiveOrderRejected):
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet",  # but owner submits
            symbol="BTC/USDT", side="buy", qty=QTY, approval_id=aid)
    assert setup["fake"].create_calls == 0


# ---- happy path + idempotency ---------------------------------------------

def test_live_order_full_happy_path_reconciled(setup):
    ctx = setup["owner"]
    aid = _approved(setup, ctx)
    result = setup["engine"].submit_live_order(
        ctx=ctx, agent_id="agent-1", venue="binance-testnet",
        symbol="BTC/USDT", side="buy", qty=QTY, approval_id=aid)
    assert result["status"] == "FILLED"
    assert result["exchange_order_id"] == "ex-1000"
    assert result["external_ref"] == "binance-testnet:ex-1000"
    # the venue saw OUR client id (idempotency §66)
    assert result["client_order_id"] == setup["fake"].orders["ex-1000"]["clientOrderId"]
    # §80: fill reconciled and confirmed against the venue
    rec = ReconciliationEngine(setup["db"], EventBus(setup["db"]), setup["audit"])
    assert rec.is_confirmed("binance-testnet", "ex-1000")
    # audit trail exists
    entries = setup["audit"].entries(limit=50)
    assert any(e["action"] == "submitted" for e in entries)


def test_idempotent_replay_same_approval_submits_once(setup):
    ctx = setup["owner"]
    aid = _approved(setup, ctx)
    first = setup["engine"].submit_live_order(
        ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
        side="buy", qty=QTY, approval_id=aid)
    second = setup["engine"].submit_live_order(
        ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
        side="buy", qty=QTY, approval_id=aid)
    assert first["id"] == second["id"]
    assert setup["fake"].create_calls == 1  # never double-submitted (§66)


# ---- §68 ambiguity resolution ----------------------------------------------

def test_timeout_marks_ambiguous_then_resolves_without_resubmit(setup):
    fake = FakeExchange(fail_first_with=RequestTimeout("request timed out"))
    adapter = CcxtExchangeAdapter(fake, venue_label="binance-testnet")
    setup["engine"].register_venue("binance-testnet", adapter)
    ctx = setup["owner"]
    aid = _approved(setup, ctx)
    with pytest.raises(LiveOrderAmbiguous):
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
            side="buy", qty=QTY, approval_id=aid)
    assert fake.create_calls == 1  # venue DID receive it
    orders = setup["engine"].orders(status="AMBIGUOUS")
    assert len(orders) == 1
    # §68: resolve by querying the venue, never resubmitting
    resolved = setup["engine"].resolve_ambiguous(orders[0]["id"])
    assert resolved["status"] == "FILLED"
    assert resolved["exchange_order_id"] == "ex-1000"
    assert fake.create_calls == 1  # no resubmission


def test_ambiguous_resolution_not_on_venue_rejects(setup):
    class NeverLandFake(FakeExchange):
        """Response lost BEFORE the venue recorded anything."""
        def create_order(self, symbol, type_, side, amount, price=None, params=None):
            self.create_calls += 1
            raise RequestTimeout("timed out, never landed")
    fake = NeverLandFake()
    adapter = CcxtExchangeAdapter(fake, venue_label="binance-testnet")
    setup["engine"].register_venue("binance-testnet", adapter)
    ctx = setup["owner"]
    aid = _approved(setup, ctx)
    with pytest.raises(LiveOrderAmbiguous):
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
            side="buy", qty=QTY, approval_id=aid)
    resolved = setup["engine"].resolve_ambiguous(setup["engine"].orders("AMBIGUOUS")[0]["id"])
    assert resolved["status"] == "REJECTED"
    assert "no such client order id" in (resolved["error"] or "")


# ---- deterministic risk + reconciliation -----------------------------------

def test_risk_engine_blocks_before_venue(setup):
    setup["risk"].record_loss(50_000_00)  # daily loss limit reached
    ctx = setup["owner"]
    aid = _approved(setup, ctx)
    with pytest.raises(LiveOrderRejected) as excinfo:
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
            side="buy", qty=QTY, approval_id=aid)
    assert "risk engine" in str(excinfo.value)
    assert setup["fake"].create_calls == 0


def test_reconciliation_mismatch_marks_order(setup):
    fake = FakeExchange(cost_multiplier=1.05)  # venue spent 5% more
    adapter = CcxtExchangeAdapter(fake, venue_label="binance-testnet")
    setup["engine"].register_venue("binance-testnet", adapter)
    ctx = setup["owner"]
    aid = _approved(setup, ctx)
    result = setup["engine"].submit_live_order(
        ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
        side="buy", qty=QTY, approval_id=aid)
    assert result["status"] == "MISMATCH"
    disputes = setup["db"].query("SELECT * FROM reconciliation_disputes")
    assert len(disputes) == 1


# ---- circuit breaker --------------------------------------------------------

def test_circuit_breaker_opens_after_repeated_failures(setup):
    class AuthenticationError(Exception):
        pass

    def always_fail(*args, **kwargs):
        raise AuthenticationError("bad api key")

    ctx = setup["owner"]
    for _ in range(5):  # default failure threshold
        fake = FakeExchange()
        # the WHOLE venue fails (ticker + orders): a succeeding endpoint would
        # legitimately reset the breaker each cycle
        fake.create_order = always_fail
        fake.fetch_ticker = always_fail
        adapter = CcxtExchangeAdapter(fake, venue_label="binance-testnet")
        setup["engine"].register_venue("binance-testnet", adapter)
        aid = _approved(setup, ctx)
        with pytest.raises(LiveOrderRejected):
            setup["engine"].submit_live_order(
                ctx=ctx, agent_id=None, venue="binance-testnet",
                symbol="BTC/USDT", side="buy", qty=QTY, approval_id=aid)
    # 6th attempt: circuit is OPEN before any venue call
    aid = _approved(setup, ctx)
    with pytest.raises(CircuitOpen):
        setup["engine"].submit_live_order(
            ctx=ctx, agent_id=None, venue="binance-testnet", symbol="BTC/USDT",
            side="buy", qty=QTY, approval_id=aid)
    assert setup["fake"].create_calls == 0


# ---- adapter + factory -------------------------------------------------------

def test_adapter_rejects_non_ccxt_instance():
    with pytest.raises(ExchangeAdapterError):
        CcxtExchangeAdapter(object())  # type: ignore[arg-type]


def test_adapter_maps_ambiguous_names():
    exc = RequestTimeout("boom")
    mapped = CcxtExchangeAdapter._map(exc)
    from aeos.core.resilience import ErrorClass
    assert mapped is ErrorClass.UNKNOWN


def test_validate_order_shape_static():
    adapter = CcxtExchangeAdapter(FakeExchange(), venue_label="binance-testnet")
    with pytest.raises(ExchangeAdapterError):
        adapter.validate_order_shape(symbol="BTCUSDT", side="buy", qty=1.0)
    with pytest.raises(ExchangeAdapterError):
        adapter.validate_order_shape(symbol="BTC/USDT", side="sideways", qty=1.0)


def test_dry_run_never_hits_venue():
    fake = FakeExchange()
    adapter = CcxtExchangeAdapter(fake, venue_label="binance-testnet")
    out = adapter.submit_market_order(symbol="BTC/USDT", side="buy", qty=QTY,
                                      client_order_id="aeostest", dry_run=True)
    assert out["dry_run"] is True and fake.create_calls == 0


def test_make_testnet_engine_real_ccxt_sandbox():
    ccxt = pytest.importorskip("ccxt")
    from aeos.investments.execution import make_testnet_engine
    db = Database(":memory:")
    migrate(db)
    events, audit = EventBus(db), Audit(db)
    gate = LiveExecutionGate(db, events, audit, mode="limited_live")
    engine, adapter = make_testnet_engine(
        db, events, audit, gate, RiskEngine(db, events, audit),
        ApprovalService(db, events, audit), EmergencyStop(db, events, audit),
        "binance", api_key="test-key", secret="test-secret")
    assert adapter.venue == "binance-testnet"
    # set_sandbox_mode(True) really redirected the URLs to the testnet
    raw = ccxt.binance({"apiKey": "k", "secret": "s"})
    raw.set_sandbox_mode(True)
    assert str(adapter.x.urls["api"]) == str(raw.urls["api"])
