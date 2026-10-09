# MASTER_AGENT_AUDIT.md — Fase 0: Auditoría Forense del Agent Runtime

> **Estado:** FASE 0 — Auditoría (SOLO LECTURA, no destructiva).
> **Alcance:** determinar qué existe, qué está conectado, qué es stub, qué
> falta, antes de implementar el Universal Coding Agent Runtime.
> **Regla aplicada:** EXISTENTE > REUTILIZAR > ADAPTAR > CONECTAR > MEJORAR > CREAR.

## 1. Resumen ejecutivo

El proyecto ya dispone de un **agent runtime maduro** (LibreChat core +
capas personalizadas `CapabilityOrchestrator`/`AgentArchitect`), un
**sandbox Docker real**, un **sistema de tools** con 17 herramientas, y
**MCP** (configuración + servidor Python). Sin embargo, las capacidades
específicas de **Coding Agent** (AST, LSP, Knowledge Graph, Git
intelligence, Blast Radius) **NO existen** y deben construirse — salvo
el hallazgo crítico del SDK `@librechat/agents` (ver §4).

La conclusión de la auditoría es:

> **NO construir un Agent Runtime nuevo.** Consolidar el existente y
> construir encima las capas de *Code Intelligence* que faltan,
> activando el motor de coding tools que ya viene en `@librechat/agents`.

## 2. Documentos de auditoría (índice)

| Documento | Contenido |
|---|---|
| `MASTER_AGENT_AUDIT.md` (este) | Resumen ejecutivo + decisiones |
| `PROJECT_ARCHITECTURE_MAP.md` | Mapa de servicios/packages/rutas |
| `AGENT_RUNTIME_CAPABILITY_MATRIX.md` | Matriz obligatoria de capacidades |
| `AGENT_RUNTIME_GAP_ANALYSIS.md` | Brechas + plan de fases por reutilización |
| `TECHNOLOGY_STACK_PLAN.md` | Pila tecnológica (de los docs del usuario) |

> **Reutilización de auditorías previas:** la raíz del repo ya contiene
> `CURRENT_CAPABILITIES.md`, `MISSING_CAPABILITIES.md`,
> `AUDITORIA_FORENSE_COMPLETA.md`, `SYSTEM_MAP.md`,
> `DEPENDENCY_MAP.md`, `INTEGRATION_MAP.md` (no se duplican; se
> referencian). Este documento añade lo que aquellos no cubren:
> capacidades de *Coding Agent* y el hallazgo del SDK de agents.

## 3. Capas del Agent Runtime existentes (3 capas, NO duplicadas)

> **Corrección (Fase 1):** la Fase 0 inicial sobreestimó la duplicación.
> Tras auditar el código línea por línea, las 3 capas **NO son loops
> duplicados** sino responsabilidades bien separadas y reutilizables.
> Fusionarlas sería un error que rompería arquitectura correcta.

| Capa | Ubicación | Rol real (no duplicado) | Estado |
|---|---|---|---|
| AgentRuntime (fachada) | `services/AgentRuntime/index.js` | **Fachada versionada** del runtime: centraliza imports de `@librechat/api` + `@librechat/agents` con pin de contrato (`RUNTIME_VERSION`). Base correcta. | ✓ Conectado (chat SSE) |
| AgentArchitect | `services/AgentArchitect/` | **Capa de planificación** (`POST /agents/architect/plan`+`/apply`): `planner`, `modelRouter`, `contextManager` (budget tokens + compresión), `complexity`, `deepResearch`. Reutilizable para Fases 4/5/12/36. | ✓ Conectado (vía rutas /architect) |
| CapabilityOrchestrator | `services/CapabilityOrchestrator/` | **Router de modelos por capacidades**: `ModelRegistry` (índice invertido), 25+ capacidades, modos simple/specialized/intelligent, estrategias cost/latency/auto, perfiles, DI. Reutilizable para Fase 12. | ✓ Conectado (vía panel.js) |

**Jerarquía correcta verificada:** `AgentArchitect.modelRouter` **importa y
reutiliza** `ModelRegistry` de `CapabilityOrchestrator` (no duplica).
No hay duplicación: hay separación de responsabilidades.

**Acción de consolidación (Fase 1):** NO fusionar. Documentar las 3 capas
como bases reutilizables para las fases futuras (ver
`PHASE1_CONSOLIDATION.md`). La única acción real es un punto de
unificación *futuro* de los 2 RAG (ver §5bis), no destructiva ahora.

## 4. Hallazgo crítico — Motor de Coding Tools en `@librechat/agents`

El SDK `@librechat/agents` (v3.2.65, dependencia instalada) **SÍ está
activo en el flujo de chat** (`createContentAggregator`, messages
langchain en `controllers/agents/client.js`). Sin embargo, contiene un
**subconjunto de coding tools locales** que la aplicación **nunca importa**:

