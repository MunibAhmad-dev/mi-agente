# PHASE21_RESEARCH_OS_GATE.md — Face 21: Research OS

> **Estado:** FACE 21 — COMPLETADA.
> **Puntuación anterior:** 8/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Face 21

El **Research OS** es el sistema de investigación profunda del agente: un pipeline de 14 fases (Faces 24-37 internas) que va desde la comprensión de la intención de investigación hasta la síntesis, persistencia y reporting de conocimiento. Implementado en `api/server/services/ResearchOS/`.

---

## 2. Arquitectura — 14 fases de investigación

```
ResearchOS/
├── Face 24 — Comprensión de intención
│   ├── intent/IntentAnalyzer.js         analiza qué se quiere investigar
│   ├── intent/ClarificationEngine.js    genera preguntas de clarificación
│   └── intent/ResearchProfile.js        perfil: depth, breadth, domain
│
├── Face 25 — Routing por complejidad
│   ├── router/ComplexityRouter.js        simple | medium | deep | exhaustive
│   └── router/ResourceGovernor.js        límites de tokens/tiempo/costo
│
├── Face 26 — Adquisición de contenido
│   ├── acquisition/AcquisitionCascade.js  web → local → RAG → LLM fallback
│   ├── acquisition/DocumentExtractor.js   extrae texto de HTML/PDF/DOC
│   ├── acquisition/HttpTransport.js       fetch con retry + rate-limit
│   ├── acquisition/SsrfGuard.js           bloquea URLs internas/privadas
│   └── acquisition/providers/            Google, Bing, Whoogle, arXiv
│
├── Face 27 — Pipeline de contenido
│   └── content/ContentPipeline.js        clean → chunk → normalize
│
├── Face 28 — Perfilado de fuentes
│   ├── sources/SourceProfiler.js         credibilidad, autoridad, freshness
│   └── sources/DependencyAnalyzer.js     analiza citas entre fuentes
│
├── Face 29 — Extracción de claims
│   ├── claims/ClaimExtractor.js          extrae afirmaciones factuales
│   ├── claims/EvidenceEngine.js          busca evidencia por afirmación
│   └── claims/ContradictionEngine.js     detecta contradicciones entre fuentes
│
├── Face 30 — Detección de sesgo
│   ├── bias/OrientationClassifier.js     izquierda/centro/derecha/técnico
│   └── bias/BiasForensics.js             forense de sesgo en texto
│
├── Face 31 — Motor de perspectivas
│   ├── perspectives/PerspectiveEngine.js  genera múltiples perspectivas
│   └── perspectives/AdversarialEngine.js  perspectiva adversarial (contraargumento)
│
├── Face 32 — Control de calidad de investigación
│   ├── research/GapEngine.js             detecta gaps en la investigación
│   ├── research/StopEngine.js            decide cuándo parar de investigar
│   └── research/ConfidenceEngine.js      score de confianza global
│
├── Face 33 — Recuperación híbrida
│   ├── rag/HybridRAG.js                  keyword + vector retrieval
│   ├── rag/VectorStore.js                embeddings + similarity search
│   ├── rag/KeywordStore.js               BM25 keyword search
│   └── rag/RetrievalRouter.js            elige estrategia según query
│
├── Face 34 — Orquestador
│   ├── orchestrator/ResearchOrchestrator.js  pipeline completo
│   ├── orchestrator/CheckpointManager.js     guarda estado para resumir
│   ├── orchestrator/ModelRouter.js            router de modelos por tarea
│   └── orchestrator/DomainPolicies.js        políticas por dominio (medical, legal)
│
├── Face 35 — Hipótesis y experimentos
│   ├── experiment/HypothesisEngine.js    genera hipótesis de investigación
│   ├── experiment/ExperimentEngine.js    lifecycle: design → test → conclude
│   └── experiment/SandboxProvider.js    sandbox para ejecutar scripts
│
├── Face 36 — Consolidación de conocimiento
│   ├── knowledge/KnowledgeConsolidator.js  síntesis multi-fuente
│   ├── knowledge/FreshnessManager.js       tracking de freshness por claim
│   └── knowledge/KnowledgeVersioning.js    versiona el conocimiento
│
└── Face 37 — Memoria de investigación
    └── memory/MemoryManager.js            persistencia entre sesiones
```

