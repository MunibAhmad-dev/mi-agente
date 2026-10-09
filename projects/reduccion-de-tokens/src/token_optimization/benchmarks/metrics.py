"""Benchmark metrics (spec §35, §40): tokens, cost, latency, fidelity, recovery."""
from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean


@dataclass
class TaskResult:
    dataset: str
    task_id: str
    model: str
    arm: str  # baseline | full | ablation name
    baseline_tokens: int
    optimized_tokens: int
    compression_ms: float
    retrieval_calls: int = 0
    recovery_calls: int = 0
    recovery_tokens: int = 0
    fidelity_failures: int = 0
    rolled_back: int = 0
    sufficient: bool = True  # determinstic sufficiency (invariants preserved or recoverable)
    total_cost: float = 0.0

    @property
    def tokens_saved(self) -> int:
        return max(0, self.baseline_tokens - self.optimized_tokens)

    @property
    def reduction_pct(self) -> float:
        return 100.0 * self.tokens_saved / self.baseline_tokens if self.baseline_tokens else 0.0


@dataclass
class SuiteReport:
    arm: str
    model: str
    tasks: int = 0
    baseline_tokens: int = 0
    optimized_tokens: int = 0
    compression_ms: float = 0.0
    retrieval_calls: int = 0
    recovery_calls: int = 0
    recovery_tokens: int = 0
    fidelity_failures: int = 0
    rolled_back: int = 0
    successes: int = 0
    total_cost: float = 0.0
    per_dataset: dict = field(default_factory=dict)

    @property
    def reduction_pct(self) -> float:
        return 100.0 * (self.baseline_tokens - self.optimized_tokens) / self.baseline_tokens if self.baseline_tokens else 0.0

    @property
    def success_rate(self) -> float:
        return self.successes / self.tasks if self.tasks else 0.0

    @property
    def cost_per_successful_task(self) -> float:
        return self.total_cost / self.successes if self.successes else float("inf")


def aggregate(results: list[TaskResult], arm: str, model: str) -> SuiteReport:
    rep = SuiteReport(arm=arm, model=model)
    rep.tasks = len(results)
    rep.baseline_tokens = sum(r.baseline_tokens for r in results)
    rep.optimized_tokens = sum(r.optimized_tokens for r in results)
    rep.compression_ms = round(sum(r.compression_ms for r in results), 2)
    rep.retrieval_calls = sum(r.retrieval_calls for r in results)
    rep.recovery_calls = sum(r.recovery_calls for r in results)
    rep.recovery_tokens = sum(r.recovery_tokens for r in results)
    rep.fidelity_failures = sum(r.fidelity_failures for r in results)
    rep.rolled_back = sum(r.rolled_back for r in results)
    rep.successes = sum(1 for r in results if r.sufficient)
    rep.total_cost = round(sum(r.total_cost for r in results), 6)
    for r in results:
        d = rep.per_dataset.setdefault(
            r.dataset,
            {"tasks": 0, "baseline": 0, "optimized": 0, "successes": 0, "recovery_calls": 0},
        )
        d["tasks"] += 1
        d["baseline"] += r.baseline_tokens
        d["optimized"] += r.optimized_tokens
        d["successes"] += 1 if r.sufficient else 0
        d["recovery_calls"] += r.recovery_calls
    return rep