| Herramienta | Archivo en `node_modules/@librechat/agents/src/` |
|---|---|
| `compile_check` | `tools/local/CompileCheckTool.ts` |
| `syntaxCheck` | `tools/local/syntaxCheck.ts` |
| `grep_search` (ripgrep) | `tools/local/` |
| `glob_search` | `tools/local/` |
| `write_file` / `edit_file` / `read_file` | `tools/local/` |
| `createBashExecutionTool` | export del paquete |

> **Impacto estratégico:** activar este motor es la palanca de
> reutilización más alta. Proporciona búsqueda (ripgrep), autoría de
> archivos y validación (compile/syntax) **sin escribir nada nuevo**.
> *Verificación realizada:* `grep -rln "compile_check"
> node_modules/@librechat/agents` confirma su existencia.

**Acción (Fase 3 — Tool Runtime):** exponer e integrar este motor en el
agent loop, en lugar de crear herramientas de código desde cero.

## 5. Estado por subsistema (veredictos)

| Subsistema | Veredicto | Nota |
|---|---|---|
| Agent Runtime (loop/estado) | EXISTS | 3 capas, requiere consolidación |
| Sandbox (Docker) | EXISTS | `SandboxManager.js` + `routes/sandbox.js`, real |
| Tools (registry + ejecución) | EXISTS | `ToolService.js`, 17 tools en `manifest.json` |
| MCP | PARTIAL | config + servidor Python existen; `MCPRuntime/` vacío |
| Permisos / Firewall | PARTIAL | `PermissionService.js` real; `supervisor/permission.js` huérfano |
| Memoria | PARTIAL | short-term + MemoryEntry (largo plazo); sin capas sesión/proyecto |
| RAG | EXISTS (dual, NO duplicado) | pgvector (chat) + Redis/Ollama (AgentArchitect) — ver §5bis |
| Filesystem tools | PARTIAL | locales en SDK (no cableadas) + remoto en sandbox |
| AST / parsing | MISSING | solo heurística regex `bashAst.ts` |
| LSP | MISSING | — |
| Knowledge Graph | MISSING | — |
| Git intelligence | MISSING | sin `simple-git`/`isomorphic-git` |
| SQLite / FTS5 | MISSING | Meilisearch solo para chat |
| Verification / test runner | PARTIAL | `compile_check` dormido; QA agents son stubs |
| Blast Radius | MISSING | — |
| Observabilidad | PARTIAL | system/metrics/telemetry existen; sin agent trace/replay |

## 6. Decisiones de la Fase 0 (corregidas en Fase 1)

1. **Reutilizar** el agent runtime core de LibreChat como base (no crear otro). ✓ confirmado
2. **NO fusionar** `CapabilityOrchestrator` + `AgentArchitect` con el core: no
   están duplicados, son capas bien separadas y reutilizables (corrección Fase 1).
3. **Activar** el motor de coding tools de `@librechat/agents` (no reimplementar).
4. **Activar** `MCPRuntime/` vacío y los esquemas huérfanos de Supervisor.
5. **Construir nuevo** (no existe reutilizable): AST (Tree-sitter), LSP,
   Knowledge Graph, Git intelligence, Blast Radius, SQLite+FTS5, Agent Trace/Replay.
6. **No instalar** infraestructura pesada (Redis extra, Neo4j, K8s) —
   alineado con el principio de minimalismo del prompt.
7. **Reutilizar las capas medio hechas** para fases futuras:
   - `CapabilityOrchestrator` → Fase 12 (Model Router + Capability Registry)
   - `AgentArchitect.planner` → Fase 5 (Planner)
   - `AgentArchitect.contextManager` → Fase 4 (Context Engine)
   - `AgentArchitect.deepResearch` → Fase 36 (Research Engine)

## 5bis. Los dos RAG — NO duplicados, roles distintos (verificado Fase 1)

| RAG | Ubicación | Rol | Conectado a |
|---|---|---|---|
| pgvector (`rag_api`) + `file_search` | `controllers/agents/callbacks.js`, `v1.js` | RAG del **chat**: archivos subidos por usuario | flujo de chat principal ✓ |
| RAGService (Redis + Ollama embeddings) | `services/RAG/RAGService.js` | RAG de la **planificación**: contexto para agentes del Architect | `AgentArchitect.contextManager` ✓ |

**Conclusión:** roles distintos, **no fusionar ahora** (rompería el chat).
Acción *futura* (cuando exista el Context Engine, Fase 4): definir un
**único interfaz de retrieval híbrido** que ambos backends implementen,
para que el Context Engine los consuma de forma uniforme. No destructivo.

## 7. Gate de Fase 0

- [x] Auditoría completada (sin modificar código)
- [x] Matriz de capacidades generada
- [x] Gap analysis generado
- [x] Duplicaciones identificadas (3 capas de agent loop)
- [x] Stubs/placeholders identificados (`MCPRuntime/`, esquemas Supervisor, QA agents)
- [x] Reutilización documentada (SDK agents, SandboxManager, ToolService)
- [x] Plan de fases alineado a los 3 docs del usuario

**Resultado del GATE:** APTO para pasar a Fase 1 (Model Adapter /
consolidación), sujeto a confirmación. La Fase 0 fue no destructiva
(solo documentos).
