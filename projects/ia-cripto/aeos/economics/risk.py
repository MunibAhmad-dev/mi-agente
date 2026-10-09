"""Risk engine (spec §51): deterministic hard limits. Any breach = BLOCK.

Limits are checked against current exposure state; the engine never executes,
it only authorizes or blocks. 'unknown' outcomes are never treated as success
(§68, §145).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus


@dataclass
class RiskLimits:
    max_position_minor: int = 10_000_00        # per position
    max_daily_loss_minor: int = 50_000_00
    max_drawdown_pct: float = 0.20
    max_exposure_minor: int = 100_000_00
    max_concentration: float = 0.25            # fraction of exposure in one symbol
    max_strategy_exposure_minor: int = 30_000_00
    max_slippage_bps: float = 100.0
    max_fee_bps: float = 50.0


@dataclass
class RiskDecision:
    allowed: bool
    reason: str
    limit: str | None = None


class RiskEngine:
    def __init__(self, db: Database, events: EventBus, audit: Audit, limits: RiskLimits | None = None):
        self.db = db
        self.events = events
        self.audit = audit
        self.limits = limits or RiskLimits()
        db.execute(
            """CREATE TABLE IF NOT EXISTS risk_state (
                key TEXT PRIMARY KEY,
                peak_exposure_minor INTEGER NOT NULL DEFAULT 0,
                daily_loss_minor INTEGER NOT NULL DEFAULT 0,
                day TEXT NOT NULL DEFAULT (date('now'))
            )"""
        )

    # ---- proposal checks ----------------------------------------------
    def check_order(self, *, notional_minor: int, symbol: str, fee_bps: float,
                    slippage_bps: float, current_exposure_by_symbol: dict[str, int],
                    strategy_exposure: int) -> RiskDecision:
        lim = self.limits
        if fee_bps > lim.max_fee_bps:
            return self._block("fee above max_fee_bps", "max_fee")
        if slippage_bps > lim.max_slippage_bps:
            return self._block("slippage above max_slippage_bps", "max_slippage")
        if notional_minor > lim.max_position_minor:
            return self._block("notional above max_position", "max_position")
        total_exposure = sum(current_exposure_by_symbol.values())
        if total_exposure + notional_minor > lim.max_exposure_minor:
            return self._block("total exposure would exceed max_exposure", "max_exposure")
        if strategy_exposure + notional_minor > lim.max_strategy_exposure_minor:
            return self._block("strategy exposure would exceed max_strategy_exposure", "max_strategy_exposure")
        new_symbol_val = current_exposure_by_symbol.get(symbol, 0) + notional_minor
        if total_exposure > 0 and \
           new_symbol_val / (total_exposure + notional_minor) > lim.max_concentration:
            return self._block("symbol concentration above max_concentration", "max_concentration")
        st = self._state()
        if st["daily_loss_minor"] >= lim.max_daily_loss_minor:
            return self._block("daily loss limit reached", "max_daily_loss")
        return RiskDecision(allowed=True, reason="OK")

    def _block(self, reason: str, limit: str) -> RiskDecision:
        self.events.publish("RiskTriggered", {"reason": reason, "limit": limit})
        self.audit.record("risk", "block", limit, {"reason": reason})
        return RiskDecision(allowed=False, reason=reason, limit=limit)

    # ---- exposure tracking ----------------------------------------------
    def _state(self) -> dict:
        self.db.execute(
            "INSERT OR IGNORE INTO risk_state (key) VALUES ('global')"
        )
        row = self.db.one("SELECT * FROM risk_state WHERE key='global'")
        # day rollover resets daily loss
        if row["day"] != self._today():
            self.db.execute(
                "UPDATE risk_state SET daily_loss_minor=0, day=? WHERE key='global'",
                (self._today(),),
            )
            row = self.db.one("SELECT * FROM risk_state WHERE key='global'")
        return dict(row)

    @staticmethod
    def _today() -> str:
        import datetime as _dt
        return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")

    def record_exposure(self, exposure_minor: int) -> None:
        self._state()
        self.db.execute(
            "UPDATE risk_state SET peak_exposure_minor = MAX(peak_exposure_minor, ?) WHERE key='global'",
            (exposure_minor,),
        )

    def record_loss(self, loss_minor: int) -> None:
        """Record realized loss against the daily limit (positive number)."""
        if loss_minor <= 0:
            return
        self._state()
        self.db.execute(
            "UPDATE risk_state SET daily_loss_minor = daily_loss_minor + ? WHERE key='global'",
            (loss_minor,),
        )

    def drawdown_pct(self, current_equity_minor: int) -> float:
        st = self._state()
        peak = st["peak_exposure_minor"]
        if peak <= 0:
            return 0.0
        dd = (peak - current_equity_minor) / peak
        return max(0.0, dd)

    def status(self) -> dict:
        st = self._state()
        return {
            "peak_exposure_minor": st["peak_exposure_minor"],
            "daily_loss_minor": st["daily_loss_minor"],
            "daily_loss_limit_minor": self.limits.max_daily_loss_minor,
            "max_drawdown_pct": self.limits.max_drawdown_pct,
        }
