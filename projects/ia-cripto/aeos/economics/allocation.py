"""Capital Allocation Engine (spec §18).

Deterministic scoring over the 11 specified inputs producing APPROVE /
PARTIAL_APPROVE / DEFER / REJECT plus a suggested amount. PuLP (or OR-Tools)
can replace the portfolio step via the IOptimizationEngine adapter interface
below; the pure-Python default needs no extra dependencies.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AllocationInputs:
    expected_return: float          # e.g. 0.15 = +15%
    historical_return: float
    risk: float                     # 0..1
    uncertainty: float              # 0..1
    capital_requirement: int        # minor units requested
    information_gain: float         # 0..1
    liquidity: float                # 0..1 (1 = fully liquid)
    correlation: float              # -1..1 vs existing portfolio
    strategy_quality: float         # 0..1
    agent_quality: float            # 0..1
    resource_cost: int              # minor units estimated operating cost


@dataclass
class AllocationVerdict:
    decision: str                   # APPROVE / PARTIAL_APPROVE / DEFER / REJECT
    amount_minor: int
    score: float
    reasons: list[str]


class CapitalAllocationEngine:
    def __init__(self, available_minor: int, threshold_score: float = 0.40,
                 min_info_gain: float = 0.15, defer_below_score: float = 0.30):
        self.available = available_minor
        self.threshold_score = threshold_score
        self.min_info_gain = min_info_gain
        self.defer_below_score = defer_below_score

    def evaluate(self, inp: AllocationInputs) -> AllocationVerdict:
        reasons: list[str] = []
        if inp.information_gain < self.min_info_gain:
            return AllocationVerdict("REJECT", 0, 0.0, ["information_gain below minimum"])
        if inp.liquidity < 0.2:
            reasons.append("low liquidity penalized")
        if inp.correlation > 0.8:
            reasons.append("high correlation with existing portfolio penalized")

        # weighted quality score in [0,1]
        score = (
            0.30 * max(0.0, inp.expected_return)
            + 0.10 * max(0.0, inp.historical_return)
            + 0.15 * inp.information_gain
            + 0.10 * inp.strategy_quality
            + 0.10 * inp.agent_quality
            + 0.05 * inp.liquidity
            - 0.25 * max(0.0, inp.risk)
            - 0.20 * max(0.0, inp.uncertainty)
            - 0.10 * max(0.0, inp.correlation)
            - 0.05 * min(1.0, inp.resource_cost / max(1, self.available))
        )
        score = round(score, 4)

        if score < self.defer_below_score:
            return AllocationVerdict("DEFER", 0, score, reasons + ["score below defer threshold"])
        if score < self.threshold_score:
            return AllocationVerdict("REJECT", 0, score, reasons + ["score below approval threshold"])

        amount = min(inp.capital_requirement, self.available)
        if amount <= 0:
            return AllocationVerdict("DEFER", 0, score, reasons + ["no capital available"])
        if score < self.threshold_score + 0.10 and inp.capital_requirement > self.available * 0.5:
            # borderline: fund at most half of the request
            amount = int(self.available * 0.5)
            reasons.append("borderline score: partial funding")
            return AllocationVerdict("PARTIAL_APPROVE", amount, score, reasons)
        return AllocationVerdict("APPROVE", amount, score, reasons)


class PuLPAllocationAdapter:
    """Optional IOptimizationEngine adapter (spec §96). Import PuLP lazily so the
    core stays dependency-free; raises ImportError with guidance if unavailable."""

    @staticmethod
    def optimize_portfolio(requests: list[tuple[str, float, int]], available_minor: int) -> dict[str, int]:
        """Maximize sum(score_i * allocated_i) s.t. sum(allocated_i) <= available,
        0 <= allocated_i <= requested_i. Returns {request_id: allocated_minor}."""
        try:
            import pulp  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "PuLP is not installed; add the 'optimization' extra or use the "
                "deterministic CapitalAllocationEngine"
            ) from exc
        prob = pulp.LpProblem("capital_allocation", pulp.LpMaximize)
        vars_ = {
            rid: pulp.LpVariable(f"a_{rid}", lowBound=0, upBound=req)
            for rid, _s, req in requests
        }
        prob += pulp.lpSum(score * vars_[rid] for rid, score, _req in requests)
        prob += pulp.lpSum(vars_.values()) <= available_minor
        prob.solve(pulp.PULP_CBC_CMD(msg=False))
        return {rid: int(round(v.value() or 0)) for rid, v in vars_.items()}
