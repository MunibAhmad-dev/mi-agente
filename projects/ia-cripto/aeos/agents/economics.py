"""Agent economics (spec §12): per-agent financial state and derived metrics."""
from __future__ import annotations

from aeos.core.db import Database


class AgentEconomics:
    def __init__(self, db: Database):
        self.db = db

    def snapshot(self, agent_id: str) -> dict:
        row = self.db.one("SELECT * FROM agent_economics WHERE agent_id=?", (agent_id,))
        if not row:
            raise KeyError(f"unknown agent {agent_id!r}")
        cash = row["cash_minor"]
        allocated = row["allocated_minor"]
        revenue = row["revenue_minor"]
        expenses = row["expenses_minor"]
        profit = revenue - expenses
        ticks = max(1, row["survival_ticks"])
        burn = max(0, expenses) // ticks  # per tick
        runway = (cash // burn) if burn > 0 else None
        invested = max(1, allocated)
        return {
            "agent_id": agent_id,
            "cash_minor": cash,
            "allocated_minor": allocated,
            "available_minor": cash,  # cash is what remains of the allocation
            "revenue_minor": revenue,
            "expenses_minor": expenses,
            "profit_minor": profit,
            "burn_per_tick_minor": burn,
            "runway_ticks": runway,
            "roi": round(profit / invested, 4),
            "risk": row["risk_score"],
            "information_gain": row["information_gain"],
            "survival_ticks": row["survival_ticks"],
        }

    def add_revenue(self, agent_id: str, amount_minor: int,
                    external_reference: str | None = None, *,
                    synthetic_allowed: bool = False) -> None:
        """Record revenue on the agent's account.

        §80 anchoring: real revenue MUST name the external artifact that
        produced it (payment id, order id, campaign id). Test/what-if callers
        may pass synthetic_allowed=True (the audit trail distinguishes them).
        """
        if amount_minor <= 0:
            raise ValueError("revenue must be positive")
        if not external_reference and not synthetic_allowed:
            raise ValueError(
                "add_revenue requires external_reference (§80); pass "
                "synthetic_allowed=True only for tests/what-if analysis"
            )
        self.db.execute(
            "UPDATE agent_economics SET revenue_minor = revenue_minor + ?, survival_ticks = survival_ticks + 1"
            " WHERE agent_id=?",
            (amount_minor, agent_id),
        )

    def add_expense(self, agent_id: str, amount_minor: int) -> None:
        if amount_minor <= 0:
            raise ValueError("expense must be positive")
        self.db.execute(
            "UPDATE agent_economics SET expenses_minor = expenses_minor + ? WHERE agent_id=?",
            (amount_minor, agent_id),
        )

    def tick(self, agent_id: str) -> None:
        self.db.execute(
            "UPDATE agent_economics SET survival_ticks = survival_ticks + 1 WHERE agent_id=?",
            (agent_id,),
        )

    def set_scores(self, agent_id: str, risk: float | None = None,
                   information_gain: float | None = None) -> None:
        if risk is not None:
            self.db.execute("UPDATE agent_economics SET risk_score=? WHERE agent_id=?", (risk, agent_id))
        if information_gain is not None:
            self.db.execute(
                "UPDATE agent_economics SET information_gain=? WHERE agent_id=?",
                (information_gain, agent_id),
            )
