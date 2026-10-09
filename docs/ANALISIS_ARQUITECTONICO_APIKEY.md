# Análisis Arquitectónico: Integración de API-Key Manager

## Fecha: 2026-07-19

---

## RESUMEN EJECUTIVO

Este documento presenta un análisis detallado de la integración del repositorio `api-key` en la arquitectura de Mi LibreChat. Se evalúan múltiples opciones de ubicación y se selecciona la más óptima basándose en escalabilidad, mantenibilidad, modularidad y rendimiento.

---

## 1. AUDITORÍA DEL REPOSITORIO API-KEY

### 1.1 Arquitectura Actual

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Key Manager                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐│
│  │   Frontend    │  │   Backend    │  │    LiteLLM Proxy     ││
│  │  (React)      │  │  (FastAPI)   │  │    (Port 4000)       ││
│  │  Port 3000    │◄─►│  Port 8000   │◄─►│                       ││
│  └──────────────┘  └──────────────┘  └───────────────────────┘│
│         │                 │                      ▲              │
│         │           ┌─────┴─────┐                │              │
│         │           │  Celery   │                │              │
│         │     ┌─────┴───────────┴─────┐         │              │
│         │     │  Workers (3 queues)  │         │              │
│         │     └─────────────────────┘         │              │
│         │                 │                      │              │
│         ▼                 ▼                      │              │
│  ┌──────────────┐  ┌──────────────┐              │              │
│  │  PostgreSQL  │  │    Redis     │◄────────────┘              │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Componentes Principales

| Componente | Responsabilidad | Tecnología |
|------------|-----------------|------------|
| **AIRouter** | Routing inteligente de requests | Python |
| **KeyService** | Gestión de estados de keys | Python/SQLAlchemy |
| **AccountGenerator** | Creación automática de cuentas | Playwright + Mail.tm |
| **QuotaMonitor** | Monitoreo proactivo de cuotas | Celery |
| **KeyRotation** | Rotación automática de keys | Celery |
| **LiteLLM Config Generator** | Generación dinámica de config LiteLLM | Python |
| **ADIR Worker** | Detección y respuesta a errores | Celery |

### 1.3 Modelos de Datos

```
Provider
├── id, name, api_base, status, priority
├── supported_models (JSON)
└── error_codes (JSON)

ApiKey
├── id, key (encrypted), label
├── status: active|exhausted|cooldown|invalid
├── remaining_quota, daily_limit
├── cooldown_until, last_used_at
└── error_count

UsageLog
├── api_key_id, provider_id, model
├── tokens_used, status_code
├── latency_ms, error_message
└── created_at
```

### 1.4 Responsabilidades Actuales

| Responsabilidad | Estado | Implementación |
|----------------|--------|----------------|
| Rotación automática de API Keys | ✅ | KeyRotation worker |
| Cambio cuando llega a cuota | ✅ | AIRouter + ADIR |
| Cambio en rate limit (429) | ✅ | AIRouter |
| Balanceo entre múltiples keys | ✅ | AIRouter (por prioridad) |
| Priorización de keys | ✅ | Provider.priority + AIRouter |
| Cooldown por key | ✅ | KeyService.mark_exhausted |
| Health Check de cada key | ✅ | Test connectivity endpoint |
| Estadísticas de uso | ✅ | UsageLog + Dashboard |
| Tokens consumidos | ✅ | UsageLog |
| Historial | ✅ | UsageLog |
| Reintentos | ✅ | AIRouter + LiteLLM router_settings |
| Recuperación automática | ✅ | Celery workers |
| Soporte múltiples proveedores | ✅ | Provider model + scripts |
| Admin desde UI | ✅ | React Dashboard |

### 1.5 Proveedores Soportados

| Proveedor | Automatización | Detección de Cuota |
|-----------|----------------|-------------------|
| Groq | ✅ Playwright | Rate Limit Headers |
| OpenRouter | ✅ Playwright | Credits Header |
| Gemini | ✅ Playwright | Error Body |
| Together AI | ✅ Playwright | Credits Header |
| Sambanova | ✅ Playwright | Rate Limit Headers |
| DeepInfra | ✅ Playwright | Error Body |
| Mistral | ❌ Manual | Error Body |
| Cohere | ❌ Manual | Error Body |
| HuggingFace | ❌ Manual | Error Body |

