# 📅 Plan de Implementación por Fases
## Sistema Multi-LLM Profesional - Roadmap Detallado

**Fecha:** 2026-07-21
**Versión:** 1.0
**Autor:** OpenHands Agent

---

## TABLA DE CONTENIDOS

1. [Resumen del Plan](#1-resumen-del-plan)
2. [Fase 1: Provider Registry](#2-fase-1-provider-registry)
3. [Fase 2: Capability Router](#3-fase-2-capability-router)
4. [Fase 3: Policy Engine](#4-fase-3-policy-engine)
5. [Fase 4: Account Manager](#5-fase-4-account-manager)
6. [Fase 5: Token Manager](#6-fase-5-token-manager)
7. [Fase 6: API Key Manager](#7-fase-6-api-key-manager)
8. [Fase 7: Free Claude Code](#8-fase-7-free-claude-code)
9. [Fase 8: Dashboard](#9-fase-8-dashboard)
10. [Criterios de Éxito](#10-criterios-de-éxito)

---

## 1. RESUMEN DEL PLAN

### 1.1 Duración Total

**16 semanas** (4 meses)

### 1.2 Fases

| Fase | Nombre | Semanas | Objetivo |
|------|--------|---------|----------|
| 0 | Preparación | 2 | Infraestructura |
| 1 | Provider Registry | 2 | Registro centralizado |
| 2 | Capability Router | 2 | Routing por capacidades |
| 3 | Policy Engine | 2 | Reglas centralizadas |
| 4 | Account Manager | 2 | Gestión de cuentas |
| 5 | Token Manager | 2 | Control de cuotas |
| 6 | API Key Manager | 2 | Unificación |
| 7 | Free Claude Code | 2 | Provider adicional |
| 8 | Dashboard | 2 | Visualización |
| 9 | Estabilización | 2 | QA y polish |

### 1.3 Equipo Recomendado

| Rol | Cantidad | Responsabilidad |
|-----|----------|-----------------|
| Backend Engineer | 2 | Desarrollo de componentes |
| Tech Lead | 1 | Arquitectura y code review |
| DevOps | 1 | Infraestructura y deploy |
| QA | 1 | Testing y validación |

---

## 2. FASE 1: PROVIDER REGISTRY

**Duración:** 2 semanas
**Objetivo:** Crear registro centralizado de proveedores

### 2.1 Entregables

```
api/server/services/ProviderRegistry/
├── ProviderRegistry.ts           # Clase principal
├── Provider.ts                  # Modelo de datos
├── Model.ts                    # Modelo de datos
├── interfaces/
│   ├── IProviderRegistry.ts    # Interfaz pública
│   └── IProviderAdapter.ts     # Interfaz de adapters
├── adapters/
│   └── LiteLLMAdapter.ts       # Adapter para LiteLLM
└── index.ts                   # Exports
```

### 2.2 Estructura de Datos

```typescript
// Provider
interface Provider {
  id: string;                    // "groq"
  name: string;                  // "Groq"
  displayName: string;          // "Groq (Free Tier)"
  capabilities: Capability[];     // ["llm.chat", "llm.reasoning"]
  models: Model[];              // Modelos disponibles
  authType: AuthType;          // "api_key"
  config: ProviderConfig;       // { apiBase: "..." }
  priority: number;             // 1-100
  weight: number;              // 0-1 para balanceo
  status: ProviderStatus;       // "active"
}

// Model
interface Model {
  id: string;                    // "llama-3.3-70b-versatile"
  providerId: string;          // "groq"
  name: string;                 // "Llama 3.3 70B"
  capabilities: Capability[];   // ["llm.chat"]
  contextWindow: number;        // 131072
  cost: {
    inputPer1M: number;       // 0.59
    outputPer1M: number;       // 0.79
  };
  latency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  status: 'active' | 'deprecated' | 'new';
}
```

### 2.3 Tareas Técnicas

| # | Tarea | Tiempo | Dependencias |
|---|-------|--------|--------------|
| 1.1 | Crear estructura de directorios | 1h | - |
| 1.2 | Definir interfaces TypeScript | 4h | - |
| 1.3 | Implementar ProviderRegistry class | 8h | 1.2 |
| 1.4 | Implementar Provider y Model types | 4h | 1.2 |
| 1.5 | Crear seed data para providers existentes | 4h | 1.3 |
| 1.6 | Implementar LiteLLMAdapter | 8h | 1.3 |
| 1.7 | Escribir tests unitarios | 8h | 1.6 |
| 1.8 | Escribir tests de integración | 8h | 1.7 |
| 1.9 | Documentar API | 4h | 1.6 |

### 2.4 Criterios de Éxito

- [ ] `ProviderRegistry` es instanciable
- [ ] Providers se cargan desde configuración
- [ ] `findByCapabilities()` retorna providers correctos
- [ ] `getModels()` retorna modelos de provider
- [ ] Tests unitarios: > 90% coverage
- [ ] Tests de integración: pasan 100%

### 2.5 API del Componente

```typescript
// usage
const registry = new ProviderRegistry(config);
await registry.initialize();

const providers = registry.findByCapabilities([Capability.LLM_CHAT]);
const provider = registry.get('groq');
const models = registry.getModels('groq');
```

---

## 3. FASE 2: CAPABILITY ROUTER

**Duración:** 2 semanas
**Objetivo:** Routing basado en capacidades en lugar de nombres

### 3.1 Ubicación

```
api/server/services/CapabilityRouter/
├── CapabilityRouter.ts          # Clase principal
├── Capability.ts                # Enum de capabilities
├── CapabilityMatcher.ts         # Lógica de matching
├── RoutingDecision.ts           # Tipo de decisión
├── tests/
│   ├── CapabilityRouter.test.ts
│   └── CapabilityMatcher.test.ts
└── index.ts
```

### 3.2 Capabilities Predefinidas

```typescript
enum Capability {
  // LLM Core
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
  
  // Media
  IMAGE_GENERATION = 'media.image_generation',
  IMAGE_EDITING = 'media.image_editing',
  VIDEO_GENERATION = 'media.video_generation',
  AUDIO_TTS = 'media.tts',
  AUDIO_STT = 'media.stt',
  
  // Search
  WEB_SEARCH = 'search.web',
  DOCUMENT_SEARCH = 'search.document',
  
  // RAG
  RAG_RETRIEVAL = 'rag.retrieval',
  RAG_EMBEDDING = 'rag.embedding',
}
```

### 3.3 Tareas Técnicas

| # | Tarea | Tiempo | Dependencias |
|---|-------|--------|--------------|
| 2.1 | Extender enum Capability | 2h | F1 |
| 2.2 | Implementar CapabilityMatcher | 8h | 2.1 |
| 2.3 | Implementar RoutingDecision | 4h | 2.1 |
| 2.4 | Extender CapabilityRouter existente | 16h | 2.2, 2.3 |
| 2.5 | Integrar con ProviderRegistry | 8h | 2.4, F1 |
| 2.6 | Implementar fallback chain | 8h | 2.5 |
| 2.7 | Tests unitarios | 8h | 2.6 |
| 2.8 | Tests de integración | 8h | 2.7 |

### 3.4 Criterios de Éxito

- [ ] Routing por capabilities funciona
- [ ] Fallback automático entre providers
- [ ] Integración con ProviderRegistry
- [ ] Soporta múltiples capabilities
- [ ] Score calculation correcto

---

## 4. FASE 3: POLICY ENGINE

**Duración:** 2 semanas
**Objetivo:** Centralizar reglas de negocio

### 4.1 Ubicación

```
api/server/services/PolicyEngine/
├── PolicyEngine.ts              # Clase principal
├── PolicyRule.ts                # Modelo de regla
├── PolicyContext.ts             # Contexto de evaluación
├── PolicyDecision.ts            # Decisión tomada
├── rules/
│   ├── PriorityRule.ts
│   ├── CostRule.ts
│   ├── LatencyRule.ts
│   ├── QuotaRule.ts
│   └── FallbackRule.ts
├── tests/
└── index.ts
```

### 4.2 Estructura de Reglas

```typescript
// PolicyRule
interface PolicyRule {
  id: string;
  name: string;
  type: PolicyType;
  description: string;
  enabled: boolean;
  priority: number;  // Mayor = más importante
  condition: (context: PolicyContext) => boolean;
  action: PolicyAction;
}

// PolicyContext
interface PolicyContext {
  userId: string;
  userTier: 'free' | 'paid' | 'enterprise';
  projectId?: string;
  capabilities: Capability[];
  estimatedCost: number;
  estimatedLatency: number;
  providerId?: string;
  modelId?: string;
}

// PolicyAction
interface PolicyAction {
  allow?: boolean;
  maxCost?: number;
  maxLatency?: number;
  allowedProviders?: string[];
  deniedProviders?: string[];
  fallbackOrder?: string[];
  quotaOverride?: number;
}
```

### 4.3 Ejemplo de Reglas

```typescript
// Regla: Solo providers gratuitos para free tier
const freeTierRule: PolicyRule = {
  id: 'free-tier-providers',
  name: 'Free Tier Providers Only',
  type: 'priority',
  priority: 100,
  condition: (ctx) => ctx.userTier === 'free',
  action: {
    allowedProviders: ['groq', 'openrouter', 'fcc', 'deepseek'],
  }
};

// Regla: Coste máximo por request
const maxCostRule: PolicyRule = {
  id: 'max-cost',
  name: 'Maximum Cost Per Request',
  type: 'cost',
  priority: 50,
  condition: (ctx) => ctx.userTier === 'free',
  action: {
    maxCost: 0.001, // $0.001 max
  }
};

// Regla: Latencia máxima
const latencyRule: PolicyRule = {
  id: 'max-latency',
  name: 'Maximum Latency',
  type: 'latency',
  priority: 30,
  condition: (ctx) => ctx.userTier === 'free',
  action: {
    maxLatency: 2000, // 2 segundos
  }
};
```

### 4.4 Tareas Técnicas

| # | Tarea | Tiempo | Dependencias |
|---|-------|--------|--------------|
| 3.1 | Crear estructura PolicyEngine | 4h | - |
| 3.2 | Implementar PolicyRule y tipos | 8h | 3.1 |
| 3.3 | Implementar PolicyContext | 4h | 3.2 |
| 3.4 | Implementar rule evaluation engine | 12h | 3.3 |
| 3.5 | Implementar PriorityRule | 8h | 3.4 |
| 3.6 | Implementar CostRule | 8h | 3.4 |
| 3.7 | Implementar LatencyRule | 8h | 3.4 |
| 3.8 | Implementar QuotaRule | 8h | 3.4 |
| 3.9 | Migrar reglas existentes | 8h | 3.5-3.8 |
| 3.10 | Tests y documentación | 12h | 3.9 |

### 4.5 Criterios de Éxito

- [ ] PolicyEngine evalúa contexto
- [ ] Todas las rule types funcionan
- [ ] Migración de reglas legacy completa
- [ ] Performance: < 10ms por evaluación

---

## 5. FASE 4: ACCOUNT MANAGER

**Duración:** 2 semanas
**Objetivo:** Abstraer gestión de cuentas de providers

### 5.1 Ubicación

```
api/server/services/AccountManager/
├── AccountManager.ts            # Clase principal
├── Account.ts                  # Modelo de cuenta
├── Credentials.ts              # Tipos de credenciales
├── AuthStrategy.ts             # Estrategias de auth
├── strategies/
│   ├── APIKeyStrategy.ts
│   ├── OAuthStrategy.ts
│   ├── JWTStrategy.ts
│   └── BrowserSessionStrategy.ts
├── tests/
└── index.ts
```

### 5.2 Tipos de Cuenta

```typescript
// Account
interface Account {
  id: string;
  providerId: string;
  authType: AuthType;
  label?: string;
  isDefault: boolean;
  credentials: EncryptedCredentials;
  organizationId?: string;
  isActive: boolean;
  lastVerified?: Date;
  expiresAt?: Date;
  metadata: Record<string, unknown>;
}

// AuthType
type AuthType = 
  | 'api_key' 
  | 'oauth' 
  | 'jwt' 
  | 'cookie' 
  | 'browser_session' 
  | 'refresh_token';

// Credentials
type EncryptedCredentials = {
  encrypted: string;  // AES-256 encrypted
  iv: string;
};

// OAuth specific
interface OAuthCredentials extends EncryptedCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}
```

### 5.3 Tareas Técnicas

| # | Tarea | Tiempo | Dependencias |
|---|-------|--------|--------------|
| 4.1 | Crear estructura AccountManager | 4h | - |
| 4.2 | Implementar Account y tipos | 8h | 4.1 |
| 4.3 | Implementar AuthStrategy interface | 8h | 4.2 |
| 4.4 | Implementar APIKeyStrategy | 8h | 4.3 |
| 4.5 | Implementar OAuthStrategy | 16h | 4.3 |
| 4.6 | Implementar BrowserSessionStrategy | 16h | 4.3 |
| 4.7 | Implementar AccountManager principal | 12h | 4.4-4.6 |
| 4.8 | Tests | 16h | 4.7 |

### 5.4 Criterios de Éxito

- [ ] Múltiples cuentas por provider
- [ ] Refresh token automático para OAuth
- [ ] Session renewal para browser sessions
- [ ] Fallback entre cuentas

---

## 6. FASE 5: TOKEN MANAGER

**Duración:** 2 semanas
**Objetivo:** Control centralizado de consumo de tokens

### 6.1 Ubicación

```
api/server/services/TokenManager/
├── TokenManager.ts             # Clase principal
├── UsageDimensions.ts           # Dimensiones de tracking
├── QuotaStatus.ts              # Estado de cuota
├── CostEstimator.ts            # Estimador de costes
├── UsageTracker.ts             # Tracker de uso
├── alerts/
│   └── QuotaAlertService.ts    # Servicio de alertas
├── tests/
└── index.ts
```

### 6.2 Estructuras

```typescript
// UsageDimensions
interface UsageDimensions {
  conversationId?: string;
  userId?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  date?: Date;
}

// QuotaStatus
interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  isNearLimit: boolean;  // > 80%
  isExceeded: boolean;    // > 100%
  resetAt?: Date;
}

// CostEstimate
interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD';
}
```

### 6.3 Tareas Técnicas

| # | Tarea | Tiempo | Dependencias |
|---|-------|--------|--------------|
| 5.1 | Crear estructura TokenManager | 4h | - |
| 5.2 | Implementar UsageDimensions | 4h | 5.1 |
| 5.3 | Implementar QuotaStatus | 4h | 5.2 |
| 5.4 | Implementar CostEstimator | 8h | 5.3, F1 |
| 5.5 | Implementar UsageTracker | 12h | 5.4 |
| 5.6 | Implementar QuotaAlertService | 8h | 5.5 |
| 5.7 | Integrar con ProviderRegistry | 8h | 5.6, F1 |
| 5.8 | Tests y load testing | 12h | 5.7 |

### 6.4 Criterios de Éxito

- [ ] Tracking por todas las dimensiones
- [ ] Predicción de agotamiento
- [ ] Alertas proactivas (80% umbral)
- [ ] Estimación de coste precisa

---

## 7. FASE 6: API KEY MANAGER

**Duración:** 2 semanas
**Objetivo:** Unificar gestión de credenciales

### 7.1 Ubicación

```
api/server/services/APIKeyManager/
├── APIKeyManager.ts            # Clase principal
├── APIKey.ts                   # Modelo de API key
├── KeyHealth.ts                # Estado de salud
├── KeyRotation.ts              # Rotación automática
├── tests/
└── index.ts
```

### 7.2 Mejoras sobre Existente

| Feature | Estado Actual | Estado Nuevo |
|---------|--------------|--------------|
| Encryption | ✅ AES-256 | Mantener |
| Health checks | ✅ Básico | Mejorado |
| Audit log | 🟡 Parcial | Completo |
| Key balancing | ❌ No | Implementar |
| Auto-reactivation | ❌ No | Implementar |
| Multi-org | ❌ No | Implementar |

### 7.3 Tareas Técnicas

| # | Tarea | Tiempo | Dependencias |
|---|-------|--------|--------------|
| 6.1 | Analizar código existente | 8h | - |
| 6.2 | Extender APIKey model | 8h | 6.1 |
| 6.3 | Implementar KeyHealth mejorado | 12h | 6.2 |
| 6.4 | Implementar KeyRotation | 16h | 6.3 |
| 6.5 | Implementar KeyBalancing | 12h | 6.4 |
| 6.6 | Implementar AutoReactivation | 8h | 6.5 |
| 6.7 | Implementar audit log completo | 12h | 6.6 |
| 6.8 | API REST completa | 8h | 6.7 |
| 6.9 | Tests y documentación | 16h | 6.8 |

### 7.4 Criterios de Éxito

- [ ] Keys nunca expuestas en logs
- [ ] Rotación automática funcional
- [ ] Balanceo entre keys activo
- [ ] Auditoría completa

---

## 8. FASE 7: FREE CLAUDE CODE

**Duración:** 2 semanas
**Objetivo:** Integrar FCC como provider estándar

### 8.1 Ubicación

```
api/server/services/Providers/
├── FreeClaudeCodeAdapter.ts    # Adapter principal
├── FCCModels.ts                # Catálogo de modelos
├── FCCConfig.ts               # Configuración
├── tests/
│   ├── FreeClaudeCodeAdapter.test.ts
│   └── FCCModels.test.ts
└── index.ts
```

### 8.2 Estructura del Adapter

```typescript
// FreeClaudeCodeAdapter
class FreeClaudeCodeAdapter implements ProviderAdapter {
  constructor(private config: FCCConfig) {}
  
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const fccRequest = this.toFCCFormat(request);
    const response = await this.callFCC(fccRequest);
    return this.fromFCCFormat(response);
  }
  
  async *stream(request: LLMRequest): AsyncIterable<LLMResponse> {
    const fccRequest = this.toFCCFormat(request);
    for await (const chunk of this.callFCCStream(fccRequest)) {
      yield this.fromFCCFormat(chunk);
    }
  }
  
  private toFCCFormat(request: LLMRequest): FCCRequest {
    return {
      model: this.selectModel(request.capabilities),
      messages: request.messages,
      stream: request.stream,
    };
  }
  
  private fromFCCFormat(response: FCCResponse): LLMResponse {
    return {
      message: response.content,
      usage: response.usage,
      finishReason: response.stop_reason,
    };
  }
}
```

### 8.3 Tareas Técnicas

| # | Tarea | Tiempo | Dependencias |
|---|-------|--------|--------------|
| 7.1 | Crear estructura adapter | 4h | - |
| 7.2 | Implementar FreeClaudeCodeAdapter | 16h | 7.1 |
| 7.3 | Definir FCCModels catalog | 8h | 7.2 |
| 7.4 | Implementar error handling | 8h | 7.3 |
| 7.5 | Implementar streaming | 12h | 7.4 |
| 7.6 | Registrar como provider en Registry | 8h | 7.5, F1 |
| 7.7 | Tests de integración con FCC real | 16h | 7.6 |
| 7.8 | Documentación | 4h | 7.7 |

### 8.4 Criterios de Éxito

- [ ] FCC funciona como provider estándar
- [ ] Streaming completo
- [ ] Error handling robusto
- [ ] Model catalog correcto

---

## 9. FASE 8: DASHBOARD

**Duración:** 2 semanas
**Objetivo:** Actualizar dashboard con nuevos componentes

### 9.1 Paneles a Implementar

| Panel | Descripción | Componentes |
|-------|-------------|-------------|
| Provider Health | Estado de providers | F1 |
| Token Usage | Consumo de tokens | F5 |
| API Keys | Gestión de keys | F6 |
| Accounts | Cuentas por provider | F4 |
| Policies | Visualización de reglas | F3 |
| Audit Log | Log de operaciones | F6 |

### 9.2 Tareas Técnicas

| # | Tarea | Tiempo | Dependencias |
|---|-------|--------|--------------|
| 8.1 | Diseñar layout dashboard | 8h | - |
| 8.2 | Implementar Provider Health panel | 16h | F1 |
| 8.3 | Implementar Token Usage panel | 16h | F5 |
| 8.4 | Implementar API Keys panel | 16h | F6 |
| 8.5 | Implementar Accounts panel | 12h | F4 |
| 8.6 | Implementar Policies panel | 16h | F3 |
| 8.7 | Implementar Audit Log panel | 12h | F6 |
| 8.8 | Testing E2E | 16h | 8.2-8.7 |
| 8.9 | Responsive design | 8h | 8.8 |

### 9.3 Criterios de Éxito

- [ ] Todos los paneles operativos
- [ ] Datos en tiempo real
- [ ] Responsive en móvil/tablet/desktop
- [ ] Accesibilidad (WCAG 2.1 AA)

---

## 10. CRITERIOS DE ÉXITO

### 10.1 Criterios por Fase

| Fase | Criterio | Threshold |
|------|----------|-----------|
| F1 | Coverage de tests | > 90% |
| F1 | Providers registrados | 100% |
| F2 | Routing accuracy | > 95% |
| F2 | Fallback success rate | > 90% |
| F3 | Policy evaluation time | < 10ms |
| F3 | Rules migrated | 100% |
| F4 | Account types supported | 100% |
| F4 | OAuth refresh success | > 99% |
| F5 | Quota prediction accuracy | > 80% |
| F5 | Alert latency | < 1s |
| F6 | Key exposure in logs | 0 |
| F6 | Audit log completeness | 100% |
| F7 | FCC latency overhead | < 50ms |
| F7 | FCC streaming fidelity | 100% |
| F8 | Panel load time | < 2s |
| F8 | Accessibility score | > 90% |

### 10.2 Criterios Globales

| Criterio | Threshold |
|----------|-----------|
| Total test coverage | > 85% |
| P99 latency | < 500ms (excluyendo provider) |
| Error rate | < 0.1% |
| Uptime | > 99.9% |
| Documentation coverage | > 90% |

---

## 11. DEFINICIÓN DE DONE

### Para cada fase:

1. ✅ Código implementado y revisado
2. ✅ Tests unitarios escritos y pasando (> 90% coverage)
3. ✅ Tests de integración pasando
4. ✅ Documentación actualizada
5. ✅ API documentada (OpenAPI/Swagger)
6. ✅ Código desplegado en staging
7. ✅ QA validado
8. ✅ Criterios de éxito cumplidos

### Para el proyecto completo:

1. ✅ Todas las fases completadas
2. ✅ Migración de datos completa
3. ✅ Descomisionamiento de código legacy
4. ✅ Documentación completa
5. ✅ Training del equipo completado
6. ✅ Runbooks escritos
7. ✅ On-call procedures documentados

---

**Fin del Plan de Implementación**
