# Análisis de Arquitectura Actual - Backend mi-libre-chat

## Resumen Ejecutivo

Este documento analiza la arquitectura actual del backend de mi-libre-chat, enfocándose en los componentes relacionados con LLM, providers y gestión de claves API.

---

## 1. Sistema LLMGateway (JavaScript)

### Ubicación
```
api/server/services/LLMGateway/
├── LLMGateway.js          (Gateway principal)
├── index.js
└── providers/              (12 providers implementados)
    ├── BaseProvider.js
    ├── GroqProvider.js, DeepSeekProvider.js, CloudflareProvider.js
    ├── MistralProvider.js, CohereProvider.js, HuggingFaceProvider.js
    ├── OpenRouterProvider.js, GeminiProvider.js, AnthropicProvider.js
    ├── PerplexityProvider.js, LeptonProvider.js, TogetherProvider.js
```

### Responsabilidad
- **Orquestación central**: Router inteligente que selecciona provider óptimo
- **Fallback automático**: Cadena de proveedores con failover
- **Gestión de salud**: Health checks y marcado de providers no disponibles
- **Estadísticas**: Tracking de latencia, errores y uso por provider
- **12 Providers**: Groq, DeepSeek, Cloudflare, Mistral, Cohere, HuggingFace, OpenRouter, Gemini, Anthropic, Perplexity, Lepton, Together

### Arquitectura
```
┌─────────────────────────────────────────────────────────┐
│                    LLMGateway                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │  selectProviderAndModel() - Selección inteligente │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  getFallbackChain() - Cadena de fallback         │   │
│  └─────────────────────────────────────────────────┘   │
│         ┌──────────────┼──────────────┐                │
│         ▼              ▼              ▼                │
│    ┌─────────┐   ┌─────────┐   ┌─────────┐             │
│    │ Groq   │   │DeepSeek │   │Anthropic│ ...         │
│    └─────────┘   └─────────┘   └─────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Reutilizable: ✅ **SÍ** (Excelente base)
- **Patrón Gateway**: Bien diseñado para extensión
- **BaseProvider reutilizable**: Herencia clara para nuevos providers
- **Fallback chain**: Mecanismo robusto

### Necesita evolucionar: ⚠️ **PARCIALMENTE**
- ❌ No tiene integración con APIKeyManager para claves dinámicas
- ❌ No soporta LiteLLM como proxy centralizado
- ❌ Estadísticas en memoria (no persisten)
- ❌ No tiene soporte para rotación de claves
- ❌ No hay métricas de costo reales


---

## 2. Sistema APIKeyManager (Python)

### Ubicación
```
api/server/services/APIKeyManager/
├── APIKeyManager.js         (Fachada JavaScript)
├── services/
│   ├── intelligent_router.py # Router principal
│   └── key_manager.py       # CRUD y lifecycle
├── models/
│   ├── api_key.py          # Modelo SQLAlchemy
│   ├── provider.py         # Modelo Provider
│   ├── account.py          # Modelo Account
│   ├── usage_log.py        # Logs de uso
│   └── base.py             # Base con TimestampMixin
```

### Responsabilidad
- **Gestión de claves API**: CRUD con encriptación Fernet
- **Router inteligente**: Selección multi-criterio (prioridad, costo, latencia, quota)
- **Tracking de uso**: Logs detallados por request
- **Rotación automática**: Detección de claves exhaustas y cooldown
- **Cifrado seguro**: AES-128-CBC con HMAC

### Modelo de Datos
```python
# Provider
- name, display_name, api_base
- priority, status (ACTIVE/DEGRADED/OFFLINE)
- cooldown_seconds, max_retries
- supported_models (JSON)
- supports_streaming, supports_function_calling, supports_vision

# ApiKey
- provider_id, key (encrypted)
- status (ACTIVE/EXHAUSTED/COOLDOWN/INVALID/REVOKED)
- remaining_quota, daily_limit
- cooldown_until, error_count, success_count
- cost_per_token

# UsageLog
- api_key_id, provider_id, model
- request_tokens, response_tokens, total_tokens
- status_code, latency_ms, estimated_cost
- created_at (indexed), user_id, session_id
```

### Reutilizable: ✅ **SÍ** (Muy bien diseñado)
- **Encriptación robusta**: Fernet con clave desde variable de entorno
- **Router flexible**: Múltiples estrategias de selección
- **Modelos completos**: SQLAlchemy con relaciones y auditoría

### Necesita evolucionar: ⚠️ **PARCIALMENTE**
- ❌ No tiene endpoint REST/GraphQL para gestión desde frontend
- ❌ No hay UI de administración para agregar/quitar claves
- ❌ Sin integración con sistema de pago para compra de créditos
- ❌ Fallback a texto plano en desarrollo (riesgo de seguridad)


---

## 3. Sistema ProviderLayer + LLMRuntime (TypeScript)

### Ubicación
```
api/server/services/ProviderLayer/
├── ProviderAdapter.ts    # Adaptador de provider
├── ProviderRegistry.ts   # Registro centralizado
└── index.ts