### 1.6 Dependencias Externas

- **PostgreSQL**: Almacenamiento de keys, providers, accounts
- **Redis**: Cache, rate limiting, Celery broker
- **LiteLLM**: Proxy/router de modelos
- **Playwright**: Automatización de registro de cuentas
- **Mail.tm**: Emails temporales para registro

---

## 2. ANÁLISIS DE SISTEMAS RELACIONADOS

### 2.1 LiteLLM Gateway (en api-key)

El LiteLLM Gateway de api-key tiene:
- Routing strategy: `least-busy`
- Num retries: 3
- Retry after: 5s
- Allowed fails: 2
- Cooldown time: 60s
- Fallback chain dinámico

**Limitaciones detectadas:**
- Routing básico (least-busy) no considera costo ni latencia
- No tiene conocimiento del estado de las keys (solo recibe 429)
- No detecta proactive depletion (keys cerca de cuota)

### 2.2 LibreChat (repo principal)

LiteChat tiene su propio sistema de endpoints:
- `/api/endpoints/*` - Configuración de modelos
- Routing basado en custom endpoint
- Model selection manual

**Limitaciones detectadas:**
- No tiene rotation automática de keys
- No tiene conocimiento de estado de providers
- No tiene fallback automático

### 2.3 Free Claude Code Bridge

El bridge creado tiene:
- Tool calling con LiteLLM
- No tiene gestión de keys
- Delega a LiteLLM Gateway

---

## 3. EVALUACIÓN DE OPCIONES DE UBICACIÓN

### Opción A: Microservicio Independiente

```
Usuario → LibreChat → AI-OS → Free Claude Code → LiteLLM Gateway → API-Key Manager → Providers
```

**Ventajas:**
- ✅ Desacoplado completamente
- ✅ Escalable independientemente
- ✅ Cada equipo puede trabajar en su dominio
- ✅ Deployment independiente
- ✅ Fácil de reemplazar o actualizar

**Desventajas:**
- ❌ Latencia adicional (otro hop de red)
- ❌ Más complejidad operacional (más servicios)
- ❌ Posible inconsistencia de estado
- ❌ Duplicación de configuración de modelos
- ❌ Dos sistemas de routing (LiteLLM + API-Key)

**Veredicto:** ❌ **NO RECOMENDADO** - Duplica funcionalidad con LiteLLM

---

### Opción B: Middleware

```
Usuario → LibreChat → API-Key Middleware → LiteLLM → Providers
```

**Ventajas:**
- ✅ Transparente para LibreChat
- ✅ Un solo punto de gestión de keys
- ✅ Logging centralizado
- ✅ Rate limiting unificado

**Desventajas:**
- ❌ Middleware como "parche" (lo que NO queremos)
- ❌ Lógica de routing dividida (middleware + LiteLLM)
- ❌ Dificultad para compartir estado de keys
- ❌ Dependencia circular potencial

**Veredicto:** ❌ **NO RECOMENDADO** - Es un parche, no solución nativa

---

### Opción C: Gateway Interno (Entre LiteLLM y Proveedores)

