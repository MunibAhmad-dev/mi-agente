# Universal Agent Phases — Gen B Implementation

All files live in `api/server/services/CognitiveBehavior/` and are exported from its `index.js`.  
REST API is mounted at `/api/agent` via `api/server/routes/universalAgent.js`.

---

## Phase 1 — UniversalAgentAbstraction

**File:** `UniversalAgentAbstraction.js`  
**Singleton:** `getUniversalAgentAbstraction()`

Model-agnostic wrapper. Takes any LLM provider from `UniversalLLMRouter` and runs the full cognitive pipeline:

1. TaskComplexityEngine analysis
2. AskVsAct decision gate
3. LoopDetection check
4. AnswerContract build
5. LLM call via UniversalLLMRouter
6. ResponseQualityGate score

**Key methods:**
- `route(prompt, context)` → full pipeline result `{ content, contract, quality, complexity, decision }`
- `wrap(providerId, defaults)` → returns a pre-configured `async (prompt, ctx) => result` function

---

## Phase 2 — CapabilityRegistry

**File:** `CapabilityRegistry.js`  
**Singleton:** `getCapabilityRegistry()`

Tracks agent capabilities. Built-in capabilities: `text_generation`, `code_execution`, `web_search`, `image_analysis`, `file_operations`, `memory_recall`, `reasoning`.

**Key methods:**
- `register(capability)` → register a new capability
- `list(filter?)` → list all (optionally filtered by type/enabled)
- `hasCapability(name)` → boolean
- `getByType(type)` → array of matching capabilities
- `setEnabled(name, enabled)` → toggle on/off
- `unregister(name)` → remove non-built-in capability

---

## Phase 5 — ContextResolution

**File:** `ContextResolution.js`  
**Singleton:** `getContextResolution()`

Resolves context from a message + conversation history. Extracts entities, fills pronouns, links to prior messages.

**Key methods:**
- `resolve(message, history)` → `{ resolvedMessage, entities, pronounResolutions, linkedMessages, context }`

---

## Phase 6 — TaskComplexityEngine

**File:** `TaskComplexityEngine.js`  
**Singleton:** `getTaskComplexityEngine()`

Analyzes a prompt's complexity using keyword patterns and heuristics.

**Key methods:**
- `analyze(text)` → `{ level: 'simple'|'moderate'|'complex'|'expert', score: 1-10, factors: [], recommendedApproach: string }`

---

## Phase 7 — AdaptiveCognition

**File:** `AdaptiveCognition.js`  
**Singleton:** `getAdaptiveCognition()`

Adjusts cognitive strategy per session based on feedback. Strategies: `analytical`, `creative`, `systematic`, `exploratory`.

**Key methods:**
- `adapt(sessionId, feedback)` → `{ newStrategy, previousStrategy, reason }`
- `getStrategy(sessionId)` → `{ strategy, config, history }`
- `setStrategy(sessionId, strategy)` → override strategy
- `listStrategies()` → all strategy configs

---

## Phase 8 — DecisionEngine

**File:** `DecisionEngine.js`  
**Singleton:** `getDecisionEngine()`

Makes explicit YES / NO / ASK decisions with confidence scoring.

**Key methods:**
- `decide(question, context)` → `{ decision: 'yes'|'no'|'ask', confidence, reasoning, alternatives }`
- `getHistory(limit)` → recent decisions

---

## Phase 9 — AskVsAct

**File:** `AskVsAct.js`  
**Singleton:** `getAskVsAct()`

Decides whether to ask for clarification or act autonomously.

**Rules:**
- ASK when confidence < 0.6
- ASK when task is irreversible (delete, deploy, send, etc.)
- ASK when task involves credentials/sensitive data

**Key methods:**
- `evaluate(task, context)` → `{ action: 'ask'|'act', reason, clarifyingQuestions, confidence }`

---

## Phase 11 — ModelPerformanceMemory

**File:** `ModelPerformanceMemory.js`  
**Singleton:** `getModelPerformanceMemory()`

Tracks per-model performance metrics by task type. Used for intelligent model selection.

**Key methods:**
- `record(modelId, task, metrics)` → record a performance observation
- `getBestModelFor(taskType)` → best model by average score
- `getRanking(taskType)` → sorted ranking of all models
- `getStats(modelId?)` → per-model or all-model stats

---

## Phase 18 — LoopDetection

**File:** `LoopDetection.js`  
**Singleton:** `getLoopDetection()`

Detects repetitive/circular thinking loops. Loop types: `exact`, `semantic`, `structural`.

**Key methods:**
- `check(sessionId, message)` → `{ loopDetected: boolean, loopType, iteration, similarity? }`
- `reset(sessionId)` → clear session state

---

## Phase 19 — ProgressEngine

**File:** `ProgressEngine.js`  
**Singleton:** `getProgressEngine()`

Tracks multi-step task progress with percent-complete reporting.

**Key methods:**
- `start(taskId, steps, meta?)` → start tracking
- `advance(taskId, step, result?)` → mark a step done, move to next
- `complete(taskId)` → mark entire task done
- `fail(taskId, reason)` → mark failed
- `getProgress(taskId)` → `{ percent, currentStep, done, status, steps }`
- `listActive()` → all running tasks

---

## REST API — `/api/agent`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Health + stats of all components |
| POST | `/route` | Full pipeline: prompt → cognitive → LLM → quality |
| POST | `/decide` | Decision Engine: YES/NO/ASK |
| POST | `/ask-vs-act` | Ask vs Act evaluation |
| POST | `/complexity` | Task complexity analysis |
| POST | `/context/resolve` | Context resolution from history |
| POST | `/cognition/adapt` | Adapt session strategy from feedback |
| GET | `/cognition/:sessionId` | Get current session strategy |
| POST | `/cognition/:sessionId/set` | Override session strategy |
| POST | `/performance/record` | Record model performance metric |
| GET | `/performance/best/:taskType` | Best model for task type |
| GET | `/performance/ranking/:taskType` | Model ranking for task type |
| GET | `/performance/:modelId` | Model stats (use `all` for all models) |
| POST | `/loop/check` | Loop detection check |
| DELETE | `/loop/:sessionId` | Reset loop detection state |
| POST | `/progress/start` | Start task progress tracking |
| POST | `/progress/:taskId/advance` | Advance to next step |
| POST | `/progress/:taskId/complete` | Mark task complete |
| POST | `/progress/:taskId/fail` | Mark task failed |
| GET | `/progress/active` | List active tasks |
| GET | `/progress/:taskId` | Get task progress |
| GET | `/capabilities` | List capabilities |
| POST | `/capabilities` | Register capability |
| PATCH | `/capabilities/:name` | Enable/disable capability |
| DELETE | `/capabilities/:name` | Unregister capability |
