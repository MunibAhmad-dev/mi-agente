# 🏛️ PROPUESTA DE ARQUITECTURA UNIFICADA
## Sistema Multi-LLM con LibreChat + LiteLLM + API Key Manager + Free Claude Code

**Fecha:** 2026-07-21
**Versión:** 1.0
**Autor:** OpenHands Agent

---

## 1. RESUMEN EJECUTIVO

### 1.1 Visión

Diseñar un sistema modular, escalable y preparado para producción que orqueste múltiples proveedores LLM de manera inteligente, utilizando componentes existentes y propuestas de integración.

### 1.2 Componentes Principales

| Componente | Rol | Fuente |
|------------|-----|--------|
| LibreChat | UI + Orquestación | Existente |
| LiteLLM | Gateway de Providers | Existente |
| API Key Manager | Administración de Credenciales | Propuesta como Admin Central |
| Free Claude Code | Provider Adicional | Integración como provider |
| Capability Router | Routing por Capacidades | Existente (extender) |
| Capability Orchestrator | Orquestación de Capabilities | Existente |
| Context Manager | Gestión de Contexto | Existente |
| Execution Engine | Motor de Ejecución | Existente |
| Event Bus | Comunicación Desacoplada | Existente |
| Runtime Registry | Registro de Runtimes | Existente |
| Sandbox Manager | Aislamiento de Agentes | Existente |

---

## 2. ARQUITECTURA PROPUESTA

### 2.1 Diagrama de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USUARIO                                          │
│                   "Ejecuta esta tarea de código"                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LIBRECHAT (Frontend)                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Chat   │ │Mission  │ │Metrics  │ │Settings │ │Market-  │          │
│  │ Window  │ │Control  │ │ Panel   │ │         │ │  place  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                          AI-OS LAYER                                │ │
│  │                                                                      │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │ │
│  │  │   Execution   │  │   Context    │  │    Event     │        │ │
│  │  │   Engine      │  │   Manager    │  │    Bus       │        │ │
│  │  └───────────────┘  └───────────────┘  └───────────────┘        │ │
│  │                                                                      │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │ │
│  │  │  Capability   │  │    Task      │  │  Workflow    │        │ │
│  │  │  Orchestrator │  │   Planner    │  │   Engine     │        │ │
│  │  └───────────────┘  └───────────────┘  └───────────────┘        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LLM GATEWAY LAYER (LiteLLM)                             │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────┐  │ │
│  │  │  Capability     │ ──▶ │     LLM        │ ──▶ │   LiteLLM   │  │ │
│  │  │  Router        │     │   Gateway      │     │   Proxy     │  │ │
│  │  └─────────────────┘     └─────────────────┘     └──────┬──────┘  │ │
│  └───────────────────────────────────────────────────────────────┼────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CREDENTIALS LAYER (API Key Manager)                     │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │ │
│  │  │  API Key       │  │  Rate Limiter  │  │    Health      │     │ │
│  │  │  Manager       │  │                 │  │    Checker     │     │ │
│  │  │  (Central)     │  │                 │  │                │     │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │ │
│  │                                                                      │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │ │
│  │  │  Quota         │  │   Key          │  │    Audit       │     │ │
│  │  │  Monitor       │  │   Rotation     │  │    Logger      │     │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROVIDER LAYER                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                      │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │ │
│  │  │  Groq   │ │DeepSeek │ │ Gemini  │ │ Claude  │ │   FCC   │    │ │
│  │  │         │ │         │ │         │ │  (via   │ │  (Free  │    │ │
│  │  │         │ │         │ │         │ │ LiteLLM)│ │Claude) │    │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘    │ │
│  │                                                                      │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │ │
│  │  │Mistral  │ │Cloudflare│ │Cohere  │ │ Hugging │ │  Open   │    │ │
│  │  │         │ │ Workers │ │         │ │  Face   │ │ Router  │    │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘    │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. FLUJO DE SOLICITUDES

### 3.1 Flujo Completo

