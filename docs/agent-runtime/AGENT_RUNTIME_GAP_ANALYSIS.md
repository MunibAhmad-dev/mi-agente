# AGENT_RUNTIME_GAP_ANALYSIS.md — Brechas y plan de fases por reutilización

> Fase 0. Traduce la matriz de capacidades en un plan de fases que cumple
> las reglas del usuario: REUTILIZAR > ADAPTAR > CONECTAR > CREAR, y
> minimalismo (SQLite + filesystem + procesos bajo demanda, sin infra pesada).

## A. Brechas críticas (qué falta, agrupado por reutilización)

### A.1 — Cablear/activar lo que YA existe (cero invención)
1. **Motor de coding tools del SDK** `@librechat/agents` dormido → integrar en el loop.
2. **`MCPRuntime/`** vacío → implementar policy/registry sobre `routes/mcp.js`.
3. **Esquemas de Supervisor** huérfanos (no exportados en `schema/index.ts`) → registrar.
4. **`compile_check`/`syntaxCheck`** → exponer como verification del agente.

### A.2 — Consolidar duplicaciones (regla de no duplicación §3)
5. **3 capas de agent loop** (LibreChat core + `CapabilityOrchestrator` +
   `AgentArchitect`) → reconciliar en una sola arquitectura.
6. **2 sistemas RAG** (pgvector + Redis/Ollama) → unificar.

### A.3 — Construir nuevo (no existe reutilizable), ordenado por impacto
7. **Code Intelligence**: AST (Tree-sitter) + symbol index + dependency graph.
8. **LSP**: typescript-language-server para definitions/references/diagnostics.
9. **Knowledge Graph**: SQLite + FTS5 + Tree-sitter + LSP (no Neo4j).
10. **Blast Radius + Risk Engine**: sobre el Knowledge Graph + Git.
11. **Git intelligence**: libgit2 (`simple-git`) para blame/diff/co-change.
12. **Context Engine**: capas L0–L7, ranking, compresión, artifacts.
13. **Verification Engine**: test runner + typecheck + lint + build + DoD.
14. **Repair + Loop Detection + Recovery**: estrategias progresivas.
15. **Agent Trace + Replay**: observabilidad de ejecución reproducible.
16. **Adaptive Model Router**: por capacidad, no por nombre.
17. **Subagents**: Explorer/Researcher/Coder/Tester/Reviewer/Security.
18. **Evaluation Engine + Benchmark**: niveles 1–10, comparación reproducible.

## B. Plan de fases (alineado a los 3 docs del usuario)

> Cada fase cumple el GATE: implementación + tests + integración + typecheck
> + lint + build + sin placeholders + sin regresiones + docs. No se avanza
> hasta cerrar la fase anterior.

### Fase 0 — Auditoría forense ✅ (este documento)
No destructiva. Genera matriz + gap + plan. **GATE cerrado.**

### Fase 1 — Consolidación del Agent Runtime (no crear nuevo)
- Reconciliar las 3 capas (core + CapabilityOrchestrator + AgentArchitect).
- Unificar los 2 sistemas RAG.
- Criterio: mayor completitud + mejor integración + menos consumo.
- Entrega: un único agent loop con estado-máquina, sin duplicación.

### Fase 2 — Model Adapter (DeepSeek V4-Flash)
- Verificar adapter OpenAI-compatible de `@librechat/agents` con DeepSeek local.
- Streaming, tool calling, structured output, cancellation, health, capabilities.
- Regla arquitectónica: el modelo es reemplazable (Regla 1 de los docs).

### Fase 3 — Tool Runtime (activar el SDK)
- Integrar el motor de coding tools de `@librechat/agents` (file/grep/glob/compile).
- Añadir permisos, retry, timeout, audit por tool a `ToolService`.
- Activar `MCPRuntime/` con policy gateway.
- Entrega: tools estructuradas preferidas sobre bash.

### Fase 4 — Context Engine
- Capas L0–L7, retrieval híbrido (keyword + structural + semantic), ranking.
- Compresión + sistema de artifacts (`artifact://`).
- No enviar repo completo al modelo.

### Fase 5 — Code Intelligence (construir nuevo)
- Tree-sitter (AST multi-lenguaje).
- LSP (typescript-language-server).
- Symbol index + dependency graph en SQLite + FTS5.
- Knowledge Graph (File/Function/Class/...; imports/calls/references/tested-by).

### Fase 6 — Blast Radius + Risk Engine
- Análisis de impacto sobre el Knowledge Graph + Git history + cobertura de tests.
- Scoring de riesgo 0–100 → política autónomo / verificación / aprobación.

### Fase 7 — Verification Engine
- test runner + typecheck + lint + build + security checks + git diff.
- Definition of Done verificable. El modelo no se autodeclara ganador.

### Fase 8 — Repair Engine + Loop Detection + Recovery
- Clasificación/localización/estrategias progresivas (5 intentos → escalado).
- Detección de loops (mismo error/patch/archivo).
- Checkpoints (adaptar de `WorkflowEngine`) + recuperación de sesiones.

### Fase 9 — Security (Firewall + Sandbox + Permissions)
- Conectar `PermissionService` + esquemas huérfanos de Supervisor.
- Permisos granulares (filesystem/shell/git/secrets/deployment).
- Sandbox Docker existente (`SandboxManager`) como ejecución aislada.

### Fase 10 — Memory por capas
- Short/Session/Project/Historical/Artifacts sobre `MemoryEntry` + SQLite.
- Recuperación por relevancia (no inyectar todo).

### Fase 11 — Subagents
- Explorer/Researcher/Coder/Tester/Reviewer/Security bajo demanda.
- Comparten DeepSeek con contextos independientes.

### Fase 12 — Adaptive Model Router
- Capability registry (tool_calling/reasoning/coding/vision/long_context).
- Selección por capacidad, no por nombre, con override manual.

### Fase 13 — Observability (Trace + Replay)
- Agent Trace (modelo/tokens/tools/RAM/VRAM/errores/retries).
- Agent Replay (reproducir misma tarea con otro modelo).

### Fase 14 — Evaluation + Benchmark
- Niveles 1–10, métricas (success/tokens/RAM/VRAM/latency/retries).
- Comparación reproducible: Claude Code vs DeepSeek+harness vs Runtime completo.

### Fase 15 — Optimización
- RAM/VRAM/tokens/latencia/contexto/paralelismo.

## C. Conexión con el AI Hub
El área **"AI Work → Coding"** del AI Hub (actualmente `coming-soon` en
`hubData.ts`) será el punto de entrada de este runtime. Al cerrar la
Fase 3, el item "Coding" pasará de *coming-soon* a *available* y
navegará al Coding Agent. **No se duplica** el AI Hub; se conecta.

## D. Riesgo y honestidad
- El sistema completo (15 fases) es **iterativo y de largo aliento**; no se
  completa en una sesión. Cada fase entrega valor incremental y verificable.
- La Fase 0 (auditoría) es la base no destructiva y obligatoria; ya está cerrada.
- Antes de cada implementación se confirma reutilización (regla §2 del prompt).
