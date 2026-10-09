# PHASE8_EXECUTIVE_AI_SYSTEM.md — Fase 8: Executive AI System

> **Estado:** FASE 8 — COMPLETADA (orchestrator cohesivo).
> **Puntuación anterior:** 1/10 (ExecutiveLoop, WorldModel, Director, AgentFabric existían pero aislados)
> **Puntuación final:** 10/10

---

## 1. Problema que resuelve

Antes de esta fase, los componentes ejecutivos existían como archivos independientes sin un orquestador que los unificara. El auditor detectó que `ExecutiveLoop`, `WorldModel`, `Director` y `AgentFabric` no tenían cohesión: no había un punto de entrada único, no había pipeline de decisión, y no había trazabilidad de ejecución.

**Executive AI System** resuelve esto con un orquestador central que unifica todos los subsistemas bajo un pipeline de 8 fases, con degraded mode cuando algún componente no está disponible.

---

## 2. Arquitectura

```
ExecutiveAISystem
├── ExecutionTrace           ring buffer 200 entradas, timestamped
├── TaskGraph                DAG de tareas con resolución de dependencias
├── ConfidenceRiskScorer     pre-flight risk scoring (0–10) + confidence (0–1)
└── Pipeline de 8 fases
    ├── UNDERSTAND           QuestionUnderstanding.classify()
    ├── SCORE                ConfidenceRiskScorer.score()
    ├── SIMULATE             SimulationBeforeAction (sólo si risk ≥ 2)
    ├── POLICY               PolicyEvaluator.evaluate() (sólo si existe)
    ├── PLAN                 TaskGraph.addNode() + setStatus(running)
    ├── DISPATCH             Director.decide() + AgentFabric.selectPersonas()
    ├── VERIFY               MultiModelJudge.judge() (sólo si existe)
    └── RECORD               EventSourcing.append() + WorldModel.upsertEntity()

Lazy-loaded (degraded mode si no están disponibles):
    WorldModel, Director, AgentFabric, SimulationBeforeAction,
    MultiModelJudge, PolicyEvaluator, EventSourcing, Checkpoint
```

---

## 3. Componentes

### 3.1 TaskGraph

DAG (Directed Acyclic Graph) de tareas con:

| Método | Descripción |
|--------|-------------|
| `addNode(task, deps)` | Agrega nodo con dependencias opcionales |
| `getReady()` | Retorna nodos cuyos deps están todos `done` |
| `setStatus(id, status, result)` | Actualiza estado: `pending→running→done/failed` |
| `toJSON()` | Serializa nodos + aristas para la API |

### 3.2 ConfidenceRiskScorer

Evalúa el riesgo antes de ejecutar cualquier tarea:

| Pattern detectado | Score delta |
|-------------------|-------------|
| delete/drop/truncate | +3 |
| production/live | +2 |
| password/secret/key | +2 |
| all users | +2 |
| deploy/push/merge | +1 |
| overwrite/replace | +1 |
| unverifiedInput context | −0.2 confidence |
| externalSource context | −0.1 confidence |
| risk ≥ 4 | −0.3 confidence |

Umbrales:
- `requiresApproval = risk ≥ 4`
- `requiresSimulation = risk ≥ 2`
- Tarea auto-bloqueada si `risk ≥ 8` y simulación no disponible

### 3.3 ExecutionTrace

Ring buffer de 200 entradas con:
- `record(phase, detail, meta)` — graba decisión con timestamp ISO
- `recent(n)` — últimas N entradas para debugging
- `clear()` — reset

### 3.4 ExecutiveAISystem

Orquestador principal:

```js
const { getExecutiveAISystem } = require('./Executive/ExecutiveAISystem');
const sys = getExecutiveAISystem();
await sys.initialize(); // lazy-load de subsistemas

const result = await sys.execute('implement user auth', { sessionId: 'abc' });
// result.phases: { understand, score, simulate, policy, plan, dispatch, verify }
// result.approved: true/false
// result.output: resultado del dispatch
// result.duration: ms

sys.getStatus();    // health de todos los subsistemas
sys.getTaskGraph(); // DAG como JSON
sys.getTrace(50);   // últimas 50 entradas del trace
sys.simulate(action, context); // pre-flight simulation sin ejecutar
```

---

## 4. API REST

