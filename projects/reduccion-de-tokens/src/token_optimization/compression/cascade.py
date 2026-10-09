"""Context-aware compression cascade (spec §12) with per-item validation,
rollback and externalization (spec §14, §16, §42)."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

from ..core.interfaces import Strategy
from ..core.ir import ContextItem, Role
from ..core.dedup import DeduplicationEngine
from ..core.classifier import TaskPolicy
from ..fidelity.evaluator import FidelityEvaluator, FidelityReport
from .base import Compressor, TokenFn
from .json_compressor import JsonCompressor
from .log_compressor import LogCompressor
from .text_compressor import TextDropCompressor
from .code_compressor import CodeCompressor
from .trajectory_compressor import TrajectoryCompressor
from .router import AdaptiveCompressionRouter, RoutingDecision


@dataclass
class ItemAudit:
    item_id: str
    content_type: str
    role: str
    risk: str
    original_tokens: int
    final_tokens: int
    decisions: list = field(default_factory=list)   # e.g. ["dedup:exact", "compress:json_structural"]
    fidelity: str = "not_checked"
    externalized: bool = False


@dataclass
class CascadeOutcome:
    items: list = field(default_factory=list)
    audits: list = field(default_factory=list)
    original_tokens: int = 0
    final_tokens: int = 0
    rolled_back: int = 0
    externalized: int = 0
    dedup_removed: int = 0
    fidelity_failures: int = 0
    latency_ms: float = 0.0
    errors: list = field(default_factory=list)

    @property
    def tokens_saved(self) -> int:
        return max(0, self.original_tokens - self.final_tokens)

    @property
    def compression_ratio(self) -> float:
        return self.final_tokens / self.original_tokens if self.original_tokens else 1.0


class CompressionCascade:
    """Runs the full cascade over a set of items. Originals must already be in
    the shadow store (the orchestrator guarantees this before calling)."""

    def __init__(
        self,
        token_fn: TokenFn,
        policy: TaskPolicy,
        router: AdaptiveCompressionRouter | None = None,
        fidelity: FidelityEvaluator | None = None,
        dedup: DeduplicationEngine | None = None,
        externalize_fn: Optional[Callable[[ContextItem], str]] = None,
        latency_budget_ms: float = 50.0,
    ) -> None:
        self.token_fn = token_fn
        self.policy = policy
        self.router = router or AdaptiveCompressionRouter()
        self.fidelity = fidelity or FidelityEvaluator()
        self.dedup = dedup or DeduplicationEngine()
        self.externalize_fn = externalize_fn
        self.latency_budget_ms = latency_budget_ms
        self.compressors: dict[str, Compressor] = {
            c.name: c
            for c in (JsonCompressor(), LogCompressor(), TextDropCompressor(),
                      CodeCompressor(), TrajectoryCompressor())
        }

    def run(self, items: Sequence[ContextItem], query: str = "") -> CascadeOutcome:
        t0 = time.perf_counter()
        outcome = CascadeOutcome()

        # stage 1+2: exact and near dedup (spec §12.1-2)
        dedup = self.dedup.deduplicate(items)
        outcome.dedup_removed = len(dedup.removed)
        survivors = dedup.kept

        for item in survivors:
            audit = ItemAudit(
                item_id=item.id,
                content_type=item.content_type.value,
                role=item.role.value,
                risk=item.risk.value,
                original_tokens=self.token_fn(item.content),
                final_tokens=0,
            )
            outcome.original_tokens += audit.original_tokens

            # stage 3: irrelevance filter -> externalize (never delete; spec §12.3, §75)
            # handled implicitly: low-value large items are externalized below by the router.

            # stage 4-5: route and compress
            decision: RoutingDecision = self.router.decide(
                item, self.policy, latency_budget_ms=self.latency_budget_ms,
                token_count=audit.original_tokens,
            )
            audit.decisions.append(f"route:{decision.strategy.value}:{decision.compressor or '-'}")

            content = item.content
            if decision.strategy in (Strategy.COMPRESS, Strategy.STRUCTURE) and decision.compressor:
                comp = self.compressors[decision.compressor]
                result = comp.compress([item], token_fn=self.token_fn)
                if result.ok and result.items:
                    content = result.items[0].content

            # stage 6: externalize large survivors (spec §12.6-7)
            if (
                self.externalize_fn is not None
                and decision.strategy == Strategy.EXTERNALIZE
            ):
                stub = self.externalize_fn(item)
                if stub:
                    content = stub
                    audit.externalized = True
                    outcome.externalized += 1
                    audit.decisions.append("externalize:shadow-store")

            # stage 8: validate (spec §12.8). Three outcomes:
            #   pass            -> accept compressed content
            #   fail+recoverable-> accept, original is exactly recoverable via pointer (spec §15)
            #   fail+no pointer -> rollback to original (spec §42)
            if content != item.content:
                report: FidelityReport = self.fidelity.check(item, content)
                recoverable = ("recoverable:" in content) or ("__recoverable__" in content)
                if report.ok:
                    audit.fidelity = "pass"
                elif recoverable:
                    audit.fidelity = "recoverable"  # loss is admitted, retrieval is the contract
                    audit.decisions.append(f"fidelity:{report.failures[0] if report.failures else 'unknown'}:recoverable")
                else:
                    outcome.fidelity_failures += 1
                    outcome.rolled_back += 1
                    audit.fidelity = "fail"
                    audit.decisions.append(f"rollback:{report.failures[0] if report.failures else 'unknown'}")
                    content = item.content  # KEEP original (spec §42)

            audit.final_tokens = self.token_fn(content)
            outcome.final_tokens += audit.final_tokens
            final_item = item if content == item.content else item.clone_with(
                content=content,
                compression_state="compressed" if not audit.externalized else "externalized",
            )
            outcome.items.append(final_item)
            outcome.audits.append(audit)

        outcome.latency_ms = round((time.perf_counter() - t0) * 1000.0, 3)
        return outcome