```
┌──────┐     ┌───────────┐     ┌──────────────┐     ┌──────────────┐
│User  │     │LibreChat  │     │ Execution     │     │  Capability  │
│      │     │ Frontend  │     │   Engine      │     │  Router      │
└──┬───┘     └─────┬─────┘     └──────┬───────┘     └──────┬───────┘
   │ Send msg      │                    │                     │
   │──────────────▶│                    │                     │
   │               │ POST /api/msg      │                     │
   │               │───────────────────▶│                     │
   │               │                    │ route(capabilities) │
   │               │                    │─────────────────────▶│
   │               │                    │                     │
   │               │                    │   { provider, model }│
   │               │                    │◀─────────────────────│
   │               │                    │                     │
   │               │                    │    execute()        │
   │               │                    │────────────────────▶│
   │               │                    │                     │
   │               │                    │   getKey(provider)  │
   │               │                    │◀────────────────────│
   │               │                    │                     │
   │               │                    │   POST /chat/completions
   │               │                    │────────────────────▶│
   │               │                    │                     │
   │               │                    │    Streaming SSE    │
   │               │                    │◀────────────────────│
   │               │                    │                     │
   │               │ SSE Stream         │                     │
   │               │◀───────────────────│                     │
   │ SSE           │                    │                     │
   │◀──────────────│                    │                     │
```

### 3.2 Flujo de Decisión del Router

```
Solicitud recibida
        │
        ▼
┌───────────────────────────────────────┐
│  Analizar capacidades requeridas      │
│  - requiredCapabilities               │
│  - preferredCapabilities              │
│  - constraints (cost, latency, etc)   │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  Consultar API Key Manager           │
│  - Keys disponibles por provider      │
│  - Rate limits                       │
│  - Cooldowns                         │
│  - Health status                     │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  Seleccionar mejor opción             │
│  Criterios:                          │
│  1. Provider priority                │
│  2. Key health                      │
│  3. Rate limit status               │
│  4. Cooldown remaining               │
│  5. Cost per token                  │
│  6. Latencia estimada                │
│  7. Contexto disponible              │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  Generar Execution Profile            │
│  {                                  │
│    provider: "groq",                │
│    model: "llama-3.3-70b-versatile",│
│    temperature: 0.7,                │
│    maxTokens: 4096,                 │
│    fallbackProviders: [...]          │
│  }                                  │
└───────────────────────────────────────┘
```

---

## 4. COMPONENTES DETALLADOS

### 4.1 API Key Manager (Admin Central)

#### Rol Propuesto
Convertir API Key Manager en el **Administrador Central de Credenciales** del sistema.

#### Responsabilidades
```
┌─────────────────────────────────────────────────────────────────┐
│                    API KEY MANAGER (ADMIN CENTRAL)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ Credential     │  │   Health      │  │    Rate       │   │
│  │ Manager        │──│   Checker     │──│    Limiter    │   │
│  │                │  │               │  │                │   │
│  │ - CRUD Keys   │  │ - Ping test   │  │ - Per user   │   │
│  │ - Encryption  │  │ - Latency     │  │ - Per provider│   │
│  │ - Rotation    │  │ - Error rate  │  │ - Global     │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
│          │                  │                  │                 │
│          ▼                  ▼                  ▼                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │     Quota      │  │    Cooldown   │  │     Audit     │   │
│  │   Monitor      │──│   Manager     │──│     Logger    │   │
│  │                │  │               │  │                │   │
│  │ - Track usage  │  │ - Auto-wait   │  │ - All ops     │   │
│  │ - Alerts       │  │ - Reset       │  │ - Compliance  │   │
│  │ - Reset daily │  │ - Prioritize  │  │ - Security    │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    ADAPTERS LAYER                          │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │  │ LiteLLM  │ │ FreeClaude│ │  Direct  │ │  Custom  │  │ │
│  │  │ Adapter  │ │  Code    │ │  Access  │ │  APIs   │  │ │
│  │  │          │ │ Adapter  │ │          │ │          │  │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### API Expuesta
```typescript
interface APIKeyManagerService {
  // Keys
  getKey(provider: string): Promise<APIKey>;
  getKeysByProvider(provider: string): Promise<APIKey[]>;
  addKey(provider: string, key: string, metadata?: KeyMetadata): Promise<APIKey>;
  markExhausted(keyId: string): Promise<void>;
  markInvalid(keyId: string): Promise<void>;
  
