"""Context Budget Planner (spec §31).

Instead of fixed compression ratios ("compress 50%"), the budget is derived
from the target model profile: context window minus reserved output, tool
overhead and a safety margin. Task policies can further cap it.
"""
from __future__ import annotations

from dataclasses import dataclass

from .tokenization.providers import ModelProfileRegistry
from .core.classifier import TaskPolicy


@dataclass
class BudgetPlan:
    model: str
    context_window: int
    reserved_output: int
    tool_overhead: int
    safety_margin: float
    available_context: int
    source: str  # "policy" | "model-derived"


class ContextBudgetPlanner:
    def __init__(self, registry: ModelProfileRegistry | None = None) -> None:
        self.registry = registry or ModelProfileRegistry()

    def plan(
        self,
        model: str,
        task_policy: TaskPolicy | None = None,
        expected_output_tokens: int = 2048,
        tool_overhead: int = 512,
        safety_margin: float = 0.10,
    ) -> BudgetPlan:
        profile = self.registry.get(model)
        if not 0 <= safety_margin < 0.9:
            raise ValueError("safety_margin must be in [0, 0.9)")
        usable = int(profile.context_window * (1.0 - safety_margin))
        available = usable - expected_output_tokens - tool_overhead
        if available <= 0:
            raise ValueError(
                f"model {model}: window {profile.context_window} too small for "
                f"output {expected_output_tokens} + overhead {tool_overhead}"
            )
        source = "model-derived"
        if task_policy is not None and task_policy.token_budget is not None:
            available = min(available, task_policy.token_budget)
            source = "policy"
        return BudgetPlan(
            model=profile.name,
            context_window=profile.context_window,
            reserved_output=expected_output_tokens,
            tool_overhead=tool_overhead,
            safety_margin=safety_margin,
            available_context=available,
            source=source,
        )
