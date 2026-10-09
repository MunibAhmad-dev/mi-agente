# 🔍 INFORME DE AUDITORÍA: ARQUITECTURA MULTI-LLM
## Mi LibreChat - Estado Actual del Sistema

**Fecha de Auditoría:** 2026-07-21
**Auditor:** OpenHands Agent
**Alcance:** Sistema Multi-LLM, Agentes, Herramientas, Supervisión

---

## RESUMEN EJECUTIVO

| Componente | Estado | Evidencia |
|------------|--------|-----------|
| LLM Gateway | ✅ Existe completamente | `api/server/services/LLMGateway/` |
| API Key Manager | ✅ Existe completamente | `api/server/services/APIKeyManager/` |
| Provider Layer | ✅ Existe completamente | 12 proveedores implementados |
| Capability Router | ✅ Existe completamente | `api/server/services/CapabilityRouter/` |
| Capability Orchestrator | ✅ Existe completamente | `api/server/services/CapabilityOrchestrator/` |
| LLM Runtime | ✅ Existe completamente | `api/server/services/LLMRuntime/` |
| MCP | ✅ Existe completamente | `api/server/services/MCP.js` |
| Agentes | 🟡 Existe parcialmente | `MultiAgentController` existe |
| Event Bus | ✅ Existe completamente | Backend + Frontend |
| Tools | 🟡 Existe parcialmente | `ToolService` existe |
| Runtime Registry | ✅ Existe completamente | `api/server/services/RuntimeRegistry/` |
| Context Manager | ✅ Existe completamente | `api/server/services/ContextManager/` |
| Execution Engine | ✅ Existe completamente | `api/server/services/ExecutionEngine/` |
| Task Planner | ✅ Existe completamente | `api/server/services/ExecutionEngine/TaskPlanner.ts` |
| Prompt Generator | ⚫ No dedicado | Funciones dispersas |
| Panel MultiLLM | ✅ Existe completamente | `client/src/components/Chat/ActivityPanel/` |
| Sandbox Manager | ✅ Existe completamente | `api/server/services/SandboxManager/` |

---

## 1. LLM GATEWAY

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/LLMGateway/LLMGateway.js`
**Clase:** `LLMGateway`
**Funciones principales:**
- `complete()` - Completa solicitud de chat
- `selectProviderAndModel()` - Selecciona provider y modelo
- `healthCheck()` - Verifica salud de providers
- `getAvailableModels()` - Lista modelos disponibles

### Arquitectura

```javascript
class LLMGateway extends EventEmitter {
  providers: Map<string, ProviderData>
  
  // Proveedores inicializados
  // groq, deepseek, cloudflare, mistral, cohere, 
  // huggingface, openrouter, gemini, anthropic,
  // perplexity, lepton, together
}
```

### Proveedores Implementados

| Proveedor | Archivo | Modelos |
|-----------|---------|---------|
| Groq | `providers/GroqProvider.js` | llama-3.3-70b, mixtral-8x7b, gemma2-9b |
| DeepSeek | `providers/DeepSeekProvider.js` | deepseek-chat, deepseek-coder |
| Cloudflare | `providers/CloudflareProvider.js` | llama-3.1-8b, mistral-7b |
| Mistral | `providers/MistralProvider.js` | mistral-small, codestral |
| Cohere | `providers/CohereProvider.js` | command-r-plus |
| HuggingFace | `providers/HuggingFaceProvider.js` | Llama-3.1-8B |
| OpenRouter | `providers/OpenRouterProvider.js` | claude-3-haiku, gemma-2-9b |
| Gemini | `providers/GeminiProvider.js` | gemini-1.5-flash, gemini-1.5-pro |
| Anthropic | `providers/AnthropicProvider.js` | claude-3.5-sonnet |
| Perplexity | `providers/PerplexityProvider.js` | sonar, sonar-pro |
| Lepton | `providers/LeptonProvider.js` | llama-3.1-405b |
| Together | `providers/TogetherProvider.js` | llama-3-70b |

### Características

- Fallback automático entre proveedores
- Rate limiting
- Estadísticas de uso
- Timeout configurable
- Reintentos automáticos

---

## 2. API KEY MANAGER

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/APIKeyManager/APIKeyManager.js`
**Clase:** `APIKeyManager`
**Dependencias:** `crypto`, `events`

