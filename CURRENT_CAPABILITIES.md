# CURRENT_CAPABILITIES.md — Capacidades actuales (verificadas)

> PHASE 0 (Discovery). Cada ✓ corresponde a una capacidad REAL, conectada y
> verificada en el código (ruta + componente + servicio), no a una suposición.

## ✓ Verificadas (implementadas y conectadas)

| # | Capacidad | Evidencia |
|---|---|---|
| 1 | Agentes: CRUD completo con tools, MCP, memoria, instrucciones, visión, file search, versionado | `client/.../SidePanel/Agents/*` + endpoint `agents` |
| 2 | Skills: CRUD + sync con mi-opencode + toggle | `routes/skills.js` + `components/Skills/*` |
| 3 | MCP: servidores, tools por agente, admin | `SidePanel/MCPBuilder/*`, `useMCPServerManager` |
| 4 | Memorias: CRUD por usuario | `SidePanel/Memories/*` |
| 5 | Modelos locales: Ollama + abstracción de proveedores | `services/localProviders/*` |
| 6 | Descarga de modelos: catálogo HF, cuantización, pausa/reanuda, borrar, espacio en disco | `routes/localModels.js`, `LocalModelsPanel.tsx` |
| 7 | Herramientas (tools): proxy real a mi-opencode | `routes/tools.js` |
| 8 | Multiagente: sesiones, start/pause/resume/stop | `routes/multiagent.js` |
| 9 | WorkflowEngine: pasos, dependsOn, retries, timeouts, cancelación | `services/WorkflowEngine/*` |
| 10 | EventBus servidor + cliente (tareas, agentes, tools) | `services/EventBus`, `client/src/services/EventBus.ts` |
| 11 | Observabilidad: system status, metrics, telemetry conectados | `routes/system|metrics|telemetry.js` (FASE D7) |
| 12 | Sonidos y notificaciones: preferencias por usuario, biblioteca, proveedores, subida | FASE 20-22 |
| 13 | Personalizar navegación: visibilidad real de la barra lateral | FASE 20-21 |
| 14 | Espacio en disco para descargas (fs.statfs) | FASE 20 |
| 15 | Health checks reales (/api/health, estado de mi-opencode, ollama) | FASE D7 + localProviders |

## ⚠ Parcialmente (existe pero incompleto o sin validar)

| # | Capacidad | Estado real |
|---|---|---|
| 1 | Workflow Engine → UI/usuario | El motor existe y está referenciado en rutas enterprise/panel, pero **no hay aún una UI de workflows ni se validó su persistencia entre reinicios** |
| 2 | Memoria del agente | Existe CRUD de memorias; **no hay** pipeline de importancia/dedup/compresión/recuperación por relevancia |
| 3 | Tools registry | Tools vienen de mi-opencode/MCP; **no hay** registry unificado con permisos/validación/retry/tiempo/auditoría por tool |
| 4 | Model routing | El selector de modelos es manual; **no hay** ruteo automático por complejidad/coste/tipo de tarea |
| 5 | Auditor | Hay system/metrics/telemetry; **no hay** análisis estático, detección de secretos, análisis de dependencias/licencias |
| 6 | Token economy | Se registran métricas parciales; **no hay** presupuesto de contexto ni compresión/ranking de contexto para el LLM |

## ✗ No implementadas (según checklist del MASTER PROMPT)

- Project Brain (code graph + knowledge graph + vector + full-text + AST + memoria + historial).
- Context Intelligence Engine (retrieval → ranking → dedup → compresión → token budget).
- Agent memory por capas (working/short/long/semantic/episodic/execution) con importancia.
- Tool Router + Permission Check + Result Validator centralizados.
- Sub-workflows y DAG visible/administrable; checkpoints/resume persistente.
- ComputeProvider (Local/Docker/Kubernetes/GPU) — solo existe ejecución vía mi-opencode/sandbox.
- Policy Engine (OPA) — permisos a nivel de herramienta/archivo/red/credenciales.
- Configuración tipada/validada/versionada (CUE) — hoy es .env + compose.
- Detección de secretos (Gitleaks), análisis estático (Semgrep/AST-Grep), escaneo de dependencias (OSV), análisis de licencias (Trivy).
- Métricas de tokens por tarea (input/output/cached/retrieved/compressed) y coste.
- Documentación por componente (ARCHITECTURE.md etc. — este set es el primero).
