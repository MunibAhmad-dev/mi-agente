# PHASE10_AUTONOMOUS_LEARNING.md — Fase 10: Autonomous Learning Engine

> **Estado:** FASE 10 — COMPLETADA.
> **Puntuación anterior:** 0/10 (no existía)
> **Puntuación final:** 10/10

---

## 1. Problema que resuelve

Un agente AI que no aprende de sus errores debe repetirlos indefinidamente. Esta fase implementa el ciclo completo de **aprendizaje autónomo**: observar eventos, clasificar conocimiento, generar hipótesis, diseñar experimentos, extraer lecciones, generalizar skills, y mantener un grafo de capacidades.

A diferencia de RAG (recuperación de documentos externos), el Autonomous Learning Engine aprende de la **experiencia propia del agente** durante ejecuciones reales.

---

## 2. Arquitectura — 8 componentes

```
AutonomousLearningEngine
├── TaskUnderstanding        clasificación de complejidad + skill extraction
├── KnowledgeConfidenceEngine  scores por topic (0–1) con historial de evidencia
├── AICouncil                3 perspectivas sintéticas (skeptic/optimist/pragmatist)
├── HypothesisEngine         genera hipótesis rankeadas por plausibilidad
├── ExperimentEngine         lifecycle: design → record → conclude
├── LearningEngine           experience → generalization → skill → registry
├── CapabilityGraph          grafo dirigido de capacidades con reinforce/findGaps
└── MetaLearningEngine       análisis de patrones + sugerencias de mejora
```

### Flujo principal: `learn(event)`

```
event
  ↓ TaskUnderstanding.classify()     → complexity, requiredSkills, knowledgeGaps
  ↓ KnowledgeConfidenceEngine        → actualiza scores de topics involucrados
  ↓ AICouncil.debate()               → 3 perspectivas → consensus + dissent
  ↓ HypothesisEngine.generate()      → hipótesis rankeadas
  ↓ ExperimentEngine.recordOutcome() → graba resultado del evento
  ↓ LearningEngine.extractLesson()   → experience → generalización → skill
  ↓ CapabilityGraph.addCapability()  → agrega/refuerza capacidad en el grafo
  ↓ MetaLearningEngine.analyze()     → meta-análisis del ciclo completo
```

---

## 3. Componentes en detalle

### 3.1 TaskUnderstanding

```js
const tu = new TaskUnderstanding();
tu.classify('implement user authentication with JWT');
// {
//   complexity: 65,
//   requiredSkills: ['programming', 'security'],
//   knowledgeGaps: ['Unfamiliar security patterns'],
//   taskType: 'complex'
// }
```

Heurísticas de complejidad (0–100):
- Base: `wordCount × 2`
- +30 si contiene `implement/architect/design/refactor/optimize`
- −20 si contiene `simple/quick/just/only/basic`
- +20 si contiene `multiple/several/all/entire/complete system`
- +15 si contiene `debug/fix/error/bug/issue`

Skill keywords detectados: `programming, database, testing, security, devops, ml_ai, frontend, backend, documentation, performance`

### 3.2 KnowledgeConfidenceEngine

Tracks scores per topic. Scores iniciales 0.5, actualizaciones con delta:

| Tipo de evento | Delta score |
|---------------|-------------|
| success | +0.1 (max 1.0) |
| failure | −0.05 (min 0.0) |
| neutral | +0.02 |

```js
const kce = new KnowledgeConfidenceEngine();
kce.update('authentication', 'success', { source: 'task_result' });
kce.getScore('authentication'); // 0.6
kce.getLowConfidenceTopics(0.5); // topics con score < 0.5
```

### 3.3 AICouncil

Genera 3 perspectivas sintéticas sobre cualquier tema:

| Perspectiva | Orientación |
|-------------|-------------|
| Skeptic | Identifica riesgos, pide más evidencia |
| Optimist | Ve oportunidades, sugiere escalabilidad |
| Pragmatist | Enfoque en implementación práctica |

```js
const council = new AICouncil();
const result = council.debate('Should we use JWT for auth?');
// { perspectives: [{role, view, score}, ...], consensus: '...', dissent: '...' }
```

### 3.4 HypothesisEngine

```js
const he = new HypothesisEngine();
const hyps = he.generate('authentication keeps failing', { failureCount: 3 });
// [
//   { hypothesis: 'Token expiration is too short', plausibility: 0.75, rationale: '...' },
//   { hypothesis: 'Race condition in token refresh', plausibility: 0.6, rationale: '...' }
// ]
```

### 3.5 ExperimentEngine

Lifecycle completo:

```js
const ee = new ExperimentEngine();
const expId = ee.design('Test JWT expiry = 15min', { hypothesis: 'Token too short' });
ee.recordOutcome(expId, { success: true, data: { expiry: '15min', errors: 0 } });
// Auto-genera conclusión: 'Experiment successful with 1 trials'
ee.getAll(); // todos los experimentos
```

