# PHASE7_UNIVERSAL_AI_OS_GATE.md — Face 7: Universal AI OS

> **Estado:** FACE 7 — COMPLETADA.
> **Puntuación anterior:** 8.5/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Face 7

La **Universal AI OS** es el sistema operativo central que orquesta todos los subsistemas del agente como una plataforma unificada: routing de modelos, gestión de providers, pipeline cognitivo, herramientas, seguridad, memoria y hooks de runtime. Todo el sistema está wired bajo la feature flag `AGENT_RUNTIME_WIRED=true`.

---

## 2. Arquitectura — capas del Universal AI OS

```
Universal AI OS
├── Runtime Core
│   ├── AgentRuntime/runtimeHooks.js    hooks lifecycle (onInit→onRun→onEnd)
│   ├── HarnessEngine.js                harness two-phase (scaffold + runtime)
│   └── HeadlessSDK.js                  modo headless para CI/CD
│
├── Model Layer
│   ├── UniversalAgentAbstraction.js    wrapper model-agnostic
│   ├── UniversalLLMRouter.js           routing por capability
│   ├── ProviderAbstraction.js          abstracción de provider
│   └── ModelPerformanceMemory.js       memoria de performance por modelo
│
├── Cognitive Layer (60+ modules)
│   ├── CognitiveBehavior/              face 4 — pipeline cognitivo completo
│   └── CognitiveBehavior/index.js      surface pública exportada
│
├── Tool Layer
│   ├── ToolService.js                  registry + ejecución de 41 tools
│   ├── handleTools.js                  handler en el chat pipeline
│   ├── ApplyPatch.js                   apply file patches
│   ├── BackgroundExec.js               ejecución background
│   └── MonitorProcess.js              monitor de procesos en segundo plano
│
├── Security Layer
│   ├── Security/agentFirewall.js       firewall: presets restricted/standard/full
│   ├── SecurityScanner/               secretos + SAST + dependencias
│   └── PolicyEngine/                  políticas Cedar (11 default)
│
├── Memory Layer
│   ├── Memory/memoryService.js         5 capas (SHORT→ARTIFACT)
│   ├── CognitiveBehavior/MemorySystem.js multi-turn memory
│   └── AutonomousLearning/            aprendizaje autónomo (face 10)
│
└── Agent Orchestration
    ├── SubAgents/ (6 roles)            Explorer/Researcher/Coder/Tester/Reviewer/Security
    ├── HarnessEngine/WorktreeIsolation git worktrees para ejecución paralela
    └── Executive/ExecutiveAISystem.js  orquestador ejecutivo (face 8)
```

---

## 3. UniversalAgentAbstraction — pipeline completo

```js
const { getUniversalAgentAbstraction } = require('./UniversalAgentAbstraction');
const agent = getUniversalAgentAbstraction();

const result = await agent.route('implement JWT auth with Redis', {
  sessionId: 'sess_123',
  model: 'deepseek-v3',
});
// {
//   content: '...',
//   contract: { format: 'code+explanation', length: 'medium' },
//   quality: { score: 0.88, passed: true },
//   complexity: { level: 'complex', score: 7 },
//   decision: { action: 'act', confidence: 0.9 }
// }
```

### `wrap()` — proveedores intercambiables

```js
const deepseekAgent = agent.wrap('deepseek-local', { temperature: 0.1 });
const ollamaAgent = agent.wrap('ollama-local', { temperature: 0.3 });
// Mismo contrato de API — provider reemplazable sin cambiar código
```

---

## 4. runtimeHooks — 8 hooks de integración

```
AGENT_RUNTIME_WIRED=true activa todos los hooks:

onInitializeClient  → preload project memory (F10)
onToolLoad          → merge coding tools en tool registry
onToolExecute       → AgentFirewall gate (F9)
onToolEnd           → CodeIntelligence → BlastRadius → Verify → Repair → Memory
onRunStart          → inicia trace observabilidad (F13) + AutoSkillMatcher (F10)
onRunEnd            → cierra trace + metrics → AdaptiveRouter + memory (F12/F13/F10)
onModelSelect       → consulta AdaptiveRouter para selección de modelo (F12)
onTraceStep         → graba evento intermedio de trace (F13)
```

Implementado en `api/server/services/AgentRuntime/runtimeHooks.js`.

---

## 5. HarnessEngine — two-phase agent harness

### Phase 1: Scaffolding (antes del primer prompt)

```
SystemPromptBuilder → Persona → Scope → Tools → Constraints → References
ToolRegistry        → lazy discovery (solo herramientas necesarias para la tarea)
SubagentRegistry    → exploradores read-only, coders read-write
```

### Phase 2: Runtime harness

```
InjectionPoints      → reminders en el momento correcto (previene instruction fade)
ReminderQueue        → reminders priorizados y deduplicados
CompactionManager    → compress tool outputs → sliding window → LLM summarization
ConversationState    → historial como event stream consultable
StopConditions       → doom loops / repeated failures / no progress
ToolEnforcement      → normaliza output: UI rendering vs model context
SandboxRunner        → shell en bubblewrap cuando disponible
```

---

## 6. REST API — `/api/agent` (Universal Agent)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Health + stats de todos los componentes |
| POST | `/route` | Pipeline completo: prompt → cognitivo → LLM → quality |
| POST | `/decide` | Decision Engine: YES/NO/ASK |
| POST | `/ask-vs-act` | Ask vs Act evaluation |
| POST | `/complexity` | Task complexity analysis |
| POST | `/context/resolve` | Context resolution |
| POST | `/cognition/adapt` | Adaptar estrategia cognitiva |
| GET | `/cognition/:sessionId` | Estrategia actual de sesión |
| POST | `/performance/record` | Registrar métrica de performance |
| GET | `/performance/best/:taskType` | Mejor modelo para tipo de tarea |
| POST | `/loop/check` | Loop detection |
| GET | `/capabilities` | Registry de capacidades |

Montada en `api/server/routes/universalAgent.js`.

---

## 7. HeadlessSDK — modo CI/CD

```bash
node api/server/services/AgentRuntime/HeadlessSDK.js \
  "implement authentication module" \
  --model deepseek-v3 \
  --max-turns 20 \
  --json
```

Output JSON con: `{ success, turns, result, trace, cost }`.

---

## 8. Gate de Face 7

| Criterio | Estado |
|----------|--------|
| UniversalAgentAbstraction model-agnostic | ✓ |
| Provider reemplazable sin cambiar código (ProviderAbstraction) | ✓ |
| `AGENT_RUNTIME_WIRED=true` activa todos los hooks | ✓ |
| 8 runtimeHooks integrados (init→run→end) | ✓ |
| HarnessEngine: two-phase scaffold + runtime | ✓ |
| ToolRegistry con lazy discovery (41 tools) | ✓ |
| AgentFirewall: presets restricted/standard/full | ✓ |
| 6 roles de SubAgents con contextos independientes | ✓ |
| WorktreeIsolation para ejecución paralela | ✓ |
| HeadlessSDK para CI/CD | ✓ |
| CompactionManager anti-context-overflow | ✓ |
| StopConditions anti-doom-loop | ✓ |
| API REST `/api/agent` con 12 endpoints | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
