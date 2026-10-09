# AUDITORÍA COMPLETA DEL SISTEMA MI-LIBRE-CHAT

**Fecha:** 2026-07-20  
**Versión:** 1.0  
**Estado:** ✅ Auditoría Completada

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Sistema de Chat](#sistema-de-chat)
3. [Sistema de Agentes](#sistema-de-agentes)
4. [Sistema de Herramientas](#sistema-de-herramientas)
5. [Panel de Control](#panel-de-control)
6. [Infraestructura](#infraestructura)
7. [Arquitectura de Datos](#arquitectura-de-datos)
8. [Puntos de Integración](#puntos-de-integración)
9. [Limitaciones Actuales](#limitaciones-actuales)
10. [Riesgos Identificados](#riesgos-identificados)

---

## 1. RESUMEN EJECUTIVO

### Stack Tecnológico
| Capa | Tecnología |
|------|------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Estado** | Recoil + Jotai + React Query |
| **Backend** | Node.js 24, Express 5 |
| **Base de Datos** | MongoDB 8.0, PostgreSQL (pgvector) |
| **Cache** | Redis |
| **Búsqueda** | MeiliSearch v1.35.1 |
| **IA/LLM** | Multi-provider (OpenAI, Anthropic, Groq, DeepSeek, etc.) |
| **Orquestación** | Docker, Kubernetes, Helm |
| **Monitoreo** | OpenTelemetry, Prometheus |

### Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                            │
│  client/src/                                                     │
│  ├── components/Chat/          # Chat principal                 │
│  ├── hooks/SSE/                # Streaming SSE                  │
│  ├── store/                    # Estado global (Recoil)         │
│  └── components/Dashboard/     # Dashboard con métricas          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP POST + SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express)                            │
│  api/server/                                                      │
│  ├── routes/                   # Endpoints API                   │
│  ├── controllers/              # Controladores                  │
│  ├── services/                 # Lógica de negocio              │
│  └── services/LLMGateway/      # Routing de LLMs                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PAQUETE AGENTES (@librechat/agents)           │
│  node_modules/@librechat/agents/                                │
│  ├── src/graphs/              # LangGraph                       │
│  ├── src/tools/               # Herramientas                    │
│  └── src/run.ts               # Ejecución principal            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. SISTEMA DE CHAT

### 2.1 Componente Frontend del Chat

#### Archivos Principales

| Archivo | Descripción |
|---------|-------------|
| `client/src/components/Chat/ChatView.tsx` | Componente principal del chat |
| `client/src/hooks/SSE/useResumableSSE.ts` | Hook de streaming SSE (~67KB) |
| `client/src/hooks/SSE/useEventHandlers.ts` | Manejadores de eventos SSE (~39KB) |
| `client/src/hooks/SSE/useStepHandler.ts` | Manejo de steps/agentes (~47KB) |
| `client/src/hooks/SSE/useUsageHandler.ts` | Tracking de tokens (~18KB) |

#### Flujo Frontend

```typescript
// ChatView.tsx - flujo principal
1. useForm<ChatFormValues>()           // Formulario con react-hook-form
2. useGetMessagesByConvoId()           // Carga mensajes via React Query
3. useChatHelpers()                     // Helpers de chat (Recoil)
4. useAdaptiveSSE()                     // Conecta al stream SSE
5. useResumeOnLoad()                    // Auto-resume de jobs activos
```

### 2.2 Backend - Recepción de Mensajes

#### Routes (API Endpoints)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/agents/chat` | POST | Chat normal |
| `/api/agents/chat/:endpoint` | POST | Agentes efímeros |
| `/api/agents/chat/resume` | POST | Continuar generación pausada |
| `/api/messages` | GET/POST | Mensajes |
| `/api/convos` | GET/POST/DELETE | Conversaciones |
| `/api/memories` | CRUD | Memorias |
| `/api/context` | CRUD | Contexto |

#### Controllers

| Archivo | Descripción |
|---------|-------------|
| `api/server/controllers/agents/request.js` | Controlador principal (~49KB) |
| `api/server/controllers/agents/callbacks.js` | Callbacks de chat (~50KB) |

#### Middleware Aplicado

```javascript
// /api/agents/chat
router.post('/', [
  restoreResumeContext,      // Restaura contexto de HITL
  createMessageFilterPii,   // Filtro PII
  moderateText,             // Moderación
  checkAgentAccess,         // Permisos
  checkAgentResourceAccess, // Acceso a recursos
  validateConvoAccess,      // Validar conversación
  buildEndpointOption       // Construir opciones de endpoint
], controller);
```

### 2.3 Sistema de Streaming (SSE)

#### Eventos SSE Manejados

```typescript
// useEventHandlers.ts
const STEP_EVENTS = {
  // Mensajes
  text: 'text',
  text_progress: 'text_progress',
  error: 'error',
  message: 'message',
  message_end: 'message_end',
  
  // Generación
  stream_start: 'stream_start',
  stream_end: 'stream_end',
  abort: 'abort',
  
  // Agentes
  agent_action: 'agent_action',
  tool_call: 'tool_call',
  tool_call_end: 'tool_call_end',
  tool_calls: 'tool_calls',
  
  // Steering
  steer: 'steer',
  steer_applied: 'steer_applied',
  
  // Pausa/Resume (HITL)
  pause: 'pause',
  waiting: 'waiting',
  
  // Usage
  usage: 'usage',
}
```

#### Flujo de Streaming

```
1. Frontend: POST /api/agents/chat
   Body: { text, conversationId, endpointOption, ... }
   
2. Backend: Retorna inmediatamente
   Response: { streamId, conversationId, status: 'started' }
   
3. Frontend: Conecta a SSE
   GET /api/agents/chat/stream/:streamId
   
4. Backend: Envía eventos en tiempo real
   event: message
   data: { messageId, content: [...], ... }
   
5. Frontend: useEventHandlers procesa eventos
   - Actualiza mensajes en Recoil
   - Renderiza en UI
   - Cuenta tokens
```

### 2.4 Manejo de Conversaciones

#### Modelo de Datos (Mongoose)

```javascript
// packages/data-schemas/src/schema/convo.ts
const convoSchema = {
  conversationId: String,
  title: String,
  user: String,
  messages: [ObjectId],
  isTemporary: Boolean,
  endpoint: String,
  model: String,
  agent_id: String,
  tags: [String],
  chatProjectId: String,
  files: [String],
  expiredAt: Date,
  tenantId: String,
  pinned: Boolean,
}
```

### 2.5 Manejo de Contexto

#### ContextManager Service

```
api/server/services/ContextManager/ContextManagerService.js
```

```javascript
class ContextManagerService {
  // Estrategias disponibles
  WINDOWING_STRATEGY = {
    SLIDING: 'sliding',      // Ventana deslizante simple
    SUMMARIZE: 'summarize',  // Resumen automático
    SEMANTIC: 'semantic',   // Por embedding (futuro)
  }
  
  // Crear contexto por conversación
  createContext(conversationId, options)
  
  // Agrega mensaje y aplica windowing si necesario
  addMessage(conversationId, message, tokens)
}
```

### 2.6 Conexión con LLMs

#### LLM Gateway

```
api/server/services/LLMGateway/LLMGateway.js
```

**Proveedores Disponibles:**

| Provider | Models | Tier |
|----------|--------|------|
| Groq | llama-3.3-70b, mixtral-8x7b | free |
| DeepSeek | deepseek-chat, deepseek-coder | free |
| Cloudflare | llama-3.1-8b | free |
| Mistral | mistral-small | free |
| Cohere | command-r-plus | free |
| HuggingFace | meta-llama/Llama-3.1-8B | free |
| OpenRouter | claude-3-haiku | free |
| Gemini | gemini-1.5-flash | free |
| Anthropic | claude-3-5-sonnet | trial |
| Perplexity | sonar | free |
| Lepton | llama-3.1-405b | free |
| Together | meta-llama/Llama-3-70b | free |

---

## 3. SISTEMA DE AGENTES

### 3.1 Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                    PAQUETE JS (@librechat/agents)                │
│  node_modules/@librechat/agents/src/                            │
│  ├── graphs/                  # LangGraph                        │
│  ├── tools/                   # ToolNode, SubagentExecutor       │
│  ├── events.ts               # HandlerRegistry                   │
│  ├── hooks/                  # Sistema de hooks                 │
│  └── run.ts                  # Clase Run principal               │
├─────────────────────────────────────────────────────────────────┤
│                    ORQUESTADOR PYTHON (agent-builder)            │
│  integrations/agent-builder/                                     │
│  ├── orchestrator/           # AgentOrchestrator                 │
│  ├── intelligent/            # IntelligentAgentCreator           │
│  └── skills/                 # Sistema de skills                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Creación de Agentes

#### Archivos Involucrados

| Archivo | Descripción |
|---------|-------------|
| `packages/api/src/agents/load.ts` | Carga de agentes |
| `packages/api/src/agents/initialize.ts` | Inicialización |
| `packages/data-schemas/src/schema/agent.ts` | Schema Mongoose |
| `packages/api/src/agents/specialized/` | Agentes especializados |

#### Clases Principales

```typescript
// packages/data-schemas/src/types/agent.ts
export interface IAgent {
  id: string;
  name?: string;
  description?: string;
  instructions?: string;
  provider: string;
  model: string;
  model_parameters?: Record<string, unknown>;
  tools?: string[];
  skills?: string[];
  edges?: GraphEdge[];
  tool_resources?: AgentToolResources;
  subagents?: AgentSubagentsConfig;
  memory_scope?: MemoryScope;
}
```

#### Agentes Especializados

| Agente | Archivo | Propósito |
|--------|---------|-----------|
| CodeReviewAgent | `code_review_agent.ts` | Revisión de código |
| DeepResearchAgent | `deep_research_agent.ts` | Investigación profunda |
| DockerAgent | `docker_agent.ts` | Gestión Docker |
| QAAgent | `qa_agent.ts` | Testing/QA |
| SecurityAgent | `security_agent.ts` | Análisis de seguridad |

### 3.3 Ejecución de Tareas

#### Clase Run Principal

```typescript
// node_modules/@librechat/agents/src/run.ts
export class Run<_T extends t.BaseGraphState> {
  id: string;
  Graph: StandardGraph | MultiAgentGraph;
  
  // Métodos principales
  async processStream(...): Promise<t.MessageContentComplex[]>
  async processUserMessage(...): Promise<void>
  async halt(...): Promise<void>
  async getInterrupt<T>(): Promise<t.RunInterruptResult<T>>
  resume(interruptResult: unknown): Promise<void>
}
```

#### Grafos de Ejecución

```
src/graphs/
├── Graph.ts              # Grafo estándar (agente único)
├── MultiAgentGraph.ts    # Grafo multi-agente
└── ConditionalEdge.ts    # Aristas condicionales
```

### 3.4 Planificación

#### Sistema de Grafos (LangGraph)

```typescript
// StandardGraph - Grafo de agente único
createAgentNode(agent: AgentConfig): GraphNode
createToolNode(tools: LCTool[]): GraphNode
compile(config?: GraphCompileConfig): CompiledStateWorkflow

// MultiAgentGraph - Grafo multi-agente
createWorkflow(agents: AgentConfig[]): StateGraph
addEdge(from: string, to: string): void
addConditionalEdges(source: string, condition: Function): void
```

### 3.5 Estados Internos

#### Checkpointing (Persistencia de Estado)

```
packages/api/src/agents/checkpointer.ts
```

```typescript
export class LazyMongoSaver extends MongoDBSaver {
  // Checkpointing durable para HITL (Human-in-the-Loop)
  // Persiste solo checkpoints con writes resumibles
}
```

#### Sistema de Memoria

```typescript
// packages/api/src/agents/memory.ts
export interface MemoryConfig {
  validKeys?: string[];
  instructions?: string;
  llmConfig?: Partial<LLMConfig>;
  tokenLimit?: number;
}

// Herramientas de memoria
export const SET_MEMORY_TOOL_NAME = 'set_memory';
export const DELETE_MEMORY_TOOL_NAME = 'delete_memory';
```

### 3.6 Eventos del Sistema

```typescript
// node_modules/@librechat/agents/src/common/constants.ts
export const GraphEvents = {
  ON_AGENT_UPDATE: 'on_agent_update',
  ON_RUN_STEP: 'on_run_step',
  ON_RUN_STEP_DELTA: 'on_run_step_delta',
  ON_MESSAGE_DELTA: 'on_message_delta',
  ON_TOOL_EXECUTE: 'on_tool_execute',
  ON_SUBAGENT_UPDATE: 'on_subagent_update',
  ON_CONTEXT_USAGE: 'on_context_usage',
};
```

---

## 4. SISTEMA DE HERRAMIENTAS

### 4.1 Terminal - Ejecución de Comandos Shell

#### Clase Principal

```typescript
// LocalExecutionEngine (Node.js)
class LocalExecutionEngine {
  DEFAULT_TIMEOUT_MS = 60000;
  DEFAULT_MAX_OUTPUT_CHARS = 200000;
  DEFAULT_MAX_SPAWNED_BYTES = 50MB;
  
  async executeLocalBash(command: string, config?): Promise<BashResult>;
  async executeLocalCode(code: string, config?): Promise<CodeResult>;
}
```

#### Características de Seguridad

```typescript
const dangerousCommandPatterns = [
  /\brm\s+(-[rf].*|\s+.*)/,  // Bloquea rm -rf
  /\bdd\s+.*of=\/dev\//,       // Bloquea dd a dispositivos
  /\bchmod\s+-R\s+(777|a\+w)/, // Bloquea chmod 777
  /\bchown\s+-R\s+.*\//,       // Bloquea chown recursivo
];
```

### 4.2 Ejecución de Código

```typescript
// CodeExecutor (Sandbox API)
class CodeExecutor {
  async executeCode(code: string, options?): Promise<ExecutionResult>;
  async getExecutionEnvironment(): Promise<EnvironmentInfo>;
}

// Herramientas registradas
export const CODE_EXECUTION_TOOLS = new Set([
  'bash_tool',
  'read_file',
  'code_tool',
]);
```

### 4.3 Manipulación de Archivos

```typescript
// WorkspaceFS (Sistema de archivos seguro)
class WorkspaceFS {
  async readFile(path: string): Promise<string>;
  async writeFile(path: string, content: string): Promise<void>;
  async deleteFile(path: string): Promise<void>;
  async listDirectory(path: string): Promise<FileInfo[]>;
  async getFileInfo(path: string): Promise<FileMetadata>;
}

// Herramientas de autoría
export const CREATE_FILE_TOOL_NAME = 'create_file';
export const EDIT_FILE_TOOL_NAME = 'edit_file';
```

### 4.4 Navegador (Browser Use)

```
integrations/browser-use/
├── api/index.js           # API endpoints
├── docker-compose.yml     # Contenedor independiente
└── README.md
```

**API Endpoints:**
```javascript
POST /api/browser-use/task      // Ejecutar tarea
POST /api/browser-use/navigate  // Navegar a URL
POST /api/browser-use/click     // Click en elemento
POST /api/browser-use/type      // Escribir en input
GET  /api/browser-use/screenshot // Captura de pantalla
```

### 4.5 MCP (Model Context Protocol)

```
packages/api/src/mcp/
├── MCPManager.ts           # Gestor centralizado
├── connection.ts          # Conexión individual
├── MCPConnectionFactory.ts # Factory
├── tools.ts               # Herramientas MCP
├── auth.ts                # Autenticación
├── UserConnectionManager.ts
├── ConnectionsRepository.ts
└── registry/
    ├── MCPServersRegistry.ts
    └── MCPServerInspector.ts
```

**Tipos de Transporte Soportados:**
```typescript
type MCPOptions = 
  | StdioOptions       // { command, args }
  | WebSocketOptions   // { url }
  | SSEOptions         // { url }
  | StreamableHTTPOptions; // { url, type: 'streamable-http' }
```

### 4.6 Conectores

```typescript
// packages/api/src/connectors/
├── github_client.ts
│   ├── verifyToken()
│   ├── searchRepos()
│   ├── getRepo()
│   └── listContents()
│
└── huggingface_client.ts
    ├── verifyToken()
    ├── searchModels()
    ├── searchDatasets()
    └── searchSpaces()
```

### 4.7 Toolkits Disponibles

```typescript
// packages/api/src/tools/toolkits/
├── google.ts      // Google Search
├── dalle.ts       // DALL-E 3
├── flux_api.ts    // Flux API
├── openweather.ts // OpenWeather
└── web.ts         // Web toolkit
```

---

## 5. PANEL DE CONTROL

### 5.1 Estructura Frontend

#### Rutas del Dashboard

```
client/src/routes/
├── Dashboard.tsx          # Rutas /d/*
└── Root.tsx              # Layout principal con sidebar
```

#### Componentes Existentes

| Componente | Descripción |
|------------|-------------|
| `Dashboard/MetricsPanel/` | Panel principal de métricas |
| `MetricWidget.tsx` | Widget individual |
| `WidgetLibrary.tsx` | Biblioteca de widgets |
| `Nav/SettingsTabs/` | Configuraciones del sistema |

### 5.2 Tipos de Widgets Disponibles

```typescript
export type WidgetType =
  | 'token_usage'        // Uso de tokens
  | 'response_time'       // Tiempo de respuesta
  | 'error_rate'          // Tasa de errores
  | 'model_performance'   // Rendimiento por modelo
  | 'cost_tracking'       // Seguimiento de costos
  | 'user_activity'       // Actividad de usuarios
  | 'conversation_volume'  // Volumen de conversaciones
  | 'provider_health';    // Salud de proveedores
```

### 5.3 Sistema de Estados

#### Arquitectura Híbrida

| Capa | Tecnología | Uso |
|------|------------|-----|
| **Estado Global** | Recoil | Usuario, settings, agentes |
| **Estado por Conversación** | Jotai | Usage, branches |
| **Datos del Servidor** | React Query | Mensajes, conversaciones |

```typescript
// client/src/store/
├── user.ts           // Usuario autenticado
├── settings.ts      // Configuraciones
├── usage.ts         // Uso de tokens
├── agents.ts        // Agentes
├── artifacts.ts     // Artefactos
├── mcp.ts           // MCP servers
└── prompts.ts       // Prompts
```

### 5.4 Comunicación con Backend

#### Endpoints de Métricas

```
api/server/routes/metrics.js
├── GET /api/metrics/summary     // Resumen
├── GET /api/metrics/dashboard   // Dashboard completo
└── GET /api/metrics            // Prometheus
```

#### Servicios Backend

```javascript
// api/server/services/
├── MetricsCollector/MetricsCollector.js  // Recopila métricas
└── Telemetry/Telemetry.js                // OpenTelemetry
```

### 5.5 Puntos de Extensión para Nuevas Interfaces

1. **Extender MetricsPanel** - Agregar nuevos tipos de widget
2. **Nuevo Panel** - Crear carpeta en `client/src/components/Dashboard/`
3. **Nueva Ruta** - Agregar en `client/src/routes/index.tsx`
4. **SidePanel** - Similar al panel de prompts
5. **Settings Tab** - Nueva carpeta en `Nav/SettingsTabs/`

---

## 6. INFRAESTRUCTURA

### 6.1 Docker

#### Dockerfiles

| Archivo | Descripción |
|---------|-------------|
| `Dockerfile` | Imagen principal (v0.8.7) - Node 24.16.0-alpine |
| `Dockerfile.multi` | Multi-stage build para producción |
| `.devcontainer/Dockerfile` | DevContainer para VS Code |
| `integrations/browser-use/Dockerfile` | Browser agent |

#### Docker Compose

```yaml
# docker-compose.yml
services:
  api:          # LibreChat - Puerto 3080
  admin-panel:  # ClickHouse - Puerto 3000
  mongodb:      # MongoDB 8.0.20
  meilisearch:  # v1.35.1
  vectordb:     # pgvector 0.8.0
  rag_api:      # LibreChat RAG API
```

### 6.2 Kubernetes

```
helm/librechat/
deploy/kubernetes/
```

- **Namespace:** `librechat`
- **Deployments:** API (3 réplicas), Frontend (2 réplicas)
- **HPA:** Autoescalado 2-10 réplicas, 70% CPU / 80% memoria
- **PVC:** 10Gi para uploads

### 6.3 Sistema de Colas

#### Leaky Bucket (Propio)

```javascript
// api/server/utils/queue.js
_LB_INTERVAL_MS: 1000/60ms (60 req/s)
LB_QueueAsyncCall() // Cola de solicitudes API
```

#### Redis

```
redis-config/
├── redis-7001.conf, -7002.conf, -7003.conf  # Cluster nodes
├── redis-tls.conf                             # TLS
└── start-*.sh                                # Scripts
```

### 6.4 Sistema de Eventos

#### Event Bus

```javascript
// Arquitectura documentada en ARQUITECTURA_EVENT_DRIVEN.md
- publish(event)
- subscribe(eventType, handler)
- request(event) / reply()
- use(middleware)  // Telemetry, Audit, Metrics
```

#### Middlewares

| Middleware | Función |
|------------|---------|
| **TelemetryMiddleware** | Tracing OpenTelemetry |
| **AuditMiddleware** | Logging con campos sensibles |
| **MetricsMiddleware** | Prometheus |

### 6.5 Integraciones Existentes

```yaml
integrations/
├── docker-compose.yml
├── browser-use/           # Browser automation
├── litellm-gateway/      # LiteLLM Gateway
└── free-claude-code/     # Free Claude Code
```

---

## 7. ARQUITECTURA DE DATOS

### 7.1 Modelos MongoDB

| Schema | Archivo |
|--------|---------|
| Conversation | `packages/data-schemas/src/schema/convo.ts` |
| Message | `packages/data-schemas/src/schema/message.ts` |
| Agent | `packages/data-schemas/src/schema/agent.ts` |
| User | `packages/data-schemas/src/schema/user.ts` |
| Memory | `packages/data-schemas/src/schema/memory.ts` |

### 7.2 PostgreSQL (Vectorial)

```
rag.yml - RAG API standalone con pgvector
```

### 7.3 Redis (Cache y Colas)

```
packages/api/src/cache/
├── redisClients.ts
├── redisUtils.ts
└── redisTelemetry.ts
```

### 7.4 MeiliSearch (Búsqueda)

```yaml
# docker-compose.yml
meilisearch:
  image: getmeili/meilisearch:v1.35.1
  ports:
    - "7700:7700"
```

---

## 8. PUNTOS DE INTEGRACIÓN

### 8.1 Flujo de Eventos para Supervisión

```
AGENTE → Run.processStream() 
       → HandlerRegistry.emit(event)
       → SSE events en /api/agents/chat/stream/:streamId
       → useEventHandlers.ts procesa
       → UI actualiza
```

### 8.2 Hooks del Sistema

```typescript
// node_modules/@librechat/agents/src/hooks/
export type HookEvent = 
  | 'RunStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolBatch'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact';
```

### 8.3 Endpoints Críticos para Integración

| Endpoint | Método | Uso en Supervisión |
|----------|--------|-------------------|
| `/api/agents/chat` | POST | Iniciar tarea de agente |
| `/api/agents/chat/stream/:id` | SSE | Eventos en tiempo real |
| `/api/agents/chat/resume` | POST | Continuar tarea pausada |
| `/api/metrics/dashboard` | GET | Métricas del sistema |

---

## 9. LIMITACIONES ACTUALES

### 9.1 Sistema de Supervisión

| Limitación | Descripción |
|------------|-------------|
| **Sin dashboard de actividad** | No existe UI para ver actividad del agente |
| **Sin timeline visual** | No hay historial visual de ejecución |
| **Sin sandbox integrado** | Los agentes modifican directamente |
| **Sin promoción de cambios** | No hay revisión antes de aplicar |
| **Sin control de múltiples agentes** | Solo un agente activo |

### 9.2 Sistema de Permisos

| Limitación | Descripción |
|------------|-------------|
| **Sin granularidad** | No hay control por tipo de acción |
| **Sin sandbox de filesystem** | Acceso total al filesystem |
| **Sin límites de comandos** | Solo patrones peligrosos bloqueados |

### 9.3 Eventos

| Limitación | Descripción |
|------------|-------------|
| **Eventos no persistidos** | No hay almacenamiento de eventos |
| **Sin replay** | No se pueden reproducir sesiones |
| **Sin diff visual** | No hay visor antes/después |

---

## 10. RIESGOS IDENTIFICADOS

### 10.1 Seguridad

| Riesgo | Nivel | Descripción |
|--------|-------|-------------|
| Acceso filesystem | 🔴 Alto | Los agentes pueden modificar cualquier archivo |
| Ejecución remota | 🔴 Alto | Comandos shell sin sandboxing completo |
| Credenciales | 🔴 Alto | API keys en variables de entorno |

### 10.2 Disponibilidad

| Riesgo | Nivel | Descripción |
|--------|-------|-------------|
| Agente runaway | 🟡 Medio | Un agente puede consumir recursos indefinidamente |
| Fallo en proveedor | 🟡 Medio | Sin fallback automático completo |
| Dependencias externas | 🟡 Medio | Browser Use puede fallar |

### 10.3 Operacionales

| Riesgo | Nivel | Descripción |
|--------|-------|-------------|
| Sin rollback | 🟡 Medio | Cambios aplicados no se pueden revertir fácilmente |
| Sin auditoría | 🟡 Medio | No hay registro de acciones de agentes |
| Sin métricas de agentes | 🟡 Medio | No se mide rendimiento de agentes |

---

## 11. CONCLUSIONES

### Fortalezas del Sistema Actual

1. ✅ Arquitectura bien estructurada con separación de concerns
2. ✅ Sistema de streaming SSE funcional
3. ✅ Multi-provider LLM con fallback
4. ✅ Sistema de hooks extensible
5. ✅ Checkpointing para HITL
6. ✅ Docker/Kubernetes para despliegue
7. ✅ Sistema de eventos existente

### Áreas de Mejora

1. ❌ Sin dashboard de supervisión de agentes
2. ❌ Sin sandbox paraWorkspace
3. ❌ Sin promoción de cambios
4. ❌ Sin sistema de permisos granular
5. ❌ Sin replay de sesiones
6. ❌ Sin visor de diffs

---

**Documento preparado para el diseño de la fase de implementación.**
