"""Engine facade: single entrypoint used by CLI and API (spec §66, §67)."""
from __future__ import annotations

import json
from dataclasses import asdict

from .orchestrator import ContextOrchestrator, OptimizationReport
from .storage.store import ShadowContextStore
from .tokenization.providers import ModelProfileRegistry
from .budget import ContextBudgetPlanner, BudgetPlan
from .graph import ContextGraph, detect_contradictions, Contradiction
from .observability import GLOBAL_METRICS
from .policy import PolicyLearner, PromotionState
from .security.redaction import mask_secrets, detect_secrets


class Engine:
    """One instance = one shadow store. Reuse it; do not recreate per request."""

    def __init__(self, model: str = "gpt-4o", db_path: str = ":memory:",
                 tenant_id: str = "default") -> None:
        self.model = model
        self.tenant_id = tenant_id
        self.registry = ModelProfileRegistry()
        self.store = ShadowContextStore(db_path)
        self.orchestrator = ContextOrchestrator(store=self.store, model=model)
        self.budget_planner = ContextBudgetPlanner(self.registry)
        self.graph = ContextGraph()
        self.learner = self.orchestrator.policy_learner

    def ingest_and_optimize(self, items: list[dict], task_id: str = "default",
                            task_type: str | None = None, query: str = "",
                            redact_secrets: bool = True) -> OptimizationReport:
        if redact_secrets:
            from .observability import M_SECRETS_REDACTED

            masked = 0
            for it in items:
                if isinstance(it, dict) and isinstance(it.get("content"), str):
                    new_content, n = mask_secrets(it["content"])
                    if n:
                        it["content"] = new_content  # spec §45: secrets never reach the store
                        masked += n
            GLOBAL_METRICS.inc(M_SECRETS_REDACTED, masked)
        return self.orchestrator.optimize(
            items, task_id=task_id, task_type=task_type, query=query, tenant_id=self.tenant_id
        )

    def pack(self, report: OptimizationReport, budget: int, query: str = ""):
        return self.orchestrator.pack(report, budget=budget, query=query)

    def retrieve(self, pointer: str, **kw):
        return self.orchestrator.retrieve(pointer, **kw)

    def search(self, query: str, k: int = 5, task_id: str | None = None):
        return self.orchestrator.search(query, k=k, task_id=task_id)

    # -- new phase capabilities -------------------------------------------
    def plan_budget(self, model: str | None = None, task_type: str | None = None,
                    expected_output_tokens: int = 2048, tool_overhead: int = 512,
                    safety_margin: float = 0.10) -> BudgetPlan:
        from .core.classifier import TASK_POLICIES

        policy = TASK_POLICIES.get(task_type) if task_type else None
        return self.budget_planner.plan(
            model or self.model, task_policy=policy,
            expected_output_tokens=expected_output_tokens,
            tool_overhead=tool_overhead, safety_margin=safety_margin,
        )

    def find_contradictions(self, report: OptimizationReport) -> list[Contradiction]:
        contradictions = detect_contradictions(report.items)
        from .observability import M_CONTRADICTIONS

        GLOBAL_METRICS.inc(M_CONTRADICTIONS, len(contradictions))
        for c in contradictions:
            self.graph.add_edge(c.item_a, "contradicts", c.item_b)
        return contradictions

    def add_relation(self, src_id: str, relation: str, dst_id: str) -> None:
        self.graph.add_edge(src_id, relation, dst_id)
        self.store.add_edge(src_id, relation, dst_id)

    def metrics_snapshot(self) -> dict:
        return GLOBAL_METRICS.snapshot()

    def learner_stats(self) -> dict:
        return self.learner.stats()

    def stats(self) -> dict:
        return {
            "model": self.model,
            "store": self.store.stats(),
            "models_available": self.registry.names(),
            "metrics": GLOBAL_METRICS.snapshot()["counters"],
        }