api/server/services/LLMRuntime/
├── LLMRuntime.js         # Runtime legacy
├── LLMRuntimeService.ts  # Runtime con eventos
└── index.ts
```

### Responsabilidad
- **Provider Registry**: Registro dinámico de providers con health monitoring
- **Provider Adapter**: Interfaz común para ejecutar tareas LLM
- **LLM Runtime Service**: Runtime event-driven para requests
- **Eventos**: Integración con EventBus para logging/observabilidad

### ProviderAdapter - Interfaz Runtime
```typescript
interface ProviderAdapter implements Runtime {
  readonly name: string;
  readonly capabilities: Capability[];
  readonly priority: number;
  
  canExecute(task: Task): boolean;
  async execute(task: Task, profile: ExecutionProfile): Promise<TaskResult>;
  async abort(executionId: string): Promise<void>;
  getStatus(executionId: string): TaskStatus;
  async healthCheck(): Promise<boolean>;
}
```

### Reutilizable: ✅ **SÍ** (Diseño limpio)
- **Interfaz Runtime**: Contrato claro para nuevos providers
- **Eventos**: Trazabilidad completa del flujo
- **TypeScript**: Tipado estático para seguridad

### Necesita evolucionar: ⚠️ **PARCIALMENTE**
- ❌ No tiene conexión con APIKeyManager Python
- ❌ Solo usa variables de entorno para API keys
- ❌ No persiste estado entre reinicios
- ❌ Falta integración real con LLMGateway.js


---

## 4. LiteLLM Integration

### Ubicación
```
integrations/litellm-gateway/
├── lib/litellm_client.py  # Cliente Python completo
├── config.yaml
└── docker-compose.yml
```

### Responsabilidad
- **Cliente LiteLLM**: Conexión robusta con LiteLLM proxy
- **Circuit Breaker**: Protección contra fallos en cascada
- **Rate Limiting**: Control de requests/tokens por minuto
- **Retry Logic**: Exponential backoff con jitter
- **Streaming**: Soporte completo para responses streaming

### Características del Cliente
```python
class LiteLLMClient:
    # Circuit Breaker Pattern
    circuit_breaker: CircuitBreaker
    
    # Rate Limiting
    rate_limiter: RateLimiter
    
    # Métricas
    metrics: Metrics
    
    # Métodos principales
    async chat(model, messages, stream=False) → LLMResponse
    async list_models() → List[Model]
    async health_check() → Dict
    async get_metrics() → Metrics
```

### Reutilizable: ✅ **SÍ** (Excelente)
- **Patrones robustos**: Circuit breaker, rate limiter, retry
- **Type hints**: Código autodocumentado
- **Métricas**: Tracking completo de uso

### Necesita evolucionar: ❌ **NO INTEGRADO**
- ❌ No se usa activamente en la arquitectura
- ❌ No hay endpoint para configurarlo desde frontend
- ❌ Falta documentación de deployment


---

## 5. Estrategias de Autenticación

### Ubicación
```
api/strategies/
├── localStrategy.js       # Login con email/password
├── jwtStrategy.js        # JWT Bearer token
├── openidStrategy.js      # OpenID Connect
├── ldapStrategy.js        # LDAP/Active Directory
├── samlStrategy.js        # SAML 2.0
├── googleStrategy.js, githubStrategy.js, discordStrategy.js
├── appleStrategy.js, facebookStrategy.js
└── socialLogin.js
```

### Responsabilidad
- **Autenticación multi-provider**: Local, OAuth, SAML, LDAP
- **Passport.js**: Framework de estrategias
- **JWT**: Token de acceso con expiración

### Reutilizable: ✅ **SÍ** (Estándar)
- Patrones probados de Passport.js
- Soporte para múltiples providers OAuth
- JWT para stateless auth

### Necesita evolucionar: ⚠️ **PARCIALMENTE**
- ❌ No hay 2FA obligatorio
- ❌ No hay rate limiting en login
- ❌ No hay lockout por intentos fallidos
- ❌ No hay OAuth2 con scopes granulares


---

## 6. Capability Router & Orchestrator

### Ubicación
```
api/server/services/CapabilityRouter/
api/server/services/CapabilityOrchestrator/
api/server/services/RuntimeRegistry/
```

### Responsabilidad
- **Capability Registry**: Registro de capacidades por modelo
- **Capability Router**: Selección de runtime por capacidades requeridas
- **Orchestrator**: Orquestación multi-LLM
- **Runtime Registry**: Registro centralizado de runtimes

### Capacidades definidas
```typescript
enum Capability {
  LLM_CHAT,
  LLM_VISION,
  LLM_REASONING,
  CODE_EXECUTION,
  IMAGE_GENERATION,
  WEB_SEARCH,
  // ... 25+ capacidades
}
```

### Modelo de decisión
```typescript
score = 
  +20 if matches required capability
  +10 if matches preferred capability
  +15 if is preferred provider
  -30 if cost exceeds max
  -20 if latency exceeds max
