"""Thin FastAPI layer (spec §67). No business logic lives here: it only
delegates to Engine/BenchmarkLab, so the API can never drift from the core."""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import Engine
from .tokenization.providers import ModelProfileRegistry

app = FastAPI(title="Context Intelligence & Token Optimization Engine", version="0.1.0")

_ENGINE: Engine | None = None


def get_engine() -> Engine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = Engine(db_path="data/context_store.db")
    return _ENGINE


class ItemIn(BaseModel):
    content: str
    role: str = "user"
    source: str = "api"
    content_type: Optional[str] = None
    agent_id: str = "default"


class OptimizeRequest(BaseModel):
    items: list[ItemIn]
    task_id: str = "api-task"
    task_type: Optional[str] = None
    query: str = ""
    model: str = "gpt-4o"


@app.post("/context/optimize")
def optimize(req: OptimizeRequest):
    engine = Engine(model=req.model, db_path="data/context_store.db")
    report = engine.ingest_and_optimize(
        [i.model_dump() for i in req.items],
        task_id=req.task_id, task_type=req.task_type, query=req.query,
    )
    return {
        "task_id": report.task_id,
        "task_type": report.task_type,
        "model": report.model,
        "tokenizer_exact": report.tokenizer_exact,
        "original_tokens": report.original_tokens,
        "optimized_tokens": report.optimized_tokens,
        "tokens_saved": report.tokens_saved,
        "compression_ratio": report.compression_ratio,
        "compression_latency_ms": report.compression_latency_ms,
        "dedup_removed": report.dedup_removed,
        "rolled_back": report.rolled_back,
        "externalized": report.externalized,
        "fidelity_failures": report.fidelity_failures,
        "explanation": report.explain(),
    }


@app.post("/context/compress")
def compress(req: OptimizeRequest):
    """Alias of /context/optimize (spec §67 naming)."""
    return optimize(req)


@app.post("/context/retrieve")
def retrieve(pointer: str, scope: str = "full", selector: Optional[str] = None,
             start_line: Optional[int] = None, end_line: Optional[int] = None):
    engine = get_engine()
    res = engine.retrieve(pointer, scope=scope, selector=selector,
                          start_line=start_line, end_line=end_line)
    if res is None:
        raise HTTPException(status_code=404, detail="pointer not found")
    return {"item_id": res.item_id, "scope": res.scope,
            "tokens_spent": res.tokens_spent, "content": res.content}


@app.post("/context/pack")
def pack(req: OptimizeRequest, budget: int = 4096):
    engine = Engine(model=req.model, db_path="data/context_store.db")
    report = engine.ingest_and_optimize([i.model_dump() for i in req.items], task_id=req.task_id)
    packed = engine.pack(report, budget=budget, query=req.query)
    return {"budget": budget, "packed_tokens": packed.tokens,
            "included": packed.included_ids, "dropped": packed.dropped_ids}


@app.get("/context/stats")
def stats():
    return get_engine().stats()


@app.get("/context/metrics")
def metrics():
    return get_engine().metrics_snapshot()


@app.get("/context/policy-stats")
def policy_stats():
    return get_engine().learner_stats()


@app.post("/context/budget")
def budget(model: str = "gpt-4o", task_type: str | None = None,
           expected_output_tokens: int = 2048, tool_overhead: int = 512,
           safety_margin: float = 0.10):
    try:
        plan = get_engine().plan_budget(model, task_type, expected_output_tokens,
                                        tool_overhead, safety_margin)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"model": plan.model, "context_window": plan.context_window,
            "reserved_output": plan.reserved_output, "tool_overhead": plan.tool_overhead,
            "safety_margin": plan.safety_margin, "available_context": plan.available_context,
            "source": plan.source}


@app.get("/context/policies")
def policies():
    from .core.classifier import TASK_POLICIES

    return {name: {"max_compression_ratio": p.max_compression_ratio,
                   "allowed_methods": list(p.allowed_methods),
                   "risk_tolerance": p.risk_tolerance.value}
            for name, p in TASK_POLICIES.items()}


@app.get("/context/models")
def models():
    reg = ModelProfileRegistry()
    return {name: {"provider": reg.get(name).provider,
                   "context_window": reg.get(name).context_window,
                   "input_price_per_mtok": reg.get(name).input_price_per_mtok,
                   "output_price_per_mtok": reg.get(name).output_price_per_mtok,
                   "tokenizer_is_exact": reg.get(name).tokenizer_is_exact}
            for name in reg.names()}


@app.get("/context/benchmarks")
def benchmarks(model: str = "gpt-4o"):
    from .benchmarks.runner import BenchmarkLab

    lab = BenchmarkLab(model=model, db_path=":memory:")
    reports = lab.run_all()
    return {
        arm: {"baseline_tokens": r.baseline_tokens, "optimized_tokens": r.optimized_tokens,
              "reduction_pct": round(r.reduction_pct, 2), "successes": r.successes,
              "tasks": r.tasks, "compression_ms": r.compression_ms,
              "total_cost": r.total_cost}
        for arm, r in reports.items()
    }
