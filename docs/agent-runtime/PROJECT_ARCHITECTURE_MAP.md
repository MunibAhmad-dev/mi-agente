# PROJECT_ARCHITECTURE_MAP.md — Mapa de servicios, packages y rutas

> Fase 0. Complementa `SYSTEM_MAP.md` y `DEPENDENCY_MAP.md` de la raíz
> (no los duplica). Aquí se mapea lo relevante al Agent Runtime.

## 1. Monorepo (workspaces)

```
packages/
├── api/            → @librechat/api (servidor)
├── api-key-client/  → cliente de API keys
├── client/          → @librechat/client (UI React)
├── data-provider/   → @librechat/data-provider (tipos + schemas)
├── data-schemas/    → @librechat/data-schemas (validación)
└── mcp-server/      → servidor MCP (Python)
```

## 2. Servidor — `api/server/`

### Rutas del agent runtime
| Ruta | Archivo | Función |
|---|---|---|
| `/api/agents/chat` | `routes/agents/chat.js` | SSE stream del agente (core) |
| `/api/agents/*` | `routes/agents/` | CRUD de agentes |
| `/api/multiagent` | `routes/multiagent.js` | sesiones multi-agente |
| `/api/sandbox/:id/execute` | `routes/sandbox.js` | ejecución en Docker |
| `/api/mcp` | `routes/mcp.js` | config/OAuth MCP |
| `/api/tools` | `routes/tools.js` | proxy de tools |
| `/api/supervisor` | (Supervisor) | multi-agente + sandbox (cliente) |
| `/api/local-models` | `routes/localModels.js` | modelos locales |
| `/api/ai-runtimes/*` | `routes/aiRuntimes.js` | health + TTS |
| `/api/comfyui/*` | `routes/comfyui.js` | imagen/video |

### Servicios clave del runtime
| Servicio | Ubicación | Rol |
|---|---|---|
| AgentRuntime | `services/AgentRuntime/` | runtime core |
| Runs | `services/Runs/` (RunManager, StreamRunManager) | lifecycle OpenAI-Assistants |
| CapabilityOrchestrator | `services/CapabilityOrchestrator/` | ExecutionEngine + TaskPlanner (paralelo) |
| AgentArchitect | `services/AgentArchitect/` | toolCallLoop + RAG (paralelo) |
| ToolService | `services/ToolService.js` | registro + ejecución de tools (17) |
| SandboxManager | `services/SandboxManager.js` | Docker containers |
| PermissionService | `services/PermissionService.js` | permisos (Mongoose + Entra) |
| MCPRuntime | `services/MCPRuntime/` | **vacío (stub)** |
| WorkflowEngine | `services/WorkflowEngine/` | pasos/dependsOn/retries |
| EventBus | `services/EventBus` | eventos servidor+cliente |

### Controllers de agentes
`api/server/controllers/agents/` → `client.js`, `callbacks.js`, `responses.js`.

## 3. Dependencia externa clave: `@librechat/agents` (npm, v3.2.65)

No es un workspace local; es un paquete npm instalado en `node_modules/`.

```
node_modules/@librechat/agents/src/
├── tools/
│   ├── local/            ← motor de coding tools (DORMANT, no importado por la app)
│   │   ├── CompileCheckTool.ts
│   │   ├── syntaxCheck.ts
│   │   └── (grep_search, glob_search, read/write/edit_file)
│   └── cloudflare/
├── hooks/
│   └── createWorkspacePolicyHook.ts
└── types/tools.ts
```

> La app importa de `@librechat/agents`: `createBashExecutionTool` y el
> runtime de run (ver `controllers/agents/client.js`). **NO importa** el
> motor de coding tools local. Activarlo es la Fase 3.

## 4. Cliente — `client/src/`

| Ruta | Componente | Rol |
|---|---|---|
| `/c/:id` | ChatRoute | chat del agente |
| `/hub` | AIHub (nuevo) | Home / AI Hub |
| `/agents` | SidePanel/Agents | CRUD agentes |
| `/supervisor` | Supervisor | multi-agente + sandbox |
| `/skills` | Skills | skills |
| `/projects` | Projects | proyectos |

Selector universal de IA: `components/Chat/Menus/Endpoints/` (Fase 29).

## 5. Flujo de ejecución del agente (estado actual)

```
Usuario (UI /c/:id)
   ↓ SSE
/api/agents/chat
   ↓
@librechat/agents run  ←──  ToolService (17 tools)  ──→ MCP (config)
   ↓                          SandboxManager (Docker)
Controllers/agents/callbacks
   ↓
Runs/RunManager (lifecycle)
   ↓
Response SSE → UI
```

Capas paralelas NO conectadas al flujo principal:
- `CapabilityOrchestrator` (estado-máquina propio)
- `AgentArchitect` (toolCallLoop + Redis RAG)
- Coding tools del SDK `@librechat/agents` (dormant)

> **Brecha de integración:** el flujo principal usa el core, pero las
> capacidades avanzadas (estado-máquina, RAG, coding tools) están en
> capas paralelas o dormidas. La Fase 1 las reconcilia.
