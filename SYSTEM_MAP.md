# SYSTEM_MAP.md — Mapa del sistema (PHASE 0)

## Topología

```
┌─────────────────────────────── CLIENTE (React) ───────────────────────────────┐
│ Sidebar (useSideNavLinks)                                                     │
│  ├─ AgentBuilder (SidePanel/Agents)      ──► /api/agents                       │
│  ├─ Skills (SkillsAccordion)             ──► /api/skills                       │
│  ├─ Prompts                              ──► /api/prompts                      │
│  ├─ Memorias (MemoryPanel)               ──► /api/memories                     │
│  ├─ MCP (MCPBuilderPanel)                ──► /api/mcp/*  + mi-opencode config  │
│  ├─ Modelos locales (LocalModelsPanel)   ──► /api/local-models/*               │
│  ├─ Parámetros / Archivos / Marcadores                                        │
│  └─ Configuración: navegación · sonidos · general · cuentas                    │
│ Chat: useResumableSSE ──► /api/chat/... (SSE) + soundService (eventos reales)  │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │ REST+SSE (JWT)
┌─────────────────────────────── API (Express) ─────────────────────────────────┐
│ rutas: agents · skills · multiagent · tools · mcp · local-models · sounds ·   │
│        files · prompts · memories · system · metrics · telemetry · enterprise │
│ servicios:                                                                   │
│  ├─ ExecutionBridge / ExecutionEngine ──► mi-opencode (ejecución real)        │
│  ├─ WorkflowEngine (pasos · dependsOn · retries · cancelación)                │
│  ├─ localProviders (Ollama · OpenAICompat · catálogo HF · espacio disco)      │
│  ├─ sounds (local · mixkit · pixabay · freesound · uploads)                   │
│  ├─ Connectors · HuggingFace · Performance · MetricsCollector · Telemetry     │
│  └─ EventBus (taskStarted/Completed/Failed, tool:*, llm:*, agent:*, command:*)│
└───────────────┬───────────────────────────────┬───────────────────────────────┘
                │ Basic auth                    │ Ollama / HF
┌───────────────▼───────────────┐   ┌───────────▼──────────────┐
│ mi-opencode (:4096)           │   │ Ollama (:11434, 8 modelos)│
│ sesiones · skills · mcp cfg   │   │ + catálogo Hugging Face   │
│ sandbox · tools · ejecución   │   └──────────────────────────┘
└───────────────────────────────┘
Datos: MongoDB (agentes, skills, memorias, prefs) · Redis (cache/rate) ·
Meilisearch (búsqueda) · uploads/ (archivos y sonidos subidos)
```

## Relaciones clave

| Componente | Depende de | Consumido por |
|---|---|---|
| AgentBuilder | /api/agents, useMCPServerManager | Sidebar |
| SkillsAccordion | /api/skills (+sync mi-opencode) | Sidebar |
| Tools proxy | mi-opencode (Session API) | Panel Tools, agentes |
| WorkflowEngine | EventBus | rutas enterprise/panel (validar UI) |
| Multiagent | WorkflowEngine? (sesiones) | rutas multiagent |
| localProviders | Ollama, HF | LocalModelsPanel, chat local |
| Sounds | MongoDB prefs + proveedores + uploads | Configuración → Preferencias |
| useResumableSSE | /api/chat (SSE) | Chat + sonidos (aiResponse/error) |

## Preguntas que este mapa permite responder

- **¿Qué hace este servicio?** → SYSTEM_MAP + CURRENT_ARCHITECTURE.
- **¿Qué puede romperse si cambio X?** → DEPENDENCY_MAP (relaciones de import).
- **¿Qué API usa este servicio?** → tabla de relaciones.
- **¿Qué workflow usa este componente?** → WorkflowEngine + EventBus.
- **¿Qué tests deberían ejecutarse?** → AUDIT.md (lista de suites).
