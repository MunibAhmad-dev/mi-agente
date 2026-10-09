# 📖 DOCUMENTACIÓN TÉCNICA COMPLETA
## Mi LibreChat - Arquitectura y Sistemas

**Fecha:** 2026-07-21
**Versión:** 3.0 Enterprise

---

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [Sistema de LLM Providers](#2-sistema-de-llm-providers)
3. [API Key Manager](#3-api-key-manager)
4. [Capability Router](#4-capability-router)
5. [Sistema de Chat](#5-sistema-de-chat)
6. [Sistema de Agentes](#6-sistema-de-agentes)
7. [Event Bus](#7-event-bus)
8. [Mission Control](#8-mission-control)
9. [Flujo Completo](#9-flujo-completo-free-cloud--api-key)

---

## 1. Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MI LIBRECHAT - ARQUITECTURA                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        FRONTEND (React)                                │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │  Chat   │ │Metrics  │ │Settings │ │Market-  │ │ Mission │       │   │
│  │  │ Window  │ │ Panel   │ │         │ │  place  │ │ Control │       │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         BACKEND (Node.js)                             │   │
│  │                                                                      │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │   │
│  │  │    AI-OS     │  │   Execution   │  │    Event      │          │   │
│  │  │  (Orquestador)│  │    Engine    │  │     Bus       │          │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘          │   │
│  │                                                                      │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │   │
│  │  │  Capability   │  │   Runtime     │  │    API       │          │   │
│  │  │  Orchestrator │  │   Registry    │  │    Keys      │          │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LLM GATEWAY (LiteLLM)                             │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                  ROUTING LAYER                               │   │   │
│  │  │  • Load Balancing   • Fallback Chain                         │   │   │
│  │  │  • Rate Limiting    • Cost Optimization                       │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                       │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│  │  │  Groq   │ │DeepSeek │ │ CF AI   │ │Mistral  │ │ Gemini  │ ...  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Componentes Principales

| Componente | Descripción | Ubicación |
|------------|-------------|-----------|
| **AI-OS** | Orquestador global | `api/server/services/` |
| **Execution Engine** | Motor de ejecución de tareas | `api/server/services/ExecutionEngine/` |
| **Capability Orchestrator** | Orquestador de capacidades | `api/server/services/CapabilityOrchestrator/` |
| **Runtime Registry** | Registro de runtimes | `api/server/services/Runtimes/` |
| **API Key Manager** | Gestión de credenciales | `api/server/services/APIKeyManager/` |
| **Event Bus** | Sistema de eventos | `api/server/services/EventBus/` |
| **LLM Gateway** | Gateway de modelos | LiteLLM |

---

## 2. Sistema de LLM Providers

### 2.1 Proveedores Soportados

Mi-LibreChat soporta múltiples proveedores de LLM para máxima flexibilidad y costo-efectividad.

| # | Proveedor | Modelos Principales | Tier Free | Streaming | Context |
|---|-----------|---------------------|-----------|-----------|---------|
| 1 | **Groq** | Llama 3.3 70B, Mixtral 8x7B | 14,400 req/día | ✅ | 131K |
| 2 | **DeepSeek** | DeepSeek-V4, DeepSeek-Coder | 5M tokens | ✅ | 64K |
| 3 | **Cloudflare** | Llama 3, Mistral, Gemma 2 | 10,000 req/día | ✅ | 131K |
| 4 | **OpenRouter** | Múltiples modelos free | ~100 req/día | ✅ | Variable |
| 5 | **Cohere** | Command R+, Rerank 3 | 1,000 req/mes | ✅ | 128K |
| 6 | **Mistral AI** | Mistral Small, Codestral | ~1B tokens/mes | ✅ | 128K |
| 7 | **HuggingFace** | 10B+ modelos | ~100 req/hora | ✅ | 4K-32K |
| 8 | **Perplexity** | Sonar Small/Large | 100 req/día | ✅ | 128K |
| 9 | **Gemini** | Gemini 1.5 Flash/Pro | 1.5M tokens/min | ✅ | 1M |
| 10 | **Anthropic** | Claude 3.5 Sonnet | $5 crédito | ✅ | 200K |

### 2.2 Matriz de Capacidades

| Proveedor | Chat | Code | RAG | Vision | Math | Spanish |
|-----------|------|------|-----|--------|------|---------|
| Groq | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| DeepSeek | ✅ | ✅✅ | ✅ | ❌ | ✅✅ | ✅ |
| Cloudflare | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Gemini | ✅ | ✅ | ✅ | ✅ | ✅✅ | ✅ |
| Claude | ✅✅ | ✅✅ | ✅ | ✅ | ✅✅ | ✅ |

### 2.3 Configuración

```yaml
# config/llm-providers.yaml
providers:
  groq:
    name: "Groq"
    models:
      - id: "llama-3.3-70b-versatile"
        name: "Llama 3.3 70B"
        context: 131072
        input: 0.59   # $/1M tokens
      - id: "mixtral-8x7b-32768"
        name: "Mixtral 8x7B"
    auth: "API_KEY"
    endpoint: "https://api.groq.com/openai/v1"
    
  deepseek:
    name: "DeepSeek"
    models:
      - id: "deepseek-chat"
        name: "DeepSeek V4"
      - id: "deepseek-coder"
        name: "DeepSeek Coder"
    auth: "API_KEY"
    endpoint: "https://api.deepseek.com"
```

---

## 3. API Key Manager

### 3.1 Descripción

El `APIKeyManager` gestiona de forma segura las credenciales de API.

**Ubicación:** `api/server/services/APIKeyManager/`

### 3.2 Proveedores

```javascript
const Providers = {
  GROQ: 'groq',
  DEEPSEEK: 'deepseek',
  CLOUDFLARE: 'cloudflare',
  MISTRAL: 'mistral',
  COHERE: 'cohere',
  HUGGINGFACE: 'huggingface',
  OPENROUTER: 'openrouter',
  GEMINI: 'gemini',
  ANTHROPIC: 'anthropic',
  PERPLEXITY: 'perplexity',
  TAVILY: 'tavily',
};
```

### 3.3 Variables de Entorno

```bash
# Proveedores Gratuitos (recomendados)
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...
CLOUDFLARE_API_KEY=...
MISTRAL_API_KEY=...

# Proveedores Pago
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
```

### 3.4 Uso

```javascript
const { APIKeyManager } = require('./services/APIKeyManager');

const keyManager = new APIKeyManager({
  validateOnLoad: true,
  storeKeys: false,
});

keyManager.loadFromEnvironment();

const apiKey = keyManager.getKey('groq');
console.log(`Using: ${apiKey.maskedKey}`);
```

---

## 4. Capability Router

### 4.1 Concepto

El **Capability Router** selecciona modelos por **capacidades requeridas**, no por nombre.

```
Input: { required: ['code-generation', 'reasoning'] }
         ↓
   Capability Router
         ↓
Output: { provider: 'groq', model: 'llama-3.3-70b-versatile' }
```

### 4.2 Capacidades

```javascript
const Capability = {
  // LLM
  LLM_CHAT: 'llm_chat',
  LLM_REASONING: 'llm_reasoning',
  LLM_FUNCTION_CALLING: 'llm_function_calling',
  LLM_VISION: 'llm_vision',
  
  // Specialized
  CODE_EXECUTION: 'code_execution',
  WEB_SEARCH: 'web_search',
  RAG_RETRIEVAL: 'rag_retrieval',
  
  // Media
  IMAGE_GENERATION: 'image_generation',
  TEXT_TO_SPEECH: 'text_to_speech',
};
```

### 4.3 Routing

```javascript
const router = new CapabilityRouter();

const decision = router.route({
  required: [Capability.LLM_CHAT, Capability.LLM_FUNCTION_CALLING],
  constraints: { maxCost: 0.01 }
});

console.log(decision);
// { provider: 'groq', model: 'llama-3.3-70b-versatile', score: 0.95 }
```

### 4.4 Configuración por Rol

```javascript
const AGENT_CAPABILITY_CONFIGS = {
  coder: {
    requiredCapabilities: [Capability.LLM_CHAT, Capability.LLM_FUNCTION_CALLING],
    preferredCapabilities: [Capability.CODE_EXECUTION],
  },
  researcher: {
    requiredCapabilities: [Capability.LLM_CHAT, Capability.WEB_SEARCH],
  },
};
```

---

## 5. Sistema de Chat

### 5.1 Flujo

```
Usuario escribe mensaje
        ↓
  ChatInput Component
        ↓
  API POST /api/messages
        ↓
  ActionService
        ↓
  CapabilityOrchestrator
        ↓
  LLM Gateway → Provider API
        ↓
  Streaming Response (SSE)
        ↓
  Chat Window
```

### 5.2 Componentes

```
client/src/components/Chat/
├── Chat.jsx                    # Componente principal
├── Messages/
│   ├── Message.jsx            # Mensaje individual
│   ├── MessageActions.tsx     # Acciones
│   └── MessageContent.tsx     # Contenido
├── Input/
│   └── TextChat.jsx           # Input
└── Windows/
    └── composer/
        └── ComposerActions.tsx # Selector de repos
```

### 5.3 Tipos de Mensajes

```javascript
const MessageType = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool',
  ERROR: 'error',
};
```

---

## 6. Sistema de Agentes

### 6.1 Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT ORCHESTRATION LAYER                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐     ┌────────────────┐                     │
│  │ MissionControl │────▶│  Orchestrator  │                     │
│  │    (Panel)     │     │                │                     │
│  └────────────────┘     └───────┬────────┘                     │
│                                 │                                │
│         ┌───────────────────────┼───────────────────────┐       │
│         ▼                       ▼                       ▼       │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────┐ │
│  │   Agent     │         │   Agent     │         │  Agent  │ │
│  │  (Coder)   │         │ (Researcher)│         │ (Writer)│ │
│  └─────────────┘         └─────────────┘         └─────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Roles

```javascript
const AgentRole = {
  ORCHESTRATOR: 'orchestrator',   // Coordina otros agentes
  SPECIALIST: 'specialist',         // Conocimientos específicos
  WORKER: 'worker',                 // Ejecuta tareas
  SUPERVISOR: 'supervisor',         // Supervisa trabajo
  QA: 'qa',                         // Control de calidad
  RESEARCHER: 'researcher',         // Investiga información
};
```

### 6.3 Estados

```javascript
const AgentState = {
  IDLE: 'idle',
  EXECUTING: 'executing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};
```

### 6.4 Hook de Orquestación

```javascript
const {
  agents,           // Lista de agentes
  activeAgents,      // Agentes activos
  addAgent,          // Crear agente
  removeAgent,       // Eliminar agente
  assignTask,        // Asignar tarea
  startOrchestration, // Iniciar
  stopOrchestration,  // Detener
} = useAgentOrchestrator();
```

---

## 7. Event Bus

### 7.1 Tipos de Eventos

```javascript
// Sistema
'system.started', 'system.ready', 'system.shutdown'

// Agentes
'agent:created', 'agent:started', 'agent:completed', 'agent:failed'

// Herramientas
'tool:started', 'tool:completed', 'tool:error'

// LLM
'llm:request_started', 'llm:request_completed', 'llm:retry'

// Sandbox
'sandbox:created', 'sandbox:apply_requested', 'sandbox:apply_completed'
```

### 7.2 API

```javascript
// Publicar
eventBus.emit('agent:created', 'Agent created', { agentId: 'agent-1' });

// Suscribirse
eventBus.subscribe('agent:created', (event) => {
  console.log(event.data);
});
```

---

## 8. Mission Control

Panel unificado para supervisar agentes en tiempo real.

```
┌─────────────────────────────────────────────────────────────────┐
│  MISSION CONTROL                                                   │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Agentes] [Actividad] [Timeline] [Cambios] [Métricas]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ● Orquestación Activa          Duración: 15m 30s                │
│    3 agente(s) ejecutando         ████████░░ 75%                 │
│                                                                  │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐                     │
│  │ 👥 5  │ │ 🔧 23 │ │ 📟   │ │ 📝 5 │                     │
│  └───────┘ └───────┘ └───────┘ └───────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Componentes

```
client/src/components/Chat/ActivityPanel/
├── MissionControl.tsx        # Panel principal
├── OverviewPanel.tsx          # Dashboard
├── AgentTree.tsx              # Árbol de agentes
├── TimelineViewer.tsx         # Timeline
├── ToolsPanel.tsx             # Herramientas
├── TerminalPanel.tsx          # Terminal
└── MetricsPanel.tsx           # Métricas
```

---

## 9. Flujo Completo: Free Cloud + API Key

```
1. USUARIO ESCRIBE MENSAJE
   └─▶ ChatInput → API /api/messages

2. BACKEND PROCESA
   └─▶ ActionService detecta intención
   └─▶ CapabilityOrchestrator recibe request

3. CAPABILITY ROUTING
   └─▶ Analiza capacidades requeridas
   └─▶ APIKeyManager consulta keys disponibles
   └─▶ Selecciona mejor provider (costo/velocidad)

4. LLM GATEWAY
   └─▶ Construye request con API key
   └─▶ Envía a provider (Groq/DeepSeek/etc)
   └─▶ Recibe streaming response

5. RESPUESTA AL FRONTEND
   └─▶ SSE al cliente
   └─▶ EventBus notifica componentes
   └─▶ ChatWindow renderiza

6. MONITOREO
   └─▶ MissionControl recibe eventos
   └─▶ Timeline registra acción
```

### Diagrama de Secuencia

```
┌─────┐     ┌─────────┐     ┌───────────┐     ┌────────────┐     ┌────────┐
│User │     │ Chat.jsx│     │   API     │     │ Capability │     │ LLM    │
│     │     │         │     │  Backend  │     │ Orchestrator│     │Gateway │
└──┬──┘     └────┬────┘     └─────┬─────┘     └──────┬─────┘     └───┬────┘
   │             │               │                   │               │
   │ Send msg    │               │                   │               │
   │────────────▶│               │                   │               │
   │             │ POST /api/msg │                   │               │
   │             │──────────────▶│                   │               │
   │             │               │ route()           │               │
   │             │               │───────────────────▶│               │
   │             │               │                   │               │
   │             │               │   getKey()        │               │
   │             │               │◀──────────────────│               │
   │             │               │                   │               │
   │             │               │ POST /chat/completions             │
   │             │               │────────────────────────────────▶│
   │             │               │                   │               │
   │             │               │   Streaming SSE    │               │
   │             │               │◀────────────────────────────────│
   │             │               │                   │               │
   │ SSE Stream  │               │                   │               │
   │◀────────────│               │                   │               │
```

---

## Referencias

- [Diseño Completo del Sistema](DISEÑO_COMPLETO_SISTEMA.md)
- [Arquitectura Enterprise](ARQUITECTURA_ENTERPRISE_FINAL.md)
- [Arquitectura Event-Driven](ARQUITECTURA_EVENT_DRIVEN.md)
- [Auditoría Chat System](docs/agent-supervision/05-CHAT-SYSTEM-AUDIT.md)
- [Limitaciones Sandbox](docs/agent-supervision/SANDBOX-LIMITATIONS.md)
