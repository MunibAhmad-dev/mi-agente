"""Live execution engine (spec §48-49, §66, §68, §71, §80, §121-122, §128):
the missing 10% — REAL exchange execution with testnet-first rollout.

Invariants, enforced by construction:
1. NO order reaches the venue without (a) EXECUTE_TRADE permission, (b) mode
   gate (limited_live/production), (c) an APPROVED human approval whose
   context MATCHES this exact order (§71 double condition).
2. Every venue interaction goes through the circuit breaker with §121
   classification; UNKNOWN outcomes are resolved by querying the venue
   (never blind resubmission, §68).
3. Idempotency: client_order_id derived from the approval id — an approval
   can fund exactly one order; replays return the existing order (§66).
4. Every fill is reconciled against the venue before any accounting (§67).
5. EMERGENCY STOP freezes everything instantly.
"""
from __future__ import annotations

import json
import uuid

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.resilience import (
    CircuitBreaker, CircuitOpen, ErrorClass, RetryPolicy, call_with_resilience,
)
from aeos.economics.risk import RiskEngine
from aeos.governance.approvals import ApprovalRequired, ApprovalService
from aeos.governance.permissions import AuthorizationContext, PermissionDenied
from aeos.investments.ccxt_adapter import (
    CcxtExchangeAdapter, ExchangeAdapterError, ExchangeLike,
)
from aeos.investments.live import LiveExecutionGate

# §71: the mode gate lives in LiveExecutionGate; the engine adds approval
# + estop + risk on top. Production modes: see LiveExecutionGate.AUTHORIZED_MODES.


class LiveOrderError(Exception):
    pass


class LiveOrderRejected(LiveOrderError):
    """Order was NOT submitted; safe to correct and retry."""


class LiveOrderAmbiguous(LiveOrderError):
    """Outcome uncertain: the order may exist on the venue. Resolve by
    fetch/reconciliation before any new submission (§68)."""


def _venue_label(exchange_id: str, testnet: bool) -> str:
    return f"{exchange_id}-testnet" if testnet else exchange_id


