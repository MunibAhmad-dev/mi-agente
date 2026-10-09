"""Adaptive Compression Router (spec §30, §62, §63).

Chooses strategy + compressor per item given content type, risk, task policy,
token budget and latency budget. Deterministic, local, zero-model.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..core.ir import ContextItem, ContentType, Role
from ..core.interfaces import Strategy
from ..core.classifier import TaskPolicy

# minimum content size (tokens) below which compression overhead is not worth it (spec §16)
_MIN_TOKENS_TO_COMPRESS = 200


@dataclass
class RoutingDecision:
    strategy: Strategy
    compressor: str | None
    reason: str
    target_budget: int | None = None
    risk_limit: str = "high"
    recovery_policy: str = "targeted"


class AdaptiveCompressionRouter:
    def __init__(self, min_tokens_to_compress: int = _MIN_TOKENS_TO_COMPRESS) -> None:
        self.min_tokens = min_tokens_to_compress

    def decide(self, item: ContextItem, policy: TaskPolicy, latency_budget_ms: float = 50.0,
               token_count: int | None = None) -> RoutingDecision:
        n = token_count if token_count is not None else max(1, len(item.content) // 4)

        # CRITICAL content and system/developer instructions are never transformed (spec §13)
        if item.risk.value == "critical":
            return RoutingDecision(Strategy.KEEP, None, "critical content preserved verbatim")
        if item.role in (Role.SYSTEM, Role.DEVELOPER):
            return RoutingDecision(Strategy.KEEP, None, "system/developer instruction preserved")

        if n < self.min_tokens:
            return RoutingDecision(Strategy.KEEP, None, f"too small to justify compression ({n} tokens)")

        ct = item.content_type.value
        if ct == "json" and "json_structural" in policy.allowed_methods:
            return RoutingDecision(Strategy.STRUCTURE, "json_structural", "structural JSON reduction")
        if ct == "logs" and "logs" in policy.allowed_methods:
            return RoutingDecision(Strategy.COMPRESS, "logs", "log collapse preserving errors")
        if ct == "agent_trajectory" and "trajectory" in policy.allowed_methods:
            return RoutingDecision(Strategy.COMPRESS, "trajectory", "trajectory observation collapse")
        if ct == "code" and "code_symbols" in policy.allowed_methods:
            return RoutingDecision(Strategy.STRUCTURE, "code_symbols", "symbol outline, bodies recoverable")
        if ct in ("text", "markdown", "search_results", "rag_chunk") and "text_drop" in policy.allowed_methods:
            return RoutingDecision(Strategy.COMPRESS, "text_drop", "redundant prose lines")
        if "externalize" in policy.allowed_methods and n > 1500:
            return RoutingDecision(Strategy.EXTERNALIZE, None, "large item externalized with pointer")

        return RoutingDecision(Strategy.KEEP, None, f"no safe method for {ct} under policy {policy.task}")
