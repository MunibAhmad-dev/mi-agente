# AGENT_RUNTIME_CAPABILITY_MATRIX.md — Matriz obligatoria de capacidades

> Fase 0. Veredictos: **EXISTS** (conectado) · **PARTIAL** (existe pero
> incompleto/desconectado) · **STUB** (placeholder vacío) · **MISSING**
> (no existe). Columna *Reutilizar* indica si debe reutilizarse vs crearse.

| Capability | Existing | Location | Status | Reusable | Needs Adaptation | Missing | Priority |
|---|---|---|---|---|---|---|---|
| Agent Controller | Sí | `controllers/agents/` + `AgentRuntime/index.js` (fachada) | EXISTS | Sí | — | No | P0 |
| Agent Loop | Sí | `@librechat/agents` (activo en `client.js`) | EXISTS | Sí | — | No | P0 |
| Planner | Sí | `AgentArchitect/planner.js` | EXISTS | Sí | Conectar al Context Engine futuro | No | P1 |
| Task Engine | Sí | `services/Runs/` + `CapabilityOrchestrator/ExecutionEngine.js` | PARTIAL | Sí | Añadir Task Graph | No | P1 |
| Task Graph | No | — | MISSING | No | — | Sí | P2 |
| Tool Runtime | Sí | `services/ToolService.js` | EXISTS | Sí | Añadir permisos/retry/timeout por tool | No | P1 |
| Tool Router | No | — | MISSING | No | — | Sí | P2 |
| Model Router | Sí | `CapabilityOrchestrator/` (ModelRegistry + estrategias) | EXISTS | Sí | Conectar al flujo de chat (no solo panel) | No | P2 |
| DeepSeek Adapter | Sí | via `@librechat/agents` (OpenAI-compatible) | EXISTS | Sí | Verificar streaming/tool calling | No | P1 |
| Context Engine | Sí (parcial) | `AgentArchitect/contextManager.js` | PARTIAL | Sí | Ampliar a capas L0–L7 + retrieval híbrido | No | P2 |
| Context Compression | Sí (parcial) | `AgentArchitect/contextManager.js` (compressToBudget) | PARTIAL | Sí | Añadir artifacts | No | P3 |
| Memory | Sí | `MemoryEntry` + Conversation/Message | PARTIAL | Sí | Añadir capas sesión/proyecto/histórico | No | P2 |
| RAG | Sí | pgvector (chat) + Redis/Ollama (Architect) — roles distintos | EXISTS | Sí | Unificar interfaz en Fase 4 | No | P2 |
| Code Intelligence | No | — | MISSING | No | — | Sí | P2 |
| Tree-sitter | No | — | MISSING | No | — | Sí | P2 |
| LSP | No | — | MISSING | No | — | Sí | P3 |
| AST | No | `bashAst.ts` (regex, no real) | MISSING | No | — | Sí | P2 |
| Symbol Index | No | — | MISSING | No | — | Sí | P3 |
| Dependency Graph | No | — | MISSING | No | — | Sí | P3 |
| Knowledge Graph | No | — | MISSING | No | — | Sí | P3 |
| Blast Radius | No | — | MISSING | No | — | Sí | P3 |
| Risk Engine | No | — | MISSING | No | — | Sí | P3 |
| Git Intelligence | No | sin `simple-git`/`isomorphic-git` | MISSING | No | — | Sí | P3 |
| MCP | Sí | `routes/mcp.js` + `packages/mcp-server/` | PARTIAL | Sí | Activar `MCPRuntime/` vacío | No | P2 |
| MCP Gateway | No | `services/MCPRuntime/` (vacío) | STUB | Sí (el dir existe) | Implementar policy/registry | No | P2 |
| Sandbox | Sí | `services/SandboxManager.js` (Docker real) | EXISTS | Sí | — | No | P1 |
| Agent Firewall | Sí | `PermissionService.js` + `supervisor/permission.js` | PARTIAL | Sí | Conectar esquemas huérfanos de Supervisor | No | P1 |
| Permissions | Sí | `PermissionService.js` (Mongoose+Entra) | EXISTS | Sí | Añadir permisos granulares de agente | No | P1 |
| Subagents | No | — | MISSING | No | — | Sí | P3 |
| Skills | Sí | `routes/skills.js` + `components/Skills/` | EXISTS | Sí | Cargar bajo demanda | No | P2 |
| AGENT.md | No | existe `AGENTS.md` (distinto) | MISSING | No | — | Sí | P3 |
| Verification Engine | No | `compile_check` dormido en SDK | PARTIAL | Sí | Activar + añadir tests/lint/build | No | P2 |
| Repair Engine | No | — | MISSING | No | — | Sí | P3 |
| Loop Detection | No | — | MISSING | No | — | Sí | P3 |
| Checkpointing | No | `WorkflowEngine` (no agente) | PARTIAL | Sí | Adaptar de WorkflowEngine | No | P3 |
| Recovery | No | — | MISSING | No | — | Sí | P3 |
| Observability | Sí | `routes/system|metrics|telemetry.js` | PARTIAL | Sí | Añadir Agent Trace/Replay | No | P2 |
| Agent Trace | No | — | MISSING | No | — | Sí | P3 |
| Agent Replay | No | — | MISSING | No | — | Sí | P3 |
| Research Engine | No | — | MISSING | No | — | Sí | P3 |
| Browser Agent | Sí | herramientas tavily/duckduckgo en `manifest.json` | PARTIAL | Sí | Añadir navigate/click/inspect | No | P3 |
| Resource Governor | No | — | MISSING | No | — | Sí | P3 |
| Evaluation Engine | No | — | MISSING | No | — | Sí | P3 |
| Benchmarking | No | — | MISSING | No | — | Sí | P3 |
| Coding Tools (file/bash/grep) | Sí | `@librechat/agents/src/tools/local/` (DORMANT) | PARTIAL | Sí | **Activar e integrar** (clave) | No | P1 |

## Leyenda de prioridades
- **P0** — Consolidación/deduplicación (bloqueante; sin esto, añadir más es duplicar).
- **P1** — Cimientos reutilizables listos para activar (sandbox, tools, SDK, permisos).
- **P2** — Capas que amplían el runtime hacia coding (context, MCP, memory, RAG, verification).
- **P3** — Capacidades avanzadas (AST/LSP/graph, blast radius, repair, subagents, observabilidad avanzada, evaluation).

## Conclusión de la matriz
- **~20 de 45** capacidades ya existen (total o parcialmente) y son **reutilizables**.
- **~25** están **MISSING** y requieren construcción nueva, pero muchas son P3.
- La palanca de mayor impacto y menor esfuerzo es **activar el SDK `@librechat/agents`** (fila final): aporta coding tools + verification sin código nuevo.