class LiveExecutionEngine:
    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 gate: LiveExecutionGate, risk: RiskEngine,
                 approvals: ApprovalService, estop: EmergencyStop,
                 breaker: CircuitBreaker | None = None):
        self.db = db
        self.events = events
        self.audit = audit
        self.gate = gate
        self.risk = risk
        self.approvals = approvals
        self.estop = estop
        self.breaker = breaker or CircuitBreaker(db, events, audit)
        self.adapters: dict[str, CcxtExchangeAdapter] = {}

    # ---- venue registry ----------------------------------------------------
    def register_venue(self, label: str, adapter: CcxtExchangeAdapter) -> None:
        """Register a REAL adapter for a venue label ('binance-testnet')."""
        if not isinstance(adapter, CcxtExchangeAdapter):
            raise LiveOrderError("venue adapter must be a CcxtExchangeAdapter")
        self.adapters[label] = adapter
        self.audit.record("live_trading", "register_venue", label,
                          {"exchange_id": getattr(adapter.x, "id", "?")})

    def _adapter(self, venue: str) -> CcxtExchangeAdapter:
        if venue not in self.adapters:
            raise LiveOrderRejected(f"venue {venue!r} not registered")
        return self.adapters[venue]

    # ---- order submission ----------------------------------------------------
    def submit_live_order(self, *, ctx: AuthorizationContext, agent_id: str | None,
                          venue: str, symbol: str, side: str, qty: float,
                          approval_id: str,
                          exposure_by_symbol: dict[str, int] | None = None,
                          strategy_exposure_minor: int = 0) -> dict:
        """Submit a REAL market order behind the full §71 chain.

        Raises LiveOrderRejected (not submitted) or LiveOrderAmbiguous
        (may exist; resolve first).
        """
        adapter = self._adapter(venue)
        # ---- §71 gate chain: permission → mode → estop → approval → risk ----
        ctx.require("EXECUTE_TRADE")  # PermissionDenied otherwise
        if self.estop.is_active():
            raise LiveOrderRejected("EMERGENCY STOP active: live trading frozen")
        verdict = self.gate.authorize(ctx.principal_id, symbol, 0)
        if not verdict["allowed"]:
            raise LiveOrderRejected(verdict["reason"])
        self._require_matching_approval(approval_id, ctx, venue, symbol, side, qty)
        self._validate_inputs(symbol, side, qty)

        # ---- deterministic risk limits ------------------------------------
        price = self._venue_price(adapter, venue, symbol)
        notional_minor = int(round(price * qty * 100))
        decision = self.risk.check_order(
            notional_minor=notional_minor, symbol=symbol,
            fee_bps=10.0, slippage_bps=10.0,
            current_exposure_by_symbol=exposure_by_symbol or {},
            strategy_exposure=strategy_exposure_minor,
        )
        if not decision.allowed:
            self.audit.record("live_trading", "risk_block", symbol,
                              {"reason": decision.reason, "limit": decision.limit})
            raise LiveOrderRejected(f"risk engine: {decision.reason}")

        # ---- idempotency: one approval funds exactly one order (§66) ------
        client_order_id = self._client_order_id(approval_id)
        existing = self.db.one(
            "SELECT * FROM live_orders WHERE client_order_id=?", (client_order_id,))
        if existing:
            row = dict(existing)
            if row["status"] in ("FILLED", "PENDING", "AMBIGUOUS"):
                return row  # replay: never double-submit (§66)
            if row["status"] == "MISMATCH":
                raise LiveOrderRejected(
                    f"approval {approval_id} already funded order {row['id']}"
                    " in MISMATCH state; resolve the dispute first")
            # REJECTED: definitive non-landing -> retry the SAME logical order
            # under the same client id (one approval = one logical order)
            order_id = row["id"]
            self._mark(order_id, "PENDING")
        else:
            order_id = "lvo_" + uuid.uuid4().hex[:12]
            with self.db.transaction() as conn:
                conn.execute(
                    """INSERT INTO live_orders (id, client_order_id, agent_id, venue,
                           symbol, side, qty, approval_id, status, notional_minor)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)""",
                    (order_id, client_order_id, agent_id, venue, symbol, side,
                     qty, approval_id, notional_minor),
                )

        # ---- submit through breaker with §121 classification ---------------
        try:
            response = call_with_resilience(
                venue,
                lambda: adapter.submit_market_order(
                    symbol=symbol, side=side, qty=qty,
                    client_order_id=client_order_id),
                self.breaker, RetryPolicy(max_attempts=1),  # no blind retry
                on_unknown=self._on_unknown_submit(order_id, venue, symbol),
            )
        except LiveOrderAmbiguous:
            raise  # already marked AMBIGUOUS by the on_unknown handler
        except ExchangeAdapterError as exc:
            if exc.error_class in (ErrorClass.SECURITY, ErrorClass.PERMANENT,
                                   ErrorClass.POLICY, ErrorClass.INTERNAL):
                # venue definitively refused semantics: no order can exist
                self._mark(order_id, "REJECTED", error=str(exc))
                raise LiveOrderRejected(str(exc)) from exc
            # UNKNOWN / EXTERNAL / TRANSIENT: the request MAY have landed (§68)
            self._mark(order_id, "AMBIGUOUS", error=str(exc))
            raise LiveOrderAmbiguous(str(exc)) from exc
        except CircuitOpen:
            raise  # row stays PENDING; retry after the breaker resets

        if response.get("dry_run"):
            self._mark(order_id, "REJECTED", error="dry_run submission refused")
            raise LiveOrderRejected("dry_run submission refused in live engine")

        return self._on_submitted(order_id, response, venue, symbol)

    # ---- §71 approval binding ---------------------------------------------
    def _require_matching_approval(self, approval_id: str, ctx: AuthorizationContext,
                                   venue: str, symbol: str, side: str, qty: float) -> None:
        """The approval must be APPROVED and its context must MATCH this exact
        order: same symbol, side, qty, venue — and same actor as requester."""
        row = self.db.one("SELECT * FROM approvals WHERE id=?", (approval_id,))
        if not row:
            raise LiveOrderRejected(f"unknown approval {approval_id!r}")
        if row["status"] == "PENDING":
            raise ApprovalRequired(approval_id, "live_order")
        if row["status"] != "APPROVED":
            raise LiveOrderRejected(
                f"approval {approval_id} is {row['status']}; only APPROVED orders execute")
        try:
            context = json.loads(row["context_json"] or "{}")
        except json.JSONDecodeError as exc:
            raise LiveOrderRejected(f"corrupt approval context: {exc}") from exc
        expected = {
            "kind": "live_order", "venue": venue, "symbol": symbol,
            "side": side, "qty": qty, "requested_by": ctx.principal_id,
        }
        mismatches = [k for k, v in expected.items() if context.get(k) != v]
        if mismatches:
            self.audit.record("live_trading", "approval_mismatch", approval_id,
                              {"mismatches": mismatches})
            raise LiveOrderRejected(
                f"approval context does not match the order: {mismatches}")
        if row["requested_by"] != ctx.principal_id:
            raise LiveOrderRejected(
                "approval requester does not match the submitting actor")

        self.events.publish("CapitalAllocated", {
            "kind": "live_order_approved", "approval_id": approval_id})

    # ---- venue outcome handling (§68) ---------------------------------------
    def _on_submitted(self, order_id: str, response: dict, venue: str,
                      symbol: str) -> dict:
        """Record the venue response; reconcile the fill immediately."""
        ex_id = str(response.get("id"))
        status = str(response.get("status") or "open")
        filled = float(response.get("filled") or 0.0)
        avg = float(response.get("average") or response.get("price") or 0.0)
        fee = None
        if isinstance(response.get("fee"), dict):
            fee = response["fee"].get("cost")
        ext_ref = f"{venue}:{ex_id}"
        # FILLED only when the venue reports a real fill; otherwise the order
        # is KNOWN to exist -> PENDING. AMBIGUOUS is reserved for "existence
        # unknown" (§68), never for a merely unfilled order.
        new_status = "FILLED" if (filled and filled > 0 and avg) else "PENDING"
        self.db.execute(
            """UPDATE live_orders SET status=?, exchange_order_id=?, fill_price=?,
                   fill_qty=?, fee_paid=?, external_ref=?, updated_at=datetime('now')
               WHERE id=?""",
            (new_status, ex_id, avg or None, filled or None, fee, ext_ref, order_id),
        )
        self.events.publish("OrderFilled" if new_status == "FILLED" else "OrderSubmitted",
                            {"order_id": order_id, "venue": venue, "symbol": symbol,
                             "mode": "LIVE", "exchange_order_id": ex_id})
        self.audit.record("live_trading", "submitted", order_id,
                          {"venue": venue, "exchange_order_id": ex_id, "status": new_status})
        if new_status == "FILLED":
            self._reconcile_fill(order_id, venue, symbol, ex_id,
                                 internal_notional=self.db.one(
                                     "SELECT notional_minor FROM live_orders WHERE id=?",
                                     (order_id,))["notional_minor"],
                                 external_cost=self._external_cost(response))
        row = self.db.one("SELECT * FROM live_orders WHERE id=?", (order_id,))
        return dict(row)

    def _external_cost(self, response: dict) -> int | None:
        """Venue-reported cost (quote spent/received) in minor units.
        Falls back to price × filled when the venue omits cost."""
        cost = response.get("cost")
        if cost is None:
            price, filled = response.get("price"), response.get("filled")
            if price and filled:
                cost = float(price) * float(filled)
        if cost:
            return int(round(float(cost) * 100))
        return None

    def _on_unknown_submit(self, order_id: str, venue: str, symbol: str):
        def _handler(exc: BaseException):
            self._mark(order_id, "AMBIGUOUS", error=f"UNKNOWN: {exc}")
            raise LiveOrderAmbiguous(
                f"order {order_id} outcome UNKNOWN ({exc}); resolve with venue (§68)") from exc
        return _handler

    def resolve_ambiguous(self, order_id: str) -> dict:
        """§68 resolution: query the venue for the order we may have created.
        Uses client_order_id first, then by approval linkage. Never resubmits."""
        row = self.db.one("SELECT * FROM live_orders WHERE id=?", (order_id,))
        if not row:
            raise KeyError(f"unknown live order {order_id!r}")
        if row["status"] != "AMBIGUOUS":
            return dict(row)
        adapter = self._adapter(row["venue"])
        try:
            found = call_with_resilience(
                row["venue"],
                lambda: adapter.find_by_client_order_id(row["client_order_id"], row["symbol"]),
                self.breaker, RetryPolicy(max_attempts=2))
        except ExchangeAdapterError as exc:
            raise LiveOrderAmbiguous(
                f"cannot resolve order {order_id} yet: {exc}") from exc
        if not found:
            # venue never saw it: the submission never landed -> rejected
            self._mark(order_id, "REJECTED", error="venue has no such client order id")
            return dict(self.db.one("SELECT * FROM live_orders WHERE id=?", (order_id,)))
        ex_id = str(found.get("id"))
        self.db.execute(
            """UPDATE live_orders SET status='PENDING', exchange_order_id=?,
                   external_ref=?, updated_at=datetime('now') WHERE id=?""",
            (ex_id, f"{row['venue']}:{ex_id}", order_id))
        self.audit.record("live_trading", "ambiguous_resolved", order_id,
                          {"exchange_order_id": ex_id})
        return self._on_submitted(order_id, found, row["venue"], row["symbol"])

    # ---- reconciliation (§67) --------------------------------------------
    def _reconcile_fill(self, order_id: str, venue: str, symbol: str,
                        exchange_order_id: str, *, internal_notional: int | None,
                        external_cost: int | None) -> None:
        from aeos.reconciliation.engine import ReconciliationEngine
        rec = ReconciliationEngine(self.db, self.events, self.audit)
        rec.record_external(venue, exchange_order_id, "order",
                            amount_minor=external_cost, currency="usd",
                            raw={"order_id": order_id})
        result = rec.compare(venue, exchange_order_id, internal_notional, external_cost)
        if result["status"] == "MISMATCH":
            self._mark(order_id, "MISMATCH", error=f"dispute {result['dispute_id']}")
        elif result["status"] == "CONFIRMED":
            self.db.execute(
                "UPDATE live_orders SET status='FILLED', updated_at=datetime('now')"
                " WHERE id=?", (order_id,))

    def _venue_price(self, adapter: CcxtExchangeAdapter, venue: str,
                     symbol: str) -> float:
        """Last price for notional estimation; through the breaker."""
        def _fetch():
            tick = adapter.ticker(symbol)
            price = tick.get("last") or tick.get("close")
            if not price:
                raise ExchangeAdapterError(
                    f"no price in ticker for {symbol}", ErrorClass.PERMANENT)
            return float(price)
        try:
            return call_with_resilience(venue, _fetch, self.breaker,
                                        RetryPolicy(max_attempts=2))
        except ExchangeAdapterError as exc:
            if exc.error_class is ErrorClass.UNKNOWN:
                raise LiveOrderAmbiguous(str(exc)) from exc
            raise LiveOrderRejected(f"cannot price {symbol}: {exc}") from exc

    @staticmethod
    def _client_order_id(approval_id: str) -> str:
        return "aeos" + approval_id.replace("apr_", "").replace("-", "")[:16]

    @staticmethod
    def _validate_inputs(symbol: str, side: str, qty: float) -> None:
        parts = symbol.split("/")
        if len(parts) != 2 or not all(p.strip().isalnum() for p in parts):
            raise LiveOrderRejected(f"invalid symbol {symbol!r}")
        if side not in ("buy", "sell"):
            raise LiveOrderRejected(f"invalid side {side!r}")
        if qty <= 0:
            raise LiveOrderRejected("qty must be positive")

    def _mark(self, order_id: str, status: str, error: str | None = None) -> None:
        self.db.execute(
            "UPDATE live_orders SET status=?, error=?, updated_at=datetime('now')"
            " WHERE id=?", (status, error, order_id))

    # ---- reporting -------------------------------------------------------
    def orders(self, status: str | None = None, limit: int = 50) -> list[dict]:
        sql = "SELECT * FROM live_orders"
        params: tuple = ()
        if status:
            sql += " WHERE status=?"
            params = (status,)
        return [dict(r) for r in self.db.query(sql + " ORDER BY created_at DESC LIMIT ?",
                                               params + (limit,))]

    def position_summary(self) -> dict:
        rows = self.db.query(
            "SELECT venue, symbol,"
            " SUM(CASE WHEN side='buy' THEN fill_qty ELSE -fill_qty END) AS net_qty,"
            " SUM(CASE WHEN side='buy' THEN notional_minor ELSE -notional_minor END)"
            "   AS net_notional_minor"
            " FROM live_orders WHERE status='FILLED'"
            " GROUP BY venue, symbol")
        return {"positions": [dict(r) for r in rows],
                "open_orders": len(self.orders(status="PENDING")),
                "ambiguous_orders": len(self.orders(status="AMBIGUOUS")),
                "mismatch_orders": len(self.orders(status="MISMATCH"))}


def make_testnet_engine(db: Database, events: EventBus, audit: Audit,
                        gate: LiveExecutionGate, risk: RiskEngine,
                        approvals: ApprovalService, estop: EmergencyStop,
                        exchange_id: str, api_key: str, secret: str,
                        password: str | None = None) -> tuple[LiveExecutionEngine, CcxtExchangeAdapter]:
    """Testnet-first factory: real ccxt exchange in sandbox mode wired into the
    full §71 chain. Production venues are constructed explicitly, never here."""
    from aeos.investments.ccxt_adapter import make_testnet_exchange
    engine = LiveExecutionEngine(db, events, audit, gate, risk, approvals, estop)
    ex = make_testnet_exchange(exchange_id, api_key, secret, password)
    adapter = CcxtExchangeAdapter(ex, venue_label=_venue_label(exchange_id, testnet=True))
    engine.register_venue(adapter.venue, adapter)
    return engine, adapter