  // Health
  checkHealth(provider: string): Promise<HealthStatus>;
  getProviderStatus(): Promise<ProviderStatus[]>;
  
  // Rate Limits
  checkRateLimit(provider: string, userId?: string): Promise<RateLimitStatus>;
  recordUsage(keyId: string, tokens: number): Promise<void>;
  
  // Cooldown
  setCooldown(keyId: string, until: Date): Promise<void>;
  getCooldownStatus(keyId: string): Promise<CooldownStatus>;
  
  // Audit
  getUsageHistory(keyId: string, range: DateRange): Promise<UsageRecord[]>;
  getAuditLog(range: DateRange): Promise<AuditRecord[]>;
}
```

### 4.2 Capability Router (Extendido)

#### Mejoras Propuestas
```
┌─────────────────────────────────────────────────────────────────┐
│                    CAPABILITY ROUTER (EXTENDIDO)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INPUT:                                                          │
│  {                                                              │
│    requiredCapabilities: [LLM_CHAT, LLM_FUNCTION_CALLING],      │
│    preferredCapabilities: [CODE_EXECUTION],                      │
│    constraints: {                                                │
│      maxCost: 0.01,          // $/1M tokens                     │
│      maxLatency: 500,        // ms                              │
│      preferredProviders: ['groq', 'openrouter'],               │
│      minContext: 32000        // tokens                         │
│    }                                                            │
│  }                                                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    ROUTING ENGINE                           │ │
│  │                                                              │ │
│  │  1. Filter by capabilities                                  │ │
│  │  2. Filter by constraints                                   │ │
│  │  3. Check API Key Manager status                           │ │
│  │  4. Score candidates                                       │ │
│  │  5. Select best + fallbacks                                │ │
│  │                                                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  OUTPUT:                                                        │
│  {                                                              │
│    provider: "groq",                                           │
│    model: "llama-3.3-70b-versatile",                         │
│    executionProfile: { ... },                                   │
│    score: 0.95,                                                │
│    fallbacks: [                                                 │
│      { provider: "deepseek", model: "deepseek-chat" },        │
│      { provider: "openrouter", model: "openrouter/auto" }      │
│    ],                                                           │
│    reason: "Best score: low cost (0.59), high context (131K)"  │
│  }                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Free Claude Code (Como Provider)

#### Integración Propuesta
Free Claude Code se integrará como un **provider compatible** via HTTP adapter.

```
┌─────────────────────────────────────────────────────────────────┐
│                FREE CLAUDE CODE INTEGRATION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LibreChat                                                     │
│      │                                                         │
│      ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           LLM Gateway (LiteLLM + Custom Adapters)       │   │
│  │                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │   Groq     │  │  DeepSeek   │  │    FCC      │    │   │
│  │  │  Adapter   │  │   Adapter   │  │   Adapter   │    │   │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘    │   │
│  └──────────────────────────────────────────┼───────────┘   │
│                                             │                 │
│                                             ▼                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    FCC HTTP Adapter                      │   │
│  │                                                          │   │
│  │  POST http://localhost:8082/v1/messages                  │   │
│  │  {                                                      │   │
│  │    "model": "nvidia_nim/nemotron-3-super-120b",       │   │
│  │    "messages": [...],                                    │   │
│  │    "stream": true                                        │   │
│  │  }                                                      │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              FREE CLAUDE CODE (Puerto 8082)              │   │
│  │                                                          │   │
│  │  OpenAIChatProvider ──▶ NVIDIA NIM / OpenRouter / etc   │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Configuración
```yaml
# config/providers/fcc.yaml
providers:
  fcc:
    name: "Free Claude Code"
    enabled: true
    endpoint: "http://localhost:8082"
    api_key: "${FCC_API_KEY}"  # Optional auth
    models:
      - id: "nvidia_nim/nvidia/nemotron-3-super-120b-a12b"
        name: "Nemotron 120B"
        capabilities: [chat, code, reasoning]
        context: 131072
      - id: "open_router/free"
        name: "OpenRouter Free"
        capabilities: [chat]
        context: 128000