### Estructura

```javascript
class APIKeyManager extends EventEmitter {
  keys: Map<provider, APIKeyEntry>
  stats: { totalRequests, hits, misses }
  
  // Métodos principales
  loadFromEnvironment()
  addKey(provider, key, metadata)
  getKey(provider)
  validateKey(provider)
  getAvailableProviders()
}
```

### Mapeo de Variables de Entorno

| Proveedor | Variable ENV |
|-----------|--------------|
| groq | GROQ_API_KEY |
| deepseek | DEEPSEEK_API_KEY |
| cloudflare | CLOUDFLARE_API_KEY |
| mistral | MISTRAL_API_KEY |
| cohere | COHERE_API_KEY |
| huggingface | HUGGINGFACE_API_KEY |
| openrouter | OPENROUTER_API_KEY |
| gemini | GEMINI_API_KEY |
| anthropic | ANTHROPIC_API_KEY |
| perplexity | PERPLEXITY_API_KEY |
| tavily | TAVILY_API_KEY |

### Características

- Carga automática desde variables de entorno
- Máscara de keys para logs
- Historial de uso
- Rate limiting por proveedor
- Validación de formato

---

## 3. CAPABILITY ROUTER

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/CapabilityRouter/CapabilityRouter.ts`
**Clase:** `CapabilityRouter`

### Capacidades Definidas

```typescript
enum Capability {
  // LLM
  LLM_CHAT = 'llm.chat',
  LLM_VISION = 'llm.vision',
  LLM_REASONING = 'llm.reasoning',
  LLM_FUNCTION_CALLING = 'llm.function_calling',
  LLM_STREAMING = 'llm.streaming',
  LLM_LONG_CONTEXT = 'llm.long_context',
  
  // Code
  CODE_EXECUTION = 'code.execution',
  CODE_FILESYSTEM = 'code.filesystem',
  CODE_TERMINAL = 'code.terminal',
  CODE_GIT = 'code.git',
  
  // Media
  IMAGE_GENERATION = 'media.image_generation',
  AUDIO_TTS = 'media.tts',
  AUDIO_STT = 'media.stt',
  
  // Search
  WEB_SEARCH = 'search.web',
  DOCUMENT_SEARCH = 'search.document',
  
  // Browser
  BROWSER_AUTOMATION = 'browser.automation',
  
  // RAG
  RAG_RETRIEVAL = 'rag.retrieval',
}
```

### Interfaz de Routing

```typescript
interface CapabilityRequirements {
  required: Capability[];
  preferred?: Capability[];
  constraints?: {
    maxCost?: number;
    maxLatency?: number;
    preferredProviders?: string[];
  };
}

interface RouteDecision {
  runtime: string;
  provider: string;
  model: string;
  executionProfile: ExecutionProfile;
  reason: string;
  fallbackProviders: string[];
  score: number;
}
```

---

## 4. CAPABILITY ORCHESTRATOR

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/CapabilityOrchestrator/index.js`
**Clase:** `CapabilityOrchestrator`

### Sub-componentes

| Componente | Ubicación |
|------------|-----------|
| ExecutionModes | `constants/ExecutionModes.js` |
| StrategyEngine | `strategies/StrategyEngine.js` |
| ModelRegistry | `models/ModelRegistry.js` |
| CapabilityRegistry | `models/CapabilityRegistry.js` |
| ConfigService | `models/ConfigService.js` |

### Modos de Ejecución

