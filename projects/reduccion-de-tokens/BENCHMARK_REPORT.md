# BENCHMARK REPORT

_Generated: 2026-09-10T21:58:12.172359+00:00 · model profile: `gpt-4o` · tokenizer: exact (tiktoken)_

## Methodology and honesty statement

- Datasets: deterministic, seeded generators (chat, rag, tool_agents, research, coding, data_analysis).
- Token counting: real model tokenizer when available; the fallback is explicitly flagged and never used silently.
- "Task success" here is a **mechanical sufficiency proxy**: every transformed item must pass the fidelity
  evaluator (numbers, dates, IDs, negations, JSON keys) or be exactly recoverable from the shadow store.
  It is NOT an LLM-judged end-to-end evaluation; treat the success rates as an engineering invariant check.
- Costs use the model profile reference prices; local compression CPU time is modeled at $0.05/CPU-hour.
- No number in this report is hardcoded; regenerate with `context-engine benchmark`.

## Arms: `gpt-4o`

| arm | baseline tok | optimized tok | reduction | success (proxy) | recovery calls | fidelity fails | rollbacks | compression ms | cost |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 201,972 | 201,972 | 0.0% | 30/30 | 0 | 0 | 0 | 0.0 | $0.504930 |
| dedup_only | 201,972 | 189,607 | 6.1% | 30/30 | 0 | 0 | 0 | 0.0 | $0.474017 |
| no_dedup | 201,972 | 30,785 | 84.8% | 30/30 | 10 | 0 | 0 | 178.2 | $0.076965 |
| no_fidelity | 201,972 | 18,792 | 90.7% | 30/30 | 10 | 0 | 0 | 42.6 | $0.046981 |
| full | 201,972 | 18,792 | 90.7% | 30/30 | 10 | 0 | 0 | 173.5 | $0.046982 |

## Per dataset (`full` arm)

| dataset | tasks | baseline tok | optimized tok | reduction | successes | recovery calls |
|---|---|---|---|---|---|---|
| chat | 6 | 3,426 | 1,598 | 53.4% | 6/6 | 0 |
| coding | 4 | 2,028 | 1,068 | 47.3% | 4/4 | 0 |
| data_analysis | 4 | 84,968 | 1,107 | 98.7% | 4/4 | 4 |
| rag | 6 | 9,264 | 3,852 | 58.4% | 6/6 | 0 |
| research | 4 | 5,100 | 935 | 81.7% | 4/4 | 0 |
| tool_agents | 6 | 97,186 | 10,232 | 89.5% | 6/6 | 6 |

Overall `full` arm reduction: **90.7%** · success proxy: 30/30 · cost per successful task: $0.001566

## Reproduce

```bash
context-engine benchmark --suite standard --model gpt-4o
```