```
┌─────────────────────────────────────────────────────────────────┐
│                        LibreChat                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    AI-OS / Orchestrator                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Free Claude Code Bridge                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              API-KEY MANAGER (Native Gateway)            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │              Intelligent Router                     │ │  │
│  │  │  - Selection by priority, quota, cost, latency   │ │  │
│  │  │  - Proactive depletion detection                 │ │  │
│  │  │  - Automatic key rotation                          │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                              │                             │  │
│  │                              ▼                             │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │              Key Manager Service                     │ │  │
│  │  │  - Provider registry                              │ │  │
│  │  │  - Key lifecycle (active/exhausted/cooldown)      │ │  │
│  │  │  - Usage tracking & statistics                     │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │           Raw Provider APIs (Direct, no LiteLLM)         │  │
│  │   Groq │ OpenRouter │ Gemini │ DeepSeek │ DeepInfra    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Ventajas:**
- ✅ API-Key es componente nativo, no parche
- ✅ Routing inteligente centralizado
- ✅ Estado de keys compartido
- ✅ Single source of truth para keys
- ✅ Eliminación de duplicación (LiteLLM ya no maneja keys)
- ✅ Decisión de routing en un solo lugar

**Desventajas:**
- ❌ LiteLLM existente queda obsoleto (o se usa solo para formatting)
- ❌ Migración de configuración existente
- ❌ Curva de aprendizaje para operadores

**Veredicto:** ✅ **RECOMENDADO** - Arquitectura más limpia y nativa

---

### Opción D: Componente de LiteLLM

```
LiteLLM + API-Key Module = Enhanced LiteLLM
```

**Ventajas:**
- ✅ Aprovecha infraestructura LiteLLM existente
- ✅ Model caching, retries ya implementados
- ✅ Compatible con herramientas LiteLLM existentes

**Desventajas:**
- ❌ API-Key es "plugin" de LiteLLM (sigue siendo parche)
- ❌ Dependencia de la evolución de LiteLLM
- ❌ Limitado por arquitectura de LiteLLM
- ❌ Custom logic fuera del core de LiteLLM

**Veredicto:** ⚠️ **POSIBLE** - Si se contribuye a LiteLLM upstream

---

### Opción E: Componente de AI-OS

```
AI-OS (Orchestrator) + API-Key Module
```

**Ventajas:**
- ✅ Routing a nivel de agente
- ✅ Decisiones de routing basadas en contexto de tarea
- ✅ Conocimiento del estado de la conversación

**Desventajas:**
- ❌ API-Key sería específico de AI-OS
- ❌ No reusable para otros consumers
- ❌ Acoplamiento con Free Claude Code

**Veredicto:** ❌ **NO RECOMENDADO** - Muy acoplado

---

## 4. ARQUITECTURA SELECCIONADA

### 4.1 Diseño: API-Key como Gateway Nativo

```
┌─────────────────────────────────────────────────────────────────┐
│                        LIBRECHAT STACK                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    LibreChat (Frontend)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    LibreChat API (Node.js)                │   │
│  │                                                              │   │
│  │  - Routes: /chat, /agents, /skills, /mcp                  │   │
│  │  - Controllers: Messages, Agents, Prompts                  │   │
│  │  - Services: MCP, Skills, Memories                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    AI-OS (Orchestrator)                   │   │
│  │                                                              │   │
│  │  - Agent orchestration                                     │   │
│  │  - Context management                                       │   │
│  │  - Tool coordination                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│          ┌───────────────────┼───────────────────┐               │
│          │                   │                   │               │
│          ▼                   ▼                   ▼               │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │   ComfyUI      │  │  Free Claude  │  │    RAG        │   │
│  │   Bridge       │  │  Code Bridge  │  │   Service     │   │
│  │               │  │               │  │               │   │
│  │ Image Gen    │  │  Tool Calling │  │  Semantic     │   │
│  │ Workflows    │  │  Planning     │  │  Search       │   │
│  └───────────────┘  └───────────────┘  └───────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               API-KEY MANAGER (Native Gateway)            │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │              Intelligent Router                      │ │   │
│  │  │                                                       │ │   │
│  │  │  • Selection Strategy:                               │ │   │
│  │  │    - Priority (configurable)                          │ │   │
│  │  │    - Remaining quota (proactive)                      │ │   │
│  │  │    - Cost per token                                   │ │   │
│  │  │    - Latency (rolling average)                        │ │   │
│  │  │    - Error rate (historical)                           │ │   │
│  │  │                                                       │ │   │
│  │  │  • Error Handling:                                    │ │   │
│  │  │    - 401/403 → Mark invalid, rotate                  │ │   │
│  │  │    - 429 → Cooldown, rotate                          │ │   │
│  │  │    - 402 → Mark exhausted, rotate                     │ │   │
│  │  │    - 5xx → Retry with backoff                        │ │   │
│  │  │                                                       │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                              │                             │   │
│  │                              ▼                             │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │              Key Manager Service                     │ │   │
│  │  │                                                       │ │   │
│  │  │  • Provider Registry                                │ │   │
│  │  │  • Key Lifecycle (active/exhausted/cooldown)         │ │   │
│  │  │  • Usage Tracking & Statistics                       │ │   │
│  │  │  • Account Generation (Playwright)                   │ │   │
│  │  │  • Encryption at Rest (Fernet)                       │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  RAW PROVIDER APIs                       │   │
│  │                                                              │   │
│  │   ┌─────────┐  ┌──────────┐  ┌────────┐  ┌────────┐   │   │
│  │   │  Groq   │  │OpenRouter│  │ Gemini │  │DeepSeek│   │   │
│  │   └─────────┘  └──────────┘  └────────┘  └────────┘   │   │
│  │   ┌─────────┐  ┌──────────┐  ┌────────┐  ┌────────┐   │   │
│  │   │DeepInfra│  │  Mistral │  │Cohere │  │Together│   │   │
│  │   └─────────┘  └──────────┘  └────────┘  └────────┘   │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 División de Responsabilidades

