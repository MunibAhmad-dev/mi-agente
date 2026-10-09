# PHASE16_AGENT_SELF_LEARNING.md — Fase 16: Agent Self-Learning System

> **Estado:** FASE 16 — COMPLETADA.
> **Puntuación anterior:** 0/10 (no existía)
> **Puntuación final:** 10/10

---

## 1. Problema que resuelve

La diferencia entre un agente que "aprende" (Fase 10) y un agente que **se conoce a sí mismo** es la introspección. El `AgentSelfLearningSystem` implementa el ciclo KV (Knowledge Verification) que permite al agente:

1. **Detectar** qué tipo de evento está ocurriendo
2. **Detectar loops** antes de quedar atrapado en ellos
3. **Detectar gaps** en su propio conocimiento
4. **Validar** el conocimiento que acumula (con staging de confianza)
5. **Recordar** relaciones causales (causa → efecto)
6. **Destilar** skills reusables desde su historial de éxitos
7. **Replaying** experiencias para avanzar el staging de confianza

---

## 2. Arquitectura — 10 componentes

```
AgentSelfLearningSystem
├── EventDetector          classify(event) → type + severity + confidence
├── LoopDetector           detectLoop(history) → isLoop + pattern + count
├── KnowledgeGapDetector   detectGaps(text) → gaps + severity
├── KnowledgeValidator     validate() → UNVERIFIED→PROVISIONAL→VERIFIED→HIGH_CONFIDENCE
├── CausalMemory           addCause(cause,effect,confidence) + getCausalChain()
├── SkillDistiller         extract(successHistory) → reusable skills
├── ExperienceReplay       replay(id) → advanced staging
├── RegressionMemory       record/checkRegression(topic, performance)
├── LearningBenchmark      compute() → recall/precision/improvement_rate
└── LessonObject           factory → { id, content, domain, confidence, stage }
```

### Flujo principal: `learn(event)`

```
event
  ↓ EventDetector.classify()        → type, severity, confidence
  ↓ LoopDetector.detectLoop()       → isLoop? (si sí, genera gap)
  ↓ KnowledgeGapDetector.detect()   → knowledge gaps en el contenido
  ↓ LessonObject.create()           → lesson con stage UNVERIFIED
  ↓ KnowledgeValidator.validate()   → stage advancement (si hay evidencia)
  ↓ CausalMemory.addCause()         → registra causa→efecto
  ↓ SkillDistiller.extract()        → extrae skill si fue success
  ↓ RegressionMemory.record()       → trackea performance por topic
  ↓ LearningBenchmark.compute()     → actualiza métricas del sistema
  ↓ return lesson + metrics
```

---

## 3. Componentes en detalle

### 3.1 EventDetector

```js
const ed = new EventDetector();
ed.classify({ content: 'Error: connection refused after 3 retries', outcome: 'failure' });
// {
//   type: 'error',       // task_start|task_end|error|tool_use|user_feedback|system|observation
//   severity: 'high',   // low|medium|high|critical
//   confidence: 0.9,
//   tags: ['connection_refused', 'retries', 'network']
// }
```

Severidades:
- `critical`: crash/fatal/critical/unrecoverable
- `high`: error/failure/failed/exception/timeout
- `medium`: warning/warn/retry/slow/degraded
- `low`: success/complete/done/ready + default

### 3.2 LoopDetector

```js
const ld = new LoopDetector();
ld.detectLoop(['retry auth', 'auth failed', 'retry auth', 'auth failed', 'retry auth']);
// { isLoop: true, pattern: 'retry auth | auth failed', count: 3, severity: 'high' }
```

Detecta loops cuando un patrón de 2 elementos aparece 3+ veces consecutivos. Severidades:
- `critical`: count ≥ 5
- `high`: count ≥ 3
- `medium`: default

### 3.3 KnowledgeGapDetector

```js
const kgd = new KnowledgeGapDetector();
kgd.detectGaps("I'm not sure how to handle the OAuth flow. I think it might need a refresh token but I'm uncertain.");
// [
//   { gap: "not sure how to handle...", severity: 'medium', topic: 'knowledge' },
//   { gap: "uncertain about...", severity: 'low', topic: 'knowledge' }
// ]
```

