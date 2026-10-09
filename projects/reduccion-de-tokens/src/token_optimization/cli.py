"""CLI (spec §66). Thin layer over Engine/BenchmarkLab - no business logic here."""
from __future__ import annotations

import argparse
import json
import sys

from .engine import Engine
from .tokenization.providers import ModelProfileRegistry


def _read_stdin() -> str:
    return sys.stdin.read() if not sys.stdin.isatty() else ""


def cmd_audit(args) -> int:
    from .version import __version__

    print(f"engine: token_optimization v{__version__}")
    print("models:", ", ".join(ModelProfileRegistry().names()))
    try:
        from .benchmarks.datasets import standard_suite

        n = len(standard_suite())
        print(f"benchmark suite: {n} deterministic tasks available")
    except Exception as exc:
        print("suite unavailable:", exc)
    return 0


def cmd_compress(args) -> int:
    content = _read_stdin()
    if not content.strip():
        print("no input on stdin (pipe a file: `cat data.json | context-engine compress`)", file=sys.stderr)
        return 2
    engine = Engine(model=args.model, db_path=args.db)
    raw = [{"content": content, "role": args.role, "source": "stdin", "content_type": args.content_type}]
    report = engine.ingest_and_optimize(raw, task_id=args.task_id, query=args.query or content[:200])
    print(report.explain())
    print("--- optimized content ---")
    for it in report.items:
        print(it.content[:4000])
    return 0


def cmd_retrieve(args) -> int:
    engine = Engine(model=args.model, db_path=args.db)
    if args.pointer:
        res = engine.retrieve(args.pointer, scope=args.scope, selector=args.selector,
                              start_line=args.start, end_line=args.end)
        print(json.dumps({"scope": res.scope, "item_id": res.item_id,
                          "tokens": res.tokens_spent, "content": res.content[:2000]}, ensure_ascii=False, indent=2)
              if res else "not found")
    else:
        hits = engine.search(args.query, k=args.k)
        for h in hits:
            print(f"- shadow://{h.item_id} ({h.scope}, {h.tokens_spent} tok) {h.content[:120]!r}")
    return 0


def cmd_inspect(args) -> int:
    engine = Engine(model=args.model, db_path=args.db)
    stored = engine.store.get(args.item_id)
    if not stored:
        print("not found:", args.item_id)
        return 1
    meta = {k: getattr(stored, k) for k in (
        "id", "content_hash", "content_type", "role", "source", "task_id", "tenant_id",
        "timestamp", "compression_state", "sensitivity")}
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    return 0


def cmd_stats(args) -> int:
    engine = Engine(model=args.model, db_path=args.db)
    print(json.dumps(engine.stats(), indent=2))
    return 0


def cmd_policies(args) -> int:
    from .core.classifier import TASK_POLICIES

    for name, p in TASK_POLICIES.items():
        print(f"{name}: max_ratio={p.max_compression_ratio} methods={','.join(p.allowed_methods)} "
              f"risk_tolerance={p.risk_tolerance.value}")
    return 0


def cmd_models(args) -> int:
    reg = ModelProfileRegistry()
    for name in reg.names():
        p = reg.get(name)
        print(f"{name}: provider={p.provider} window={p.context_window:,} "
              f"in=${p.input_price_per_mtok}/Mtok out=${p.output_price_per_mtok}/Mtok "
              f"tokenizer_exact={p.tokenizer_is_exact}")
    return 0


def cmd_benchmark(args) -> int:
    from .benchmarks.runner import BenchmarkLab
    from .benchmarks.report import render_report

    lab = BenchmarkLab(model=args.model, db_path=args.db)
    reports = lab.run_all(arms=args.arms.split(",") if args.arms else None)
    from .tokenization.providers import TokenCounter

    exact = TokenCounter(ModelProfileRegistry().get(args.model).encoding).exact
    out = render_report(reports, args.model, exact)
    print(out)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(out)
        print(f"written: {args.out}", file=sys.stderr)
    return 0


def cmd_budget(args) -> int:
    engine = Engine(model=args.model, db_path=args.db)
    try:
        plan = engine.plan_budget(args.model, args.task, expected_output_tokens=args.output,
                                  tool_overhead=args.overhead, safety_margin=args.margin)
    except (KeyError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"model={plan.model} window={plan.context_window:,} reserved_output={plan.reserved_output:,} "
          f"overhead={plan.tool_overhead:,} margin={plan.safety_margin:.0%}")
    print(f"available_context={plan.available_context:,} tokens (source={plan.source})")
    return 0


def cmd_metrics(args) -> int:
    engine = Engine(model=args.model, db_path=args.db)
    print(json.dumps(engine.metrics_snapshot(), indent=2))
    return 0


def cmd_learn(args) -> int:
    engine = Engine(model=args.model, db_path=args.db)
    print(json.dumps(engine.learner_stats(), indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="context-engine",
                                description="Universal Context Intelligence & Token Optimization Engine")
    p.add_argument("--model", default="gpt-4o", help="model profile for token counting")
    p.add_argument("--db", default=":memory:", help="shadow store sqlite path")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("audit", help="show engine capabilities").set_defaults(func=cmd_audit)
    sub.add_parser("stats", help="shadow store stats").set_defaults(func=cmd_stats)
    sub.add_parser("policies", help="list task policies").set_defaults(func=cmd_policies)
    sub.add_parser("models", help="list model profiles").set_defaults(func=cmd_models)

    sp = sub.add_parser("compress", help="optimize stdin content")
    sp.add_argument("--task-id", default="cli")
    sp.add_argument("--query", default="")
    sp.add_argument("--role", default="user")
    sp.add_argument("--content-type", default=None)
    sp.set_defaults(func=cmd_compress)

    sp = sub.add_parser("retrieve", help="recover original content from the shadow store")
    sp.add_argument("--pointer", default=None)
    sp.add_argument("--query", default=None)
    sp.add_argument("-k", type=int, default=5)
    sp.add_argument("--scope", default="full", choices=["full", "lines", "json_field"])
    sp.add_argument("--selector", default=None)
    sp.add_argument("--start", type=int, default=None)
    sp.add_argument("--end", type=int, default=None)
    sp.set_defaults(func=cmd_retrieve)

    sp = sub.add_parser("inspect", help="inspect a stored item")
    sp.add_argument("item_id")
    sp.set_defaults(func=cmd_inspect)

    sp = sub.add_parser("benchmark", help="run the benchmark lab and print/write the report")
    sp.add_argument("--suite", default="standard")
    sp.add_argument("--arms", default=None, help="comma separated arms (baseline,full,...)")
    sp.add_argument("--out", default=None, help="write BENCHMARK_REPORT.md here")
    sp.set_defaults(func=cmd_benchmark)

    sp = sub.add_parser("budget", help="compute the available context budget for a model/task")
    sp.add_argument("--task", default=None)
    sp.add_argument("--output", type=int, default=2048)
    sp.add_argument("--overhead", type=int, default=512)
    sp.add_argument("--margin", type=float, default=0.10)
    sp.set_defaults(func=cmd_budget)

    sub.add_parser("metrics", help="observability counters snapshot").set_defaults(func=cmd_metrics)
    sub.add_parser("learn", help="policy learner stats (shadow mode)").set_defaults(func=cmd_learn)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