```javascript
const ExecutionModes = {
  SIMPLE: 'simple',
  SPECIALIZED: 'specialized',
  INTELLIGENT: 'intelligent',
  PARALLEL: 'parallel',
  CONSENSUS: 'consensus',
};
```

### Estrategias

```javascript
const Strategies = {
  PRIORITY: 'priority',
  ROUND_ROBIN: 'round_robin',
  LATENCY: 'latency',
  COST: 'cost',
  CONTEXT: 'context',
  REASONING: 'reasoning',
  CONSENSUS: 'consensus',
  AUTO: 'auto',
};
```

### Profiles Predefinidos

```javascript
const PROFILES = {
  fast: { temperature: 0.3, maxTokens: 500 },
  balanced: { temperature: 0.7, maxTokens: 2000 },
  creative: { temperature: 1.0, maxTokens: 4000 },
  precise: { temperature: 0.2, maxTokens: 2000 },
};
```

---

## 5. LLM RUNTIME

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/LLMRuntime/LLMRuntime.js`
**Clase:** `LLMRuntime`

### Conexión con LLM Gateway

```javascript
class LLMRuntime {
  async execute(task, profile) {
    const gateway = getLLMGateway();
    return gateway.complete({
      messages: task.messages,
      model: profile.model,
      provider: profile.provider,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
      stream: profile.stream,
    });
  }
}
```

### Características

- Lazy loading del LLMGateway
- Modo mock para desarrollo
- Integración con EventBus
- Métricas de ejecución

---

## 6. MCP (MODEL CONTEXT PROTOCOL)

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/MCP.js`
**Tamaño:** 36,558 bytes
**Tests:** `MCP.spec.js` (60,923 bytes)

### Funciones Principales

```javascript
// Permisos
userCanUseMCPServers(user, req)
createMCPPermissionContext(req)

// OAuth
getOAuthFlowId(userId, serverName)
handleOAuthCallback(req, code)
refreshMCPServerToken(serverName, refreshToken)

// Gestión de servidores
registerMCPServer(userId, config)
reinitMCPServer(userId, serverName)
deleteMCPServer(userId, serverName)
```

### Integraciones MCP

- GitHub
- Google Drive
- Slack
- Notion
- Custom servers

---

## 7. AGENTES

### Estado: 🟡 EXISTE PARCIALMENTE

### Evidencia

**Archivo:** `api/server/services/MultiAgentController/MultiAgentController.js`
**Clase:** `MultiAgentController`

### Estados de Agente

```javascript
const AgentStatus = {
  IDLE: 'idle',
  THINKING: 'thinking',
  ACTING: 'acting',
  WAITING: 'waiting',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
};
```

### Tipos de Agente

```javascript
const AgentType = {
  COORDINATOR: 'coordinator',
  RESEARCHER: 'researcher',
  CODER: 'coder',
  REVIEWER: 'reviewer',
  TESTER: 'tester',
  CUSTOM: 'custom',
};
```

### Hook Frontend

**Archivo:** `client/src/hooks/useAgentOrchestrator.ts`

```typescript
interface UseAgentOrchestratorReturn {
  agents: AgentInfo[];
  activeAgents: AgentInfo[];
  agentTree: AgentTreeNode[];
  stats: OrchestratorStats;
  
  addAgent(config: AgentConfig): string;
  removeAgent(agentId: string): void;
  assignTask(agentId: string, task: AgentTask): void;
  startOrchestration(): void;
  stopOrchestration(): void;
}
```

### Limitaciones Detectadas

1. No hay implementación de Agentes en `api/server/services/Agents/`
2. El directorio está casi vacío (solo `ownerContact.js`)
3. La funcionalidad de agente depende de MultiAgentController

---

## 8. EVENT BUS

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia Backend

**Archivo:** `api/server/services/EventBus/EventBus.ts`
**Clase:** `EventBus`

### Tipos de Eventos Backend

