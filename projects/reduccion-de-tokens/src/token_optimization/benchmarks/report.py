"""BENCHMARK_REPORT.md generator (spec §70). All numbers come from measured runs."""
from __future__ import annotations

from datetime import datetime, timezone

from .metrics import SuiteReport
from ..tokenization.providers import TokenCounter


def render_report(reports: dict[str, SuiteReport], model: str, tokenizer_exact: bool) -> str:
    lines: list[str] = []
    lines.append("# BENCHMARK REPORT")
    lines.append("")
    lines.append(f"_Generated: {datetime.now(timezone.utc).isoformat()} · model profile: `{model}` · "
                 f"tokenizer: {'exact (tiktoken)' if tokenizer_exact else 'char/4 estimator (non-exact fallback)'}_")
    lines.append("")
    lines.append("## Methodology and honesty statement")
    lines.append("")
    lines.append("- Datasets: deterministic, seeded generators (chat, rag, tool_agents, research, coding, data_analysis).")
    lines.append("- Token counting: real model tokenizer when available; the fallback is explicitly flagged and never used silently.")
    lines.append("- \"Task success\" here is a **mechanical sufficiency proxy**: every transformed item must pass the fidelity")
    lines.append("  evaluator (numbers, dates, IDs, negations, JSON keys) or be exactly recoverable from the shadow store.")
    lines.append("  It is NOT an LLM-judged end-to-end evaluation; treat the success rates as an engineering invariant check.")
    lines.append("- Costs use the model profile reference prices; local compression CPU time is modeled at $0.05/CPU-hour.")
    lines.append("- No number in this report is hardcoded; regenerate with `context-engine benchmark`.")
    lines.append("")
    lines.append(f"## Arms: `{model}`")
    lines.append("")
    lines.append("| arm | baseline tok | optimized tok | reduction | success (proxy) | recovery calls | fidelity fails | rollbacks | compression ms | cost |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|")
    for name in ("baseline", "dedup_only", "no_dedup", "no_fidelity", "full"):
        r = reports.get(name)
        if not r:
            continue
        lines.append(
            f"| {name} | {r.baseline_tokens:,} | {r.optimized_tokens:,} | {r.reduction_pct:.1f}% | "
            f"{r.successes}/{r.tasks} | {r.recovery_calls} | {r.fidelity_failures} | {r.rolled_back} | "
            f"{r.compression_ms:.1f} | ${r.total_cost:.6f} |"
        )
    lines.append("")
    lines.append("## Per dataset (`full` arm)")
    lines.append("")
    lines.append("| dataset | tasks | baseline tok | optimized tok | reduction | successes | recovery calls |")
    lines.append("|---|---|---|---|---|---|---|")
    full = reports.get("full")
    if full:
        for ds, d in sorted(full.per_dataset.items()):
            red = 100.0 * (d["baseline"] - d["optimized"]) / d["baseline"] if d["baseline"] else 0.0
            lines.append(
                f"| {ds} | {d['tasks']} | {d['baseline']:,} | {d['optimized']:,} | {red:.1f}% | "
                f"{d['successes']}/{d['tasks']} | {d['recovery_calls']} |"
            )
    lines.append("")
    full_red = f"{full.reduction_pct:.1f}%" if full else "n/a"
    lines.append(f"Overall `full` arm reduction: **{full_red}** · "
                 f"success proxy: {full.successes}/{full.tasks} · "
                 f"cost per successful task: ${full.cost_per_successful_task:.6f}" if full else "")
    lines.append("")
    lines.append("## Reproduce")
    lines.append("")
    lines.append("```bash")
    lines.append("context-engine benchmark --suite standard --model gpt-4o")
    lines.append("```")
    return "\n".join(lines) + "\n"