```

---

## 5. DIAGRAMA DE COMPONENTES COMPLETO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Chat   │ │Mission  │ │Metrics  │ │Settings │ │Market-  │          │
│  │ Window  │ │Control  │ │ Panel   │ │         │ │  place  │          │
│  └────┬────┘ └────┬────┘ └────┬────┘ └─────────┘ └─────────┘          │
│       │            │            │                                        │
│       └────────────┼────────────┘                                        │
│                    │                                                     │
│                    ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      EVENT BUS (Client)                           │   │
│  │  - agent:* / tool:* / llm:* / sandbox:*                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │ SSE
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Node.js)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          API ROUTES                                   │   │
│  │  /api/messages  /api/agents  /api/keys  /api/models  /api/supervisor│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AI-OS LAYER                                  │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │   │
│  │  │ ExecutionEngine │  │ ContextManager  │  │   EventBus      │    │   │
│  │  │                 │  │                 │  │   (Server)      │    │   │
│  │  │ - Task planning │  │ - Windowing     │  │                 │    │   │
│  │  │ - Workflow exec │  │ - Truncation    │  │ - Pub/Sub       │    │   │
│  │  │ - Orchestration│  │ - Summarization │  │ - Middlewares   │    │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │   │
│  │  │ Capability      │  │   TaskPlanner   │  │   Runtime      │    │   │
│  │  │ Orchestrator   │  │                 │  │   Registry     │    │   │
│  │  │                 │  │ - Decompose     │  │                 │    │   │
│  │  │ - Multi-mode    │  │ - Dependencies  │  │ - LLMRuntime   │    │   │
│  │  │ - Strategies   │  │ - Optimize      │  │ - CodeRuntime  │    │   │
│  │  └─────────────────┘  └─────────────────┘  │ - MediaRuntime │    │   │
│  │                                            └─────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         LLM GATEWAY LAYER                             │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │   │
│  │  │  Capability     │  │     LLM         │  │   LiteLLM       │    │   │
│  │  │  Router        │──│     Gateway     │──│   Proxy         │    │   │
│  │  │                 │  │                 │  │                 │    │   │
│  │  │ - By capability│  │ - Fallback chain│  │ - 12+ providers│    │   │
│  │  │ - By cost     │  │ - Load balance  │  │ - Unified API   │    │   │
│  │  │ - By latency  │  │ - Rate limit    │  │ - Health checks│    │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │   │
│  │                                    │                               │   │
│  │                                    │ getKey()                     │   │
│  │                                    ▼                               │   │
│  │  ┌─────────────────────────────────────────────────────────────┐  │   │
│  │  │              API KEY MANAGER (Admin Central)                 │  │   │
│  │  │                                                              │  │   │
│  │  │  - Encryption  - Health    - Quota     - Rotation          │  │   │
│  │  │  - Rate Limit  - Cooldown  - Audit     - Stats             │  │   │
│  │  │                                                              │  │   │
│  │  │  ┌─────────────────────────────────────────────────────┐  │  │   │
│  │  │  │                    ADAPTERS                          │  │  │   │
│  │  │  │  LiteLLM  │  FreeClaude  │  Direct  │  Custom     │  │  │   │
│  │  │  └─────────────────────────────────────────────────────┘  │  │   │
│  │  └─────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROVIDER LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │   Groq     │ │  DeepSeek   │ │   Gemini    │ │   Mistral   │        │
│  │  llama-3.3 │ │deepseek-chat│ │gemini-1.5  │ │mistral-small│        │
│  │   70B      │ │  coder      │ │   flash     │ │             │        │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘        │
│                                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │ Cloudflare │ │  Cohere     │ │  Hugging    │ │   Open      │        │
│  │  Workers   │ │ command-r+  │ │   Face     │ │   Router    │        │
│  │    AI     │ │             │ │             │ │             │        │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     FREE CLAUDE CODE (Puerto 8082)                     │ │
│  │  ┌───────────────────────────────────────────────────────────────┐ │ │
│  │  │  OpenAIChatProvider (Anthropic-compatible)                    │ │ │
│  │  │                                                                │ │ │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │ │ │
│  │  │  │ NVIDIA NIM │ │ OpenRouter  │ │   Local    │            │ │ │
│  │  │  │ nemotron   │ │ auto        │ │  Ollama    │            │ │ │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘            │ │ │
│  │  └───────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │  Claude     │ │  SambaNova  │ │   Lepton    │ │   Together  │        │
│  │  (Anthropic)│ │   AI        │ │    AI       │ │     AI      │        │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. LISTA DE MEJORAS PROPUESTAS

### 6.1 Alta Prioridad

| # | Mejora | Descripción | Complejidad | Impacto |
|---|--------|-------------|-------------|---------|
| 1 | Adapter API Key Manager → LibreChat | Conectar API Key Manager como fuente única de credenciales | Media | Alto |
| 2 | FCC como Provider | Integrar FCC como provider vía HTTP adapter | Media | Alto |
| 3 | Capability Router + API Key Manager | Router consulta estado de keys antes de rutear | Baja | Alto |
| 4 | Event-driven Updates | API Key Manager emite eventos al Event Bus | Baja | Alto |

### 6.2 Media Prioridad

| # | Mejora | Descripción | Complejidad | Impacto |
|---|--------|-------------|-------------|---------|
| 5 | Audit Logger Centralizado | Logging completo de todas las operaciones | Media | Medio |
| 6 | Reactivación Automática | Worker que monitorea cooldowns y reactiva | Media | Medio |
| 7 | Round-Robin Balance | Balanceo entre múltiples keys del mismo provider | Media | Medio |
| 8 | Cost Tracking | Métricas de costo por provider y usuario | Baja | Medio |

### 6.3 Baja Prioridad

| # | Mejora | Descripción | Complejidad | Impacto |
|---|--------|-------------|-------------|---------|
| 9 | Dashboard Unificado | Panel que muestra estado de keys y usage | Baja | Bajo |
| 10 | Prometheus Metrics | Exportación de métricas para monitoring | Baja | Bajo |
| 11 | Webhooks | Notificaciones de cambios de estado | Baja | Bajo |
| 12 | Multi-tenancy | Soporte para múltiples organizaciones | Alta | Bajo |

---

## 7. RIESGOS DETECTADOS

### 7.1 Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Duplicación de estado entre sistemas | Alta | Alto | Adapter centralizado, sync periódico |
| Latencia adicional por indirección | Media | Medio | Cache agresivo, async donde sea posible |
| Conflicto de rate limits | Media | Alto | Cooldown inteligente, prioridades |
| Keys expuestas en logs | Baja | Crítico | Sanitización de logs, encrypt at rest |
| Fallback chain muy larga | Media | Bajo | Límite de retries configurables |

### 7.2 Riesgos de Integración

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| FCC no compatible con streaming | Baja | Medio | Testing extensivo, fallback a otros providers |
| API Key Manager no disponible | Baja | Alto | Graceful degradation, keys directas |
| LiteLLM config conflicts | Baja | Medio | Namespaces separados |

---

## 8. ESTRATEGIA DE INTEGRACIÓN POR FASES

### Fase 1: Fundamentos (Semana 1-2)
**Objetivo:** Establecer la base de integración

```
Tareas:
□ 1.1 Crear adapter de API Key Manager para LiteLLM
□ 1.2 Modificar CapabilityRouter para consultar API Key Manager
□ 1.3 Agregar eventos del Event Bus para API Key Manager
□ 1.4 Testing básico de integración
□ 1.5 Documentar configuración
```

**Entregable:** API Key Manager integrado como fuente de credenciales para LiteLLM

### Fase 2: Free Claude Code (Semana 3-4)
**Objetivo:** Integrar FCC como provider

```
Tareas:
□ 2.1 Crear FCC HTTP Adapter en LiteLLM
□ 2.2 Configurar FCC como provider en LibreChat
□ 2.3 Testing de streaming y tool use
□ 2.4 Validar fallback chains
□ 2.5 Documentar integración
```

**Entregable:** FCC disponible como provider en LibreChat

### Fase 3: Observabilidad (Semana 5-6)
**Objetivo:** Monitoreo completo

```
Tareas:
□ 3.1 Implementar audit logger centralizado
□ 3.2 Agregar métricas Prometheus
□ 3.3 Crear dashboard de estado
□ 3.4 Testing de alerts
□ 3.5 Documentar runbooks
```

**Entregable:** Sistema de monitoreo completo

### Fase 4: Optimización (Semana 7-8)
**Objetivo:** Mejoras de performance y reliability

```
Tareas:
□ 4.1 Implementar round-robin entre keys
□ 4.2 Agregar reactivación automática post-cooldown
□ 4.3 Optimizar cache de modelos
□ 4.4 Testing de stress
□ 4.5 Fine-tuning de retry policies
```

**Entregable:** Sistema optimizado y resiliente

---

## 9. MIGRACIÓN DE DATOS

### 9.1 Keys Existentes en LibreChat
```bash
# Exportar keys existentes de LibreChat
curl -X GET http://librechat/api/keys \
  -H "Authorization: Bearer $TOKEN" \
  > keys_export.json