```typescript
const EventType = {
  // Sistema
  SYSTEM_STARTED: 'system.started',
  SYSTEM_READY: 'system.ready',
  
  // Ejecución
  EXECUTION_REQUESTED: 'execution.requested',
  EXECUTION_STARTED: 'execution.started',
  
  // LLM
  LLM_REQUEST_STARTED: 'llm.request_started',
  LLM_REQUEST_FINISHED: 'llm.request_finished',
  LLM_FALLBACK: 'llm.fallback',
  
  // Provider
  PROVIDER_SELECTED: 'provider.selected',
  PROVIDER_HEALTHY: 'provider.healthy',
  PROVIDER_UNHEALTHY: 'provider.unhealthy',
  
  // API Key
  APIKEY_SELECTED: 'apikey.selected',
  APIKEY_QUOTA_EXCEEDED: 'apikey.quota_exceeded',
  APIKEY_RATE_LIMIT: 'apikey.rate_limit',
};
```

### Evidencia Frontend

**Archivo:** `client/src/services/EventBus.ts`
**Clase:** `EventBusClient`

### Tipos de Eventos Frontend

```typescript
type EventType = 
  | 'agent:created'
  | 'agent:started'
  | 'agent:completed'
  | 'agent:failed'
  | 'tool:started'
  | 'tool:completed'
  | 'llm:request_started'
  | 'llm:request_completed'
  | 'sandbox:created'
  | 'sandbox:apply_requested'
  | 'change:pending'
  | 'change:approved'
  | 'milestone:reached';
```

### Características

- Pub/Sub desacoplado
- Historial de eventos
- Middlewares (ChatInstrumenter)
- SSE para streaming en frontend

---

## 9. TOOLS (HERRAMIENTAS)

### Estado: 🟡 EXISTE PARCIALMENTE

### Evidencia

**Archivo:** `api/server/services/ToolService.js`
**Funciones de Tools:** `client/src/components/Chat/Tools/`

### Tipos de Tools

| Tool | Ubicación |
|------|-----------|
| Web Search | `Tools/search.js` |
| MCP Tools | `Tools/mcp.js` |
| Credentials | `Tools/credentials.js` |
| Code | `app/clients/tools/Code/` |
| Image Generation | `app/clients/tools/stable-diffusion/` |
| DALL-E | `app/clients/tools/DALLE/` |

### ToolService Principales

```javascript
// Funciones de ToolService.js
loadTools()
buildToolClassification()
createBashExecutionTool()
createBashProgrammaticToolCallingTool()
```

### Integraciones

- LangChain tools (`@librechat/agents/langchain/tools`)
- DynamicStructuredTool
- Custom tools via manifest

### Limitaciones Detectadas

1. No hay un sistema centralizado de gestión de tools
2. Las tools están dispersas en múltiples ubicaciones

---

## 10. RUNTIME REGISTRY

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/RuntimeRegistry/RuntimeRegistry.ts`
**Archivo:** `api/server/services/RuntimeRegistry/RuntimeRegistryIndex.ts`

### Runtimes Registrados

| Runtime | Tipo | Capacidades |
|---------|------|-------------|
| LLMRuntime | LLM | chat, vision, reasoning |
| BrowserRuntime | Browser | automation |
| CodeRuntime | Code | execution, filesystem |
| MediaRuntime | Media | image_generation, tts, stt |
| SearchRuntime | Search | web_search |
| FileStorageRuntime | Storage | file_storage |
| RAGRuntime | RAG | retrieval, embedding |

---

## 11. CONTEXT MANAGER

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/ContextManager/ContextManagerService.js`
**Clase:** `ContextManagerService`

### Estrategias de Windowing

```javascript
const WINDOWING_STRATEGY = {
  SLIDING: 'sliding',      // Ventana deslizante
  TOKEN_BASED: 'token_based', // Por tokens
  SEMANTIC: 'semantic',    // Por similitud semántica
};
```

### Funciones Principales

```javascript
class ContextManagerService {
  addMessage(conversationId, message)
  getContext(conversationId, options)
  truncateContext(conversationId, maxTokens)
  getTokenCount(conversationId)
  summarizeContext(conversationId)
}
```