| Componente | Responsabilidad Única | NO hace |
|-----------|----------------------|---------|
| **LibreChat** | UI, Auth, User Management | Routing, Key Management |
| **AI-OS** | Agent orchestration, Context | Key Management |
| **Free Claude Code** | Tool calling, Planning | Key Management |
| **ComfyUI Bridge** | Image generation workflows | Key Management |
| **RAG Service** | Semantic search, embeddings | Key Management |
| **API-Key Manager** | Key lifecycle, Routing, Provider abstraction | UI, Agent logic |
| **LiteLLM** | ~~Routing~~ (ELIMINADO) | (Replaced by API-Key) |

### 4.3 Por qué ELIMINAR LiteLLM como Router

LiteLLM fue diseñado para ser un proxy genérico. Pero tiene limitaciones:

1. **No conoce el estado de las keys**:
   - Solo sabe que recibió 429
   - No sabe cuántas requests quedan
   - No hace detección proactiva

2. **Routing básico**:
   - `least-busy` no considera costo ni latencia
   - No tiene priorización configurable
   - Fallback chain estático

3. **Monitoreo limitado**:
   - No tiene dashboard de keys
   - No tiene generación automática de accounts
   - No tiene cooldown inteligente

**Conclusión**: API-Key Manager hace TODO lo que LiteLLM hacía para routing, MEJOR.

### 4.4 Integración con Componentes Existentes

#### Free Claude Code Bridge

```python
# ANTES (con LiteLLM):
response = await litellm.chat.completions.create(
    model="anthropic/claude-sonnet-4-20250514",
    messages=messages,
)

# DESPUÉS (con API-Key):
response = await api_key_client.chat(
    provider="anthropic",  # o "auto" para selección automática
    model="claude-sonnet-4-20250514",
    messages=messages,
)
```

#### ComfyUI Bridge

```python
# El bridge de ComfyUI ya tiene su propia lógica
# Solo necesita recibir una API key válida del API-Key Manager
api_key = await api_key_manager.get_key(provider="stability")
```

#### Scheduler Service

```python
# Scheduler puede interactuar con API-Key para:
# - Monitorear uso de keys
# - Programar rotación de keys
# - Alertas de cuota baja
```

---

## 5. COMPONENTES DE API-KEY A INTEGRAR

### 5.1 Componentes a Migrar

| Componente | Origen | Destino en Mi LibreChat |
|-----------|--------|------------------------|
| AIRouter | api-key/services | `api/server/services/APIKeyManager/` |
| KeyService | api-key/services | `api/server/services/APIKeyManager/` |
| Provider model | api-key/models | `api/server/services/APIKeyManager/models/` |
| ApiKey model | api-key/models | `api/server/services/APIKeyManager/models/` |
| Account model | api-key/models | `api/server/services/APIKeyManager/models/` |
| UsageLog model | api-key/models | `api/server/services/APIKeyManager/models/` |
| KeyRotation worker | api-key/workers | `api/server/services/Scheduler/` (integrado) |
| QuotaMonitor | api-key/services | `api/server/services/APIKeyManager/` |
| AccountGenerator | api-key/workers | `api/server/services/APIKeyManager/` |
| Playwright scripts | api-key/playwright | `api/server/services/APIKeyManager/automation/` |

