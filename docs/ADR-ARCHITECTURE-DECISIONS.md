# 📋 ADR - Architecture Decision Records
## Sistema Multi-LLM Profesional

**Fecha:** 2026-07-21
**Versión:** 1.0
**Autor:** OpenHands Agent

---

## TABLA DE CONTENIDOS

1. [ADR-0001: Arquitectura Modular por Capas](#adr-0001-arquitectura-modular-por-capas)
2. [ADR-0002: Separation of Concerns en Providers](#adr-0002-separation-of-concerns-en-providers)
3. [ADR-0003: Capability-Based Routing](#adr-0003-capability-based-routing)
4. [ADR-0004: Policy Engine Centralizado](#adr-0004-policy-engine-centralizado)
5. [ADR-0005: Account Manager como Abstracción](#adr-0005-account-manager-como-abstracción)
6. [ADR-0006: Token Manager Dedicado](#adr-0006-token-manager-dedicado)
7. [ADR-0007: API Key Manager como Fuente Única](#adr-0007-api-key-manager-como-fuente-única)
8. [ADR-0008: Event Bus para Comunicación](#adr-0008-event-bus-para-comunicación)
9. [ADR-0009: Integración de Free Claude Code](#adr-0009-integración-de-free-claude-code)
10. [ADR-0010: Observabilidad Integral](#adr-0010-observabilidad-integral)

---

## ADR-0001: Arquitectura Modular por Capas

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Necesitamos una arquitectura que permita:
- Agregar nuevos proveedores sin modificar código existente
- Escalabilidad horizontal
- Mantenibilidad a largo plazo
- Testing independiente de componentes

### Decisión

Implementar una arquitectura modular por capas con las siguientes capas:

```
┌─────────────────────────────────────────┐
│         CAPA DE ORQUESTACIÓN            │
│  Execution Engine │ Task Planner        │
├─────────────────────────────────────────┤
│           CAPA DE ROUTING               │
│  Capability Router │ Policy Engine     │
├─────────────────────────────────────────┤
│          CAPA DE PROVEEDORES            │
│  Provider Registry │ Provider Manager  │
│  Account Manager │ Token Manager      │
├─────────────────────────────────────────┤
│        CAPA DE CREDENCIALES             │
│  API Key Manager │ Health Checker      │
├─────────────────────────────────────────┤
│           CAPA DE GATEWAY               │
│           LiteLLM Gateway               │
└─────────────────────────────────────────┘
```

### Consecuencias

**Positivas:**
- ✅ Cada capa tiene responsabilidad única
- ✅ Cambios en una capa no afectan otras
- ✅ Testing independiente por capa
- ✅ Paralelización del desarrollo

**Negativas:**
- ❌ Más indirecciones inicialmente
- ❌ Mayor complejidad en debugging
- ❌ Más archivos y módulos

**Mitigaciones:**
- Documentación clara de interfaces
- Diagrams de flujo de datos
- Logging estructurado con correlation IDs

---

## ADR-0002: Separation of Concerns en Providers

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Los proveedores de LLM tienen diferentes:
- Tipos de autenticación (API Keys, OAuth, JWT, Browser Sessions)
- Mecanismos de gestión de cuentas
- Límites y cuotas
- Estados y transiciones

No queremos mezclar estas responsabilidades.

### Decisión

Separar las responsabilidades en componentes distintos:

| Componente | Responsabilidad |
|------------|----------------|
| **Provider Registry** | Registro de capacidades y configuración |
| **Provider Manager** | Estado activo/inactivo, prioridades |
| **Account Manager** | Cuentas y autenticación |
| **API Key Manager** | Credenciales específicas |

### Justificación

```
# ANTES (monolítico):
Provider {
  apiKeys: APIKey[]       // Mezclado
  accounts: Account[]      // Mezclado
  priority: number         // Mezclado
}

# DESPUÉS (separado):
Provider {
  id: string
  capabilities: Capability[]
  config: ProviderConfig
}

ProviderAccount {
  providerId: string
  credentials: Credentials
}

APIKey {
  accountId: string
  encryptedKey: string
}
```

### Consecuencias

**Positivas:**
- ✅ Agregar tipo de autenticación no afecta providers
- ✅ Múltiples cuentas por provider son naturales
- ✅ Keys pueden rotar sin afectar cuentas
- ✅ Testing más específico

**Negativas:**
- ❌ Más JOINs en queries
- ❌ Más objetos para administrar
- ❌ Transacciones más complejas

---

## ADR-0003: Capability-Based Routing

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Los modelos tienen diferentes capacidades (chat, visión, código, etc.). 
El routing por nombre de modelo es frágil y no escala.

### Decisión

Implementar routing basado en **capacidades** en lugar de nombres de modelos:

```typescript
// Solicitud del usuario
interface ExecutionRequest {
  capabilities: Capability[];  // NO: model: "gpt-4o"
  constraints?: ExecutionConstraints;
}

// Capabilities predefinidas
enum Capability {
  LLM_CHAT = 'llm.chat',
  LLM_VISION = 'llm.vision',
  LLM_REASONING = 'llm.reasoning',
  LLM_FUNCTION_CALLING = 'llm.function_calling',
  CODE_EXECUTION = 'code.execution',
  WEB_SEARCH = 'search.web',
  IMAGE_GENERATION = 'media.image_generation',
}
```

### Flujo de Routing

```
Solicitud con capabilities [LLM_CHAT, CODE_EXECUTION]
              │
              ▼
    ┌─────────────────┐
    │ Capability      │
    │ Router         │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Busca providers │
    │ que soporten    │
    │ ambas caps      │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Policy Engine  │
    │ aplica reglas  │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Selecciona     │
    │ mejor opción   │
    └─────────────────┘
```

### Consecuencias

**Positivas:**
- ✅ Agregar modelo no requiere cambiar código cliente
- ✅ Fallback automático a capabilities equivalentes
- ✅ Policies pueden controlar capabilities
- ✅ Testing por capability

**Negativas:**
- ❌ Mapping capabilities → models puede ser complejo
- ❌ Algunas capabilities son subjetivas
- ❌ Documentación más detallada necesaria

---

## ADR-0004: Policy Engine Centralizado

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Las reglas de negocio actuales están dispersas:
- Prioridades en Provider
- Límites en API Key Manager
- Coste en Capability Router
- Rate limits en Rate Limiter

Esto dificulta:
- Auditar reglas
- Cambiar reglas dinámicamente
- Testing de combinaciones

### Decisión

Crear un **Policy Engine** centralizado que gestione TODAS las reglas:

```typescript
interface PolicyEngine {
  // Evaluar contexto contra todas las reglas
  evaluate(context: PolicyContext): PolicyDecision;
  
  // Validar acción contra reglas
  validate(action: PolicyAction): boolean;
}

// Tipos de reglas centralizadas
type PolicyType = 
  | 'priority'      // Prioridad de providers
  | 'cost'          // Límites de coste
  | 'latency'       // Límites de latencia
  | 'quota'         // Cuotas por usuario/proveedor
  | 'fallback'      // Orden de fallback
  | 'experimental'; // Acceso a modelos experimentales
```

### Reglas Implementables

```typescript
// Ejemplo: Coste máximo por request
{
  type: 'cost',
  name: 'Max cost per request',
  condition: (ctx) => ctx.userTier === 'free',
  action: { maxCost: 0.001 }, // $0.001 max
  priority: 10
}

// Ejemplo: Solo modelos gratuitos para free tier
{
  type: 'priority',
  name: 'Free tier models only',
  condition: (ctx) => ctx.userTier === 'free',
  action: { allowedProviders: ['groq', 'openrouter', 'fcc'] },
  priority: 5
}

// Ejemplo: Fallback personalizado por proyecto
{
  type: 'fallback',
  name: 'Project custom fallback',
  condition: (ctx) => ctx.projectId === 'proj-123',
  action: { order: ['fcc', 'groq', 'deepseek'] },
  priority: 20
}
```

### Consecuencias

**Positivas:**
- ✅ Reglas centralizadas y auditables
- ✅ Cambios dinámicos sin deploy
- ✅ Testing holístico
- ✅ Documentación automática

**Negativas:**
- ❌ Punto único de fallo
- ❌ Performance overhead (mitigado con caching)
- ❌ Complejidad inicial

---

## ADR-0005: Account Manager como Abstracción

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Diferentes proveedores usan diferentes métodos de autenticación:

| Proveedor | Método de Auth |
|-----------|---------------|
| Groq | API Key |
| OpenRouter | API Key |
| Google AI | OAuth + API Key |
| GitHub Models | OAuth + Token |
| Free Claude Code | API Key / Session |
| Browser-based | Browser Session |

### Decisión

Crear un **Account Manager** que abstraiga todos los métodos:

```typescript
interface AccountManager {
  // Obtener credenciales válidas
  getCredentials(providerId: string): Promise<Credentials>;
  
  // Verificar y renovar si es necesario
  ensureValid(providerId: string): Promise<Credentials>;
}

// Diferentes tipos de cuenta
interface Account {
  id: string;
  providerId: string;
  authType: AuthType;
  credentials: EncryptedCredentials;
  // OAuth
  refreshToken?: EncryptedToken;
  expiresAt?: Date;
  // Browser session
  sessionCookies?: EncryptedCookies;
}

// Abstracción de credenciales
type Credentials = 
  | { type: 'api_key'; key: string }
  | { type: 'oauth'; accessToken: string; expiresAt: Date }
  | { type: 'jwt'; token: string }
  | { type: 'session'; cookies: Record<string, string> }
  | { type: 'browser'; sessionId: string };
```

### Consecuencias

**Positivas:**
- ✅ Agregar nuevo tipo de auth es local
- ✅ Provider Manager no sabe de auth
- ✅ Testing con mocks fácil
- ✅ Soporte para multi-cuenta natural

**Negativas:**
- ❌ Más indirección
- ❌ Gestión de refresh tokens compleja
- ❌ Sesiones pueden expirar

---

## ADR-0006: Token Manager Dedicado

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

El tracking de tokens y cuotas está disperso:
- API Key Manager tiene `remaining_quota`
- No hay tracking por usuario/proyecto
- No hay predicción de consumo
- No hay detección proactiva de agotamiento

### Decisión

Crear un **Token Manager** dedicado:

```typescript
interface TokenManager {
  // Registrar uso
  trackUsage(dimensions: UsageDimensions, tokens: number): void;
  
  // Verificar cuota antes de request
  checkQuota(dimensions: UsageDimensions): QuotaStatus;
  
  // Estimar coste
  estimateCost(modelId: string, tokens: number): CostEstimate;
  
  // Detectar consumo anómalo
  detectAnomaly(dimensions: UsageDimensions): AnomalyReport;
}

// Dimensiones de tracking
interface UsageDimensions {
  userId?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  conversationId?: string;
}
```

### Características Clave

```typescript
// Detección proactiva de cuota baja
{
  threshold: 0.8,  // Alertar al 80%
  action: 'notify',  // Notificar al Policy Engine
  provider: 'all'
}

// Predicción de agotamiento
{
  metrics: {
    consumptionRate: 10000, // tokens/min
    remainingQuota: 500000,
    estimatedMinutesLeft: 50
  },
  alert: true
}

// Budget tracking
{
  userId: 'user-123',
  dailyBudget: 1000000, // 1M tokens
  currentUsage: 750000,
  projectedOverage: false
}
```

### Consecuencias

**Positivas:**
- ✅ Control granular de consumo
- ✅ Predicción de agotamiento
- ✅ Alertas proactivas
- ✅ Cost optimization

**Negativas:**
- ❌ Más estado a gestionar
- ❌ Sync eventual con providers reales
- ❌ Complejidad de deduplication

---

## ADR-0007: API Key Manager como Fuente Única

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Actualmente:
- LiteLLM tiene su propia config de keys
- LibreChat tiene keys en DB
- API Key Manager tiene keys
- Hay duplicación y potencial de inconsistencia

### Decisión

**API Key Manager es la única fuente de verdad** para credenciales:

```
┌─────────────────────────────────────────────────────────────────┐
│                   API KEY MANAGER (ÚNICA FUENTE)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │  LiteLLM    │  │   LibreChat   │  │  API Key     │      │
│  │  Gateway     │──│   Backend     │──│  Manager UI  │      │
│  │              │  │              │  │              │      │
│  │  Lee keys   │  │  Lee keys    │  │  CRUD keys  │      │
│  │  via API    │  │  via API     │  │             │      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API Expuesta

```typescript
interface APIKeyManagerService {
  // Obtener key para uso (descifra internally)
  getKey(providerId: string): Promise<{ key: string; expiresAt?: Date }>;
  
  // Health check de key
  checkHealth(keyId: string): Promise<KeyHealth>;
  
  // Reportar uso
  reportUsage(keyId: string, tokens: number, success: boolean): void;
}
```

### Consecuencias

**Positivas:**
- ✅ Consistencia de estado
- ✅ Logs centralizados
- ✅ Rotación automática funciona
- ✅ Auditoría unificada

**Negativas:**
- ❌ Dependencia de API Key Manager
- ❌ Latencia adicional en requests
- ❌ Cache crítico para performance

---

## ADR-0008: Event Bus para Comunicación

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Los componentes necesitan comunicarse de forma desacoplada:
- Capability Router → Policy Engine
- Provider Manager → API Key Manager (quota alerts)
- Token Manager → Policy Engine (quota exceeded)
- API Key Manager → Dashboard (health changes)

### Decisión

Usar **Event Bus** para toda comunicación entre componentes:

```typescript
// Formato de evento
interface SystemEvent {
  id: string;
  type: EventType;
  source: string;
  timestamp: Date;
  correlationId?: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  data: Record<string, unknown>;
}

// Ejemplos de eventos
enum EventType {
  // Provider
  PROVIDER_ENABLED = 'provider.enabled',
  PROVIDER_DISABLED = 'provider.disabled',
  PROVIDER_HEALTH_CHANGED = 'provider.health_changed',
  PROVIDER_RATE_LIMITED = 'provider.rate_limited',
  
  // Quota
  QUOTA_LOW = 'quota.low',
  QUOTA_EXCEEDED = 'quota.exceeded',
  QUOTA_RESET = 'quota.reset',
  
  // Credentials
  KEY_EXHAUSTED = 'key.exhausted',
  KEY_INVALIDATED = 'key.invalidated',
  KEY_REACTIVATED = 'key.reactivated',
  
  // Execution
  EXECUTION_REQUESTED = 'execution.requested',
  EXECUTION_COMPLETED = 'execution.completed',
  EXECUTION_FAILED = 'execution.failed',
}
```

### Uso

```typescript
// Publicar evento
eventBus.publish({
  type: EventType.QUOTA_LOW,
  source: 'TokenManager',
  data: {
    userId: 'user-123',
    providerId: 'anthropic',
    usedPercentage: 85
  }
});

// Suscribirse
eventBus.subscribe(EventType.QUOTA_LOW, (event) => {
  // Policy Engine recibe alerta
  policyEngine.onQuotaLow(event.data);
});
```

### Consecuencias

**Positivas:**
- ✅ Desacoplamiento completo
- ✅ Fácil extensión con nuevos eventos
- ✅ Debugging via event replay
- ✅ Testing con mock events

**Negativas:**
- ❌ Tracking de flujo más difícil
- ❌ Posible inconsistencia eventual
- ❌ Más complejidad en debugging

---

## ADR-0009: Integración de Free Claude Code

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Free Claude Code (FCC) es un proxy local que:
- Expone API compatible con Anthropic Messages
- Soporta múltiples providers (NVIDIA NIM, OpenRouter, etc.)
- Corre en puerto 8082 local

### Decisión

Integrar FCC como **provider adicional** via adapter HTTP:

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTEGRACIÓN FREE CLAUDE CODE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LibreChat                                                      │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │            LLM Gateway (LiteLLM)                        │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │              FCC Adapter                          │  │  │
│  │  │                                                  │  │  │
│  │  │  POST http://localhost:8082/v1/messages          │  │  │
│  │  │  { model: "nvidia_nim/nemotron-3-120b", ... }  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Registration

```typescript
// Registro de FCC como provider
const freeClaudeCodeProvider: Provider = {
  id: 'fcc',
  name: 'Free Claude Code',
  displayName: 'Free Claude Code (Local)',
  capabilities: [
    Capability.LLM_CHAT,
    Capability.LLM_REASONING,
    Capability.CODE_EXECUTION,
  ],
  authType: 'api_key', // Opcional
  config: {
    endpoint: 'http://localhost:8082',
    apiKey: process.env.FCC_API_KEY // Opcional
  }
};
```

### Características

- ✅ Provider como cualquier otro
- ✅ Fallback automático funciona
- ✅ Policies aplican normalmente
- ✅ Sin código especial para FCC

### Consecuencias

**Positivas:**
- ✅ Acceso a providers adicionales (NVIDIA NIM, etc.)
- ✅ Sin cambios en routing
- ✅ Gratis para modelos seleccionados
- ✅ FCC puede usarse como fallback

**Negativas:**
- ❌ Requiere FCC corriendo localmente
- ❌ Latencia adicional vs providers directos
- ❌ No disponible en entornos serverless

---

## ADR-0010: Observabilidad Integral

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

Necesitamos visibilidad completa del sistema para:
- Debugging de issues
- Performance optimization
- Cost tracking
- Compliance

### Decisión

Implementar observabilidad en tres pilares:

```typescript
// 1. MÉTRICAS (Prometheus format)
interface Metrics {
  // Request metrics
  requests_total: Counter;
  request_duration_seconds: Histogram;
  
  // Provider metrics
  provider_health: Gauge;
  provider_latency_ms: Histogram;
  
  // Token metrics
  tokens_total: Counter;
  cost_total: Counter;
  
  // Key metrics
  key_health: Gauge;
  key_usage: Counter;
}

// 2. TRACING (OpenTelemetry)
interface Tracing {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  
  // Spans por operación
  spans: [{
    name: string;
    startTime: number;
    endTime: number;
    attributes: Record<string, string | number>;
  }];
}

// 3. LOGGING (Structured JSON)
interface Log {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  correlationId?: string;
  userId?: string;
  providerId?: string;
  
  // Context
  context: {
    component: string;
    operation: string;
    duration?: number;
    metadata?: Record<string, unknown>;
  };
}
```

### Exportadores

| Pilar | Exportador | Endpoint |
|-------|------------|----------|
| Métricas | Prometheus | `/metrics` |
| Tracing | Jaeger | `localhost:14268` |
| Logs | Loki/ELK | Configurado |
| Dashboard | Grafana | `localhost:3000` |

### Consecuencias

**Positivas:**
- ✅ Debugging rápido
- ✅ Performance optimization basada en datos
- ✅ Cost tracking automático
- ✅ Alertas proactivas

**Negativas:**
- ❌ Overhead de instrumentación
- ❌ Storage para logs/traces
- ❌ Complejidad operacional

---

## Resumen de ADRs

| ADR | Título | Estado | Impacto |
|-----|--------|--------|---------|
| 0001 | Arquitectura Modular por Capas | ✅ Aceptado | Alto |
| 0002 | Separation of Concerns | ✅ Aceptado | Alto |
| 0003 | Capability-Based Routing | ✅ Aceptado | Alto |
| 0004 | Policy Engine Centralizado | ✅ Aceptado | Medio |
| 0005 | Account Manager | ✅ Aceptado | Medio |
| 0006 | Token Manager Dedicado | ✅ Aceptado | Medio |
| 0007 | API Key Manager Fuente Única | ✅ Aceptado | Alto |
| 0008 | Event Bus para Comunicación | ✅ Aceptado | Medio |
| 0009 | Integración Free Claude Code | ✅ Aceptado | Bajo |
| 0010 | Observabilidad Integral | ✅ Aceptado | Medio |

---

**Fin de ADRs**