---

## 12. EXECUTION ENGINE

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/ExecutionEngine/ExecutionEngine.js`
**Archivo:** `api/server/services/ExecutionEngine/ExecutionEngine.ts`

### Estados de Ejecución

```javascript
const ExecutionStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};
```

### Flujo de Ejecución

```
TaskPlanner → ExecutionEngine → RuntimeRegistry 
                         ↓
                   LLMRuntime
                         ↓
                   LLMGateway
                         ↓
                   Provider API
```

---

## 13. TASK PLANNER

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/ExecutionEngine/TaskPlanner.ts`

### Funciones

```typescript
class TaskPlanner {
  decomposeTask(task): Task[]
  estimateCost(task): CostEstimate
  estimateDuration(task): DurationEstimate
  getDependencies(task): Task[]
  optimizeExecutionOrder(tasks): Task[]
}
```

---

## 14. PROMPT GENERATOR

### Estado: ⚫ NO EXISTE DEDICADO

### Evidencia

No existe un servicio dedicado para generación de prompts. Hay funciones de formato dispersas:

| Archivo | Función |
|---------|---------|
| `app/clients/prompts/formatMessages.js` | Formatea mensajes |
| `app/clients/prompts/createVisionPrompt.js` | Crea prompts de visión |
| `app/clients/prompts/artifacts.js` | Genera artifacts |
| `app/clients/prompts/summaryPrompts.js` | Prompts de resumen |

### Conclusion

⚠️ No existe un componente centralizado de "Prompt Generator". Las funcionalidades están dispersas en múltiples archivos.

---

## 15. PANEL MULTI-LLM (SUPERVISIÓN)

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Directorio:** `client/src/components/Chat/ActivityPanel/`

### Componentes

| Componente | Archivo | Descripción |
|------------|---------|-------------|
| MissionControl | `MissionControl.tsx` | Panel principal |
| OverviewPanel | `OverviewPanel.tsx` | Dashboard |
| MetricsPanel | `MetricsPanel.tsx` | Estadísticas |
| AgentTree | `AgentTree.tsx` | Árbol de agentes |
| AgentCard | `AgentCard.tsx` | Card de agente |
| AgentStatusBar | `AgentStatusBar.tsx` | Barra de estado |
| BrowserPanel | `BrowserPanel.tsx` | Panel de navegador |
| TerminalPanel | `TerminalPanel.tsx` | Terminal |
| ToolsPanel | `ToolsPanel.tsx` | Panel de herramientas |
| TaskMonitor | `TaskMonitor.tsx` | Monitor de tareas |
| ProcessPanel | `ProcessPanel.tsx` | Panel de procesos |
| TimelineViewer | `TimelineViewer.tsx` | Timeline |
| ChangeInspector | `ChangeInspector.tsx` | Inspector de cambios |
| DiffViewer | `DiffViewer.tsx` | Visualizador de diff |

### Hooks de Supervisión

| Hook | Ubicación | Función |
|------|-----------|---------|
| useAgentOrchestrator | `hooks/useAgentOrchestrator.ts` | Orquestación de agentes |
| useMultiAgent | `hooks/supervisor/useMultiAgent.ts` | Control multi-agente |
| useSandbox | `hooks/supervisor/useSandbox.ts` | Workspace aislado |
| useTaskMonitor | `hooks/supervisor/useTaskMonitor.ts` | Monitor de tareas |

---

## 16. SANDBOX MANAGER

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/SandboxManager/SandboxManager.js`
**Clase:** `SandboxManager`

### Estados del Sandbox

```javascript
const SandboxStatus = {
  CREATING: 'creating',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
};
```

### Funciones Principales

```javascript
class SandboxManager {
  async createSandbox(options)
  async destroySandbox(sandboxId)
  async readFile(sandboxId, path)
  async writeFile(sandboxId, path, content)
  async executeCommand(sandboxId, command)
  async getChanges(sandboxId)
  async applyChanges(sandboxId)
  async createSnapshot(sandboxId)
}
```

### Características

- Aislamiento Docker (cuando disponible)
- Workspace virtual fallback
- Sincronización bidireccional
- Sistema de promoción de cambios
- Diff viewer

---

## 17. AGENT CAPABILITIES

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/AgentCapabilities.ts`

