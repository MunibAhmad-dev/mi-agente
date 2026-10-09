# 📋 PLAN DE IMPLEMENTACIÓN PROFESIONAL
## Universal AI Gateway Platform - Mi LibreChat

**Versión:** 1.0.0
**Fecha:** 2026-07-22
**Estado:** LISTO PARA IMPLEMENTACIÓN
**Estimación Total:** 11-13 semanas

---

## TABLA DE CONTENIDOS

1. [Filosofía y Principios](#1-filosofía-y-principios)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Arquitectura Propuesta](#3-arquitectura-propuesta)
4. [Dependencias entre Componentes](#4-dependencias-entre-componentes)
5. [Fases de Implementación](#5-fases-de-implementación)
6. [Interfaces y Contratos](#6-interfaces-y-contratos)
7. [Herramientas y Utilidades](#7-herramientas-y-utilidades)
8. [Testing Strategy](#8-testing-strategy)
9. [Documentación Requerida](#9-documentación-requerida)
10. [Riesgos y Mitigaciones](#10-riesgos-y-mitigaciones)

---

## 1. FILOSOFÍA Y PRINCIPIOS

### 1.1 Principios de Diseño

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRINCIPIOS FUNDAMENTALES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. KISS (Keep It Simple, Stupid)                                          │
│     ─────────────────────────────────                                      │
│     Cada componente hace UNA cosa bien.                                      │
│     No sobreingenierizar.                                                   │
│                                                                             │
│  2. YAGNI (You Aren't Gonna Need It)                                       │
│     ─────────────────────────────────                                      │
│     Implementar solo lo necesario.                                          │
│     Refactorizar cuando sea necesario, no antes.                             │
│                                                                             │
│  3. SOLID en su justa medida                                               │
│     ────────────────────────────────                                        │
│     - S: Single Responsibility (claramiente)                                │
│     - O: Open/Closed (extensible sin modificar)                             │
│     - L: Liskov Substitution (interfaces claras)                            │
│     - I: Interface Segregation (interfaces pequeñas)                         │
│     - D: Dependency Inversion (depender de abstracciones)                   │
│                                                                             │
│  4. Preferir Composición sobre Herencia                                    │
│     ─────────────────────────────────                                       │
│     Composable functions > Class hierarchies                                │
│                                                                             │
│  5. Convention over Configuration                                           │
│     ────────────────────────────────                                        │
│     Buenos defaults. Configuración solo cuando sea necesario.                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Reglas de Oro

| Regla | Descripción |
|-------|-------------|
| **No romper existente** | Toda implementación debe ser additive |
| **Interfaces primero** | Definir контракт antes de implementar |
| **Testing desde día 1** | TDD para componentes críticos |
| **Documentar decisiones** | ADR para cada decisión significativa |
| **Reutilizar existente** | No reinventar la rueda |
| **Minimal viable** | Empezar simple, iterar |

---

## 2. STACK TECNOLÓGICO

### 2.1 Tecnologías Core (Ya en el proyecto)

| Tecnología | Uso | Licencia |
|------------|-----|----------|
| **Node.js 18+** | Runtime | MIT |
| **TypeScript 5.x** | Lenguaje | Apache 2.0 |
| **Express.js** | HTTP framework | MIT |
| **MongoDB** | Base de datos | SSPL |
| **Redis** | Cache, Pub/Sub, Rate Limiting | BSD |
| **Docker** | Contenedores, Sandbox | Apache 2.0 |

### 2.2 Librerías Externas (Abiertas y Permisivas)

| Librería | Uso | Licencia | Por qué |
|----------|-----|----------|---------|
| **LiteLLM** | Gateway LLM | ISC | 35k+ stars, 100+ providers, mejor opción open source |
| **InversifyJS** | Dependency Injection | MIT | Ligero, TypeScript nativo |
| **zod** | Validación | MIT | Ya existe en el proyecto |
| **pino** | Logging | MIT | Alto rendimiento, ya usado |
| **ioredis** | Cliente Redis | MIT | Mejor cliente Redis para Node |
| **BullMQ** | Colas async | MIT | Job queues, ya existe Celery en api-key |
| **uuid** | Identificadores | MIT | RFC 4122 compliant |

### 2.3 Para Testing

| Herramienta | Uso | Licencia |
|-------------|-----|----------|
| **Vitest** | Unit testing | MIT |
| **Supertest** | API testing | MIT |
| **faker** | Mock data | MIT |
| **nock** | HTTP mocking | MIT |

### 2.4 Para Observabilidad

| Herramienta | Uso | Ya existe |
|-------------|-----|-----------|
| **Prometheus** | Métricas | ✅ En api-key |
| **Grafana** | Dashboards | ✅ En api-key |
| **OpenTelemetry** | Trazabilidad | ⚠️ Integrar |

---

## 3. ARQUITECTURA PROPUESTA

### 3.1 Estructura de Paquetes

```
packages/
├── gateway/                          # ⭐ NUEVO: Universal AI Gateway
│   ├── src/
│   │   ├── index.ts                  # Exports públicos
│   │   ├── types/                    # Interfaces y tipos
│   │   │   ├── i-provider.ts         # Contrato IProvider
│   │   │   ├── i-model.ts           # Contrato IModel
│   │   │   ├── i-adapter.ts         # Contrato IAdapter
│   │   │   ├── i-policy.ts          # Contrato IPolicy
│   │   │   ├── i-event.ts           # Contrato IEvent
│   │   │   └── index.ts
│   │   ├── core/                     # Nucleo del gateway
│   │   │   ├── registry/            # ProviderRegistry, ModelRegistry
│   │   │   ├── policy/              # PolicyEngine
│   │   │   ├── executor/            # RequestExecutor
│   │   │   ├── eventbus/            # EventBus
│   │   │   └── errors/              # Errores tipados
│   │   ├── providers/               # Implementaciones de adapters
│   │   │   ├── base.ts              # BaseProvider
│   │   │   ├── litellm.ts           # LiteLLM Adapter
│   │   │   ├── openai.ts            # OpenAI Adapter
│   │   │   ├── anthropic.ts         # Anthropic Adapter
│   │   │   ├── freeclaudecode.ts    # FreeClaudeCode Adapter
│   │   │   └── index.ts
│   │   ├── services/                 # Servicios adicionales
│   │   │   ├── account-manager.ts   # AccountManager
│   │   │   ├── api-key-connector.ts # Connector para api-key
│   │   │   ├── metrics.ts           # Metrics collector
│   │   │   └── health.ts            # Health checks
│   │   ├── plugins/                 # Plugin system
│   │   │   ├── plugin-manager.ts    # PluginManager
│   │   │   ├── loader.ts            # Dynamic loader
│   │   │   └── sandbox.ts           # Plugin sandboxing
│   │   └── utils/                   # Utilidades
│   │       ├── config.ts            # Configuration loader
│   │       ├── logger.ts            # Logger wrapper
│   │       └── retry.ts             # Retry logic
│   ├── tests/                        # Tests unitarios
│   ├── package.json
│   └── tsconfig.json
│
├── api-key-client/                   # ⭐ MEJORAR: Connector api-key
│   └── src/
│       ├── client.ts                 # Cliente REST mejorado
│       ├── types.ts                  # Tipos compartidos
│       └── index.ts
│
└── data-provider/                    # (Ya existe)
    └── src/
        └── ...
```

### 3.2 Arquitectura Visual

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UNIVERSAL AI GATEWAY                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         PUBLIC API                                      │ │
│  │                                                                        │ │
│  │   Gateway.complete(request) → Promise<Response>                        │ │
│  │   Gateway.stream(request) → AsyncIterable<Response>                     │ │
│  │   Gateway.listModels() → Promise<Model[]>                             │ │
│  │   Gateway.getHealth() → Promise<HealthStatus>                          │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      REQUEST EXECUTOR                                  │ │
│  │                                                                        │ │
│  │   ┌─────────┐    ┌─────────────┐    ┌────────────────┐               │ │
│  │   │Validate │───▶│    Route    │───▶│   Transform    │               │ │
│  │   └─────────┘    └─────────────┘    └────────────────┘               │ │
│  │                                                │                       │ │
│  │                                                ▼                       │ │
│  │                   ┌─────────────────────────────────────┐            │ │
│  │                   │         POLICY ENGINE                │            │ │
│  │                   │                                      │            │ │
│  │                   │   ┌─────────────────────────────┐   │            │ │
│  │                   │   │ • Capability check          │   │            │ │
│  │                   │   │ • Cost limit               │   │            │ │
│  │                   │   │ • Rate limit               │   │            │ │
│  │                   │   │ • User policy               │   │            │ │
│  │                   │   │ • Fallback strategy         │   │            │ │
│  │                   │   └─────────────────────────────┘   │            │ │
│  │                   └─────────────────────────────────────┘            │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      PROVIDER REGISTRY                                 │ │
│  │                                                                        │ │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │   │   LiteLLM    │  │    OpenAI    │  │  Anthropic   │              │ │
│  │   │   Adapter    │  │   Adapter    │  │   Adapter    │              │ │
│  │   └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │   │ FreeClaude   │  │    Groq      │  │   Gemini     │              │ │
│  │   │   Code       │  │   Adapter    │  │   Adapter    │              │ │
│  │   └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  │                                                                        │ │
│  │                          ... + MORE ADAPTERS ...                        │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      MODEL REGISTRY                                    │ │
│  │                                                                        │ │
│  │   Model: "claude-3.5-sonnet"                                         │ │
│  │   ├── providers: [Anthropic, Vertex, LiteLLM]                        │ │
│  │   ├── capabilities: [chat, vision, function_calling]                 │ │
│  │   ├── context_window: 200000                                          │ │
│  │   └── status: "available"                                            │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPPORTING SERVICES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Account     │  │    API       │  │   Event      │  │   Metrics    │  │
│  │  Manager     │  │    Key       │  │   Bus        │  │   Collector  │  │
│  │              │  │  Connector   │  │              │  │              │  │
│  │  • OAuth     │  │              │  │  • Redis     │  │  • Prometheus│  │
│  │  • API Keys  │  │  • Fetch key │  │  • Events    │  │  • Latency   │  │
│  │  • Sessions  │  │  • Rotate    │  │  • Async     │  │  • Errors    │  │
│  │  • Cookies   │  │  • Health    │  │              │  │  • Usage     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Flujo de una Solicitud

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REQUEST FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USER                                                                       │
│    │                                                                        │
│    ▼                                                                        │
│  LibreChat ──────────────────────────────────────────────────────────────    │
│    │                                                                        │
│    │ POST /api/chat/completions                                             │
│    │ { messages, model, capabilities }                                      │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  GATEWAY API (Express Router)                                        │    │
│  │                                                                      │    │
│  │  1. Authenticate request                                              │    │
│  │  2. Parse and validate body                                          │    │
│  │  3. Emit: 'request.received'                                         │    │
│  │  4. Forward to RequestExecutor                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  REQUEST EXECUTOR                                                   │    │
│  │                                                                      │    │
│  │  5. Validate capabilities (PolicyEngine)                             │    │
│  │     └─ If denied → Return 403                                        │    │
│  │                                                                      │    │
│  │  6. Check cost limits (PolicyEngine)                                 │    │
│  │     └─ If exceeded → Return 402                                      │    │
│  │                                                                      │    │
│  │  7. Check rate limits (PolicyEngine)                                 │    │
│  │     └─ If exceeded → Return 429                                      │    │
│  │                                                                      │    │
│  │  8. Select provider (CapabilityRouter)                               │    │
│  │     └─ Based on: model, capabilities, provider_status                │    │
│  │                                                                      │    │
│  │  9. Get credentials (AccountManager)                                  │    │
│  │     └─ From api-key service or cache                                 │    │
│  │                                                                      │    │
│  │  10. Emit: 'request.routing'                                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PROVIDER ADAPTER (LiteLLM/Other)                                   │    │
│  │                                                                      │    │
│  │  11. Transform request to provider format                            │    │
│  │  12. Execute request                                                 │    │
│  │  13. Handle errors (401, 429, 5xx)                                   │    │
│  │  14. Transform response                                              │    │
│  │  15. Emit: 'request.completed' or 'request.failed'                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  METRICS & EVENT BUS                                                 │    │
│  │                                                                      │    │
│  │  16. Record tokens, latency, cost                                    │    │
│  │  17. Update provider health status                                   │    │
│  │  18. Emit events for monitoring                                      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│    │                                                                        │
│    ▼                                                                        │
│  LibreChat ──────────────────────────────────────────────────────────────    │
│    │                                                                        │
│    ▼                                                                        │
│  USER (Streaming Response)                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. DEPENDENCIAS ENTRE COMPONENTES

### 4.1 Diagrama de Dependencias

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPENDENCY ORDER (Bottom-up)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LEVEL 0: Foundations (Sin dependencias)                                   │
│  ┌─────────────┐                                                            │
│  │ Interfaces │  ← IProvider, IModel, IAdapter, IPolicy, IEvent             │
│  └─────────────┘                                                            │
│        │                                                                   │
│        ▼                                                                   │
│  LEVEL 1: Core Utilities                                                    │
│  ┌─────────────┐  ┌─────────────┐                                          │
│  │  EventBus   │  │   Errors    │  ← Usa solo Interfaces                   │
│  └─────────────┘  └─────────────┘                                          │
│        │                                                                   │
│        ▼                                                                   │
│  LEVEL 2: Registries                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │  Provider   │  │   Model     │  │   Plugin    │                         │
│  │  Registry   │  │  Registry   │  │   Manager   │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
│        │                   │                                                │
│        └────────┬──────────┘                                                │
│                 ▼                                                           │
│  LEVEL 3: Policy Engine                                                    │
│  ┌─────────────────────────────────────┐                                   │
│  │          Policy Engine              │  ← Usa ProviderRegistry            │
│  │  • CapabilityRouter                 │                                    │
│  │  • CostController                   │                                    │
│  │  • RateLimiter                     │                                    │
│  └─────────────────────────────────────┘                                   │
│                 │                                                          │
│                 ▼                                                          │
│  LEVEL 4: Services                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │  Account    │  │  API Key    │  │  Metrics    │                         │
│  │  Manager    │  │ Connector   │  │  Collector  │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
│                 │                                                          │
│                 ▼                                                           │
│  LEVEL 5: Request Executor                                                 │
│  ┌─────────────────────────────────────┐                                   │
│  │        Request Executor             │  ← Usa todo lo anterior           │
│  │  • Coordinates all components       │                                    │
│  │  • Handles streaming               │                                    │
│  │  • Manages retries                 │                                    │
│  └─────────────────────────────────────┘                                   │
│                 │                                                          │
│                 ▼                                                           │
│  LEVEL 6: API Layer                                                        │
│  ┌─────────────────────────────────────┐                                   │
│  │        Gateway API                  │  ← Punto de entrada               │
│  │  • Express routes                  │                                    │
│  │  • Auth middleware                 │                                    │
│  │  • Request/Response handling       │                                    │
│  └─────────────────────────────────────┘                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Orden de Implementación

| Orden | Componente | Semanas | Dependencias |
|-------|------------|---------|--------------|
| 1 | Interfaces (types/) | 0.5 | Ninguna |
| 2 | EventBus | 0.5 | Interfaces |
| 3 | Errors | 0.25 | Interfaces |
| 4 | ProviderRegistry | 1 | Interfaces, EventBus |
| 5 | ModelRegistry | 1 | Interfaces, ProviderRegistry |
| 6 | BaseProvider | 0.5 | Interfaces, Registry |
| 7 | LiteLLM Adapter | 1.5 | BaseProvider |
| 8 | FreeClaudeCode Adapter | 1 | BaseProvider |
| 9 | PolicyEngine | 2 | Registry, EventBus |
| 10 | AccountManager | 1 | PolicyEngine |
| 11 | API Key Connector | 1 | AccountManager |
| 12 | Metrics Collector | 0.5 | EventBus |
| 13 | RequestExecutor | 1.5 | Todo lo anterior |
| 14 | PluginManager | 1 | Registry, Loader |
| 15 | API Layer | 1 | RequestExecutor |
| 16 | Integration & Testing | 2 | Todo |

**TOTAL: ~15 semanas** (con holgura)

---

## 5. FASES DE IMPLEMENTACIÓN

### FASE 0: Fundamentos (Semanas 1-2)

**Objetivo:** Establecer la base sólida

#### Tasks:
- [ ] Crear paquete `packages/gateway`
- [ ] Definir todas las interfaces en `types/`
- [ ] Implementar `EventBus` básico
- [ ] Implementar sistema de errores tipados
- [ ] Configurar logging
- [ ] Configurar testing (Vitest)
- [ ] Crear README y docs iniciales

#### Entregables:
```
packages/gateway/
├── src/
│   ├── types/
│   │   ├── i-provider.ts
│   │   ├── i-model.ts
│   │   ├── i-adapter.ts
│   │   ├── i-policy.ts
│   │   ├── i-event.ts
│   │   └── index.ts
│   ├── core/
│   │   ├── eventbus/
│   │   │   ├── index.ts
│   │   │   ├── EventBus.ts
│   │   │   └── types.ts
│   │   └── errors/
│   │       ├── index.ts
│   │       ├── GatewayError.ts
│   │       └── index.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   │   ├── eventbus.test.ts
│   │   └── errors.test.ts
│   └── setup.ts
├── package.json
└── tsconfig.json
```

#### Definición de Interfaces Clave:

```typescript
// i-provider.ts
export interface IProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  readonly capabilities: ProviderCapabilities;
  
  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  
  // Health
  getHealth(): Promise<ProviderHealth>;
  
  // Execution
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<LLMStreamEvent>;
}

// i-model.ts
export interface IModel {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly capabilities: ModelCapabilities;
  readonly contextWindow: number;
  readonly pricing: ModelPricing;
  
  isAvailable(): boolean;
}

// i-policy.ts
export interface IPolicyEngine {
  checkCapability(request: PolicyRequest): Promise<PolicyResult>;
  checkCost(request: PolicyRequest): Promise<PolicyResult>;
  checkRateLimit(request: PolicyRequest): Promise<PolicyResult>;
  selectFallback(request: PolicyRequest, failedProvider: string): Promise<string | null>;
}

// i-adapter.ts
export interface IAdapter {
  readonly provider: IProvider;
  
  // Transform requests/responses
  toProviderRequest(request: LLMRequest): ProviderRequest;
  fromProviderResponse(response: ProviderResponse): LLMResponse;
  fromProviderStream(event: ProviderStreamEvent): LLMStreamEvent;
  
  // Error mapping
  mapError(error: ProviderError): GatewayError;
}
```

---

### FASE 1: Registries (Semanas 3-4)

**Objetivo:** Sistema central de registro de proveedores y modelos

#### Tasks:
- [ ] Implementar `ProviderRegistry`
- [ ] Implementar `ModelRegistry`
- [ ] Crear `DiscoveryService` para auto-detectar adapters
- [ ] Implementar cache inteligente
- [ ] Tests de registry

#### ProviderRegistry:

```typescript
// provider-registry.ts
export class ProviderRegistry {
  private providers = new Map<string, IProvider>();
  private adapters = new Map<string, IAdapter>();
  
  // Registration
  register(provider: IProvider, adapter: IAdapter): void;
  unregister(providerId: string): void;
  
  // Query
  get(id: string): IProvider | undefined;
  getByType(type: ProviderType): IProvider[];
  getAll(): IProvider[];
  getAvailable(): IProvider[];
  
  // Capability-based query
  findByCapability(capability: Capability): IProvider[];
  
  // Health
  async updateHealth(id: string, health: ProviderHealth): Promise<void>;
  async getAggregateHealth(): Promise<ProviderHealthSummary>;
}
```

#### ModelRegistry:

```typescript
// model-registry.ts
export class ModelRegistry {
  private models = new Map<string, IModel>();
  private providerModelIndex = new Map<string, Set<string>>(); // provider -> models
  
  // Registration
  register(model: IModel): void;
  registerForProvider(modelId: string, providerId: string): void;
  unregister(modelId: string): void;
  
  // Query
  get(id: string): IModel | undefined;
  getAll(): IModel[];
  getByProvider(providerId: string): IModel[];
  getByCapability(capability: Capability): IModel[];
  
  // Search
  findBestMatch(requirements: ModelRequirements): IModel | null;
}
```

---

### FASE 2: Adapters (Semanas 5-6)

**Objetivo:** Implementar adapters para los providers principales

#### LiteLLM Adapter (Semana 5)

```typescript
// adapters/litellm.ts
export class LiteLLMAdapter implements IAdapter {
  readonly provider: IProvider;
  
  constructor(
    private config: LiteLLMConfig,
    private httpClient: HttpClient,
    private apiKeyConnector: IApiKeyConnector,
  ) {}
  
  async complete(request: LLMRequest): Promise<LLMResponse> {
    // 1. Get API key from connector
    const credentials = await this.apiKeyConnector.getCredentials('litellm');
    
    // 2. Transform request
    const providerRequest = this.toProviderRequest(request);
    
    // 3. Execute
    const response = await this.httpClient.post(
      `${this.config.baseUrl}/chat/completions`,
      providerRequest,
      { headers: { Authorization: `Bearer ${credentials.key}` } }
    );
    
    // 4. Transform response
    return this.fromProviderResponse(response);
  }
  
  async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    // Streaming implementation
  }
}
```

#### FreeClaudeCode Adapter (Semana 6)

```typescript
// adapters/freeclaudecode.ts
export class FreeClaudeCodeAdapter implements IAdapter {
  readonly provider: IProvider;
  
  constructor(
    private config: FreeClaudeCodeConfig,
    private httpClient: HttpClient,
  ) {}
  
  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Free Claude Code usa protocolo Anthropic
    const anthropicRequest = this.toAnthropicFormat(request);
    
    const response = await this.httpClient.post(
      `${this.config.baseUrl}/v1/messages`,
      anthropicRequest,
      { headers: { Authorization: `Bearer ${this.config.token}` } }
    );
    
    return this.fromAnthropicResponse(response);
  }
}
```

---

### FASE 3: Policy Engine (Semanas 7-8)

**Objetivo:** Motor de políticas centralizado

#### Arquitectura del PolicyEngine:

```typescript
// policy/policy-engine.ts
export class PolicyEngine implements IPolicyEngine {
  constructor(
    private config: PolicyConfig,
    private userPolicyStore: IUserPolicyStore,
    private providerRegistry: IProviderRegistry,
    private metricsStore: IMetricsStore,
  ) {}
  
  async checkCapability(request: PolicyRequest): Promise<PolicyResult> {
    // 1. Get user policies
    const userPolicies = await this.userPolicyStore.get(request.userId);
    
    // 2. Check model access
    const modelAllowed = this.evaluateModelPolicy(
      request.model,
      userPolicies,
    );
    if (!modelAllowed) {
      return { allowed: false, reason: 'Model not permitted' };
    }
    
    // 3. Check capability requirements
    const capabilities = this.analyzeRequiredCapabilities(request);
    for (const cap of capabilities) {
      if (!this.userHasCapability(request.userId, cap)) {
        return { allowed: false, reason: `Missing capability: ${cap}` };
      }
    }
    
    return { allowed: true };
  }
  
  async checkCost(request: PolicyRequest): Promise<PolicyResult> {
    // 1. Get model pricing
    const pricing = this.getModelPricing(request.model);
    
    // 2. Estimate request cost
    const estimatedCost = this.estimateCost(request, pricing);
    
    // 3. Check user balance
    const balance = await this.metricsStore.getUserBalance(request.userId);
    
    if (balance < estimatedCost) {
      return { 
        allowed: false, 
        reason: 'Insufficient balance',
        currentBalance: balance,
        required: estimatedCost,
      };
    }
    
    return { allowed: true };
  }
  
  async checkRateLimit(request: PolicyRequest): Promise<PolicyResult> {
    // Sliding window rate limiting
    const { allowed, remaining, resetAt } = await this.rateLimiter.check(
      request.userId,
      request.model,
    );
    
    if (!allowed) {
      return { 
        allowed: false, 
        reason: 'Rate limit exceeded',
        remaining,
        resetAt,
      };
    }
    
    return { allowed: true };
  }
  
  async selectFallback(
    request: PolicyRequest, 
    failedProvider: string
  ): Promise<string | null> {
    // 1. Find alternative providers with same capabilities
    const alternatives = this.providerRegistry
      .findByCapability(request.requiredCapabilities)
      .filter(p => p.id !== failedProvider)
      .filter(p => p.getHealth().status === 'healthy');
    
    // 2. Score by latency, cost, availability
    const scored = await this.scoreProviders(alternatives, request);
    
    // 3. Return best option
    return scored[0]?.id ?? null;
  }
}
```

#### Policy Types:

```typescript
// policy/types.ts
export interface PolicyRequest {
  userId: string;
  model: string;
  capabilities: Capability[];
  estimatedTokens?: number;
  userAgent?: string;
  ipAddress?: string;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface UserPolicy {
  userId: string;
  allowedModels: string[];
  deniedModels: string[];
  maxCostPerDay: number;
  maxRequestsPerMinute: number;
  capabilities: Capability[];
  customRules: PolicyRule[];
}

export interface PolicyRule {
  id: string;
  condition: PolicyCondition;
  action: 'allow' | 'deny' | 'modify';
  params?: Record<string, unknown>;
}
```

---

### FASE 4: Services (Semanas 9-10)

**Objetivo:** Implementar AccountManager y API Key Connector

#### AccountManager:

```typescript
// services/account-manager.ts
export class AccountManager implements IAccountManager {
  constructor(
    private config: AccountManagerConfig,
    private credentialStore: ICredentialStore,
    private sessionManager: ISessionManager,
  ) {}
  
  // Credential Management
  async storeCredential(
    userId: string,
    provider: string,
    credential: Credential
  ): Promise<void> {
    // Encrypt and store
    const encrypted = this.encrypt(credential);
    await this.credentialStore.set(userId, provider, encrypted);
  }
  
  async getCredential(
    userId: string,
    provider: string
  ): Promise<Credential | null> {
    const encrypted = await this.credentialStore.get(userId, provider);
    return encrypted ? this.decrypt(encrypted) : null;
  }
  
  // OAuth Flow
  async initiateOAuth(
    userId: string,
    provider: string,
    scopes: string[]
  ): Promise<OAuthInitiateResult> {
    const authUrl = this.buildAuthUrl(provider, scopes);
    const state = this.generateState(userId, provider);
    await this.sessionManager.setPendingAuth(state, { userId, provider, scopes });
    return { authUrl, state };
  }
  
  async completeOAuth(
    code: string,
    state: string
  ): Promise<OAuthCompleteResult> {
    const pending = await this.sessionManager.getPendingAuth(state);
    const tokens = await this.exchangeCode(provider, code);
    await this.storeCredential(pending.userId, pending.provider, tokens);
    return { success: true };
  }
  
  // Session Management
  async refreshSession(userId: string, provider: string): Promise<boolean> {
    const credential = await this.getCredential(userId, provider);
    if (!credential.refreshToken) return false;
    
    try {
      const newTokens = await this.refreshTokens(provider, credential.refreshToken);
      await this.storeCredential(userId, provider, newTokens);
      return true;
    } catch {
      return false;
    }
  }
}
```

#### API Key Connector:

```typescript
// services/api-key-connector.ts
export class APIKeyConnector implements IAPIKeyConnector {
  constructor(
    private apiKeyServiceUrl: string,
    private httpClient: HttpClient,
    private cache: ICache,
  ) {}
  
  async getCredentials(provider: string): Promise<Credentials> {
    // 1. Check cache
    const cached = await this.cache.get(`apikey:${provider}`);
    if (cached) return cached;
    
    // 2. Fetch from API Key Service
    const response = await this.httpClient.get(
      `${this.apiKeyServiceUrl}/api/v1/keys/available`,
      { params: { provider } }
    );
    
    // 3. Cache result
    await this.cache.set(
      `apikey:${provider}`,
      response.data,
      { ttl: 60 } // 1 minute
    );
    
    return response.data;
  }
  
  async reportUsage(
    keyId: string,
    usage: UsageReport
  ): Promise<void> {
    await this.httpClient.post(
      `${this.apiKeyServiceUrl}/api/v1/keys/${keyId}/usage`,
      usage
    );
  }
  
  async reportHealth(
    keyId: string,
    status: 'healthy' | 'rate_limited' | 'invalid' | 'exhausted'
  ): Promise<void> {
    await this.httpClient.post(
      `${this.apiKeyServiceUrl}/api/v1/keys/${keyId}/health`,
      { status }
    );
  }
}
```

---

### FASE 5: Request Executor (Semanas 11-12)

**Objetivo:** Orquestar todos los componentes

```typescript
// executor/request-executor.ts
export class RequestExecutor {
  constructor(
    private policyEngine: IPolicyEngine,
    private providerRegistry: IProviderRegistry,
    private accountManager: IAccountManager,
    private eventBus: IEventBus,
    private metrics: IMetricsCollector,
  ) {}
  
  async execute(request: GatewayRequest): Promise<GatewayResponse> {
    const startTime = Date.now();
    
    try {
      // 1. Policy checks
      this.eventBus.emit('request.started', { requestId: request.id });
      
      const capResult = await this.policyEngine.checkCapability(request);
      if (!capResult.allowed) {
        throw new PolicyViolationError(capResult.reason!);
      }
      
      const costResult = await this.policyEngine.checkCost(request);
      if (!costResult.allowed) {
        throw new InsufficientBalanceError(costResult.reason!);
      }
      
      const rateResult = await this.policyEngine.checkRateLimit(request);
      if (!rateResult.allowed) {
        throw new RateLimitError(rateResult.reason!, rateResult.resetAt);
      }
      
      // 2. Select provider
      const providerId = await this.selectProvider(request);
      const provider = this.providerRegistry.get(providerId);
      const adapter = this.getAdapter(providerId);
      
      // 3. Get credentials
      const credentials = await this.accountManager.getCredentials(providerId);
      
      // 4. Execute with retry
      const response = await this.executeWithRetry(
        provider,
        adapter,
        credentials,
        request,
      );
      
      // 5. Record metrics
      await this.recordMetrics(request, response, startTime);
      
      this.eventBus.emit('request.completed', { 
        requestId: request.id, 
        providerId,
        latency: Date.now() - startTime,
      });
      
      return response;
      
    } catch (error) {
      await this.handleError(error, request, startTime);
      throw error;
    }
  }
  
  private async selectProvider(request: GatewayRequest): Promise<string> {
    // 1. Try preferred provider
    if (request.preferredProvider) {
      const health = await this.providerRegistry.get(request.preferredProvider)
        ?.getHealth();
      if (health?.status === 'healthy') {
        return request.preferredProvider;
      }
    }
    
    // 2. Find by capabilities
    const candidates = this.providerRegistry.findByCapabilities(
      request.requiredCapabilities
    );
    
    // 3. Score and select
    const scored = await this.scoreCandidates(candidates, request);
    const selected = scored[0];
    
    if (!selected) {
      throw new NoProviderAvailableError();
    }
    
    return selected.id;
  }
  
  private async executeWithRetry(
    provider: IProvider,
    adapter: IAdapter,
    credentials: Credentials,
    request: GatewayRequest,
    maxRetries: number = 3
  ): Promise<GatewayResponse> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await provider.complete(request);
      } catch (error) {
        lastError = error as Error;
        
        if (this.isRetryableError(error)) {
          // Exponential backoff
          await this.delay(Math.pow(2, attempt) * 100);
          
          // Try fallback provider
          const fallback = await this.policyEngine.selectFallback(
            request, 
            provider.id
          );
          if (fallback) {
            return this.executeWithRetry(
              this.providerRegistry.get(fallback)!,
              this.getAdapter(fallback),
              credentials,
              request,
              maxRetries - attempt - 1
            );
          }
        } else {
          throw error;
        }
      }
    }
    
    throw lastError!;
  }
}
```

---

### FASE 6: API Layer & Integration (Semanas 13-14)

**Objetivo:** Exponer la funcionalidad via API e integrar con LibreChat

```typescript
// api/gateway.routes.ts
export function createGatewayRouter(executor: RequestExecutor) {
  const router = express.Router();
  
  // POST /v1/chat/completions
  router.post('/chat/completions', async (req, res) => {
    try {
      const request = mapToGatewayRequest(req.body);
      const response = await executor.execute(request);
      
      if (request.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event.json(mapToOpenAIResponse(response));
      }
    } catch (error) {
      handleError(error, res);
    }
  });
  
  // GET /v1/models
  router.get('/models', async (req, res) => {
    const models = await executor.listModels();
    res.json({ object: 'list', data: models });
  });
  
  // GET /health
  router.get('/health', async (req, res) => {
    const health = await executor.getHealth();
    res.json(health);
  });
  
  return router;
}
```

---

## 6. INTERFACES Y CONTRATOS

### 6.1 Interface IProvider

```typescript
// packages/gateway/src/types/i-provider.ts

export type ProviderType = 
  | 'openai' 
  | 'anthropic' 
  | 'google' 
  | 'groq'
  | 'deepseek'
  | 'litellm'
  | 'freeclaudecode'
  | 'custom';

export type ProviderStatus = 'healthy' | 'degraded' | 'unhealthy' | 'disabled';

export interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  audio: boolean;
  jsonMode: boolean;
}

export interface ProviderHealth {
  status: ProviderStatus;
  latencyMs: number;
  errorRate: number;
  lastChecked: Date;
  issues?: string[];
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey?: string;
  options?: Record<string, unknown>;
}

export interface IProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  readonly capabilities: ProviderCapabilities;
  
  initialize(config: ProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  
  getHealth(): Promise<ProviderHealth>;
  getModels(): Promise<IModel[]>;
  
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<LLMStreamEvent>;
}

export interface LLMRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
  tools?: Tool[];
}

export interface LLMResponse {
  id: string;
  model: string;
  choices: Choice[];
  usage: Usage;
  created: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  toolCallId?: string;
}

export interface Choice {
  index: number;
  message: Message;
  finishReason: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type ContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image'; image: string | { url: string } };
```

### 6.2 Interface IPolicy

```typescript
// packages/gateway/src/types/i-policy.ts

export type Capability = 
  | 'chat'
  | 'code'
  | 'vision'
  | 'audio'
  | 'translation'
  | 'reasoning'
  | 'tools'
  | 'long-context';

export interface PolicyRequest {
  userId: string;
  model: string;
  capabilities: Capability[];
  estimatedTokens?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface UserPolicy {
  userId: string;
  allowedModels: string[];
  deniedModels: string[];
  allowedCapabilities: Capability[];
  maxCostPerDay: number;
  maxRequestsPerMinute: number;
  maxTokensPerDay: number;
  customRules: PolicyRule[];
}

export interface PolicyRule {
  id: string;
  type: 'model' | 'capability' | 'time' | 'ip' | 'custom';
  condition: PolicyCondition;
  action: 'allow' | 'deny' | 'modify';
  parameters?: Record<string, unknown>;
}

export interface PolicyCondition {
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'notIn' | 'regex';
  field: string;
  value: unknown;
}

export interface IPolicyEngine {
  checkCapability(request: PolicyRequest): Promise<PolicyResult>;
  checkCost(request: PolicyRequest): Promise<PolicyResult>;
  checkRateLimit(request: PolicyRequest): Promise<PolicyResult>;
  selectFallback(request: PolicyRequest, failedProvider: string): Promise<string | null>;
  evaluateRules(userPolicy: UserPolicy, request: PolicyRequest): PolicyResult;
}
```

### 6.3 Interface IEvent

```typescript
// packages/gateway/src/types/i-event.ts

export type EventType = 
  | 'request.started'
  | 'request.completed'
  | 'request.failed'
  | 'request.routing'
  | 'provider.health_changed'
  | 'provider.error'
  | 'quota.warning'
  | 'quota.exceeded'
  | 'user.policy_changed'
  | 'model.added'
  | 'model.removed';

export interface GatewayEvent<T = unknown> {
  type: EventType;
  timestamp: Date;
  payload: T;
  metadata?: EventMetadata;
}

export interface EventMetadata {
  requestId?: string;
  userId?: string;
  providerId?: string;
  modelId?: string;
}

export type EventHandler<T = unknown> = (event: GatewayEvent<T>) => void | Promise<void>;

export interface IEventBus {
  emit<T = unknown>(type: EventType, payload: T, metadata?: EventMetadata): void;
  on<T = unknown>(type: EventType, handler: EventHandler<T>): void;
  off<T = unknown>(type: EventType, handler: EventHandler<T>): void;
  once<T = unknown>(type: EventType, handler: EventHandler<T>): void;
  
  // Pub/Sub (for distributed)
  publish(channel: string, event: GatewayEvent): Promise<void>;
  subscribe(channel: string, handler: EventHandler): Promise<void>;
}
```

---

## 7. HERRAMIENTAS Y UTILIDADES

### 7.1 Retry Logic

```typescript
// packages/gateway/src/utils/retry.ts

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: (error: Error) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: (e) => {
    if (e instanceof ProviderError) {
      return e.statusCode >= 500 || e.statusCode === 429;
    }
    return false;
  },
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === opts.maxAttempts - 1) break;
      
      if (opts.retryableErrors && !opts.retryableErrors(lastError)) {
        throw lastError;
      }
      
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs
      );
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}
```

### 7.2 Configuration Loader

```typescript
// packages/gateway/src/utils/config.ts

export interface GatewayConfig {
  providers: ProviderConfig[];
  policies: PolicyConfig;
  logging: LoggingConfig;
  cache: CacheConfig;
  metrics: MetricsConfig;
}

export function loadConfig(): GatewayConfig {
  // Load from environment variables with defaults
  return {
    providers: parseProvidersConfig(process.env.PROVIDERS),
    policies: parsePolicyConfig(process.env.POLICIES),
    logging: {
      level: process.env.LOG_LEVEL ?? 'info',
      format: process.env.LOG_FORMAT ?? 'json',
    },
    cache: {
      provider: process.env.CACHE_PROVIDER ?? 'memory',
      redisUrl: process.env.REDIS_URL,
      ttl: parseInt(process.env.CACHE_TTL ?? '60', 10),
    },
    metrics: {
      enabled: process.env.METRICS_ENABLED === 'true',
      port: parseInt(process.env.METRICS_PORT ?? '9090', 10),
    },
  };
}
```

### 7.3 Logger

```typescript
// packages/gateway/src/utils/logger.ts

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Redact sensitive data
  redact: {
    paths: [
      'req.headers.authorization',
      'apiKey',
      'password',
      'token',
    ],
    censor: '[REDACTED]',
  },
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
```

---

## 8. TESTING STRATEGY

### 8.1 Testing Pyramid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TESTING PYRAMID                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                    ▲                                        │
│                                   ╱ ╲                                       │
│                                  ╱   ╲                                      │
│                                 ╱     ╲                                     │
│                                ╱       ╲                                    │
│                               ╱         ╲                                   │
│                              ╱           ╲                                  │
│                             ╱             ╲                                 │
│                            ╱───────────────╲                                │
│                                                                             │
│  ████████████████████████████████████████████████████████████                │
│  █                                                              █            │
│  █   E2E TESTS (10%)                                            █            │
│  █   - Full request flow                                        █            │
│  █   - Integration with real providers (mocked)                 █            │
│  █                                                              █            │
│  ████████████████████████████████████████████████████████████                │
│  █                                                              █            │
│  █   INTEGRATION TESTS (30%)                                   █            │
│  █   - ProviderRegistry + Provider                             █            │
│  █   - PolicyEngine + UserPolicyStore                          █            │
│  █   - EventBus + Redis                                        █            │
│  █                                                              █            │
│  ████████████████████████████████████████████████████████████                │
│  █                                                              █            │
│  █   UNIT TESTS (60%)                                         █            │
│  █   - Each class/method in isolation                          █            │
│  █   - Mocks for dependencies                                   █            │
│  █                                                              █            │
│  ████████████████████████████████████████████████████████████                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Unit Test Example

```typescript
// packages/gateway/tests/unit/policy-engine.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyEngine } from '../../src/policy/policy-engine';
import type { IUserPolicyStore, IProviderRegistry, IMetricsStore } from '../../src/types';

describe('PolicyEngine', () => {
  let policyEngine: PolicyEngine;
  let mockUserPolicyStore: IUserPolicyStore;
  let mockProviderRegistry: IProviderRegistry;
  let mockMetricsStore: IMetricsStore;
  
  beforeEach(() => {
    mockUserPolicyStore = {
      get: vi.fn().mockResolvedValue({
        allowedModels: ['gpt-4', 'claude-3'],
        maxCostPerDay: 100,
        maxRequestsPerMinute: 60,
      }),
    };
    
    mockProviderRegistry = {
      findByCapabilities: vi.fn().mockReturnValue([
        { id: 'openai', getHealth: () => ({ status: 'healthy' }) },
      ]),
    };
    
    mockMetricsStore = {
      getUserBalance: vi.fn().mockResolvedValue(50),
      estimateCost: vi.fn().mockReturnValue(0.01),
    };
    
    policyEngine = new PolicyEngine({
      userPolicyStore: mockUserPolicyStore,
      providerRegistry: mockProviderRegistry,
      metricsStore: mockMetricsStore,
    });
  });
  
  describe('checkCapability', () => {
    it('should allow request when model is permitted', async () => {
      const result = await policyEngine.checkCapability({
        userId: 'user-1',
        model: 'gpt-4',
        capabilities: ['chat'],
      });
      
      expect(result.allowed).toBe(true);
    });
    
    it('should deny request when model is not permitted', async () => {
      const result = await policyEngine.checkCapability({
        userId: 'user-1',
        model: 'gpt-5', // Not in allowed list
        capabilities: ['chat'],
      });
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted');
    });
  });
  
  describe('checkCost', () => {
    it('should allow request when user has sufficient balance', async () => {
      const result = await policyEngine.checkCost({
        userId: 'user-1',
        model: 'gpt-4',
        capabilities: [],
      });
      
      expect(result.allowed).toBe(true);
    });
    
    it('should deny request when balance is insufficient', async () => {
      mockMetricsStore.getUserBalance = vi.fn().mockResolvedValue(0.001);
      
      const result = await policyEngine.checkCost({
        userId: 'user-1',
        model: 'gpt-4',
        capabilities: [],
      });
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient balance');
    });
  });
});
```

---

## 9. DOCUMENTACIÓN REQUERIDA

### 9.1 Documentos ADR (Architecture Decision Records)

| ID | Título | Estado |
|----|--------|--------|
| ADR-001 | Usar TypeScript para todo el código | ✅ Aprobado |
| ADR-002 | Arquitectura basada en interfaces | ✅ Aprobado |
| ADR-003 | LiteLLM como adapter principal | ✅ Aprobado |
| ADR-004 | Redis para EventBus distribuido | ✅ Aprobado |
| ADR-005 | PolicyEngine centralizado | ⏳ Pendiente |
| ADR-006 | Plugin system basado en discovery | ⏳ Pendiente |
| ADR-007 | Métricas con Prometheus | ⏳ Pendiente |

### 9.2 Documentación de API

```typescript
/**
 * @route POST /v1/chat/completions
 * @description Generate a chat completion
 * @body { model: string, messages: Message[], temperature?: number }
 * @returns { id: string, choices: Choice[], usage: Usage }
 * @errors 400 Bad Request, 401 Unauthorized, 403 Forbidden, 429 Rate Limited, 500 Internal Error
 */
```

---

## 10. RIESGOS Y MITIGACIONES

### 10.1 Matriz de Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Complejidad excesiva | Alta | Alta | Empezar simple, iterar |
| Dependencias externas fallan | Media | Alta | Retry logic, fallbacks |
| Breaking changes en LiteLLM | Baja | Alta | Version pinning, adapters isolation |
| Performance bottlenecks | Media | Media | Profiling temprano, caching |
| Testing incompleto | Media | Alta | TDD, coverage gates |
| Documentación desactualizada | Alta | Media | Docs as code, automated generation |

### 10.2 Plan de Mitigación

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MITIGATION PLAN                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  RIESGO: Complejidad excesiva                                              │
│  ─────────────────────────────────────                                     │
│  MITIGACIÓN:                                                               │
│  • Semanas 1-2: Solo interfaces y EventBus                                 │
│  • No agregar features hasta que lo básico funcione                        │
│  • Code review obligatorio para cada PR                                    │
│  • Documentation review semanal                                            │
│                                                                             │
│  RIESGO: Dependencias externas                                              │
│  ─────────────────────────────────────                                     │
│  MITIGACIÓN:                                                               │
│  • Retry logic con exponential backoff                                     │
│  • Fallback providers configurables                                        │
│  • Health checks proactivos                                                │
│  • Circuit breaker pattern                                                 │
│                                                                             │
│  RIESGO: Breaking changes en LiteLLM                                       │
│  ─────────────────────────────────────                                     │
│  MITIGACIÓN:                                                               │
│  • Semantic versioning estricto                                            │
│  • Adapter isolation (los cambios de LiteLLM no afectan al core)          │
│  • Tests de контракт con mocks                                            │
│  • Changelog detallado                                                     │
│                                                                             │
│  RIESGO: Performance bottlenecks                                            │
│  ─────────────────────────────────────                                     │
│  MITIGACIÓN:                                                               │
│  • Profiling en Week 2                                                     │
│  • Benchmarks en CI                                                       │
│  • Redis caching para requests frecuentes                                   │
│  • Connection pooling                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## RESUMEN EJECUTIVO

### Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TIMELINE (14 semanas)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Semana 1-2:   ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  FASE 0    │
│  Semana 3-4:   ░░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  FASE 1    │
│  Semana 5-6:   ░░░░░░░░░░░░░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░  FASE 2    │
│  Semana 7-8:   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████░░░░░░░░░  FASE 3    │
│  Semana 9-10:  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████  FASE 4    │
│  Semana 11-12: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  FASE 5    │
│  Semana 13-14: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  FASE 6    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Equipo Recomendado

| Rol | Semanas | Responsabilidad |
|-----|---------|-----------------|
| Tech Lead | 14 | Arquitectura, code review |
| Senior Dev | 14 | Implementación core |
| Mid Dev | 10 | Adapters, services |
| QA | 6 | Testing, integration |

### Costo Estimado

| Recurso | Costo |
|---------|-------|
| Compute (dev/staging/prod) | $X/mes |
| Monitoring (Prometheus/Grafana) | $Y/mes |
| Development | 3 devs x 14 semanas |

---

*Documento creado por OpenHands AI Agent*
*Para validación antes de implementación*