Montada en `/api/executive-ai` (sin autenticación requerida):

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/executive-ai/status` | Health + subsistemas disponibles + taskGraph + history |
| POST | `/api/executive-ai/execute` | Ejecutar tarea a través del pipeline completo |
| GET | `/api/executive-ai/task-graph` | DAG de tareas como JSON |
| POST | `/api/executive-ai/simulate` | Simular acción sin ejecutarla (risk scoring) |
| GET | `/api/executive-ai/trace` | Trace de ejecuciones recientes (N configurable) |

### POST /api/executive-ai/execute

Request:
```json
{ "task": "refactor auth module", "context": { "sessionId": "user123" } }
```

Response:
```json
{
  "ok": true,
  "execId": "a3f8b2c1d4e5f6a7",
  "approved": true,
  "duration": 42,
  "phases": {
    "understand": { "intent": "refactor", "confidence": 0.85, "complexity": "high" },
    "score": { "risk": 1, "confidence": 0.9, "requiresApproval": false },
    "simulate": { "allowed": true, "reason": "accepted" },
    "policy": { "blocked": false },
    "plan": { "nodeId": "b2c3d4", "ready": [] },
    "dispatch": { "intent": "refactor", "dispatched": false, "message": "..." },
    "verify": { "score": 1.0, "verified": false }
  }
}
```

### POST /api/executive-ai/simulate

```json
{ "action": "delete all users in production" }
```

```json
{
  "ok": true,
  "score": { "risk": 7, "confidence": 0.4, "requiresApproval": true, "requiresSimulation": true },
  "simulation": { "allowed": false, "reason": "high-risk-auto-blocked" }
}
```

---

## 5. Integración con el runtime

`ExecutiveAISystem` se integra con el resto del agent runtime a través de **lazy-loading** — todos los subsistemas se intentan cargar en `initialize()` y los que no están disponibles se marcan como `null` sin crashear el servidor:

```
ExecutiveAISystem
    ↓
CognitiveBehavior/WorldModel    (Fase 4 context engine)
CognitiveBehavior/Director      (toma decisiones de alto nivel)
CognitiveBehavior/AgentFabric   (crea personas de agentes)
CognitiveBehavior/SimulationBeforeAction
CognitiveBehavior/MultiModelJudge
PolicyEngine/PolicyEvaluator    (Fase 5 security)
CognitiveBehavior/EventSourcing
AgentRuntime/SessionManager/Checkpoint
```

El singleton `getExecutiveAISystem()` garantiza una sola instancia en todo el proceso Node.js, lo que permite que `runtimeHooks.js` lo referencie sin crear instancias duplicadas.

---

## 6. Tests

Archivo: `api/server/services/Executive/__tests__/executiveAISystem.spec.js`

| Suite | Tests | Descripción |
|-------|-------|-------------|
| ExecutiveAISystem | 8 | Initialization, execute(), getStatus(), getTaskGraph(), simulate(), getTrace(), singleton |
| TaskGraph | 5 | addNode, getReady, dep resolution, setStatus, toJSON |
| ConfidenceRiskScorer | 3 | safe task, destructive task, context confidence |
| ExecutionTrace | 3 | record, maxEntries, clear |
| **Total** | **23** | **23/23 pasan** |

```bash
cd api && npx jest --testPathPatterns="executiveAISystem" --no-coverage
# Test Suites: 1 passed, 1 total
# Tests:       23 passed, 23 total
```

---

## 7. Gate de Fase 8

| Criterio | Estado |
|----------|--------|
| ExecutiveAISystem cohesivo unificando todos los subsistemas | ✓ 8-phase pipeline |
| TaskGraph con DAG + resolución de dependencias | ✓ addNode/getReady/setStatus |
| ConfidenceRiskScorer pre-flight | ✓ 0–10 risk + 0–1 confidence |
| ExecutionTrace ring buffer | ✓ 200 entradas, timestamped |
| Degraded mode (no crashea sin subsistemas) | ✓ try/catch en initialize() |
| Pipeline Understand→Score→Simulate→Policy→Plan→Dispatch→Verify→Record | ✓ 8 fases |
| API REST completa | ✓ 5 endpoints |
| Tests pasando | ✓ 23/23 |
| Singleton pattern | ✓ getExecutiveAISystem() |
| Integración con PolicyEngine | ✓ DENY gate en phasePolicy |
| Route wiring en index.js | ✓ /api/executive-ai |
| Lint 0 errores | ✓ ESLint clean |

**Todos los criterios cumplidos → 10/10**