### 3.6 LearningEngine

```js
const le = new LearningEngine();
le.addExperience({ task: 'JWT auth', outcome: 'success', domain: 'security', duration: 200 });
le.generateGeneralization('security');
// { domain, pattern, confidence, supportingExperiences, generalization }
const skill = le.distillSkill('security');
// { name, domain, confidence, applications: ['Handle authentication with JWT...'] }
```

### 3.7 CapabilityGraph

Grafo dirigido de capacidades con operaciones:

```js
const cg = new CapabilityGraph();
cg.addCapability('jwt_auth', 0.8, ['security', 'authentication']);
cg.addRelation('jwt_auth', 'token_refresh', 'enables');
cg.reinforce('jwt_auth', 0.1); // aumenta strength
cg.query({ minStrength: 0.7 }); // filtra capacidades
cg.findGaps(0.6); // capacidades con strength < 0.6
```

### 3.8 MetaLearningEngine

```js
const mle = new MetaLearningEngine();
mle.record({ domain: 'security', learningRate: 0.1 });
mle.analyze();
// { totalSessions, avgLearningRate, topDomains, improvements: ['...'] }
```

---

## 4. API REST

Montada en `/api/autonomous-learning`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Engine health + stats (experiences, skills, capabilities, experiments) |
| POST | `/learn` | Submite evento para aprendizaje (task + outcome + domain) |
| GET | `/capabilities` | Grafo de capacidades como JSON |
| POST | `/hypothesize` | Genera hipótesis para un topic |
| POST | `/experiment` | Registra resultado de experimento |
| GET | `/confidence/:topic` | Score de confianza para un topic |
| POST | `/council` | Obtiene debate de AICouncil sobre un tema |

### POST /api/autonomous-learning/learn

```json
{
  "task": "implement JWT authentication",
  "outcome": "success",
  "domain": "security",
  "duration": 1200,
  "details": { "tokensUsed": 2400 }
}
```

Response:
```json
{
  "ok": true,
  "learned": true,
  "lesson": {
    "id": "lesson_a1b2c3",
    "task": "implement JWT authentication",
    "outcome": "success",
    "domain": "security",
    "generalization": "security operations succeed with proper token validation",
    "skill": "jwt_auth",
    "confidence": 0.7,
    "learnedAt": "2026-09-24T12:00:00Z"
  }
}
```

---

## 5. Persistencia opcional

El engine puede persistir el registry a `data/learning-registry.json`:

```js
const engine = new AutonomousLearningEngine({ persistPath: 'data/learning-registry.json' });
// Al hacer learn(), si el directorio existe y es escribible, persiste automáticamente
// Al inicializar, carga el registry previo si existe
```

Sin `persistPath`, funciona 100% en memoria.

---

## 6. Integración con runtimeHooks

En `api/server/services/AgentRuntime/runtimeHooks.js`, con `AGENT_RUNTIME_WIRED=true`:

```js
// En onToolEnd — aprende de cada tool execution
if (process.env.AGENT_RUNTIME_WIRED === 'true') {
  const engine = require('../AutonomousLearning/AutonomousLearningEngine');
  await engine.learn({ task: toolName, outcome: error ? 'failure' : 'success', domain: 'tools' });
}
```

---

## 7. Tests

Archivo: `api/server/services/AutonomousLearning/__tests__/autonomousLearning.spec.js`

| Suite | Tests |
|-------|-------|
| TaskUnderstanding | 4 |
| KnowledgeConfidenceEngine | 4 |
| AICouncil | 3 |
| HypothesisEngine | 3 |
| ExperimentEngine | 3 |
| LearningEngine | 4 |
| CapabilityGraph | 4 |
| MetaLearningEngine | 3 |
| AutonomousLearningEngine integration | 5 |
| **Total** | **33** |

```bash
cd api && npx jest --testPathPatterns="autonomousLearning" --no-coverage
# Tests: 33 passed, 33 total
```

---

## 8. Gate de Fase 10

| Criterio | Estado |
|----------|--------|
| TaskUnderstanding — complejidad + skills + gaps | ✓ |
| KnowledgeConfidenceEngine — scores por topic con historial | ✓ |
| AICouncil — 3 perspectivas + consensus + dissent | ✓ |
| HypothesisEngine — hipótesis rankeadas | ✓ |
| ExperimentEngine — design/record/conclude lifecycle | ✓ |
| LearningEngine — experience→generalization→skill | ✓ |
| CapabilityGraph — grafo dirigido con reinforce/query/findGaps | ✓ |
| MetaLearningEngine — análisis de patrones | ✓ |
| `learn()` orquesta todo el ciclo | ✓ |
| Persistencia opcional (sin deps externas) | ✓ |
| API REST 7 endpoints | ✓ |
| Tests pasando | ✓ 33/33 |
| Route wiring en index.js | ✓ /api/autonomous-learning |
| Sin dependencias externas nuevas | ✓ solo Node.js built-ins |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
