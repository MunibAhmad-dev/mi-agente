# PHASE1_CONSOLIDATION.md — Fase 1: Consolidación del Agent Runtime

> **Estado:** FASE 1 — COMPLETADA.
> **Principio aplicado:** REUTILIZAR > ADAPTAR > CONECTAR > CREAR.
> **Regla de no ruptura:** no se modificó ni un archivo de código
> existente. La Fase 1 fue documental/decisional: confirmar la base y
> documentar la reutilización real tras corregir la Fase 0.

## 1. Decisión de consolidación

**Decisión:** NO fusionar las 3 capas del agent runtime.

**Por qué:** la auditoría línea por línea demostró que las 3 capas **no
están duplicadas**. Fusionarlas destruiría separación de responsabilidades
correcta, rompería 10+ specs de test, y violaría "NO ROMPER EL PROYECTO".
La regla del prompt (§3 no duplicación) no aplica aquí porque **no hay
duplicación real**: hay jerarquía y especialización.

## 2. Mapa de reutilización (qué capa alimenta qué fase futura)

| Capa existente | Capacidad que aporta | Fase del doc que la reutiliza | Estado |
|---|---|---|---|
| `services/AgentRuntime/index.js` | Fachada versionada del runtime (pin de contrato `RUNTIME_VERSION`) | Base de todas las fases | ✓ Base correcta |
| `services/CapabilityOrchestrator/` | ModelRegistry (índice invertido), 25+ capacidades, modos, estrategias, perfiles, DI | Fase 12 (Adaptive Model Router) | ✓ Reutilizable |
| `services/AgentArchitect/planner.js` | generatePlan (plan multi-agente) | Fase 5 (Planner) | ✓ Reutilizable |
| `services/AgentArchitect/contextManager.js` | budget tokens, compresión, dedup, buildAgentContext, fetchContextForAgent | Fase 4 (Context Engine) | ✓ Reutilizable (ampliar) |
| `services/AgentArchitect/deepResearch.js` | decompose, collectSources, verifySubQueries, buildAnswer | Fase 36 (Research Engine) | ✓ Reutilizable |
| `services/AgentArchitect/modelRouter.js` | routePlanToModels (reutiliza CapabilityOrchestrator) | Fase 12 (routing) | ✓ Ya reutiliza |
| `services/AgentArchitect/complexity.js` | analyzeComplexity, TIERS, buildTierGuidance | Fase 23 (Risk Engine) | ✓ Reutilizable |
| `services/SandboxManager.js` | Docker containers, memory limits, execute/stage/diff | Fase 9 (Sandbox), 20 | ✓ Reutilizable |
| `services/ToolService.js` | 17 tools, loadAgentTools, authz filtering | Fase 3 (Tool Runtime) | ✓ Reutilizable (ampliar) |
| `services/PermissionService.js` | permisos Mongoose + Entra | Fase 9 (Firewall) | ✓ Reutilizable (ampliar) |
| `@librechat/agents` coding tools | compile_check, syntaxCheck, grep_search, file authoring | Fase 3 (activar) + Fase 7 (verification) | ⚠ Dormido → activar |

## 3. Duplicación real encontrada — SOLO accionable a futuro

**Duplicación real:** los 2 sistemas RAG (pgvector vs Redis/Ollama).
Pero **no** son duplicados del mismo propósito:
- pgvector = RAG del **chat** (archivos del usuario, `file_search`).
- RAGService = RAG de la **planificación** (contexto del Architect).

**Acción:** NO fusionar ahora (rompería el chat). Punto de unificación
futuro en Fase 4: un **interfaz de retrieval híbrido** que ambos
backends implementen para que el Context Engine los consuma uniforme.

## 4. Stubs/huérfanos confirmados (acciones para fases posteriores)

| Stub/huérfano | Acción | Fase |
|---|---|---|
| `services/MCPRuntime/` (vacío) | Implementar policy/registry sobre `routes/mcp.js` | Fase 3 |
| Esquemas Supervisor huérfanos (no exportados en `schema/index.ts`) | Registrar | Fase 9 |
| Coding tools del SDK `@librechat/agents` (dormido) | Integrar en el loop | Fase 3 |
| `supervisor/permission.js` (huérfano) | Conectar a PermissionService | Fase 9 |
| QA agents (stubs que devuelven markdown fijo) | Implementar de verdad | Fase 7/11 |

## 5. Verificación de integridad (no destructiva)

- **Código modificado:** NINGUNO (Fase 1 fue decisional/documental).
- **Tests rotos:** 0 (no se tocó código).
- **Regresiones:** 0.
- **Razón de no tocar código:** consolidar capas no duplicadas habría
  sido un error; la acción correcta era confirmar la base y documentar.

## 6. Gate de Fase 1

| Criterio | Estado |
|---|---|
| Implementación (decisional) | ✓ Decisión de no-fusión documentada |
| Integración | ✓ Bases reutilizables mapeadas a fases futuras |
| Sin placeholders/TODO críticos | ✓ |
| Sin imports rotos | ✓ (no se tocó código) |
| Sin servicios duplicados nuevos | ✓ (no se creó nada duplicado) |
| Sin regresiones | ✓ |
| Documentación actualizada | ✓ Fase 0 corregida + este doc |
| Compatibilidad con existentes verificada | ✓ |

**Resultado del GATE:** APTO. Pasa a Fase 2 (Model Adapter — DeepSeek).

## 7. Nota de honestidad

La Fase 0 inicial (con subagentes, leyendo de lejos) sobreestimó la
duplicación. La Fase 1 corrigió esto examinando el código real. Esto es
coherente con el método del prompt: cada fase audita la anterior.
**No se "consolidó" fusionando** porque no había duplicación real; se
consolidó **confirmando la arquitectura correcta y mapeando la
reutilización** — que es la forma responsable de respetar
"REUTILIZAR > CREAR".
