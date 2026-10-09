"""Paper trading engine (spec §49, §128): realistic fills with fees and
slippage, explicitly PAPER. Paper results are recorded as such and NEVER
reported as real profit (§2, §138); they feed learning, not REAL_REVENUE.
"""
from __future__ import annotations

import uuid

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.economics.risk import RiskDecision, RiskEngine


class PaperTradingEngine:
    def __init__(self, db: Database, events: EventBus, audit: Audit, risk: RiskEngine,
                 fee_bps: float = 10.0, slippage_bps: float = 5.0):
        self.db = db
        self.events = events
        self.audit = audit
        self.risk = risk
        self.fee_bps = fee_bps
        self.slippage_bps = slippage_bps

    def submit(self, *, agent_id: str | None, symbol: str, side: str, qty: float,
               reference_price: float, exposure_by_symbol: dict[str, int] | None = None,
               strategy_exposure_minor: int = 0) -> dict:
        if side not in ("buy", "sell"):
            raise ValueError("side must be buy or sell")
        if qty <= 0 or reference_price <= 0:
            raise ValueError("qty and price must be positive")
        # symbol must look like BASE/QUOTE (exchange convention, §48)
        parts = symbol.split("/")
        if len(parts) != 2 or not all(p.strip() for p in parts) or \
                not all(p.isalnum() for p in parts):
            raise ValueError(f"invalid symbol {symbol!r}; expected BASE/QUOTE (e.g. BTC/USDT)")
        slip = self.slippage_bps / 10_000
        fill_price = reference_price * (1 + slip) if side == "buy" else reference_price * (1 - slip)
        notional = fill_price * qty
        notional_minor = int(round(notional * 100))

        decision = self.risk.check_order(
            notional_minor=notional_minor, symbol=symbol,
            fee_bps=self.fee_bps, slippage_bps=self.slippage_bps,
            current_exposure_by_symbol=exposure_by_symbol or {},
            strategy_exposure=strategy_exposure_minor,
        )
        if not decision.allowed:
            return {"status": "BLOCKED", "reason": decision.reason, "limit": decision.limit}

        order_id = "ppr_" + uuid.uuid4().hex[:12]
        with self.db.transaction() as conn:
            conn.execute(
                """INSERT INTO paper_orders (id, agent_id, symbol, side, qty, price,
                       fee_bps, slippage_bps, notional_minor, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'filled')""",
                (order_id, agent_id, symbol, side, qty, fill_price,
                 self.fee_bps, self.slippage_bps, notional_minor),
            )
        self.events.publish("OrderFilled",
                            {"order_id": order_id, "symbol": symbol, "side": side,
                             "mode": "PAPER"})
        self.audit.record("paper_trading", "submit", order_id,
                          {"symbol": symbol, "side": side, "qty": qty,
                           "fill_price": fill_price, "notional_minor": notional_minor})
        return {
            "status": "filled", "order_id": order_id, "symbol": symbol, "side": side,
            "qty": qty, "fill_price": fill_price, "notional_minor": notional_minor,
            "mode": "PAPER",  # explicit: this is not real execution (§128)
        }

    def positions(self) -> list[dict]:
        return [dict(r) for r in self.db.query(
            "SELECT * FROM paper_orders ORDER BY created_at DESC LIMIT 100"
        )]
