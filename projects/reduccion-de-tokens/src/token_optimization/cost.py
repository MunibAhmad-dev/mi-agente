"""Total cost model (spec §37). Cost per successful task is the master metric."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CostBreakdown:
    input_tokens: int = 0
    output_tokens: int = 0
    input_cost: float = 0.0
    output_cost: float = 0.0
    compression_cost: float = 0.0        # modeled from CPU time (seconds * hourly rate)
    retrieval_cost: float = 0.0          # modeled from retrieval token spends
    embedding_cost: float = 0.0
    reranking_cost: float = 0.0
    tool_cost: float = 0.0
    latency_cost: float = 0.0
    recovery_cost: float = 0.0

    @property
    def total(self) -> float:
        return (
            self.input_cost + self.output_cost + self.compression_cost
            + self.retrieval_cost + self.embedding_cost + self.reranking_cost
            + self.tool_cost + self.latency_cost + self.recovery_cost
        )


@dataclass
class CostModel:
    input_price_per_mtok: float = 0.0
    output_price_per_mtok: float = 0.0
    cpu_hourly_cost: float = 0.05       # reference value, configurable
    latency_cost_per_second: float = 0.0

    def price_input(self, tokens: int) -> float:
        return tokens / 1_000_000 * self.input_price_per_mtok

    def price_output(self, tokens: int) -> float:
        return tokens / 1_000_000 * self.output_price_per_mtok

    def price_cpu_ms(self, ms: float) -> float:
        return (ms / 1000.0) / 3600.0 * self.cpu_hourly_cost

    def breakdown(self, *, input_tokens: int = 0, output_tokens: int = 0,
                  compression_ms: float = 0.0, retrieval_tokens: int = 0,
                  recovery_tokens: int = 0, latency_s: float = 0.0) -> CostBreakdown:
        cb = CostBreakdown(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_cost=self.price_input(input_tokens),
            output_cost=self.price_output(output_tokens),
            compression_cost=self.price_cpu_ms(compression_ms),
            retrieval_cost=self.price_input(retrieval_tokens) * 0.1,  # local FTS: ~10% of input price
            recovery_cost=self.price_input(recovery_tokens) * 0.1,
            latency_cost=self.latency_cost_per_second * latency_s,
        )
        return cb


@dataclass
class TaskRunMetrics:
    task_id: str
    model: str
    baseline_input_tokens: int = 0
    optimized_input_tokens: int = 0
    output_tokens: int = 0
    compression_ms: float = 0.0
    retrieval_tokens: int = 0
    recovery_tokens: int = 0
    latency_s: float = 0.0
    success: bool = False
    quality: float = 0.0
    cost: CostBreakdown | None = None

    @property
    def tokens_saved(self) -> int:
        return max(0, self.baseline_input_tokens - self.optimized_input_tokens)


def cost_per_successful_task(runs: list[TaskRunMetrics]) -> float | None:
    total = sum((r.cost.total if r.cost else 0.0) for r in runs)
    successes = sum(1 for r in runs if r.success)
    return (total / successes) if successes else None


def successful_task_efficiency(runs: list[TaskRunMetrics]) -> float | None:
    """successful tasks / total cost (spec §1). Units: successes per currency unit."""
    total = sum((r.cost.total if r.cost else 0.0) for r in runs)
    successes = sum(1 for r in runs if r.success)
    return (successes / total) if total > 0 else None
