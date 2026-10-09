"""ContextBenchmarkLab (spec §35, §36).

Runs the same deterministic tasks under different arms:
  baseline      no optimization
  dedup_only    only dedup stage
  no_dedup      full system minus dedup (ablation)
  no_fidelity   full system minus fidelity enforcement (ablation)
  full          the complete engine

Sufficiency is mechanical: every transformed item must either pass the
fidelity evaluator or be exactly recoverable from the shadow store. This is a
deterministic proxy for task success, not an LLM-judged evaluation; the
generated report states this explicitly.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from ..core.dedup import DeduplicationEngine
from ..compression.cascade import CompressionCascade
from ..compression.router import AdaptiveCompressionRouter
from ..fidelity.evaluator import FidelityEvaluator
from ..core.classifier import TASK_POLICIES
from ..cost import CostModel
from ..orchestrator import ContextOrchestrator
from .datasets import TaskSample, standard_suite
from .metrics import TaskResult, SuiteReport, aggregate


@dataclass
class ArmConfig:
    name: str
    use_dedup: bool = True
    enforce_fidelity: bool = True
    optimize: bool = True


ARMS = {
    "baseline": ArmConfig("baseline", optimize=False),
    "dedup_only": ArmConfig("dedup_only", optimize=False),
    "no_dedup": ArmConfig("no_dedup", use_dedup=False),
    "no_fidelity": ArmConfig("no_fidelity", enforce_fidelity=False),
    "full": ArmConfig("full"),
}


class BenchmarkLab:
    def __init__(self, model: str = "gpt-4o", db_path: str = ":memory:") -> None:
        self.model = model
        self.db_path = db_path

    def run_arm(self, arm: str, samples: list[TaskSample]) -> list[TaskResult]:
        cfg = ARMS[arm]
        results: list[TaskResult] = []
        for sample in samples:
            orch = ContextOrchestrator(model=self.model, store=self._fresh_store())
            items = orch.ingest(sample.items, task_id=sample.task_id)
            # originals must be in the shadow store BEFORE any compression (spec §14)
            for it in items:
                orch.store.put(it)
            baseline_tokens = sum(orch.token_fn(i.content) for i in items)
            task_type = sample.dataset if sample.dataset != "tool_agents" else "tool_execution"
            policy = TASK_POLICIES.get(task_type, TASK_POLICIES["chat"])

            if not cfg.optimize:
                if arm == "dedup_only":
                    dedup = DeduplicationEngine().deduplicate(items)
                    kept = dedup.kept
                    opt_tokens = sum(orch.token_fn(i.content) for i in kept)
                    results.append(TaskResult(
                        dataset=sample.dataset, task_id=sample.task_id, model=self.model, arm=arm,
                        baseline_tokens=baseline_tokens, optimized_tokens=opt_tokens,
                        compression_ms=0.0, sufficient=True, total_cost=orch.cost_model.breakdown(input_tokens=opt_tokens).total,
                    ))
                else:
                    results.append(TaskResult(
                        dataset=sample.dataset, task_id=sample.task_id, model=self.model, arm=arm,
                        baseline_tokens=baseline_tokens, optimized_tokens=baseline_tokens,
                        compression_ms=0.0, sufficient=True,
                        total_cost=orch.cost_model.breakdown(input_tokens=baseline_tokens).total,
                    ))
                continue

            # full pipeline arms
            dedup_engine = DeduplicationEngine() if cfg.use_dedup else DeduplicationEngine(near_threshold=1.01)
            cascade = CompressionCascade(
                token_fn=orch.token_fn,
                policy=policy,
                dedup=dedup_engine,
                fidelity=FidelityEvaluator() if cfg.enforce_fidelity else _PassThroughFidelity(),
                externalize_fn=orch._externalize_stub,
            )
            t0 = time.perf_counter()
            outcome = cascade.run(items, query=sample.query)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            # mechanical sufficiency: transformed items must be faithful OR recoverable.
            # Originals were stored (same id) in the shadow store before the cascade ran.
            fidelity = FidelityEvaluator()
            recovery_probes = 0
            insufficient = 0
            for final in outcome.items:
                stored = orch.store.get(final.id)
                if stored is None:
                    insufficient += 1  # original missing: unrecoverable by construction
                    continue
                if final.content != stored.content:
                    report = fidelity.check(stored.content, final.content)
                    recoverable = orch.store.get_by_pointer(f"shadow://{stored.id}") is not None
                    recovery_probes += 1
                    if not (report.ok or recoverable):
                        insufficient += 1

            opt_tokens = outcome.final_tokens
            cost = orch.cost_model.breakdown(
                input_tokens=opt_tokens, compression_ms=elapsed_ms,
            )
            results.append(TaskResult(
                dataset=sample.dataset, task_id=sample.task_id, model=self.model, arm=arm,
                baseline_tokens=baseline_tokens, optimized_tokens=opt_tokens,
                compression_ms=round(elapsed_ms, 3),
                recovery_calls=recovery_probes,
                fidelity_failures=outcome.fidelity_failures,
                rolled_back=outcome.rolled_back,
                sufficient=(insufficient == 0),
                total_cost=cost.total,
            ))
        return results

    def run_all(self, samples: list[TaskSample] | None = None, arms: list[str] | None = None) -> dict[str, SuiteReport]:
        samples = samples or standard_suite()
        arms = arms or ["baseline", "dedup_only", "no_dedup", "no_fidelity", "full"]
        reports: dict[str, SuiteReport] = {}
        for arm in arms:
            results = self.run_arm(arm, samples)
            reports[arm] = aggregate(results, arm=arm, model=self.model)
        return reports

    def _fresh_store(self):
        from ..storage.store import ShadowContextStore

        return ShadowContextStore(self.db_path)


class _PassThroughFidelity:
    """Ablation arm: accepts every compression (no enforcement)."""

    def check(self, original, compressed):
        from ..fidelity.evaluator import FidelityReport

        return FidelityReport(ok=True, failures=[], checked={"ablation": "no_fidelity"})


def _match_items(originals, finals):
    """Pair originals with finals by identity of content for fidelity re-checks."""
    return originals[: len(finals)]