---

## 3. ResearchOrchestrator — pipeline completo

```js
const { ResearchOrchestrator } = require('./services/ResearchOS');
const orchestrator = new ResearchOrchestrator();

const result = await orchestrator.research({
  query: 'What are the latest advances in LLM reasoning capabilities?',
  depth: 'deep',          // simple | medium | deep | exhaustive
  maxSources: 20,
  domains: ['arxiv', 'web'],
  checkpoint: true,       // permite reanudar si se interrumpe
});
// {
//   summary: '...',
//   claims: [{ text, confidence, sources: [...] }],
//   perspectives: [{ view, evidence, bias }],
//   gaps: ['No coverage of multimodal reasoning'],
//   confidence: 0.82,
//   sources: [{ url, credibility, freshness }],
//   knowledge: { consolidated: '...', version: 2 }
// }
```

---

## 4. AcquisitionCascade — fuentes de datos

```js
const { AcquisitionCascade } = require('./services/ResearchOS');
const cascade = new AcquisitionCascade();

const docs = await cascade.acquire('quantum computing breakthroughs 2026', {
  sources: ['web', 'arxiv', 'local_rag'],
  maxResults: 10,
  freshness: '30d',  // últimos 30 días
});
// Cascade: web → arXiv → local RAG → LLM generation (si todo falla)
// [{ content, source, credibility, timestamp }]
```

Providers disponibles: Whoogle (MIT, sin API key), Bing Search, arXiv API, local RAG (pgvector).

---

## 5. SsrfGuard — protección SSRF

```js
const { SsrfGuard } = require('./services/ResearchOS');
const guard = new SsrfGuard();

guard.check('http://169.254.169.254/latest/meta-data/');
// throws SsrfError: 'AWS metadata endpoint blocked'

guard.check('http://localhost:8080/admin');
// throws SsrfError: 'Loopback address blocked'

guard.check('https://arxiv.org/abs/2603.05344');
// { allowed: true }
```

Bloquea: loopback (127.0.0.1, ::1), link-local (169.254.x.x), RFC 1918 privadas, .local domains.

---

## 6. API REST — `/api/research-os`

Montada en `api/server/routes/research.js`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Health + stats de investigaciones activas |
| POST | `/research` | Pipeline completo (query → resultado) |
| POST | `/acquire` | AcquisitionCascade (solo adquisición) |
| POST | `/analyze` | ClaimExtractor + ContradictionEngine |
| POST | `/hypothesize` | HypothesisEngine |
| GET | `/checkpoints` | Investigaciones pausadas recuperables |
| POST | `/checkpoints/:id/resume` | Reanudar investigación checkpoint |
| GET | `/knowledge/:topic` | Conocimiento consolidado por topic |

---

## 7. Gate de Face 21

| Criterio | Estado |
|----------|--------|
| IntentAnalyzer + ClarificationEngine + ResearchProfile | ✓ |
| ComplexityRouter (simple→exhaustive) + ResourceGovernor | ✓ |
| AcquisitionCascade (web→arXiv→RAG→LLM fallback) | ✓ |
| HttpTransport con retry + rate-limit | ✓ |
| SsrfGuard (bloquea localhost/privadas/AWS metadata) | ✓ |
| ContentPipeline (clean→chunk→normalize) | ✓ |
| SourceProfiler (credibilidad + autoridad + freshness) | ✓ |
| ClaimExtractor + EvidenceEngine + ContradictionEngine | ✓ |
| OrientationClassifier + BiasForensics | ✓ |
| PerspectiveEngine + AdversarialEngine | ✓ |
| GapEngine + StopEngine + ConfidenceEngine | ✓ |
| HybridRAG (keyword + vector retrieval) | ✓ |
| ResearchOrchestrator + CheckpointManager | ✓ |
| HypothesisEngine + ExperimentEngine | ✓ |
| KnowledgeConsolidator + FreshnessManager + KnowledgeVersioning | ✓ |
| MemoryManager: persistencia entre sesiones | ✓ |
| API REST `/api/research-os` 8 endpoints | ✓ |
| Whoogle provider (MIT, sin API key) | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
