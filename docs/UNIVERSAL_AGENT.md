# Universal Agent System — Face 17

## Overview

Face 17 defines the Universal Model-Agnostic Cognitive & Behavior System. Its core principle:

> **MODEL ≠ AGENT**
>
> The model (LLM) is a replaceable reasoning engine. The agent is the cognitive + behavioral architecture that wraps and directs it.

This separation means the entire cognitive pipeline runs identically regardless of whether the underlying model is Claude, GPT-4, Mistral, or a local model.

---

## Architecture

```
User Prompt
     │
     ▼
PromptInjectionDetector      ← Face 15: block attacks before any processing
     │
     ▼
QuestionUnderstanding        ← classify: intent, domain, answer_type, complexity
     │
     ▼
AnswerContract               ← define: expected format, length, required elements
     │
     ▼
PromptIR                     ← improve & refine the raw prompt (heuristic rewrite)
     │
     ▼
BehaviorRegistry             ← select behavior pack by answer_type
     │
     ▼
AdaptiveVerbosity            ← track per-session verbosity, adjust instructions
     │
     ▼
PersonalityLayer + ModePrompts  ← inject personality fragment + mode system prompt
     │
     ▼
   LLM (any model)           ← model is a black-box engine here
     │
     ▼
ResponseQualityGate          ← score outgoing response against contract
     │
     ▼
LearningEvaluationGate       ← record alignment score for learning pipeline
     │
     ▼
 Final Response
```

---

## Components

### QuestionUnderstanding
**File:** `api/server/services/CognitiveBehavior/QuestionUnderstanding.js`

Analyzes the user message and returns a cognitive profile:
- `intent` — coding, research, creative, explain, etc.
- `answer_type` — code, list, explanation, factual, etc.
- `domain` — programming, math, general, etc.
- `complexity` — simple, moderate, complex

### AnswerContract
**File:** `api/server/services/CognitiveBehavior/AnswerContract.js`

Builds a contract from the cognitive profile specifying:
- Expected format
- Required elements
- Length constraints
- Quality criteria

### PromptIR (Prompt Improvement & Refinement)
**File:** `api/server/services/CognitiveBehavior/PromptIR.js`

Lightweight heuristic rewriter that:
- Detects vague/ambiguous prompts
- Expands short, simple questions
- Adds code/domain context when missing
- Returns `{ improved, original, changes, issues, score, wasImproved }`

### BehaviorRegistry
**File:** `api/server/services/CognitiveBehavior/BehaviorRegistry.js`

Named behavior packs with personality + mode + rules:
- `coding-assistant` — systematic code responses
- `research-mode` — evidence-based, citation-aware
- `tutor-mode` — step-by-step, check understanding
- `chat-mode` — natural, conversational

### AdaptiveVerbosity
**File:** `api/server/services/CognitiveBehavior/AdaptiveVerbosity.js`

Per-session verbosity tracking: `terse → brief → moderate → detailed → comprehensive`

Responds to explicit user instructions ("be brief", "explain in detail") and implicit signals.

### PersonalityLayer
**File:** `api/server/services/CognitiveBehavior/PersonalityLayer.js`

Registered personality profiles (default, expert, friendly, tutor, etc.) that inject consistent tone into the system prompt fragment.

### ModePrompts
**File:** `api/server/services/CognitiveBehavior/ModePrompts.js`

Mode-specific system prompt fragments (coding, analysis, creative, teaching, research, chat).

### ResponseQualityGate
**File:** `api/server/services/CognitiveBehavior/ResponseQualityGate.js`

Scores outgoing LLM responses against the AnswerContract:
- Checks: non-empty, no boilerplate refusal, code blocks present (for code answers), adequate length, no excessive filler
- Returns `{ pass, score, report }`
- Gate threshold: 60% — non-fatal (never blocks the response, only records)

### LearningEvaluationGate
**File:** `api/server/services/Learning/LearningEvaluationGate.js`

Records alignment scores for the learning pipeline (Face 16). Stores history for quality trend analysis.

---

## Wiring

The entire pipeline runs as Express middleware in `api/server/routes/agents/chat.js`:

```javascript
router.use(wireCognitiveBehavior);
```

`wireCognitiveBehavior` runs before `wireExecutiveLoop`, so cognitive context is available to the executive system.

The pipeline intercepts `res.json` to score the outgoing response without blocking it.

---

## Management API

All endpoints under `/api/cognitive/behavior/` (registered at `/api/cognitive`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| POST | `/understand` | Parse question into cognitive profile |
| POST | `/contract` | Build answer contract from question |
| POST | `/contract/score` | Score a response against a contract |
| GET | `/personalities` | List registered personalities |
| POST | `/personalities` | Register a custom personality |
| GET | `/behaviors` | List behavior packs |
| POST | `/behaviors/:id/activate` | Activate a behavior pack |
| POST | `/behaviors/:id/deactivate` | Deactivate a behavior pack |
| GET | `/modes` | List mode prompts |
| GET | `/modes/:id/prompt` | Get system prompt for a mode |
| GET | `/verbosity/:sessionId` | Get session verbosity level |
| POST | `/verbosity/:sessionId` | Set session verbosity level |
| GET | `/cache/stats` | Semantic cache statistics |
| DELETE | `/cache` | Clear semantic cache |
| POST | `/score-pipeline` | Full pipeline: prompt → contract → score |
| GET | `/learning/history` | Learning gate evaluation history |
| POST | `/learning/evaluate` | Full before/after evaluation |
| POST | `/prompt-ir/improve` | Improve/refine a raw prompt |
| POST | `/prompt-ir/score` | Score prompt clarity |
| POST | `/quality-gate/gate` | Score a response against a contract |
| GET | `/quality-gate/stats` | ResponseQualityGate statistics |

---

## Feature Flags

- `AGENT_RUNTIME_WIRED=true` — enables ExecutiveLoop wiring
- `HARNESS_ENGINE_ENABLED=true` — enables Harness cognitive pipeline

The CognitiveBehavior pipeline runs unconditionally (no flag required) — it degrades gracefully if any component fails to load.

---

## Design Principles

1. **Never block a legitimate request** — all pipeline stages are non-fatal; errors are caught and logged
2. **Model agnostic** — the cognitive layer makes no assumptions about the LLM
3. **Composable** — each stage is an independent module with a stable interface
4. **Observable** — every stage writes to `req.*` for downstream middleware to inspect