### 5.2 Componentes a ELIMINAR (no necesarios)

| Componente | Razón |
|-----------|-------|
| LiteLLM Proxy | Reemplazado por API-Key Router |
| LiteLLM Config Generator | Ya no se necesita |
| Frontend Dashboard | LibreChat ya tiene UI |
| Open WebUI | LibreChat ya es el frontend |

### 5.3 Componentes a CREAR

| Componente | Responsabilidad |
|-----------|----------------|
| API-Key Service | Wrapper para LibreChat API |
| API-Key Middleware | Inyección de API-Key en requests |
| API-Key Admin Routes | CRUD de providers y keys |

---

## 6. DIAGRAMA DE ARQUITECTURA FINAL

```
                              USUARIO
                                 │
                                 ▼
                    ┌──────────────────────┐
                    │   LibreChat (Frontend) │
                    └──────────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────┐
                    │   LibreChat API        │
                    │   (Node.js)           │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │ API-Key Client  │  │
                    │  │ (Wrapper)       │  │
                    │  └─────────────────┘  │
                    └──────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
              ▼                  ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │    ComfyUI      │ │   Free Claude   │ │      RAG        │
    │    Bridge       │ │   Code Bridge   │ │    Service      │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
              │                  │                   │
              └──────────────────┼───────────────────┘
                                 │
                                 ▼
              ┌─────────────────────────────────────────┐
              │         API-KEY MANAGER                │
              │           (Native Gateway)             │
              │                                        │
              │  ┌──────────────────────────────────┐  │
              │  │     Intelligent Router           │  │
              │  │                                  │  │
              │  │  Selection Strategy:            │  │
              │  │  • Priority                      │  │
              │  │  • Remaining Quota (proactive)   │  │
              │  │  • Cost                          │  │
              │  │  • Latency                       │  │
              │  │  • Error Rate                    │  │
              │  │                                  │  │
              │  │  Error Handling:                 │  │
              │  │  • 401/403 → Invalid, Rotate    │  │
              │  │  • 429 → Cooldown, Rotate       │  │
              │  │  • 402 → Exhausted, Rotate      │  │
              │  │  • 5xx → Retry w/ backoff      │  │
              │  └──────────────────────────────────┘  │
              │                    │                     │
              │                    ▼                     │
              │  ┌──────────────────────────────────┐  │
              │  │     Key Manager Service          │  │
              │  │                                  │  │
              │  │  • Provider Registry             │  │
              │  │  • Key Lifecycle                 │  │
              │  │  • Usage Tracking               │  │
              │  │  • Account Automation           │  │
              │  │  • Encryption (Fernet)           │  │
              │  └──────────────────────────────────┘  │
              │                    │                     │
              │                    ▼                     │
              │  ┌──────────────────────────────────┐  │
              │  │     Database (PostgreSQL)        │  │
              │  │                                  │  │
              │  │  • providers                     │  │
              │  │  • api_keys                     │  │
              │  │  • accounts                     │  │
              │  │  • usage_logs                  │  │
              │  │  • email_aliases                │  │
              │  └──────────────────────────────────┘  │
              │                    │                     │
              │                    ▼                     │
              │  ┌──────────────────────────────────┐  │
              │  │     Cache (Redis)               │  │
              │  │                                  │  │
              │  │  • Key state cache              │  │
              │  │  • Rate limiting                │  │
              │  │  • Celery broker                │  │
              │  └──────────────────────────────────┘  │
              └─────────────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
              ▼                  ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │     Groq        │ │   OpenRouter    │ │     Gemini      │
    │  (Playwright)   │ │  (Playwright)   │ │  (Playwright)   │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │    DeepSeek     │ │   DeepInfra     │ │     Others      │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## 7. EVIDENCIA DE DECISIONES

### 7.1 Responsabilidades Únicas por Componente

| Componente | Única Responsabilidad | Razón |
|-----------|----------------------|-------|
| LibreChat | Interfaz de usuario, autenticación | Ya existe, no duplicar |
| AI-OS | Orquestación de agentes | Ya existe, no duplicar |
| Free Claude Code | Tool calling, planning | Ya existe, no duplicar |
| ComfyUI Bridge | Generación de imágenes | Ya existe, no duplicar |
| RAG Service | Búsqueda semántica | Ya existe, no duplicar |
| **API-Key Manager** | **Gestión de keys, routing inteligente** | **Nueva responsabilidad nativa** |

### 7.2 NO Duplicación con LiteLLM

| Función | LiteLLM (Eliminado) | API-Key (Reemplazo) |
|---------|-------------------|---------------------|
| Routing | basic (least-busy) | intelligent (multi-criteria) |
| Key state | unknown | fully tracked |
| Proactive depletion | ❌ | ✅ |
| Automatic rotation | basic | full lifecycle |
| Account generation | ❌ | ✅ (Playwright) |
| Dashboard | separate | integrated |
| Quota monitoring | limited | proactive |

### 7.3 Evitar Ciclos de Dependencias

```
LibreChat → API-Key → Providers
     ↑                    │
     └────────────────────┘ (NO hay ciclo, es DAG)