### Configs por Rol

```typescript
export const AGENT_CAPABILITY_CONFIGS: Record<string, AgentCapabilityConfig> = {
  coder: {
    requiredCapabilities: [Capability.LLM_CHAT, Capability.LLM_FUNCTION_CALLING],
    preferredCapabilities: [Capability.CODE_EXECUTION, Capability.LLM_REASONING],
  },
  researcher: {
    requiredCapabilities: [Capability.LLM_CHAT, Capability.WEB_SEARCH],
    preferredCapabilities: [Capability.LLM_REASONING, Capability.RAG_RETRIEVAL],
  },
  analyst: { ... },
  writer: { ... },
  reviewer: { ... },
  orchestrator: { ... },
};
```

---

## 18. WORKFLOW ENGINE

### Estado: ✅ EXISTE COMPLETAMENTE

### Evidencia

**Archivo:** `api/server/services/ExecutionEngine/WorkflowEngine.ts`

### Funciones

```typescript
class WorkflowEngine {
  createWorkflow(definition): Workflow
  executeWorkflow(workflowId): Promise<Execution>
  pauseWorkflow(workflowId)
  resumeWorkflow(workflowId)
  cancelWorkflow(workflowId)
  getExecutionHistory(workflowId)
}
```

---

## RELACIONES ENTRE COMPONENTES

### Diagrama de Dependencias

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                      │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ Activity    │  │ Mission     │  │ EventBus    │                  │
│  │ Panel       │──│ Control     │──│ Client      │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│         │                │                │                           │
│         └────────────────┼────────────────┘                           │
│                          │ SSE                                      │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────────┐
│                          │ BACKEND                                   │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AI-OS / Execution Engine                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│         ┌────────────────┼────────────────┐                        │
│         ▼                ▼                ▼                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │ TaskPlanner │  │   Context   │  │  Workflow   │               │
│  │             │  │  Manager    │  │  Engine     │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
│                          │                                          │
│         ┌────────────────┼────────────────┐                        │
│         ▼                ▼                ▼                        │
│  ┌─────────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ Capability      │  │    MCP      │  │  Sandbox    │           │
│  │ Orchestrator   │  │             │  │  Manager    │           │
│  └────────┬────────┘  └─────────────┘  └─────────────┘           │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ Capability      │  │   LLM      │  │   API Key   │           │
│  │ Router          │  │  Runtime   │  │   Manager   │           │
│  └────────┬────────┘  └──────┬──────┘  └─────────────┘           │
│           │                  │                                   │
│           └──────────┬───────┘                                   │
│                      ▼                                          │
│           ┌─────────────────────┐                                │
│           │    LLM Gateway     │                                │
│           └──────────┬──────────┘                                │
│                      │                                          │
│     ┌───────┬───────┼───────┬───────┬───────┐                   │
│     ▼       ▼       ▼       ▼       ▼       ▼                   │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│  │Groq │ │Deep │ │ CF  │ │Mist │ │Gem  │ │Anth │              │
│  │     │ │Seek │ │     │ │ral  │ │ini  │ │ropic│              │
│  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘              │
│     └────────┴───────┴───────┴───────┴───────┘                   │
│                     Providers                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Matriz de Dependencias

