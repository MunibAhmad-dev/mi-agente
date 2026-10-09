"""ContextOrchestrator (spec §6): the single entry point that decides, per item,
between KEEP / DEDUP / COMPRESS / EXTERNALIZE / RECOVER, always minimizing
*total* cost per successful task — not raw tokens (spec §1, §51, §75).

Pipeline: observe → classify → store originals (shadow) → dedup → cascade
(compress + fidelity + rollback) → report with full audit trail.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .core.ir import ContextItem, ContentType
from .core.classifier import ContextClassifier, TASK_POLICIES
from .core.dedup import DeduplicationEngine
from .core.risk import RiskEngine
from .compression.cascade import CompressionCascade, CascadeOutcome
from .packing.packer import ContextPacker, PackedContext
from .packing.levels import LevelManager, MemoryLevels, LevelAssignment
from .storage.store import ShadowContextStore
from .recovery.recoverer import TargetedRecoverer
from .tokenization.providers import TokenCounter, ModelProfileRegistry
from .cost import CostModel, CostBreakdown
from .observability import (
    GLOBAL_METRICS, M_COMPRESSIONS, M_ROLLBACKS, M_FIDELITY_FAILURES,
    M_EXTERNALIZED, M_DEDUP_REMOVED, T_CASCADE_MS,
)
from .policy import PolicyLearner, PolicyObservation


@dataclass
class OptimizationReport:
    task_id: str
    task_type: str
    model: str
    tokenizer_exact: bool
    original_tokens: int
    optimized_tokens: int
    tokens_saved: int
    compression_ratio: float
    compression_latency_ms: float
    dedup_removed: int
    rolled_back: int
    externalized: int
    fidelity_failures: int
    items: list = field(default_factory=list)
    audits: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    cost: CostBreakdown | None = None

    def explain(self) -> str:
        lines = [
            f"task={self.task_id} type={self.task_type} model={self.model}",
            f"tokenizer_exact={self.tokenizer_exact} "
            f"tokens: {self.original_tokens} -> {self.optimized_tokens} "
            f"(saved {self.tokens_saved}, ratio {self.compression_ratio:.3f})",
            f"dedup_removed={self.dedup_removed} rolled_back={self.rolled_back} "
            f"externalized={self.externalized} fidelity_failures={self.fidelity_failures}",
            f"latency_ms={self.compression_latency_ms}",
        ]
        for a in self.audits:
            lines.append(
                f"  item={a.item_id} type={a.content_type} risk={a.risk} "
                f"{a.original_tokens}->{a.final_tokens} tok decisions={';'.join(a.decisions)} "
                f"fidelity={a.fidelity}{' [externalized]' if a.externalized else ''}"
            )
        for e in self.errors:
            lines.append(f"  ERROR: {e}")
        return "\n".join(lines)


class ContextOrchestrator:
    """Main facade. `optimize()` is the full pipeline; `pack()` prepares the
    final model-ready context under a token budget."""

    def __init__(
        self,
        store: Optional[ShadowContextStore] = None,
        model: str = "gpt-4o",
        task_type: str | None = None,
        registry: ModelProfileRegistry | None = None,
        cost_model: CostModel | None = None,
        latency_budget_ms: float = 50.0,
    ) -> None:
        self.registry = registry or ModelProfileRegistry()
        self.profile = self.registry.get(model)
        self.counter = TokenCounter(self.profile.encoding)
        self.token_fn = self.counter.count
        self.store = store or ShadowContextStore(":memory:")
        self.classifier = ContextClassifier()
        self.risk_engine = RiskEngine()
        self.dedup = DeduplicationEngine()
        self.recoverer = TargetedRecoverer(self.store, token_fn=self.token_fn)
        self.cost_model = cost_model or CostModel(
            input_price_per_mtok=self.profile.input_price_per_mtok,
            output_price_per_mtok=self.profile.output_price_per_mtok,
        )
        self.latency_budget_ms = latency_budget_ms
        self.metrics = GLOBAL_METRICS
        self.policy_learner = PolicyLearner()

    # -- helpers ------------------------------------------------------------
    def ingest(self, raw: list[dict | ContextItem], task_id: str) -> list[ContextItem]:
        """Public ingest: classify + risk-assess items (no storage, no compression)."""
        return self._ingest(raw, task_id)

    def _ingest(self, raw: list[dict | ContextItem], task_id: str) -> list[ContextItem]:
        items: list[ContextItem] = []
        for r in raw:
            if isinstance(r, ContextItem):
                item = r.model_copy(update={"task_id": task_id})
            else:
                content = str(r.get("content", ""))
                role = r.get("role", "user")
                ctype = r.get("content_type")
                if ctype is None:
                    detected = self.classifier.classify_content(content)
                    ctype = detected.value
                item = ContextItem(
                    content=content,
                    content_type=ContentType(ctype),
                    role=role,
                    source=r.get("source", "unknown"),
                    task_id=task_id,
                    agent_id=r.get("agent_id", "default"),
                    trust=r.get("trust", 0.5),
                )
            item.risk = self.risk_engine.assess(item.content, item.role)
            items.append(item)
        return items

    # -- main pipeline --------------------------------------------------------
    def optimize(
        self,
        raw_items: list[dict | ContextItem],
        task_id: str = "default",
        task_type: str | None = None,
        query: str = "",
        tenant_id: str = "default",
    ) -> OptimizationReport:
        items = self._ingest(raw_items, task_id)
        if not items:
            return OptimizationReport(task_id, task_type or "chat", self.profile.name,
                                      self.counter.exact, 0, 0, 0, 1.0, 0.0, 0, 0, 0, 0)

        task = task_type or self.classifier.classify_task(query or items[0].content[:400])
        policy = self.classifier.policy_for(task)

        # 1) originals first: externalize BEFORE any compression (spec §14)
        for it in items:
            self.store.put(it, tenant_id=tenant_id)

        # 2) cascade with routing + fidelity + rollback
        cascade = CompressionCascade(
            token_fn=self.token_fn,
            policy=policy,
            externalize_fn=self._externalize_stub,
            latency_budget_ms=self.latency_budget_ms,
        )
        outcome: CascadeOutcome = cascade.run(items, query=query)

        # observability (spec §40)
        m = self.metrics
        m.inc(M_DEDUP_REMOVED, outcome.dedup_removed)
        m.inc(M_ROLLBACKS, outcome.rolled_back)
        m.inc(M_FIDELITY_FAILURES, outcome.fidelity_failures)
        m.inc(M_EXTERNALIZED, outcome.externalized)
        m.inc(M_COMPRESSIONS, sum(1 for it in outcome.items if it.compression_state != "raw"))
        m.observe_ms(T_CASCADE_MS, outcome.latency_ms)

        # policy learner telemetry (advisory only, spec §33-34)
        for audit in outcome.audits:
            methods = [d.split(":")[1] for d in audit.decisions
                       if d.startswith("compress:") or d.startswith("route:")]
            method = next((x for x in methods if x not in ("-", "keep", "externalize")), "keep")
            self.policy_learner.record(PolicyObservation(
                task=task,
                content_type=audit.content_type,
                method=method,
                compression_ratio=(audit.final_tokens / audit.original_tokens) if audit.original_tokens else 1.0,
                recovery_count=1 if "recoverable" in "".join(audit.decisions) else 0,
                fidelity_failures=1 if audit.fidelity == "fail" else 0,
                latency_ms=outcome.latency_ms / max(1, len(outcome.audits)),
                success=audit.fidelity in ("pass", "recoverable", "not_checked"),
                quality=1.0 if audit.fidelity == "pass" else 0.7 if audit.fidelity == "recoverable" else 0.4,
            ))

        cost = self.cost_model.breakdown(
            input_tokens=outcome.final_tokens,
            compression_ms=outcome.latency_ms,
        )
        return OptimizationReport(
            task_id=task_id,
            task_type=task,
            model=self.profile.name,
            tokenizer_exact=self.counter.exact,
            original_tokens=outcome.original_tokens,
            optimized_tokens=outcome.final_tokens,
            tokens_saved=outcome.tokens_saved,
            compression_ratio=round(outcome.compression_ratio, 4),
            compression_latency_ms=outcome.latency_ms,
            dedup_removed=outcome.dedup_removed,
            rolled_back=outcome.rolled_back,
            externalized=outcome.externalized,
            fidelity_failures=outcome.fidelity_failures,
            items=outcome.items,
            audits=outcome.audits,
            errors=outcome.errors,
            cost=cost,
        )

    # -- packing / levels ------------------------------------------------------
    def pack(self, report: OptimizationReport, budget: int, query: str = "") -> PackedContext:
        packer = ContextPacker(self.token_fn)
        return packer.pack(report.items, budget=budget, query=query)

    def assign_levels(self, report: OptimizationReport, budget: int, query: str = ""):
        lm = LevelManager(self.token_fn)
        return lm.assign(report.items, budget_tokens=budget, query=query)

    # -- externalization -------------------------------------------------------
    def _externalize_stub(self, item: ContextItem) -> str:
        pointer = f"shadow://{item.id}"
        tokens = self.token_fn(item.content)
        return (
            f"[EXTERNALIZED {item.content_type.value} '{item.source}' — {tokens} tokens, "
            f"full original recoverable at {pointer} via context_retrieve]"
        )

    # -- recovery passthrough ----------------------------------------------------
    def retrieve(self, pointer: str, **kw):
        return self.recoverer.recover(pointer, **kw)

    def search(self, query: str, k: int = 5, task_id: str | None = None):
        return self.recoverer.search(query, k=k, task_id=task_id)