```

### 7.4 Evitar Duplicación

- **LiteLLM como proxy** → ELIMINADO (API-Key lo reemplaza)
- **Model config en LibreChat** → MIGRAR a API-Key
- **Custom endpoints** → INTEGRAR en API-Key

---

## 8. PRÓXIMOS PASOS

### Fase 1: Análisis (Completado ✅)
- [x] Auditar repositorio api-key
- [x] Auditar repositorio principal
- [x] Evaluar opciones de ubicación
- [x] Seleccionar arquitectura óptima

### Fase 2: Diseño (Pendiente)
- [ ] Diseñar schemas de base de datos
- [ ] Diseñar API del API-Key Manager
- [ ] Diseñar integración con LibreChat

### Fase 3: Implementación (Pendiente)
- [ ] Crear estructura de carpetas
- [ ] Migrar modelos de datos
- [ ] Implementar Intelligent Router
- [ ] Implementar Key Manager Service
- [ ] Integrar con LibreChat
- [ ] Eliminar LiteLLM como proxy
- [ ] Migrar Scheduler Service

### Fase 4: Validación (Pendiente)
- [ ] Tests de integración
- [ ] Tests de stress
- [ ] Documentación

---

## 9. CONCLUSIONES

### 9.1 Arquitectura Seleccionada

**API-Key Manager como Gateway Nativo**

Esta arquitectura ofrece:
- ✅ Responsabilidad única para gestión de keys
- ✅ Routing inteligente centralizado
- ✅ Eliminación de duplicación con LiteLLM
- ✅ Sistema nativo, no parche
- ✅ Fácil de extender
- ✅ Desacoplado de otros componentes

### 9.2 Cambios Principales

1. **ELIMINAR**: LiteLLM como proxy de routing
2. **MIGRAR**: Funcionalidad de api-key al stack principal
3. **INTEGRAR**: API-Key Manager como gateway nativo
4. **MANTENER**: LibreChat, AI-OS, Free Claude Code, ComfyUI Bridge, RAG Service

### 9.3 Beneficios

| Beneficio | Descripción |
|-----------|-------------|
| **Single Source of Truth** | Una sola fuente para estado de keys |
| **Routing Inteligente** | Selección por prioridad, cuota, costo, latencia |
| **Proactivo** | Detecta depletion antes de que falle |
| **Autónomo** | Auto-genera accounts y rota keys |
| **Escalable** | Componente independiente y extensible |
| **Mantenible** | Lógica de routing en un solo lugar |

---

**Documento preparado para revisión y aprobación antes de implementación.**
