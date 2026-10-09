# Executive System — Face 8

## What it is

The Executive System is a 12-phase cognitive pipeline that runs before every LLM response. It classifies intent, plans execution, assesses risk, executes steps, verifies quality, and records decisions — all in ~2500ms or less.

## Pipeline phases

| Phase | Component | Description |
|-------|-----------|-------------|
| 0 | EventSourcing, MemoriaMulticapa, WorldModel, LongHorizon | Initialize context: load prior memory, world state, active long-horizon plan |
| 1 | IntentClassifier | Classify user intent (simple_query / research / multi_step / code_task) |
| 2 | decomposeGoal | Extract subgoals, constraints, success criteria |
| 3 | Director + MultiModelJudge | Choose approach + model; call MultiModelJudge for risk ≥ 5 (FASE 16) |
| 4 | Planner | Dynamic step list from intent + context |
| 5 | TaskGraphBuilder | Build DAG — steps run in parallel where dependencies allow |
| 6 | PolicyEngine | Per-step risk assessment (0–7). Blocks level 7. |
| 7 | StepExecutor | LLM call per step via UniversalLLMRouter |
| 8 | LoopVerifier | Quality score 0.0–1.0 per step |
| 9 | CriticAgent | Adversarial review for low-quality (< 0.75) or medium+ risk steps |
| 10 | Replanning | If steps failed: `Director.replan()` generates recovery plan (FASE 13) |
| 11 | Learning | LearningEngine reflects on outcome; learns strategy |
| 12 | Memory + Checkpoint | MemoriaMulticapa records episode+procedure; EventSourcing logs completion |

## Decision records (FASE 15)

Every Director decision is persisted to `data/decision_log.jsonl` via `DecisionLog`. Each record contains:
- `intent`, `approach`, `risk` (0–10), `confidence` (0–1)
- `evidence[]`, `assumptions[]`, `reversibility`
- `judgeVerdict` — outcome from MultiModelJudge (`approve`/`deny`/`abstain`/`null`)

Query via `GET /api/harness/decision-log`.

## MultiModelJudge (FASE 16)

When `_estimateMessageRisk()` returns ≥ 5, Director calls `MultiModelJudge.judge()` with:
- The proposed plan description
- Classified intent
- Risk label (medium/high/critical)

Multiple LLM providers vote in parallel. Quorum (60%) determines verdict. A `deny` verdict is logged but does NOT block execution (fail-open policy for availability) — it is recorded and surfaced in logs for human review.

## Replanning (FASE 13)

When one or more steps have `status === 'failed'` after DAG execution:
1. `Director.replan()` is called with the failed step name + reason + previous direction
2. Approach is escalated (direct → plan_execute → research_first)
3. A diagnostic step (`Diagnose failure: <step>`) is prepended
4. The replan direction is logged to EventSourcing + DecisionLog

The replan plan is available in the `replanned` event emitted by the loop and in `DecisionLog` entries with `stepName: 'replan:<step>'`.

## Output

The loop completes in < 2500ms (timeout-raced). On success, it builds an `<executive_brief>` XML tag injected before the user message so the LLM response is guided by the executive analysis.

```xml
<executive_brief intent="code_task" approach="code_pipeline" complexity="high" quality="82%">
Subgoals: write tests | integrate CI | handle edge cases
Success criteria: Code executes without errors; Meets stated requirements
Analysis:
[Understand requirements]: Requirements extracted: Node.js tests with Jest...
</executive_brief>
```

## API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/harness/audit-trail` | EventSourcing query |
| `GET /api/harness/decision-log` | DecisionLog query (FASE 15) |
| `GET /api/harness/long-horizon-plans` | List multi-session plans |
| `POST /api/harness/long-horizon-plans` | Create plan |
| `GET /api/executive/loop/:sessionId` | SSE stream of loop phases |
