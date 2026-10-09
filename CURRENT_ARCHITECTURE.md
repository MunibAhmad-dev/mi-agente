# CURRENT_ARCHITECTURE.md — Arquitectura actual del sistema de agentes

> Documento de PHASE 0 (Discovery) del "MASTER PROMPT — UNIVERSAL AI AGENT
> ARCHITECTURE". Generado el 14-ago-2026 tras inspección real del código
> (no se asumió nada; cada capacidad se verificó en archivos y rutas).

## 1. Visión general

El proyecto es **mi-libre-chat** (fork de LibreChat) + **mi-opencode**
(repositorio hermano que actúa como "cerebro"/capa de ejecución). El dashboard
NO es solo el LibreChat original: integra agentes, skills, MCP, memorias,
modelos locales (Ollama, FASE 14-19), herramientas (tools), sonidos (FASE 20-22),
workflows y multiagente.

```
┌────────────────────────────────────────────────────────────┐
│  Cliente (React + Vite, client/src)                        │
│  Sidebar → AgentBuilder · Skills · Prompts · Memorias      │
│  Marcadores · Archivos · Parámetros · MCP · Modelos locales│
└───────────────┬────────────────────────────────────────────┘
                │ REST / SSE (JWT)
┌───────────────▼────────────────────────────────────────────┐
│  API (Node/Express, api/server)                           │
│  routes: agents · skills · multiagent · tools · mcp ·     │
│          local-models · sounds · system · metrics ·       │
│          telemetry · enterprise · panel                   │
│  services: ExecutionBridge · ExecutionEngine ·            │
│            WorkflowEngine · EventBus · localProviders ·   │
│            Connectors · HuggingFace · Sounds ·            │
│            Performance · MetricsCollector · Telemetry     │
└───────────────┬────────────────────────────────────────────┘
                │ HTTP (Basic auth, OPENCODE_SERVER_PASSWORD)
┌───────────────▼────────────────────────────────────────────┐
│  mi-opencode (servidor hermano, puerto 4096)              │
│  Sesiones · skills · mcp config · sandbox · ejecución real │
└────────────────────────────────────────────────────────────┘
```

## 2. Capas y módulos verificados

### 2.1 Agentes (Builder)
- `client/src/components/SidePanel/Agents/` — panel completo: instrucciones,
  modelo, tools (incl. MCP), memoria del agente, code interpreter, visión,
  file search, categorías, versionado, duplicar/borrar.
- API de agentes de LibreChat (endpoint `agents`) con persistencia MongoDB.

### 2.2 Skills (FASE 19)
- `api/server/routes/skills.js` — CRUD real (create/list/get/delete/update),
  sync inicial con mi-opencode (`maybeStartRequestSkillSync`).
- `client/src/components/Skills/` — SkillsAccordion en la barra lateral.
- Toggle de habilitación en Configuración (FASE 19b).

### 2.3 MCP
- `client/src/components/SidePanel/MCPBuilder/` — panel + admin de servidores MCP.
- `useMCPServerManager` + sincronización de config MCP hacia mi-opencode.

### 2.4 Memorias
- `client/src/components/SidePanel/Memories/` — CRUD de memorias del usuario
  (MemoryCard, dialogs, uso/limite).

### 2.5 Workflow Engine (existente, conectado)
- `api/server/services/WorkflowEngine/WorkflowEngine.js` — clases `Workflow`,
  `WorkflowStep`, `WorkflowEngine`: pasos con `dependsOn` (DAG), retries,
  timeouts, cancelación, health check.
- Referenciado desde `routes/enterprise/index.js` y `routes/panel.js`
  (verificado por grep). **Pendiente de validar** su exposición real al usuario.

### 2.6 Multiagente
- `api/server/routes/multiagent.js` — sesiones multiagente: crear/listar,
  pausar/reanudar/borrar sesiones, añadir agentes a sesión, start/pause/
  resume/stop por agente.

### 2.7 Herramientas (Tools) — proxy real
- `api/server/routes/tools.js` — proxy con timeout hacia mi-opencode
  (Session API): catálogo de tools, sesiones, mensajes. Sin placeholders:
  si mi-opencode no responde, el error se propaga.

### 2.8 Modelos locales
- `api/server/services/localProviders/` — abstracción `LocalModelProvider` con
  `OllamaProvider` y `OpenAICompatProvider` (preparada para LM Studio, llama.cpp,
  vLLM), `CatalogService` (catálogo HF), descubrimiento, refresh, health check,
  espacio en disco (FASE 20).

### 2.9 Ejecución y observabilidad
- `ExecutionBridge`/`ExecutionEngine` conectados a `routes/system`, `metrics`,
  `telemetry` (FASE D7: /api/health y /api/system/status ya reportan estado real).
- `EventBus` (servidor) y `EventBus` (cliente) para tareas/agentes/tools.

## 3. Stack técnico

| Capa | Tecnología |
|---|---|
| Cliente | React 18, Vite (rolldown), Recoil, Tailwind, react-i18next |
| API | Node/Express, Mongoose (MongoDB), SSE, multer |
| Cache | Redis |
| Búsqueda | Meilisearch |
| Ejecución real | mi-opencode (servidor hermano, Docker) |
| Modelos locales | Ollama (8 modelos instalados), catálogo Hugging Face |
| Infra | docker-compose (LibreChat, mi-opencode, mongodb, redis, meili, rag, vectordb, ollama) |

## 4. Patrones dominantes

- **Inyección por servicios singleton**: `getX()` (EventBus, WorkflowEngine,
  MetricsCollector, Telemetry) — reemplazable por diseño.
- **Adapters por proveedor**: `LocalModelProvider`/`OllamaProvider`, providers de
  sonidos (local/mixkit/pixabay/freesound), Connectors.
- **Proxy honesto a mi-opencode**: el dashboard no simula ejecución; delega y
  propaga errores reales.
- **Preferencias por usuario**: Recoil + persistencia backend (settings,
  sound-preferences, sidebar visibility).