Frases trigger: `not sure`, `don't know`, `unsure`, `uncertain`, `unclear`, `confused`, `unknown`, `need to learn`, `lack`, `missing`, `gap`, `I think`, `I believe` (con severidades distintas).

### 3.4 KnowledgeValidator — Staging de confianza

```
UNVERIFIED (0 evidencias)
    ↓ evidenceCount ≥ 1
PROVISIONAL (confianza ≥ 0.5)
    ↓ evidenceCount ≥ 3
VERIFIED (confianza ≥ 0.7)
    ↓ evidenceCount ≥ 5
HIGH_CONFIDENCE (confianza ≥ 0.9)
```

```js
const kv = new KnowledgeValidator();
const id = kv.register('JWT refresh flow', 'auth');
kv.addEvidence(id, { source: 'experiment', outcome: 'success' });
kv.addEvidence(id, { source: 'user_feedback', outcome: 'success' });
kv.addEvidence(id, { source: 'test_result', outcome: 'success' });
kv.validate(id);
// { id, stage: 'VERIFIED', confidence: 0.7, evidenceCount: 3 }
```

### 3.5 CausalMemory

```js
const cm = new CausalMemory();
cm.addCause('token_expired', 'auth_failure', 0.9, { context: 'prod' });
cm.getEffects('token_expired'); // [{ effect, confidence, count, ... }]
cm.getCausalChain('token_expired', 'user_locked_out', 3);
// ['token_expired → auth_failure → repeated_retry → user_locked_out']
cm.getStats(); // { totalRelations, avgConfidence, topCauses }
```

### 3.6 SkillDistiller

```js
const sd = new SkillDistiller();
const skill = sd.extract([
  { task: 'implement JWT auth', domain: 'security', outcome: 'success', duration: 1200 },
  { task: 'add token refresh', domain: 'security', outcome: 'success', duration: 800 },
  { task: 'setup OAuth2 flow', domain: 'security', outcome: 'success', duration: 1500 },
]);
// {
//   name: 'security_mastery',
//   domain: 'security',
//   pattern: 'Successful approach to security tasks',
//   successCount: 3,
//   avgDuration: 1167,
//   confidence: 0.75,
//   applications: ['Apply to: implement JWT auth', 'Apply to: add token refresh', ...]
// }
```

### 3.7 ExperienceReplay

```js
const er = new ExperienceReplay();
er.add('lesson_123', { content: 'JWT works best with 15min expiry', stage: 'UNVERIFIED', confidence: 0.5 });
er.replay('lesson_123');
// { ...lesson, stage: 'PROVISIONAL', confidence: 0.6, replayCount: 1 }
// Cada replay: confidence += 0.1, avanza stage si supera umbral
```

### 3.8 RegressionMemory

```js
const rm = new RegressionMemory();
rm.record('auth', 0.85); // primer registro
rm.record('auth', 0.60); // bajó
rm.checkRegression('auth');
// { hasRegression: true, topic: 'auth', current: 0.60, baseline: 0.85, delta: -0.25 }
```

Umbral de regresión: delta < −0.1 (10% de caída)

### 3.9 LearningBenchmark

```js
const lb = new LearningBenchmark();
lb.record({ domain: 'security', stage: 'VERIFIED', correct: true, regressions: 0 });
lb.compute();
// { recall: 0.85, precision: 0.9, improvement_rate: 0.1, total: 1 }
```

Métricas:
- **recall**: ratio de lecciones correctas
- **precision**: ratio de HIGH_CONFIDENCE correctas
- **improvement_rate**: variación respecto al período anterior

---

## 4. API REST

Montada en `/api/self-learning`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Health + stats (lessons, skills, distilled skills, benchmark) |
| POST | `/observe` | Registrar evento para aprendizaje (aprende + retorna lección) |
| GET | `/lessons` | Todas las lecciones (filtrable por domain/stage/minConfidence) |
| GET | `/causal-map` | Mapa causal como JSON |
| POST | `/distill` | Destilar skills desde historial de éxitos |
| GET | `/benchmark` | Métricas de recall/precision/improvement_rate |
| POST | `/replay/:id` | Replay de una lección específica |
| GET | `/skills` | Skills destilados |
| GET | `/gaps` | Knowledge gaps detectados |