| Componente | Depende De | Usado Por |
|------------|-----------|-----------|
| LLMGateway | APIKeyManager, Providers | LLMRuntime, CapabilityRouter |
| LLMRuntime | LLMGateway, EventBus | ExecutionEngine |
| CapabilityRouter | RuntimeRegistry, EventBus | CapabilityOrchestrator |
| CapabilityOrchestrator | CapabilityRouter, LLMGateway | MultiAgentController |
| TaskPlanner | CapabilityOrchestrator | ExecutionEngine |
| ExecutionEngine | TaskPlanner, LLMRuntime, ContextManager | MultiAgentController |
| MultiAgentController | ExecutionEngine, EventBus | Hooks Frontend |
| APIKeyManager | Environment vars | LLMGateway, Providers |
| SandboxManager | Docker (optional), EventBus | Hooks Frontend |
| MCP | OAuth handlers | ToolService |

---

## COMPONENTES ACOPLADOS

| Par | Tipo de Acoplamiento | Razón |
|-----|---------------------|-------|
| LLMGateway ↔ Providers | Fuerte | Providers son instancias directas |
| CapabilityOrchestrator ↔ LLMGateway | Medio | Usa adapter |
| MultiAgentController ↔ EventBus | Débil | EventBus es opcional |

---

## COMPONENTES INDEPENDIENTES

| Componente | Independencia |
|-----------|---------------|
| APIKeyManager | ✅ Totalmente independiente |
| ContextManager | ✅ Independiente del resto |
| SandboxManager | ✅ Puede funcionar sin agentes |
| RuntimeRegistry | ✅ Registro estático |

---

## COMPONENTES REUTILIZABLES

| Componente | Reutilizable En |
|-----------|-----------------|
| APIKeyManager | Cualquier servicio que necesite keys |
| CapabilityRouter | Cualquier sistema de routing |
| EventBus | Cualquier comunicación pub/sub |
| ContextManager | Cualquier gestión de contexto |
| RuntimeRegistry | Cualquier sistema de runtime |

---

## CONCLUSIONES

### Fortalezas

1. **Arquitectura modular**: Los componentes están bien separados
2. **Multi-provider**: 12 proveedores implementados
3. **Event-driven**: Sistema de eventos desacoplado
4. **Capability-based**: Routing por capacidades
5. **Supervisión completa**: Panel de control con 18+ componentes

### Áreas de Mejora

1. **Agentes**: Necesitan más implementación en `api/server/services/Agents/`
2. **Prompt Generator**: No existe componente dedicado
3. **Tools**: Sistema disperso, necesita centralización
4. **Documentación**: Aunque existe, está fragmentada

### Recomendaciones

1. Crear servicio dedicado de Prompt Generator
2. Centralizar sistema de Tools
3. Implementar más funcionalidades en `api/server/services/Agents/`
4. Crear documentación unificada

---

## EVIDENCIA DE ARCHIVOS

```bash
# Componentes principales
api/server/services/LLMGateway/LLMGateway.js
api/server/services/APIKeyManager/APIKeyManager.js
api/server/services/CapabilityRouter/CapabilityRouter.ts
api/server/services/CapabilityOrchestrator/index.js
api/server/services/LLMRuntime/LLMRuntime.js
api/server/services/MCP.js
api/server/services/MultiAgentController/MultiAgentController.js
api/server/services/EventBus/EventBus.ts
api/server/services/ToolService.js
api/server/services/RuntimeRegistry/RuntimeRegistry.ts
api/server/services/ContextManager/ContextManagerService.js
api/server/services/ExecutionEngine/ExecutionEngine.js
api/server/services/ExecutionEngine/TaskPlanner.ts
api/server/services/ExecutionEngine/WorkflowEngine.ts
api/server/services/SandboxManager/SandboxManager.js
api/server/services/AgentCapabilities.ts

# Frontend
client/src/hooks/useAgentOrchestrator.ts
client/src/hooks/supervisor/useMultiAgent.ts
client/src/hooks/supervisor/useSandbox.ts
client/src/hooks/supervisor/useTaskMonitor.ts
client/src/services/EventBus.ts
client/src/components/Chat/ActivityPanel/*
```

---

**Fin del Informe de Auditoría**