# Importar a API Key Manager
curl -X POST http://api-key-manager/api/v1/keys/import \
  -H "Content-Type: application/json" \
  -d @keys_export.json
```

### 9.2 Configuración LiteLLM
```yaml
# litellm_config.yaml (generado por API Key Manager)
model_list:
  - model_name: groq-primary
    litellm_params:
      model: groq/llama-3.3-70b-versatile
      api_key: ${GROQ_API_KEY}
  - model_name: fcc-nemotron
    litellm_params:
      model: fcc/nvidia_nim/nemotron-3-super-120b-a12b
      api_base: http://localhost:8082
```

---

## 10. MONITOREO Y ALERTAS

### 10.1 Métricas Clave

| Métrica | Descripción | Alert Threshold |
|---------|-------------|-----------------|
| `key_health_rate` | % de keys saludables | < 80% |
| `avg_latency_ms` | Latencia promedio por provider | > 2000ms |
| `quota_usage_pct` | Uso de cuota por provider | > 90% |
| `rate_limit_hits` | Rate limits disparados | > 100/hour |
| `cost_per_day` | Costo diario por provider | > $10 |

### 10.2 Dashboard Propuesto
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CREDENTIALS DASHBOARD                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ Keys Activas: 24    │  │ Rate Limits: 3     │  │ Costo Hoy: $2.45   │ │
│  │ ████████████░░░░░░ │  │ ⚠️ groq (2)        │  │ ↓ 15% vs ayer      │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                              │
│  PROVIDERS                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Provider     │ Keys │ Health │ Quota │ Latencia │ Costo               │ │
│  │──────────────│──────│────────│───────│──────────│────────────────────│ │
│  │ Groq        │   3  │   ✅   │  45%  │   120ms  │ $0.89              │ │
│  │ DeepSeek    │   2  │   ✅   │  78%  │   250ms  │ $0.45              │ │
│  │ FCC         │   1  │   ✅   │  N/A  │   180ms  │ $0.00              │ │
│  │ Gemini      │   1  │   ⚠️   │  92%  │   350ms  │ $1.11              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. CONCLUSIONES

### 11.1 Resumen de la Propuesta

La arquitectura propuesta permite:

1. **Modularidad completa** - Cada componente tiene responsabilidad única
2. **Sustituibilidad** - Cualquier provider puede替换se sin afectar otros
3. **Escalabilidad** - Arquitectura preparada para crecimiento
4. **Observabilidad** - Monitoreo completo de todas las operaciones
5. **Seguridad** - Cifrado, auditoría, rate limiting

### 11.2 Próximos Pasos

1. **Validar propuesta** con stakeholders
2. **Priorizar mejoras** según recursos disponibles
3. **Iniciar Fase 1** según estrategia outlined
4. **Iterar** basado en feedback

### 11.3 Contactos y Referencias

| Componente | Ubicación | Docs |
|-----------|-----------|------|
| LibreChat | `/workspace/mi-libre-chat` | README.md |
| API Key Manager | `/workspace/api-key` | README.md |
| Free Claude Code | `/workspace/free-claude-code` | README.md, ARCHITECTURE.md |

---

**Fin de la Propuesta de Arquitectura Unificada**