### POST /api/self-learning/observe

```json
{
  "content": "Successfully implemented JWT refresh using Redis for token storage",
  "outcome": "success",
  "domain": "security",
  "context": { "duration": 1200, "tokensUsed": 2100 }
}
```

Response:
```json
{
  "ok": true,
  "lesson": {
    "id": "lesson_a1b2c3",
    "content": "Successfully implemented JWT refresh...",
    "domain": "security",
    "outcome": "success",
    "stage": "UNVERIFIED",
    "confidence": 0.5,
    "learnedAt": "2026-09-24T12:00:00Z"
  },
  "eventType": "task_end",
  "loops": { "isLoop": false },
  "gaps": []
}
```

### GET /api/self-learning/lessons?domain=security&stage=VERIFIED

```json
{
  "ok": true,
  "lessons": [{ "id": "...", "content": "...", "stage": "VERIFIED", "confidence": 0.75 }],
  "total": 5
}
```

---

## 5. Diferencia con Autonomous Learning Engine (Fase 10)

| Dimensión | Fase 10 (AutonomousLearning) | Fase 16 (SelfLearning) |
|-----------|------------------------------|------------------------|
| Foco | Ciclo de aprendizaje completo (TaskUnderstanding→CapabilityGraph) | Introspección + verificación de conocimiento |
| Loop detection | No | ✓ LoopDetector |
| Knowledge gaps | En task classify | ✓ KnowledgeGapDetector (análisis de texto) |
| Staging de confianza | No | ✓ UNVERIFIED→HIGH_CONFIDENCE |
| Causal memory | No | ✓ CausalMemory |
| Skill distillation | LearningEngine.distillSkill() | ✓ SkillDistiller (desde historial) |
| Experience replay | No | ✓ ExperienceReplay (avanza staging) |
| Regression detection | No | ✓ RegressionMemory |
| Benchmark metrics | MetaLearningEngine | ✓ LearningBenchmark (recall/precision) |

Los dos sistemas son **complementarios**: Fase 10 aprende del mundo, Fase 16 aprende de sí mismo.

---

## 6. Tests

Archivo: `api/server/services/SelfLearning/__tests__/selfLearning.spec.js`

| Suite | Tests |
|-------|-------|
| EventDetector | 4 |
| LoopDetector | 3 |
| KnowledgeGapDetector | 3 |
| KnowledgeValidator (staging) | 5 |
| CausalMemory | 4 |
| SkillDistiller | 3 |
| ExperienceReplay | 3 |
| RegressionMemory | 3 |
| LearningBenchmark | 3 |
| AgentSelfLearningSystem integration | 4 |
| **Total** | **35** |

```bash
cd api && npx jest --testPathPatterns="selfLearning" --no-coverage
# Tests: 35 passed, 35 total
```

---

## 7. Gate de Fase 16

| Criterio | Estado |
|----------|--------|
| EventDetector (7 tipos + 4 severidades) | ✓ |
| LoopDetector (patrón 3+ repeticiones) | ✓ |
| KnowledgeGapDetector (phrases + severidades) | ✓ |
| KnowledgeValidator (4 stages: UNVERIFIED→HIGH_CONFIDENCE) | ✓ |
| CausalMemory (cause→effect + causal chains) | ✓ |
| SkillDistiller (historial de éxitos → skills reusables) | ✓ |
| ExperienceReplay (replay → stage advancement) | ✓ |
| RegressionMemory (baseline + delta detection) | ✓ |
| LearningBenchmark (recall/precision/improvement_rate) | ✓ |
| LessonObject factory | ✓ |
| `learn()` orquesta los 10 componentes | ✓ |
| API REST 9 endpoints | ✓ |
| Tests pasando | ✓ 35/35 |
| Route wiring en index.js | ✓ /api/self-learning |
| Sin dependencias externas nuevas | ✓ |
| Diferenciación clara de Fase 10 | ✓ complementario, no duplicado |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