```

### Reutilizable: ✅ **SÍ** (Diseño extensible)
- Sistema de capacidades escalable
- Estrategias de selección configurables
- Integración con EventBus

### Necesita evolucionar: ⚠️ **Testing completo**
- Tests unitarios limitados
- No hay benchmarks de performance
- Sin integración con监控系统


---

## 7. Análisis Comparativo de Sistemas

| Aspecto | LLMGateway (JS) | APIKeyManager (Python) | ProviderLayer (TS) |
|---------|----------------|----------------------|-------------------|
| **Lenguaje** | JavaScript | Python | TypeScript |
| **Madurez** | 🟢 Alta | 🟢 Alta | 🟡 Media |
| **Persistencia** | ❌ Memoria | ✅ SQLite/Postgres | ❌ Memoria |
| **Encriptación** | ❌ No | ✅ Fernet AES-128 | ❌ No |
| **Fallback** | ✅ Implícito | ✅ Por configuración | ✅ Por capacidad |
| **Métricas** | ⚠️ Básicas | ✅ Completas | ⚠️ En memoria |
| **Integración DB** | ❌ No | ✅ SQLAlchemy | ❌ No |
| **API REST** | ❌ No | ❌ No | ❌ No |

---

## 8. Problemas y Gaps Identificados

### 🔴 Gap Crítico: Desconexión entre sistemas

```
┌──────────────────────────────────────────────────────────┐
│                    PROBLEMA ACTUAL                        │
│                                                          │
│  LLMGateway.js ←── No conecta ──→ APIKeyManager (Python) │
│      │                                                     │
│      └── Usa variables de entorno (estáticas)             │
│      └── No tiene rotación de claves                      │
│                                                          │
│  ProviderLayer ←── No conecta ──→ LLMGateway.js           │
│      │                                                     │
│      └── Duplicación de lógica de providers               │
│      └── No usa el mismo registry                        │
└──────────────────────────────────────────────────────────┘
```

### 🟡 Gaps Secundarios

1. **Duplicación de providers**: GroqProvider existe en 3 lugares diferentes
2. **No hay cache de respuestas**: Cada request va al LLM
3. **Métricas dispersas**: No hay dashboard unificado
4. **No hay límites por usuario**: Sin rate limiting granular
5. **Logs no centralizados**: Console.log vs logger estructurado


---

## 9. Recomendaciones de Evolución

### Corto Plazo (Semana 1-2)
1. **Integrar APIKeyManager en LLMGateway**
   - Agregar cliente Python al gateway
   - Usar claves dinámicas en vez de env vars

2. **Unificar providers**
   - Crear ProviderAdapter que use APIKeyManager
   - Deprecadar providers duplicados en LLMGateway

### Medio Plazo (Mes 1)
3. **Agregar API REST a APIKeyManager**
   - Endpoints para CRUD de claves
   - Dashboard admin en frontend

4. **Integrar LiteLLM Gateway**
   - Usar como proxy central para cost optimization
   - Beneficiar de caching y fallbacks nativos

### Largo Plazo (Mes 2-3)
5. **Sistema de créditos por usuario**
   - Integración con sistema de pago
   - Rate limiting por tier de suscripción

6. **Métricas centralizadas**
   - Integración con Prometheus/Grafana
   - Dashboard de uso por equipo


---

## 10. Conclusión

### Estado Actual

| Componente | Estado | Reutilizable | Necesita Evoluir |
|------------|--------|-------------|-----------------|
| LLMGateway | 🟢 Productivo | ✅ Sí | ⚠️ Integración con APIKeyManager |
| APIKeyManager | 🟢 Productivo | ✅ Sí | ⚠️ API REST, UI admin |
| ProviderLayer | 🟡 Desarrollo | ✅ Sí | ❌ No está conectado |
| LiteLLM Client | 🟡 Desarrollo | ✅ Sí | ❌ No está integrado |
| Strategies Auth | 🟢 Productivo | ✅ Sí | ⚠️ Seguridad adicional |
| Capability Router | 🟡 Desarrollo | ✅ Sí | ⚠️ Testing completo |

### Prioridades
1. **Conectar LLMGateway con APIKeyManager** (Crítico)
2. **Agregar API REST a APIKeyManager** (Alto)
3. **Integrar LiteLLM como proxy** (Medio)
4. **Unificar sistema de métricas** (Medio)

### Arquitectura Objetivo

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (REST/GraphQL)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │  Chat API   │  │ Admin API   │  │  User Management    ││
│  └─────────────┘  └─────────────┘  └─────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                        Orchestration Layer                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐│
│  │ CapabilityRouter│  │  LLMGateway.js │  │ LiteLLM     ││
│  │                 │  │  (Fallback)    │  │ (Cache)     ││
│  └─────────────────┘  └─────────────────┘  └─────────────┘│
├─────────────────────────────────────────────────────────────┤
│                     Provider Layer                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐ │
│  │ Groq   │  │DeepSeek │  │Anthropic│  │  Others...  │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                  APIKeyManager (Python)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Intelligent│  │KeyManager│  │UsageLog  │  │Fernet    │ │
│  │ Router    │  │(CRUD)    │  │(BD)      │  │Encrypt   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

*Documento generado: 2026-07-22*
*Autor: Análisis Arquitectura - mi-libre-chat*
