# DISEÑO DE ARQUITECTURA PROFESIONAL v2.0
## Sistema Multi-LLM para Mi LibreChat

**Versión:** 2.0.0  
**Fecha:** 2026-07-22  
**Estado:** PARA VALIDACIÓN  
**Basado en:** Auditorías previas + Análisis de arquitectura actual

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Análisis del Estado Actual](#2-análisis-del-estado-actual)
3. [Arquitectura Propuesta](#3-arquitectura-propuesta)
4. [Componentes de la Arquitectura](#4-componentes-de-la-arquitectura)
5. [Interfaces entre Componentes](#5-interfaces-entre-componentes)
6. [Modelo de Datos Unificado](#6-modelo-de-datos-unificado)
7. [Diagrama de Flujo Completo](#7-diagrama-de-flujo-completo)
8. [Decisiones de Arquitectura (ADRs)](#8-decisiones-de-arquitectura-adrs)
9. [Estrategia de Migración](#9-estrategia-de-migración)
10. [Plan de Implementación por Fases](#10-plan-de-implementación-por-fases)
11. [Reutilización de Componentes Existentes](#11-reutilización-de-componentes-existentes)
12. [Dashboard Multi-LLM](#12-dashboard-multi-llm)
13. [Comparativa y Validación](#13-comparativa-y-validación)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Visión

Diseñar una arquitectura profesional, modular y escalable para el sistema Multi-LLM de Mi LibreChat que permita:

- **Escalabilidad horizontal**: Agregar nuevos proveedores sin modificar el código existente
- **Mantenibilidad**: Cada componente con única responsabilidad
- **Resiliencia**: Fallbacks automáticos y recuperación inteligente
- **Observabilidad**: Trazabilidad completa de extremo a extremo
- **Seguridad**: Gestión centralizada de credenciales con encriptación

### 1.2 Arquitectura Objetivo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USUARIO FINAL                                      │
│                         (LibreChat UI)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER DE ORQUESTACIÓN                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   Request   │  │   Policy   │  │ Capability │  │  Execution  │      │
│  │   Gateway   │──▶│   Engine   │──▶│   Router   │──▶│   Engine    │      │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LAYER DE PROVEEDORES                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Provider   │  │   Free     │  │  LiteLLM   │  │   Native   │      │
│  │  Registry   │──▶│   Claude   │──▶│  Gateway   │──▶│  Providers │      │
│  │             │  │   Code     │  │            │  │            │      │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
│         │                                                    │             │
│         │              ┌─────────────┐                     │             │
│         └──────────────▶│   Account   │◀────────────────────┘             │
│                        │   Manager   │                                       │
│                        └─────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER DE CREDENCIALES                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │    API     │  │   Token &   │  │   Health   │  │   Audit    │      │
│  │    Key     │──▶│   Quota    │──▶│  Monitor   │──▶│   Logger   │      │
│  │   Manager  │  │   Manager   │  │            │  │            │      │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Principios de Diseño

| Principio | Descripción |
|-----------|-------------|
| **SRP** | Cada componente tiene UNA única responsabilidad |
| **DIP** | Depender de abstracciones, no de implementaciones |
| **OCP** | Abierto para extensión, cerrado para modificación |
| **ISP** | Interfaces específicas para cada cliente |
| **Replaceability** | Cualquier proveedor puede sustituirse sin cambios en otros módulos |

---

## 2. ANÁLISIS DEL ESTADO ACTUAL

### 2.1 Componentes Existentes y su Estado

| Componente | Ubicación | Estado | Reutilizable | Evolución |
|------------|-----------|--------|--------------|-----------|
| **LLMGateway.js** | `api/server/services/LLMGateway/` | 🟢 Productivo | ✅ Sí | Integrar con APIKeyManager |
| **APIKeyManager (Python)** | `api/server/services/APIKeyManager/` | 🟢 Productivo | ✅ Sí | API REST, UI admin |
| **ProviderLayer** | `api/server/services/ProviderLayer/` | 🟡 Desarrollo | ✅ Sí | Conectar con APIKeyManager |
| **LiteLLM Client** | `integrations/litellm-gateway/` | 🟡 Desarrollo | ✅ Sí | Integrar como proxy |
| **CapabilityRouter** | `api/server/services/CapabilityRouter/` | 🟡 Desarrollo | ✅ Sí | Testing completo |
| **Auth Strategies** | `api/strategies/` | 🟢 Productivo | ✅ Sí | 2FA adicional |

### 2.2 Gaps Críticos Identificados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GAPS CRÍTICOS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GAP 1: Desconexión LLMGateway ↔ APIKeyManager                            │
│  ─────────────────────────────────────────────────                         │
│  • LLMGateway usa variables de entorno (estáticas)                         │
│  • No hay rotación dinámica de claves                                       │
│  • Duplicación de lógica de providers                                       │
│                                                                             │
│  GAP 2: ProviderLayer no conectado                                         │
│  ─────────────────────────────────────                                     │
│  • GroqProvider existe en 3 lugares diferentes                             │
│  • No hay registry unificado                                               │
│  • Métricas en memoria (no persisten)                                      │
│                                                                             │
│  GAP 3: LiteLLM no integrado                                               │
│  ────────────────────────────────                                          │
│  • Cliente existe pero no se usa                                            │
│  • No hay endpoint para configurarlo desde frontend                        │
│  • Falta documentación de deployment                                       │
│                                                                             │
│  GAP 4: No hay Account Manager centralizado                                 │
│  ──────────────────────────────────────                                     │
│  • Diferentes métodos de autenticación por proveedor                       │
│  • No hay manejo de OAuth, cookies, browser sessions                      │
│  • No hay renovación automática                                            │
│                                                                             │
│  GAP 5: Dashboard fragmentado                                              │
│  ─────────────────────────────                                             │
│  • Métricas dispersas en múltiples ubicaciones                            │
│  • No hay observabilidad centralizada                                      │
│  • No hay alertas proactivas                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Componentes a Crear

| Componente | Prioridad | Complejidad | Descripción |
|------------|-----------|-------------|-------------|
| **PolicyEngine** | 🔴 Alta | Alta | Motor de reglas de negocio |
| **AccountManager** | 🔴 Alta | Alta | Gestión centralizada de cuentas |
| **TokenQuotaManager** | 🔴 Alta | Media | Control de consumo y cuotas |
| **HealthMonitor** | 🟡 Media | Media | Verificación proactiva de salud |
| **AuditLogger** | 🟡 Media | Baja | Registro inmutable de operaciones |

---

## 3. ARQUITECTURA PROPUEStA

### 3.1 Vista de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURA MULTI-LLM v2.0                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CAPA DE PRESENTACIÓN                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │   │
│  │  │  LibreChat   │  │  Dashboard   │  │  Mission Control UI     │ │   │
│  │  │     UI       │  │  Enterprise  │  │  (Agent Supervision)    │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        UNIFIED GATEWAY                               │   │
│  │  ┌─────────────────────────────────────────────────────────────┐  │   │
│  │  │  • Authentication (JWT, OAuth2, API Keys)                   │  │   │
│  │  │  • Rate Limiting (Global + Per-User + Per-Provider)        │  │   │
│  │  │  • Request Validation & Transformation                      │  │   │
│  │  │  • Metrics Collection (Prometheus)                         │  │   │
│  │  │  • Circuit Breaker (Global)                               │  │   │
│  │  │  • CORS & Security Headers                                 │  │   │
│  │  └─────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐│
│  │                                 │                                      ││
│  ▼                                 ▼                                      ││
│  ┌─────────────────────┐   ┌─────────────────────┐                      ││
│  │   EXECUTION ENGINE   │   │    POLICY ENGINE    │                      ││
│  │                     │   │                      │                      ││
│  │  • Request Transform │   │  • Priority Rules    │                      ││
│  │  • Response Transform│   │  • Cost Limits       │                      ││
│  │  • Streaming (SSE)  │   │  • Latency Limits    │                      ││
│  │  • Retry & Backoff  │   │  • User Policies     │                      ││
│  │  • Timeout Mgmt     │   │  • Project Policies  │                      ││
│  └──────────┬──────────┘   └──────────┬──────────┘                      ││
│             │                         │                                   ││
│             └────────────┬────────────┘                                   ││
│                          │                                                ││
│                          ▼                                                ││
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      CAPABILITY ROUTER                                │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │  DECISION MATRIX                                              │   │  │
│  │  │  ─────────────────────────────────────────────────────       │   │  │
│  │  │                                                               │   │  │
│  │  │  Required Capability ──┬──▶ Filter Providers ──▶ Score       │   │  │
│  │  │                       │                                      │   │  │
│  │  │  Policy Constraints ───┼──▶ Apply Rules ───▶ Adjust Score   │   │  │
│  │  │                       │                                      │   │  │
│  │  │  Real-time Health ─────┼──▶ Check Status ──▶ Filter        │   │  │
│  │  │                       │                                      │   │  │
│  │  │  Quota Status ────────┼──▶ Check Limits ──▶ Filter        │   │  │
│  │  │                       │                                      │   │  │
│  │  │  Cost Optimization ────┴──▶ Select Best ──▶ Execute       │   │  │
│  │  │                                                               │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐│
│  │                                 │                                      ││
│  ▼                                 ▼                                      ││
│  ┌─────────────────────┐   ┌─────────────────────┐                      ││
│  │  PROVIDER REGISTRY   │   │  PROVIDER MANAGER   │                      ││
│  │                      │   │                      │                      ││
│  │  • Provider Catalog  │   │  • Enable/Disable   │                      ││
│  │  • Capabilities     │   │  • Priority Config  │                      ││
│  │  • Model Catalog    │   │  • Weights & Rules │                      ││
│  │  • Health Status    │   │  • Load Balancing   │                      ││
│  │  • Quota Status     │   │  • Maintenance     │                      ││
│  └──────────┬──────────┘   └──────────┬──────────┘                      ││
│             │                         │                                   ││
│             └────────────┬────────────┘                                   ││
│                          │                                                ││
│                          ▼                                                ││
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                   PROVIDER ADAPTERS                                   │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐ │  │
│  │  │   Native    │ │ Free Claude  │ │   LiteLLM   │ │  Custom   │ │  │
│  │  │  Providers  │ │    Code      │ │   Gateway   │ │  Adapters │ │  │
│  │  │             │ │  Adapter     │ │             │ │            │ │  │
│  │  │ • Groq     │ │             │ │             │ │            │ │  │
│  │  │ • DeepSeek │ │ Implements  │ │  Uniﬁed    │ │ Implement  │ │  │
│  │  │ • Gemini   │ │ IProvider   │ │  Interface  │ │ IProvider  │ │  │
│  │  │ • ...      │ │             │ │             │ │            │ │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └───────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐│
│  │                                 │                                      ││
│  ▼                                 ▼                                      ││
│  ┌─────────────────────┐   ┌─────────────────────┐                      ││
│  │  ACCOUNT MANAGER    │   │  API KEY MANAGER   │                      ││
│  │                     │   │                     │                      ││
│  │  • API Keys        │   │  • Secure Storage  │                      ││
│  │  • OAuth Tokens    │   │  • Encryption      │                      ││
│  │  • JWT Tokens      │   │  • Auto Rotation   │                      ││
│  │  • Cookies         │   │  • Health Checks   │                      ││
│  │  • Browser Sessions│   │  • Rate Limiting   │                      ││
│  │  • Refresh Tokens  │   │  • Cooldowns       │                      ││
│  └──────────┬──────────┘   └──────────┬──────────┘                      ││
│             │                         │                                   ││
│             └────────────┬────────────┘                                   ││
│                          │                                                ││
│                          ▼                                                ││
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     TOKEN & QUOTA MANAGER                            │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │  TRACKING DIMENSIONS                                        │   │  │
│  │  │  ─────────────────────────────────────────────────────       │   │  │
│  │  │  • Conversation Tokens   • User Tokens                      │   │  │
│  │  │  • Project Tokens       • Model Tokens                      │   │  │
│  │  │  • Provider Tokens      • Daily/Monthly Usage               │   │  │
│  │  │  • Estimated Cost       • Rate of Consumption               │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                       SUPPORTING SERVICES                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │  │
│  │  │    Event     │  │    Health    │  │    Audit    │              │  │
│  │  │     Bus      │  │   Monitor    │  │    Logger   │              │  │
│  │  │             │  │              │  │              │              │  │
│  │  │  • Pub/Sub  │  │  • Probes    │  │  • Immutable│              │  │
│  │  │  • SSE      │  │  • Alerts    │  │  • Hash Chain│             │  │
│  │  │  • WebSocket│  │  • Recovery  │  │  • Compliance│              │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de Solicitud Detallado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUJO DE SOLICITUD - SECUENCIA COMPLETA                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USER ───▶ LibreChat UI                                                     │
│              │                                                               │
│              │ 1. POST /v1/chat/completions                                  │
│              │    {                                                          │
│              │      "model": "auto",  // "auto" = capability routing        │
│              │      "messages": [...],                                      │
│              │      "metadata": {                                           │
│              │        "capabilities": ["code", "reasoning"],                │
│              │        "project_id": "proj_123",                            │
│              │        "user_tier": "pro"                                  │
│              │      }                                                       │
│              │    }                                                         │
│              ▼                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         UNIFIED GATEWAY                                 │  │
│  │  ─────────────────────────────────────────────────────────────────    │  │
│  │                                                                        │  │
│  │  2. AUTHENTICATION                                                     │  │
│  │     • Verify JWT Token                                                 │  │
│  │     • Extract user_id, project_id, organization_id                      │  │
│  │                                                                        │  │
│  │  3. RATE LIMITING                                                      │  │
│  │     • Check user quota (Redis: ratelimit:{user_id})                    │  │
│  │     • Check project quota                                               │  │
│  │     • Return 429 if exceeded                                           │  │
│  │                                                                        │  │
│  │  4. REQUEST VALIDATION                                                 │  │
│  │     • Validate message format                                           │  │
│  │     • Check max_tokens (cap by user tier)                               │  │
│  │     • Sanitize input                                                   │  │
│  │                                                                        │  │
│  │  5. CIRCUIT BREAKER (Global)                                           │  │
│  │     • Check if system is overloaded                                    │  │
│  │     • Return 503 if circuit open                                        │  │
│  │                                                                        │  │
│  │  6. METRICS                                                           │  │
│  │     • Increment counter: requests_total{user, model}                   │  │
│  │     • Start latency timer                                              │  │
│  │                                                                        │  │
│  │  7. TRACE ID                                                          │  │
│  │     • Generate: trace_{timestamp}_{random}                            │  │
│  │     • Propagate to all components                                      │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│              │                                                               │
│              │ (validated_request, trace_id, user_context)                    │
│              ▼                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         POLICY ENGINE                                   │  │
│  │  ─────────────────────────────────────────────────────────────────    │  │
│  │                                                                        │  │
│  │  8. LOAD USER POLICIES                                                │  │
│  │     ┌─────────────────────────────────────────────────────────────┐  │  │
│  │     │  policies = get_user_policies(user_id, project_id)           │  │  │
│  │     │  {                                                           │  │  │
│  │     │    "max_cost_per_request": 0.50,                            │  │  │
│  │     │    "max_latency_ms": 30000,                                 │  │  │
│  │     │    "allowed_models": ["claude-3-5-sonnet", "gpt-4o"],       │  │  │
│  │     │    "denied_models": ["gpt-3.5-turbo"],                      │  │  │
│  │     │    "preferred_providers": ["anthropic", "openai"],          │  │  │
│  │     │    "fallback_strategy": "cost_first",                       │  │  │
│  │     │    "experimental_models_allowed": false                      │  │  │
│  │     │  }                                                           │  │  │
│  │     └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  9. APPLY CONSTRAINTS                                                 │  │
│  │     • Filter models exceeding max_cost                                 │  │
│  │     • Filter models exceeding max_latency                              │  │
│  │     • Apply allowed/denied lists                                       │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│              │                                                               │
│              │ (filtered_request, policies, trace_id)                        │
│              ▼                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      CAPABILITY ROUTER                                 │  │
│  │  ─────────────────────────────────────────────────────────────────    │  │
│  │                                                                        │  │
│  │  10. EXTRACT CAPABILITIES                                             │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  requested_caps = [                                        │  │  │
│  │      │    "code_generation",  // from metadata.capabilities       │  │  │
│  │      │    "reasoning",        // inferred from model or prompt    │  │  │
│  │      │    "streaming"         // from stream parameter             │  │  │
│  │      │  ]                                                          │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  11. QUERY PROVIDER REGISTRY                                          │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  candidates = provider_registry.get_providers(              │  │  │
│  │      │    capabilities=requested_caps,                             │  │  │
│  │      │    enabled=true                                            │  │  │
│  │      │  )                                                         │  │  │
│  │      │  // Returns list of providers with their model mappings     │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  12. CHECK HEALTH STATUS                                              │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  For each candidate:                                        │  │  │
│  │      │    health = health_monitor.check(provider_id)               │  │  │
│  │      │    If health.status != HEALTHY:                             │  │  │
│  │      │      If health.status == DEGRADED:                          │  │  │
│  │      │        Apply penalty to score                               │  │  │
│  │      │      Else: // UNHEALTHY                                    │  │  │
│  │      │        Remove from candidates                               │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  13. CHECK QUOTA STATUS                                               │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  For each candidate:                                        │  │  │
│  │      │    quota = token_quota_manager.get_remaining(provider_id)   │  │  │
│  │      │    If quota.remaining <= 0:                                  │  │  │
│  │      │      Remove from candidates                                 │  │  │
│  │      │    Else If quota.remaining < quota.threshold:              │  │  │
│  │      │      Emit warning event                                     │  │  │
│  │      │      Apply penalty to score                                 │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  14. CALCULATE SCORES                                                 │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  For each candidate:                                        │  │  │
│  │      │    score = 0                                               │  │  │
│  │      │                                                             │  │  │
│  │      │    // Capability match (30%)                                │  │  │
│  │      │    score += 0.30 * capability_match_score                   │  │  │
│  │      │                                                             │  │  │
│  │      │    // Health status (25%)                                   │  │  │
│  │      │    score += 0.25 * health_score                            │  │  │
│  │      │                                                             │  │  │
│  │      │    // Latency (20%)                                         │  │  │
│  │      │    score += 0.20 * latency_score                           │  │  │
│  │      │                                                             │  │  │
│  │      │    // Cost (15%)                                            │  │  │
│  │      │    score += 0.15 * cost_score                              │  │  │
│  │      │                                                             │  │  │
│  │      │    // Priority/Preference (10%)                            │  │  │
│  │      │    score += 0.10 * priority_score                          │  │  │
│  │      │  }                                                         │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  15. SELECT BEST PROVIDER                                             │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  selected = candidates                                      │  │  │
│  │      │    .sort_by(score, descending)                              │  │  │
│  │      │    .first()                                                │  │  │
│  │      │                                                             │  │  │
│  │      │  fallbacks = candidates                                     │  │  │
│  │      │    .sort_by(score, descending)                             │  │  │
│  │      │    .skip(1)                                                │  │  │
│  │      │    .take(3)                                                │  │  │
│  │      │                                                             │  │  │
│  │      │  Return { selected, fallbacks, routing_reason }             │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│              │                                                               │
│              │ (selected_provider, fallbacks, routing_reason)                  │
│              ▼                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      EXECUTION ENGINE                                  │  │
│  │  ─────────────────────────────────────────────────────────────────    │  │
│  │                                                                        │  │
│  │  16. GET API KEY                                                      │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  api_key = api_key_manager.get_best_key(                    │  │  │
│  │      │    provider_id=selected.provider_id,                        │  │  │
│  │      │    user_id=user_id                                          │  │  │
│  │      │  )                                                          │  │  │
│  │      │                                                             │  │  │
│  │      │  // Returns decrypted key, updates last_used_at             │  │  │
│  │      │  // Handles rotation if needed                               │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  17. TRANSFORM REQUEST                                                │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  // Convert from standard format to provider-specific      │  │  │
│  │      │  provider_request = execution_engine.transform_request(    │  │  │
│  │      │    request,                                                │  │  │
│  │      │    target_format=selected.provider.api_format              │  │  │
│  │      │  )                                                        │  │  │
│  │      │                                                             │  │  │
│  │      │  // Example: OpenAI → Anthropic                            │  │  │
│  │      │  {                                                         │  │  │
│  │      │    "model": "claude-3-5-sonnet-20240620",                │  │  │
│  │      │    "messages": [...],                                      │  │  │
│  │      │    "max_tokens": 8192,                                     │  │  │
│  │      │    "stream": true                                          │  │  │
│  │      │  }                                                         │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  18. EXECUTE WITH RETRY                                               │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  result = await execution_engine.execute(                  │  │  │
│  │      │    provider=selected.provider,                             │  │  │
│  │      │    request=provider_request,                               │  │  │
│  │      │    api_key=api_key,                                       │  │  │
│  │      │    options={                                              │  │  │
│  │      │      timeout: 120000,                                      │  │  │
│  │      │      retries: 3,                                          │  │  │
│  │      │      backoff: "exponential",                               │  │  │
│  │      │      on_retry: (attempt, error) => {                     │  │  │
│  │      │        // Try next fallback                                │  │  │
│  │      │        if (attempt.failed && fallbacks.length > 0) {      │  │  │
│  │      │          return fallbacks.shift()                         │  │  │
│  │      │        }                                                   │  │  │
│  │      │      }                                                     │  │  │
│  │      │    }                                                      │  │  │
│  │      │  )                                                        │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  19. TRANSFORM RESPONSE                                               │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  // Convert from provider format to standard OpenAI format  │  │  │
│  │      │  response = execution_engine.transform_response(            │  │  │
│  │      │    provider_response,                                       │  │  │
│  │      │    source_format=selected.provider.api_format               │  │  │
│  │      │  )                                                        │  │  │
│  │      │                                                             │  │  │
│  │      │  // Now in standard format for client                      │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│              │                                                               │
│              │ (response, usage_stats)                                        │
│              ▼                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      TOKEN & QUOTA MANAGER                              │  │
│  │  ─────────────────────────────────────────────────────────────────    │  │
│  │                                                                        │  │
│  │  20. RECORD USAGE                                                     │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  token_quota_manager.record({                                 │  │  │
│  │      │    user_id,                                                  │  │  │
│  │      │    project_id,                                                │  │  │
│  │      │    provider_id: selected.provider_id,                         │  │  │
│  │      │    model: selected.model,                                     │  │  │
│  │      │    input_tokens: response.usage.prompt_tokens,                │  │  │
│  │      │    output_tokens: response.usage.completion_tokens,           │  │  │
│  │      │    estimated_cost: calculate_cost(selected, response.usage), │  │  │
│  │      │    latency_ms: response.latency                               │  │  │
│  │      │  })                                                          │  │  │
│  │      │                                                               │  │  │
│  │      │  // Updates all relevant counters and generates events        │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  21. CHECK THRESHOLDS                                                 │  │
│  │      ┌─────────────────────────────────────────────────────────────┐  │  │
│  │      │  If quota.remaining < quota.warning_threshold:              │  │  │
│  │      │    Emit event: "quota.warning"                            │  │  │
│  │      │    // Dashboard will show warning                          │  │  │
│  │      │                                                             │  │  │
│  │      │  If quota.remaining < quota.critical_threshold:            │  │  │
│  │      │    Emit event: "quota.critical"                           │  │  │
│  │      │    // Trigger auto-remediation if configured               │  │  │
│  │      │                                                             │  │  │
│  │      │  If quota.exhausted:                                       │  │  │
│  │      │    Emit event: "quota.exhausted"                          │  │  │
│  │      │    // Provider will be marked as unavailable               │  │  │
│  │      │    // PolicyEngine will reroute future requests            │  │  │
│  │      └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│              │                                                               │
│              ▼                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         EVENT BUS                                       │  │
│  │  ─────────────────────────────────────────────────────────────────    │  │
│  │                                                                        │  │
│  │  PUBLISH:                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────┐     │  │
│  │  │  event: "request.completed"                                 │     │  │
│  │  │  {                                                          │     │  │
│  │  │    trace_id,                                                │     │  │
│  │  │    user_id,                                                 │     │  │
│  │  │    provider_id,                                             │     │  │
│  │  │    model,                                                   │     │  │
│  │  │    latency_ms,                                              │     │  │
│  │  │    tokens_used,                                             │     │  │
│  │  │    cost,                                                    │     │  │
│  │  │    success: true                                            │     │  │
│  │  │  }                                                          │     │  │
│  │  └─────────────────────────────────────────────────────────────┘     │  │
│  │                                                                        │  │
│  │  SUBSCRIBE (Dashboard):                                               │  │
│  │  • provider.status.* → Update provider status panel                  │  │
│  │  • quota.warning.* → Show quota warning                              │  │
│  │  • api_key.* → Update API key status panel                          │  │
│  │  • audit.* → Log to audit trail                                     │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│              │                                                               │
│              │ SSE Stream (OpenAI format)                                    │
│              ▼                                                               │
│  LibreChat UI ───▶ USER                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. COMPONENTES DE LA ARQUITECTURA

### 4.1 Unified Gateway

**Ubicación:** `api/server/services/UnifiedGateway/`

**Responsabilidad:** Punto de entrada único para todas las solicitudes

**Interfaces:**
```typescript
interface IGateway {
  // Middleware
  authenticate(request: Request): Promise<UserContext>;
  rateLimit(request: Request, context: UserContext): Promise<RateLimitResult>;
  validate(request: Request): ValidatedRequest;
  
  // Metrics
  recordMetrics(request: Request, response: Response): void;
  
  // Circuit Breaker
  isSystemHealthy(): boolean;
  getSystemLoad(): number;
}
```

**Reutiliza de:**
- `api/strategies/` (autenticación JWT existente)
- LiteLLM client (rate limiting pattern)

**Evoluciona hacia:**
- Agregar rate limiting granular
- Agregar circuit breaker global
- Agregar métricas Prometheus

---

### 4.2 Policy Engine

**Ubicación:** `api/server/services/PolicyEngine/`

**Responsabilidad:** Centralizar todas las reglas de negocio

**Interfaces:**
```typescript
interface IPolicyEngine {
  // Policy Management
  getUserPolicies(userId: string, projectId?: string): UserPolicies;
  getProjectPolicies(projectId: string): ProjectPolicies;
  getOrganizationPolicies(orgId: string): OrganizationPolicies;
  
  // Evaluation
  evaluateRequest(request: LLMRequest, context: RequestContext): PolicyEvaluation;
  applyConstraints(request: LLMRequest, policies: UserPolicies): ConstrainedRequest;
  
  // Cost Estimation
  estimateCost(request: LLMRequest, providers: Provider[]): CostEstimate;
}

interface UserPolicies {
  maxCostPerRequest: number;
  maxLatencyMs: number;
  maxTokensPerDay: number;
  allowedModels: string[];
  deniedModels: string[];
  preferredProviders: string[];
  fallbackStrategy: 'cost_first' | 'latency_first' | 'reliability_first';
  experimentalModelsAllowed: boolean;
  customRules: PolicyRule[];
}
```

**Nuevas funcionalidades:**
- Políticas por usuario, proyecto, organización
- Límites de costo y latencia
- Estrategias de fallback configurables
- Modelos experimentales (on/off)
- Reglas personalizadas

---

### 4.3 Capability Router

**Ubicación:** `api/server/services/CapabilityRouter/` (existente)

**Responsabilidad:** Seleccionar provider óptimo basándose en capacidades

**Interfaces:**
```typescript
interface ICapabilityRouter {
  // Routing
  route(request: CapabilitiesRequest): RoutingResult;
  
  // Provider Query
  getProviders(capabilities: Capability[]): Provider[];
  getProviderHealth(providerId: string): ProviderHealth;
  
  // Scoring
  calculateScore(provider: Provider, request: RoutingRequest): number;
}

interface RoutingResult {
  selected: SelectedProvider;
  fallbacks: SelectedProvider[];
  routingReason: string;
  capabilitiesMatched: Capability[];
  capabilitiesMissing: Capability[];
}
```

**Evoluciona hacia:**
- Integración con Health Monitor
- Integración con Token & Quota Manager
- Scoring más sofisticado

---

### 4.4 Execution Engine

**Ubicación:** `api/server/services/ExecutionEngine/`

**Responsabilidad:** Ejecutar requests a providers con transformaciones

**Interfaces:**
```typescript
interface IExecutionEngine {
  // Execution
  execute(request: LLMRequest, provider: Provider): Promise<LLMResponse>;
  executeStream(request: LLMRequest, provider: Provider): AsyncIterator<StreamChunk>;
  
  // Transformation
  transformRequest(request: LLMRequest, targetFormat: ApiFormat): ProviderRequest;
  transformResponse(response: ProviderResponse, sourceFormat: ApiFormat): LLMResponse;
  
  // Retry
  executeWithRetry(request: LLMRequest, provider: Provider, options: RetryOptions): Promise<LLMResponse>;
}

interface RetryOptions {
  maxRetries: number;
  backoff: 'linear' | 'exponential' | 'fixed';
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: ErrorType[];
  onRetry?: (attempt: number, error: Error, nextProvider?: Provider) => Provider | null;
}
```

**Reutiliza de:**
- `api/server/services/LLMGateway/` (providers existentes)
- `integrations/litellm-gateway/lib/litellm_client.py` (retry logic)

---

### 4.5 Provider Registry

**Ubicación:** `api/server/services/ProviderRegistry/`

**Responsabilidad:** Catálogo centralizado de providers

**Interfaces:**
```typescript
interface IProviderRegistry {
  // Registration
  register(provider: ProviderDefinition): void;
  unregister(providerId: string): void;
  
  // Query
  getAll(): Provider[];
  getById(id: string): Provider | null;
  getByCapability(capabilities: Capability[]): Provider[];
  getByAuthMethod(authMethod: AuthMethod): Provider[];
  
  // Health & Quota (delegates)
  getHealthStatus(providerId: string): ProviderHealth;
  getQuotaStatus(providerId: string): QuotaStatus;
}

interface ProviderDefinition {
  id: string;                           // unique identifier
  name: string;                         // display name
  displayName: string;                  // human readable
  apiFormat: 'openai' | 'anthropic' | 'google' | 'custom';
  
  // Capabilities
  capabilities: Capability[];
  supportedModels: ModelDefinition[];
  
  // Authentication
  authMethod: AuthMethod;                // api_key | oauth | jwt | cookies | browser_session
  authConfig: AuthConfig;               // method-specific config
  
  // Limits
  rateLimitRpm: number;
  rateLimitTpm: number;
  dailyQuota: number;
  
  // Features
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsMCP: boolean;
  supportsMultimodal: boolean;
  
  // Configuration
  priority: number;                     // 1-100, higher = preferred
  weight: number;                        // for load balancing
  enabled: boolean;
  maintenance: boolean;
  
  // Adapter
  adapterClass: string;                 // class name to instantiate
  adapterConfig: Record<string, any>;   // provider-specific config
}

interface ModelDefinition {
  id: string;
  name: string;
  capabilities: Capability[];
  contextWindow: number;
  maxOutputTokens: number;
  cost: {
    inputPer1M: number;
    outputPer1M: number;
  };
}
```

**Reutiliza de:**
- `api/server/services/ProviderLayer/ProviderRegistry.ts` (existente)
- `api/server/services/LLMGateway/providers/` (provider implementations)

---

### 4.6 Provider Manager

**Ubicación:** `api/server/services/ProviderManager/`

**Responsabilidad:** Gestión operativa de providers

**Interfaces:**
```typescript
interface IProviderManager {
  // Lifecycle
  enableProvider(providerId: string): void;
  disableProvider(providerId: string, reason?: string): void;
  
  // Configuration
  setPriority(providerId: string, priority: number): void;
  setWeight(providerId: string, weight: number): void;
  setMaintenance(providerId: string, enabled: boolean, message?: string): void;
  
  // Status
  getStatus(providerId: string): ProviderStatus;
  getAllStatuses(): ProviderStatusMap;
  
  // Maintenance
  scheduleMaintenance(providerId: string, start: Date, end: Date): void;
  cancelMaintenance(providerId: string): void;
}

interface ProviderStatus {
  providerId: string;
  enabled: boolean;
  health: 'healthy' | 'degraded' | 'unhealthy';
  inMaintenance: boolean;
  maintenanceMessage?: string;
  lastHealthCheck: Date;
  currentLatencyMs: number;
  errorRate: number;
  quotaRemaining: number;
  quotaPercentage: number;
}
```

**Nuevo componente** - No existe actualmente

---

### 4.7 Account Manager

**Ubicación:** `api/server/services/AccountManager/`

**Responsabilidad:** Gestión centralizada de cuentas y autenticación

**Interfaces:**
```typescript
interface IAccountManager {
  // Account CRUD
  createAccount(account: Account): Promise<Account>;
  getAccount(accountId: string): Promise<Account | null>;
  updateAccount(accountId: string, updates: Partial<Account>): Promise<Account>;
  deleteAccount(accountId: string): Promise<void>;
  
  // Authentication Methods
  addApiKey(accountId: string, apiKey: ApiKeyInput): Promise<AccountCredential>;
  addOAuth(accountId: string, oauthConfig: OAuthConfig): Promise<OAuthSession>;
  addBrowserSession(accountId: string, session: BrowserSessionInput): Promise<Session>;
  
  // Session Management
  refreshSession(credentialId: string): Promise<Session>;
  validateSession(credentialId: string): Promise<boolean>;
  revokeSession(credentialId: string): Promise<void>;
  
  // Multi-account
  getAccountsForProvider(providerId: string): Account[];
  switchAccount(providerId: string, accountId: string): void;
}

interface Account {
  id: string;
  providerId: string;
  accountType: 'personal' | 'organization';
  ownerId?: string;
  organizationId?: string;
  credentials: AccountCredential[];
  status: 'active' | 'suspended' | 'expired';
  expiresAt?: Date;
  metadata: Record<string, any>;
}

interface AccountCredential {
  id: string;
  type: 'api_key' | 'oauth' | 'jwt' | 'cookies' | 'browser_session' | 'refresh_token';
  status: 'active' | 'expired' | 'revoked';
  lastUsed?: Date;
  expiresAt?: Date;
  metadata: Record<string, any>;
}
```

**Nuevo componente** - No existe actualmente

---

### 4.8 API Key Manager

**Ubicación:** `api/server/services/APIKeyManager/` (existente + evolución)

**Responsabilidad:** Gestión centralizada de credenciales

**Interfaces:**
```typescript
interface IAPIKeyManager {
  // Key Management
  createKey(providerId: string, key: string, options?: KeyOptions): Promise<APIKey>;
  getKey(keyId: string): Promise<APIKey | null>;
  getBestKey(providerId: string, userId?: string): Promise<APIKey>;
  updateKey(keyId: string, updates: Partial<APIKey>): Promise<APIKey>;
  deleteKey(keyId: string): Promise<void>;
  revokeKey(keyId: string): Promise<void>;
  
  // Health & Rotation
  checkHealth(keyId: string): Promise<HealthResult>;
  rotateKey(keyId: string, newKey: string): Promise<APIKey>;
  enableKey(keyId: string): Promise<void>;
  disableKey(keyId: string, reason?: string): Promise<void>;
  
  // Cooldowns
  setCooldown(keyId: string, durationMs: number): Promise<void>;
  clearCooldown(keyId: string): Promise<void>;
  getCooldownStatus(keyId: string): CooldownStatus;
  
  // Usage
  recordUsage(keyId: string, usage: UsageRecord): Promise<void>;
  getUsageStats(keyId: string, period: Period): UsageStats;
}

interface APIKey {
  id: string;
  providerId: string;
  accountId?: string;
  label: string;
  keyHash: string;                    // never store raw key
  encryptedKey: string;               // Fernet encrypted
  
  status: 'active' | 'exhausted' | 'cooldown' | 'invalid' | 'revoked';
  
  // Quotas
  remainingQuota: number;
  dailyLimit: number;
  cooldownUntil?: Date;
  
  // Stats
  lastUsedAt?: Date;
  errorCount: number;
  successCount: number;
  
  // Cost
  costPerToken?: number;
  
  // Priority
  priority: number;                   // 1-100
  isPrimary: boolean;
}
```

**Evoluciona desde:**
- `api/server/services/APIKeyManager/` (Python)
- `integrations/api-key-client/` (JavaScript SDK)

**Mejoras:**
- API REST completa
- UI de administración
- Integración con Event Bus
- Métricas Prometheus

---

### 4.9 Token & Quota Manager

**Ubicación:** `api/server/services/TokenQuotaManager/`

**Responsabilidad:** Control granular de consumo

**Interfaces:**
```typescript
interface ITokenQuotaManager {
  // Recording
  record(requestId: string, record: UsageRecord): Promise<void>;
  
  // Queries
  getRemaining(userId: string, dimension: QuotaDimension): number;
  getUsage(userId: string, period: Period, dimension?: QuotaDimension): UsageData;
  getCost(userId: string, period: Period): CostData;
  
  // Limits
  setLimit(userId: string, dimension: QuotaDimension, limit: number): Promise<void>;
  getLimits(userId: string): QuotaLimits;
  
  // Alerts
  getAlertStatus(userId: string): AlertStatus;
  configureAlert(userId: string, alert: AlertConfig): Promise<void>;
  
  // Project/Org level
  getProjectUsage(projectId: string, period: Period): ProjectUsage;
  getOrgUsage(orgId: string, period: Period): OrgUsage;
}

type QuotaDimension = 
  | 'tokens_conversation'
  | 'tokens_user_daily'
  | 'tokens_user_monthly'
  | 'tokens_project_daily'
  | 'tokens_model'
  | 'tokens_provider'
  | 'cost_daily'
  | 'cost_monthly';

interface UsageRecord {
  userId: string;
  projectId?: string;
  organizationId?: string;
  providerId: string;
  model: string;
  conversationId?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
  timestamp: Date;
}

interface UsageData {
  dimension: QuotaDimension;
  used: number;
  limit: number | null;         // null = unlimited
  percentage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  ratePerHour: number;
}
```

**Nuevo componente** - No existe actualmente

---

### 4.10 Free Claude Code Adapter

**Ubicación:** `api/server/services/Providers/FreeClaudeCodeAdapter/`

**Responsabilidad:** Integrar Free Claude Code como provider estándar

**Interfaces:**
```typescript
// Implements IProvider (standard interface)
class FreeClaudeCodeAdapter implements IProvider {
  readonly id = 'free_claude_code';
  readonly name = 'Free Claude Code';
  readonly apiFormat: ApiFormat = 'anthropic';
  
  // Capabilities
  readonly capabilities: Capability[] = [
    'llm_chat',
    'llm_reasoning',
    'code_generation',
    'code_review',
    'debugging',
    'analysis',
  ];
  
  readonly supportedModels: ModelDefinition[] = [
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', ... },
    { id: 'claude-opus-4', name: 'Claude Opus 4', ... },
  ];
  
  // Authentication
  readonly authMethod: AuthMethod = 'api_key';
  
  // Configuration
  readonly adapterConfig = {
    baseUrl: process.env.FREE_CLAUDE_CODE_URL || 'http://localhost:8080',
    authToken: process.env.FREE_CLAUDE_CODE_AUTH_TOKEN,
    rateLimitRpm: 40,
    timeout: 120000,
  };
  
  async healthCheck(): Promise<ProviderHealth> {
    const response = await fetch(`${this.baseUrl}/health`);
    return {
      healthy: response.ok,
      latencyMs: response.headers.get('x-latency') || 0,
    };
  }
  
  async execute(request: LLMRequest): Promise<LLMResponse> {
    // Transform request to Anthropic format
    const anthropicRequest = this.transformRequest(request);
    
    // Execute via Free Claude Code API
    const response = await this.client.post('/v1/messages', anthropicRequest);
    
    // Transform response back to standard format
    return this.transformResponse(response);
  }
  
  async *stream(request: LLMRequest): AsyncIterator<StreamChunk> {
    const response = await this.client.stream('/v1/messages', request);
    
    for await (const line of response) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        yield this.transformChunk(event);
      }
    }
  }
}
```

**Reutiliza de:**
- `alishahryar1/free-claude-code` (el servidor mismo)
- Patrones de provider de `LLMGateway.js`

---

### 4.11 LiteLLM Gateway Adapter

**Ubicación:** `api/server/services/Providers/LiteLLMAdapter/`

**Responsabilidad:** Integrar LiteLLM como provider estándar

**Interfaces:**
```typescript
class LiteLLMAdapter implements IProvider {
  readonly id = 'litellm';
  readonly name = 'LiteLLM Gateway';
  readonly apiFormat: ApiFormat = 'openai';  // LiteLLM uses OpenAI format
  
  // LiteLLM proxies to 100+ providers
  readonly capabilities: Capability[] = ['*'];  // All capabilities via LiteLLM
  
  // This adapter provides access to ALL LiteLLM-supported models
  // Model catalog is fetched dynamically from LiteLLM
  
  async listModels(): Promise<ModelDefinition[]> {
    const response = await fetch(`${this.baseUrl}/model/list`);
    const data = await response.json();
    return data.data.map(this.mapLiteLLMModel);
  }
}
```

**Reutiliza de:**
- `integrations/litellm-gateway/lib/litellm_client.py`

---

### 4.12 Health Monitor

**Ubicación:** `api/server/services/HealthMonitor/`

**Responsabilidad:** Verificación proactiva de salud de providers

**Interfaces:**
```typescript
interface IHealthMonitor {
  // Checks
  check(providerId: string): Promise<ProviderHealth>;
  checkAll(): Promise<Map<string, ProviderHealth>>;
  
  // Continuous Monitoring
  startMonitoring(): void;
  stopMonitoring(): void;
  
  // Configuration
  setInterval(intervalMs: number): void;
  setTimeout(timeoutMs: number): void;
  
  // History
  getHistory(providerId: string, period: Period): HealthHistory;
}

interface ProviderHealth {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  errorRate: number;
  lastCheck: Date;
  nextCheck: Date;
  details?: {
    quotaRemaining?: number;
    rateLimitRemaining?: number;
    specificErrors?: string[];
  };
}
```

**Nuevo componente** - Requerido para la nueva arquitectura

---

### 4.13 Audit Logger

**Ubicación:** `api/server/services/AuditLogger/`

**Responsabilidad:** Registro inmutable de operaciones sensibles

**Interfaces:**
```typescript
interface IAuditLogger {
  // Logging
  log(event: AuditEvent): Promise<void>;
  logBatch(events: AuditEvent[]): Promise<void>;
  
  // Querying
  query(filter: AuditFilter): Promise<AuditLog[]>;
  getByResource(resourceType: string, resourceId: string): Promise<AuditLog[]>;
  getByUser(userId: string, period: Period): Promise<AuditLog[]>;
  
  // Integrity
  verifyIntegrity(): Promise<IntegrityReport>;
  getMerkleRoot(): string;
}

interface AuditEvent {
  id: string;
  timestamp: Date;
  actor: {
    type: 'user' | 'system' | 'service';
    id: string;
    ip?: string;
  };
  action: AuditAction;
  resource: {
    type: ResourceType;
    id: string;
    name?: string;
  };
  outcome: 'success' | 'failure';
  details: Record<string, any>;
  metadata: {
    traceId: string;
    requestId?: string;
    sessionId?: string;
  };
  // Integrity
  previousHash: string;
  hash: string;
}

type AuditAction = 
  | 'api_key.created' | 'api_key.rotated' | 'api_key.revoked'
  | 'provider.enabled' | 'provider.disabled' | 'provider.configured'
  | 'quota.exceeded' | 'quota.limit_set'
  | 'user.login' | 'user.logout'
  | 'policy.created' | 'policy.modified';
```

**Nuevo componente** - Requerido para compliance

---

### 4.14 Event Bus

**Ubicación:** `api/server/services/EventBus/`

**Responsabilidad:** Sistema de eventos para comunicación desacoplada

**Interfaces:**
```typescript
interface IEventBus {
  // Publish
  publish(event: Event): Promise<void>;
  publishToChannel(channel: string, event: Event): Promise<void>;
  
  // Subscribe
  subscribe(channel: string, handler: EventHandler): Subscription;
  subscribeOnce(channel: string, handler: EventHandler): Promise<Event>;
  
  // Unsubscribe
  unsubscribe(subscriptionId: string): void;
  
  // Channels
  createChannel(channel: string): void;
  deleteChannel(channel: string): void;
}

interface Event {
  type: string;
  payload: any;
  metadata: {
    timestamp: Date;
    traceId: string;
    source: string;
    correlationId?: string;
  };
}

// Predefined channels
const Channels = {
  PROVIDER_STATUS: 'provider.status.*',
  QUOTA_WARNING: 'quota.warning.*',
  API_KEY_EVENTS: 'api_key.*',
  AUDIT: 'audit.*',
  METRICS: 'metrics.*',
} as const;
```

**Reutiliza de:**
- `client/src/services/EventBus.ts` (existente)

---

## 5. INTERFACES ENTRE COMPONENTES

### 5.1 Diagrama de Dependencias

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DIAGRAMA DE DEPENDENCIAS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌─────────────────┐                                │
│                         │   LibreChat UI   │                                │
│                         └────────┬────────┘                                │
│                                  │                                          │
│                                  ▼                                          │
│                         ┌─────────────────┐                                │
│                         │ Unified Gateway  │                                │
│                         └────────┬────────┘                                │
│                                  │                                          │
│              ┌───────────────────┼───────────────────┐                    │
│              │                   │                   │                    │
│              ▼                   ▼                   ▼                    │
│     ┌───────────────┐   ┌───────────────┐   ┌───────────────┐           │
│     │ Policy Engine │   │Capability     │   │Execution      │           │
│     │               │   │Router         │   │Engine         │           │
│     └───────┬───────┘   └───────┬───────┘   └───────┬───────┘           │
│             │                   │                   │                     │
│             └───────────────────┼───────────────────┘                     │
│                                 │                                         │
│                                 ▼                                         │
│                      ┌─────────────────┐                                  │
│                      │Provider Registry│                                  │
│                      └────────┬────────┘                                  │
│                               │                                            │
│         ┌─────────────────────┼─────────────────────┐                    │
│         │                     │                     │                    │
│         ▼                     ▼                     ▼                    │
│ ┌───────────────┐     ┌───────────────┐     ┌───────────────┐           │
│ │Provider       │     │Provider       │     │FreeClaudeCode │           │
│ │Manager        │     │Registry       │     │Adapter        │           │
│ └───────┬───────┘     └───────┬───────┘     └───────────────┘           │
│         │                     │                                          │
│         └─────────────────────┼──────────────────────────────────────────│
│                               │                                           │
│                               ▼                                           │
│                      ┌─────────────────┐                                 │
│                      │ Account Manager │                                 │
│                      └────────┬────────┘                                 │
│                               │                                           │
│                               ▼                                           │
│                      ┌─────────────────┐                                 │
│                      │  API Key        │                                 │
│                      │  Manager        │                                 │
│                      └────────┬────────┘                                 │
│                               │                                           │
│         ┌─────────────────────┼─────────────────────┐                   │
│         │                     │                     │                     │
│         ▼                     ▼                     ▼                     │
│ ┌───────────────┐     ┌───────────────┐     ┌───────────────┐           │
│ │Token & Quota  │     │Health Monitor │     │ Audit Logger  │           │
│ │Manager        │     │              │     │               │           │
│ └───────────────┘     └───────────────┘     └───────────────┘           │
│                                                                             │
│  ──────────────────────────────────────────────────────────────────────   │
│                                                                             │
│  ALL COMPONENTS                                                            │
│       │                                                                    │
│       ▼                                                                    │
│  ┌───────────────┐                                                        │
│  │   Event Bus   │◀──── Todas publican eventos aquí                       │
│  └───────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Contratos de Interfaz

#### IProvider (Contrato Principal)

```typescript
// Este es el contrato que TODOS los providers deben implementar
interface IProvider {
  // Identificación
  readonly id: string;
  readonly name: string;
  readonly apiFormat: 'openai' | 'anthropic' | 'google' | 'custom';
  
  // Metadatos
  readonly capabilities: Capability[];
  readonly supportedModels: ModelDefinition[];
  readonly authMethod: AuthMethod;
  readonly config: ProviderConfig;
  
  // Operations
  healthCheck(): Promise<ProviderHealth>;
  execute(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterator<StreamChunk>;
  listModels(): Promise<ModelDefinition[]>;
}
```

#### IKeyManager (Contrato de Credenciales)

```typescript
// Contrato para gestión de credenciales
interface IKeyManager {
  getBestKey(providerId: string, context?: KeySelectionContext): Promise<APIKey>;
  recordUsage(keyId: string, usage: UsageRecord): Promise<void>;
  checkHealth(keyId: string): Promise<HealthResult>;
  rotateKey(keyId: string): Promise<APIKey>;
}
```

#### IRouter (Contrato de Routing)

```typescript
// Contrato para routing de providers
interface IRouter {
  route(request: RoutingRequest): Promise<RoutingResult>;
  getProviders(criteria: ProviderCriteria): Promise<Provider[]>;
  getProviderStatus(providerId: string): ProviderStatus;
}
```

---

## 6. MODELO DE DATOS UNIFICADO

### 6.1 Entidades Principales

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MODELO DE DATOS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │    Provider     │                                                        │
│  ├─────────────────┤                                                        │
│  │ id: UUID        │                                                        │
│  │ name: String    │◀─────┐                                                │
│  │ displayName     │      │                                                │
│  │ apiFormat       │      │ 1:N                                           │
│  │ authMethod      │      │                                                │
│  │ priority        │      ▼                                                │
│  │ weight          │  ┌─────────────────┐                                │
│  │ enabled          │  │   ApiKey        │                                │
│  │ maintenance      │  ├─────────────────┤                                │
│  │ config: JSON    │  │ id: UUID        │                                │
│  │ createdAt       │  │ providerId: FK ──┘                                │
│  │ updatedAt       │  │ accountId: FK?  (N:1)                             │
│  └─────────────────┘  │ encryptedKey    │                                │
│         │              │ status          │                                │
│         │              │ remainingQuota  │                                │
│         │              │ dailyLimit      │                                │
│         │              │ cooldownUntil   │                                │
│         │              │ priority        │                                │
│         │              │ isPrimary        │                                │
│         │              └────────┬────────┘                                │
│         │                       │                                         │
│         │              ┌────────┴────────┐                                │
│         │              │                 │                                 │
│         ▼              ▼                 ▼                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │ SupportedModel  │  │   Account       │  │   UsageLog      │           │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤           │
│  │ id: UUID        │  │ id: UUID        │  │ id: UUID        │           │
│  │ providerId: FK ──┘  │ providerId: FK ──┘  │ apiKeyId: FK ────┘          │
│  │ modelId          │  │ type            │  │ providerId: FK              │
│  │ contextWindow    │  │ status          │  │ model                      │
│  │ maxOutput        │  │ credentials     │  │ inputTokens                │
│  │ costInput        │  │ expiresAt      │  │ outputTokens               │
│  │ costOutput       │  └─────────────────┘  │ totalTokens                │
│  └─────────────────┘                        │ latencyMs                   │
│                                             │ estimatedCost              │
│                                             │ statusCode                  │
│                                             │ userId                      │
│                                             │ projectId                   │
│                                             │ createdAt                   │
│                                             └─────────────────┘           │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐                            │
│  │     User        │     │    Project      │                            │
│  ├─────────────────┤     ├─────────────────┤                            │
│  │ id: UUID        │     │ id: UUID        │                            │
│  │ email           │     │ name            │                            │
│  │ organizationId  │◀─────│ organizationId  │                            │
│  │ policies        │ 1:N  │ ownerId: FK ────────▶ User                   │
│  │ quotaLimits     │     │ policies        │                            │
│  │ createdAt       │     │ createdAt       │                            │
│  └─────────────────┘     └─────────────────┘                            │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐                            │
│  │ Organization    │     │    Policy       │                            │
│  ├─────────────────┤     ├─────────────────┤                            │
│  │ id: UUID        │     │ id: UUID        │                            │
│  │ name            │     │ scope: 'user'   │                            │
│  │ plan            │     │     | 'project'  │                            │
│  │ quotaLimits     │     │     | 'org'      │                            │
│  │ createdAt       │     │ scopeId         │                            │
│  └─────────────────┘     │ rules: JSON     │                            │
│                          │ priority        │                            │
│                          │ createdAt       │                            │
│                          └─────────────────┘                            │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐                            │
│  │   Capability    │     │  AuditLog      │                            │
│  ├─────────────────┤     ├─────────────────┤                            │
│  │ id: String      │     │ id: UUID        │                            │
│  │ name            │     │ timestamp       │                            │
│  │ description     │     │ actorType       │                            │
│  │ category        │     │ actorId         │                            │
│  └─────────────────┘     │ action          │                            │
│                          │ resourceType    │                            │
│                          │ resourceId      │                            │
│                          │ outcome         │                            │
│                          │ details: JSON   │                            │
│                          │ previousHash    │                            │
│                          │ hash            │                            │
│                          └─────────────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Colecciones MongoDB/PostgreSQL

```javascript
// Providers Collection
db.providers.createIndex({ "id": 1 }, { unique: true });
db.providers.createIndex({ "enabled": 1, "priority": -1 });
db.providers.createIndex({ "capabilities": 1 });

// ApiKeys Collection
db.api_keys.createIndex({ "id": 1 }, { unique: true });
db.api_keys.createIndex({ "providerId": 1, "status": 1 });
db.api_keys.createIndex({ "accountId": 1 });
db.api_keys.createIndex({ "cooldownUntil": 1 }, { expireAfterSeconds: 0 });

// UsageLogs Collection (Time-series optimization)
db.usage_logs.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 31536000 }); // 1 year TTL
db.usage_logs.createIndex({ "apiKeyId": 1, "createdAt": -1 });
db.usage_logs.createIndex({ "userId": 1, "createdAt": -1 });
db.usage_logs.createIndex({ "providerId": 1, "createdAt": -1 });

// AuditLogs Collection (Immutable)
db.audit_logs.createIndex({ "id": 1 }, { unique: true });
db.audit_logs.createIndex({ "hash": 1 }, { unique: true });
db.audit_logs.createIndex({ "actor.id": 1, "timestamp": -1 });
db.audit_logs.createIndex({ "resource.type": 1, "resource.id": 1 });

// Users Collection
db.users.createIndex({ "id": 1 }, { unique: true });
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "organizationId": 1 });

// Projects Collection
db.projects.createIndex({ "id": 1 }, { unique: true });
db.projects.createIndex({ "organizationId": 1 });
db.projects.createIndex({ "ownerId": 1 });
```

---

## 7. DIAGRAMA DE FLUJO COMPLETO

### 7.1 Secuencia de Decisión del Router

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CAPABILITY ROUTER - FLUJO DE DECISIÓN                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INICIO                                                                  │
│     │                                                                     │
│     ▼                                                                     │
│  ┌────────────────────┐                                                  │
│  │ Parse Request      │                                                  │
│  │ • capabilities[]   │                                                  │
│  │ • model (optional) │                                                  │
│  │ • user context     │                                                  │
│  └─────────┬──────────┘                                                  │
│            │                                                              │
│            ▼                                                              │
│  ┌────────────────────┐                                                  │
│  │ Get Policies       │                                                  │
│  │ (Policy Engine)    │                                                  │
│  └─────────┬──────────┘                                                  │
│            │                                                              │
│            ▼                                                              │
│  ┌────────────────────┐                                                  │
│  │ Filter by Policy  │                                                  │
│  │ • denied_models   │                                                  │
│  │ • max_cost        │                                                  │
│  │ • max_latency     │                                                  │
│  └─────────┬──────────┘                                                  │
│            │                                                              │
│            ▼                                                              │
│  ┌────────────────────┐                                                  │
│  │ Get Candidates    │◀── From Provider Registry                        │
│  │ (Match Capabilities)│                                                │
│  └─────────┬──────────┘                                                  │
│            │                                                              │
│            ▼                                                              │
│  ┌────────────────────┐                                                  │
│  │ Check Health      │                                                  │
│  │ (Health Monitor)   │                                                  │
│  │                   │                                                  │
│  │ ┌────────────────┐│  UNHEALTHY ──────────────────┐                 │
│  │ │healthy ────────┼┼──degraded ──► apply penalty   │                 │
│  │ └────────────────┘│                              │                 │
│  └─────────┬──────────┘                              │                 │
│            │                                          │                 │
│            ▼                                          │                 │
│  ┌────────────────────┐                              │                 │
│  │ Check Quota       │                              │                 │
│  │ (TokenQuotaMgr)   │                              │                 │
│  │                   │                              │                 │
│  │ ┌────────────────┐│  EXHAUSTED ──────────────────┘                 │
│  │ │remaining > 0 ──┼┼──warning ──► emit event + penalty              │
│  │ └────────────────┘│                                                 │
│  └─────────┬──────────┘                                                 │
│            │                                                              │
│            ▼                                                              │
│  ┌────────────────────┐                                                  │
│  │ Calculate Scores  │                                                  │
│  │                   │                                                  │
│  │ score =           │                                                  │
│  │   cap_match * 0.3 │                                                  │
│  │ + health * 0.25   │                                                  │
│  │ + latency * 0.20  │                                                  │
│  │ + cost * 0.15     │                                                  │
│  │ + priority * 0.10 │                                                  │
│  └─────────┬──────────┘                                                  │
│            │                                                              │
│            ▼                                                              │
│  ┌────────────────────┐                                                  │
│  │ Sort by Score      │                                                  │
│  │                    │                                                  │
│  │ 1. Provider A (0.95)│                                                │
│  │ 2. Provider B (0.82)│                                                │
│  │ 3. Provider C (0.71)│                                                │
│  └─────────┬──────────┘                                                  │
│            │                                                              │
│            ▼                                                              │
│  ┌────────────────────┐                                                  │
│  │ Select Best +      │                                                  │
│  │ Generate Fallbacks │                                                  │
│  └─────────┬──────────┘                                                  │
│            │                                                              │
│            ▼                                                              │
│        RESULTADO                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ {                                                                 │  │
│  │   selected: { providerId: "anthropic", model: "claude-3-5-sonnet" }│  │
│  │   fallbacks: [                                                    │  │
│  │     { providerId: "free_claude_code", model: "claude-sonnet-4" }, │  │
│  │     { providerId: "openai", model: "gpt-4o" }                    │  │
│  │   ],                                                               │  │
│  │   routingReason: "Best match for capabilities: [code, reasoning]"  │  │
│  │ }                                                                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. DECISIONES DE ARQUITECTURA (ADRs)

### ADR-001: Monorepo con Paquetes Independientes

**Estado:** ACEPTADA

**Contexto:**  
Tenemos múltiples paquetes (api, client, data-provider, api-key-client) que necesitan compartir tipos y lógica.

**Decisión:**  
Mantener el monorepo existente con estructura de paquetes npm.

**Consecuencias:**
- ✅ Reutilización de tipos entre paquetes
- ✅ Shared configurations (tsconfig, eslint)
- ✅ atomic commits a través de paquetes
- ❌ Necesidad de tooling (turborepo, nx)
- ❌ Curva de aprendizaje para nuevos contribuidores

---

### ADR-002: TypeScript como Lenguaje Principal

**Estado:** ACEPTADA

**Contexto:**  
El backend tiene componentes en JavaScript, Python y TypeScript.

**Decisión:**  
Migrar todos los componentes nuevos a TypeScript. Mantener Python solo para APIKeyManager (integración con ML/AI).

**Consecuencias:**
- ✅ Tipado estático para catching de errores temprano
- ✅ Mejor IDE support
- ✅ Tipos compartidos entre frontend y backend
- ❌ Curva de aprendizaje para contributors Python
- ❌ Complejidad adicional en build

---

### ADR-003: API REST como Interfaz Principal

**Estado:** ACEPTADA

**Decisión:**  
Usar REST para comunicación interna entre servicios y para la API externa.

**Alternativas consideradas:**
- GraphQL: ✅ Mejor para queries complejas, ❌ Overkill para este caso
- gRPC: ✅ Mejor performance, ❌ Más complejo, ❌ No necesario aún

**Consecuencias:**
- ✅ Simple de implementar y debuggear
- ✅ Amplia adopción y tooling
- ✅ Fácil de cachear con CDNs
- ❌ No es optimal para real-time
- ⚠️ Para streaming usamos Server-Sent Events (SSE)

---

### ADR-004: Base de Datos Principal

**Estado:** ACEPTADA (MongoDB + Redis)

**Decisión:**  
Usar MongoDB como base de datos principal y Redis para caching y rate limiting.

**Consecuencias:**
- ✅ MongoDB ya está en uso (modelos Mongoose)
- ✅ Flexible schema para providers con diferentes características
- ✅ Redis para sesiones, caching, rate limiting
- ❌ Transacciones distribuidas más complejas
- ❌ SQL queries más complejas (pero no necesario por ahora)

---

### ADR-005: Event Bus para Comunicación

**Estado:** ACEPTADA

**Decisión:**  
Usar un Event Bus interno (Redis Pub/Sub o similar) para comunicación entre servicios.

**Consecuencias:**
- ✅ Desacopla componentes
- ✅ Permite agregar listeners sin modificar publishers
- ✅ Útil para logging, metrics, cache invalidation
- ❌ Mayor complejidad en debugging
- ❌ Posible pérdida de eventos si no se configura correctamente

---

### ADR-006: Proveedores como Plugins

**Estado:** ACEPTADA

**Decisión:**  
Cada provider es un "plugin" que implementa la interfaz IProvider.

**Consecuencias:**
- ✅ Agregar provider nuevo = agregar archivo nuevo
- ✅ Testing independiente por provider
- ✅ Desplegar providers sin tocar el core
- ❌ Necesidad de interface estable
- ❌ Posible drift entre implementaciones

---

### ADR-007: Free Claude Code como Provider Estándar

**Estado:** ACEPTADA

**Decisión:**  
Integrar Free Claude Code como un provider más, no como un sistema especial.

**Consecuencias:**
- ✅ Transparente para el resto del sistema
- ✅ Se beneficia de todos los mecanismos de fallback
- ✅ Métricas unificadas
- ❌ Puede ser "apagado" accidentalmente
- ❌ Dependencia de una herramienta externa

---

### ADR-008: Métricas con Prometheus

**Estado:** ACEPTADA

**Decisión:**  
Exponer métricas usando Prometheus format en `/metrics`.

**Consecuencias:**
- ✅ Estándar de la industria
- ✅ Fácil integración con Grafana
- ✅ Bajo overhead
- ❌ Requiere conocimiento de Prometheus
- ❌ Cardinalidad puede ser un problema

---

## 9. ESTRATEGIA DE MIGRACIÓN

### 9.1 Principios de Migración

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRINCIPIOS DE MIGRACIÓN                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. NEVER BREAK PRODUCTION                                                 │
│     ├── Nueva arquitectura debe coexistir con la actual                     │
│     ├── Feature flags para switch entre新旧                                 │
│     └── Rollback instantáneo                                               │
│                                                                             │
│  2. INCREMENTAL                                                             │
│     ├── Un componente a la vez                                              │
│     ├── Validar antes de proceder                                           │
│     └── Documentar cada paso                                                │
│                                                                             │
│  3. REVERSIBLE                                                             │
│     ├── Cada cambio debe poder deshacerse                                   │
│     ├── Mantener backward compatibility                                    │
│     └── Feature flags para disable                                         │
│                                                                             │
│  4. OBSERVABLE                                                             │
│     ├── Métricas antes, durante y después                                  │
│     ├── Logging detallado de migración                                      │
│     └── Rollback triggers claros                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Estrategia de Coexistencia

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ESTRATEGIA DE COEXISTENCIA                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FASE 0: Estado Actual                                                     │
│  ═════════════════════                                                     │
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │ LibreChat   │────▶│ LLMGateway │────▶│  Providers  │                   │
│  │             │     │  (Legacy)  │     │  (Direct)   │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│                            │                                               │
│                            ▼                                               │
│                     ┌─────────────┐                                       │
│                     │  Env Vars   │  ◀── Claves estáticas                 │
│                     └─────────────┘                                       │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────   │
│                                                                             │
│  FASE 1: Agregar Nuevos Componentes (Side by Side)                          │
│  ═══════════════════════════════════════════════════                        │
│                                                                             │
│  ┌─────────────┐                                                           │
│  │ LibreChat   │                                                           │
│  │             │                                                           │
│  │ Feature Flag:                                                           │
│  │ USE_NEW_ARCH=false                                                      │
│  └──────┬──────┘                                                           │
│         │                                                                  │
│         ├──── (USE_NEW_ARCH=false) ────▶ LLMGateway (Legacy) ───▶ Providers│
│         │                                                                  │
│         │                                                                  │
│         ├──── (USE_NEW_ARCH=true) ────▶ ┌─────────────────────────────────┐│
│         │                               │       NEW ARCHITECTURE          ││
│         │                               │                                 ││
│         │                               │  Unified Gateway               ││
│         │                               │       │                        ││
│         │                               │       ▼                        ││
│         │                               │  Policy Engine                 ││
│         │                               │       │                        ││
│         │                               │       ▼                        ││
│         │                               │  Capability Router             ││
│         │                               │       │                        ││
│         │                               │       ▼                        ││
│         │                               │  Provider Registry             ││
│         │                               │       │                        ││
│         │                               │  ┌────┴────┐                 ││
│         │                               │  │         │                 ││
│         │                               │  ▼         ▼                 ││
│         │                               │ Providers  LiteLLM            ││
│         │                               │                                 ││
│         │                               │       │                        ││
│         │                               │       ▼                        ││
│         │                               │  API Key Manager               ││
│         │                               │       │                        ││
│         │                               │       ▼                        ││
│         │                               │  Token & Quota Manager         ││
│         │                               └─────────────────────────────────┘│
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────   │
│                                                                             │
│  FASE 2: Migración Gradual (%)
│  ══════════════════════════                                                 │
│                                                                             │
│  Semana 1-2:  5% tráfico nuevo  │ 95% Legacy                               │
│  Semana 3-4: 20% tráfico nuevo  │ 80% Legacy                               │
│  Semana 5-6: 50% tráfico nuevo  │ 50% Legacy                               │
│  Semana 7-8: 80% tráfico nuevo  │ 20% Legacy                               │
│  Semana 9+:   100% tráfico nuevo │  0% Legacy (Legacy deprecated)          │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────   │
│                                                                             │
│  FASE 3: Deprecación (Opcional)                                            │
│  ═══════════════════════════════                                           │
│                                                                             │
│  Una vez que la nueva arquitectura está estable al 100%:                    │
│  - Mantener Legacy como fallback por 3 meses                               │
│  - Documentar deprecated endpoints                                         │
│  - Remover Legacy después de período de gracia                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Plan de Migración Detallado

| Fase | Componente | Riesgo | Duración | Validación |
|------|------------|--------|----------|------------|
| 1.1 | Provider Registry | Bajo | 1 semana | Tests green |
| 1.2 | API Key Manager Client | Medio | 1 semana | Comparar respuestas |
| 1.3 | Token & Quota Manager | Medio | 1 semana | Métricas match |
| 2.1 | Execution Engine | Medio | 2 semanas | A/B testing |
| 2.2 | Capability Router | Alto | 2 semanas | Tracing comparison |
| 2.3 | Policy Engine | Medio | 1 semana | Policy tests |
| 3.1 | Unified Gateway | Alto | 2 semanas | Canary deploy |
| 3.2 | Dashboard | Bajo | 2 semanas | Visual check |
| 4 | Full Integration | Alto | 2 semanas | Load testing |

---

## 10. PLAN DE IMPLEMENTACIÓN POR FASES

### 10.1 Roadmap Visual

```
2026                              2027
Julio    Agosto   Sept    Oct     Nov     Dic     Ene     Feb     Mar
  │        │       │       │       │       │       │       │       │
  ▼        ▼       ▼       ▼       ▼       ▼       ▼       ▼       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ FASE 1  │ FASE 2  │ FASE 3  │ FASE 4  │ FASE 5  │ FASE 6  │ FASE 7  │
│ Base    │ Core    │Provider │ Routing │ Policy  │Dashboard│ Polish  │
│         │         │Layer    │         │ Engine  │         │         │
└────────────────────────────────────────────────────────────────────────────┘
  ▲        ▲        ▲        ▲        ▲        ▲        ▲
  │        │        │        │        │        │        │
  │        │        │        │        │        │        └─► v2.0.0 Release
  │        │        │        │        │        │
  │        │        │        │        │        └────────────► Dashboard completo
  │        │        │        │        │
  │        │        │        │        └─────────────────────► Policy Engine
  │        │        │        │
  │        │        │        └──────────────────────────────► Capability Router
  │        │        │
  │        │        └────────────────────────────────────────► Provider Layer
  │        │
  │        └──────────────────────────────────────────────────► Core Services
  │
  └────────────────────────────────────────────────────────────► Base & Types
```

### 10.2 Fases Detalladas

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 1: FUNDAMENTOS (Semanas 1-4)                                        ║
║  ════════════════════════════════════════════                              ║
║                                                                            ║
║  Objetivo: Establecer la base técnica                                      ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 1.1 Definir interfaces TypeScript (IProvider, IKeyManager, etc.)  │ ║
║  │ □ 1.2 Crear paquete @librechat/multi-llm-types                      │ ║
║  │ □ 1.3 Configurar Event Bus básico                                   │ ║
║  │ □ 1.4 Implementar Audit Logger (hash chain)                         │ ║
║  │ □ 1.5 Configurar Prometheus metrics                                  │ ║
║  │ □ 1.6 Docker Compose con servicios base                             │ ║
║  │ □ 1.7 Tests de contrato para interfaces                             │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Criterio de éxito:                                                       ║
║  • Interfaces compilando sin errores                                      ║
║  • Event Bus funcionando                                                  ║
║  • Métricas expuestas en /metrics                                        ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 2: CORE SERVICES (Semanas 5-8)                                      ║
║  ═══════════════════════════════════════                                  ║
║                                                                            ║
║  Objetivo: Implementar servicios centrales                                 ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 2.1 Provider Registry (migrar desde ProviderLayer.ts)            │ ║
║  │ □ 2.2 Provider Manager (enable/disable/priority)                   │ ║
║  │ □ 2.3 API Key Manager Client (JS SDK para API Python)              │ ║
║  │ □ 2.4 Token & Quota Manager (Redis-based)                          │ ║
║  │ □ 2.5 Health Monitor (probes y alertas)                            │ ║
║  │ □ 2.6 Integration tests entre componentes                          │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Criterio de éxito:                                                       ║
║  • Provider Registry con 3 providers registrados                          ║
║  • API Key Manager respondiendo a queries                                 ║
║  • Token tracking en Redis funcionando                                   ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 3: PROVIDER LAYER (Semanas 9-12)                                     ║
║  ══════════════════════════════════════════                                ║
║                                                                            ║
║  Objetivo: Conectar todos los providers                                   ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 3.1 Native Provider Adapter (Groq, DeepSeek, etc.)               │ ║
║  │ □ 3.2 Free Claude Code Adapter                                     │ ║
║  │ □ 3.3 LiteLLM Gateway Adapter                                      │ ║
║  │ □ 3.4 Execution Engine (transform + retry)                         │ ║
║  │ □ 3.5 Account Manager (OAuth, API Keys, etc.)                      │ ║
║  │ □ 3.6 Full integration test                                        │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Criterio de éxito:                                                       ║
║  • Todos los providers implementando IProvider                           ║
║  • Free Claude Code funcionando como provider estándar                    ║
║  • LiteLLM integrado como fallback                                      ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 4: ROUTING & POLICY (Semanas 13-16)                                 ║
║  ═════════════════════════════════════════════                             ║
║                                                                            ║
║  Objetivo: Sistema de decisión inteligente                                ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 4.1 Capability Router (mejorar existente)                          │ ║
║  │ □ 4.2 Policy Engine (reglas de negocio centralizadas)               │ ║
║  │ □ 4.3 Integración Router ↔ Provider Registry                       │ ║
║  │ □ 4.4 Integración Router ↔ Token & Quota Manager                    │ ║
║  │ □ 4.5 Integración Router ↔ Health Monitor                           │ ║
║  │ □ 4.6 Pruebas A/B con routing actual vs nuevo                       │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Criterio de éxito:                                                       ║
║  • Routing funcionando con todas las consideraciones                      ║
║  • Políticas evaluando correctamente                                      ║
║  • Fallbacks automáticos funcionando                                      ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 5: UNIFIED GATEWAY & DASHBOARD (Semanas 17-20)                       ║
║  ═════════════════════════════════════════════════════════                   ║
║                                                                            ║
║  Objetivo: Punto de entrada y observabilidad                              ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 5.1 Unified Gateway (auth + rate limiting + metrics)             │ ║
║  │ □ 5.2 LibreChat UI → Gateway integration                          │ ║
║  │ □ 5.3 Dashboard panels:                                            │ ║
║  │     • Provider status                                              │ ║
║  │     • Token & quota usage                                          │ ║
║  │     • API keys health                                              │ ║
║  │     • Cost tracking                                                │ ║
║  │     • Observability (logs, metrics, traces)                        │ ║
║  │ □ 5.4 Load testing y optimization                                  │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Criterio de éxito:                                                       ║
║  • Gateway manejando tráfico de producción                                ║
║  • Dashboard mostrando métricas en tiempo real                            ║
║  • P99 latency < 500ms                                                    ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 6: POLISH & PRODUCTION (Semanas 21-24)                              ║
║  ═══════════════════════════════════════════════════                        ║
║                                                                            ║
║  Objetivo: Estabilización y producción                                    ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 6.1 Documentación completa de APIs                                │ ║
║  │ □ 6.2 Runbooks de operaciones                                       │ ║
║  │ □ 6.3 Plan de rollback documentado                                  │ ║
║  │ □ 6.4 Chaos engineering (simular fallos)                            │ ║
║  │ □ 6.5 Security audit                                                │ ║
║  │ □ 6.6 Performance benchmarks                                       │ ║
║  │ □ 6.7 Training para equipo de operaciones                          │ ║
║  │ □ 6.8 v2.0.0 Release                                               │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Criterio de éxito:                                                       ║
║  • SLA documentado (99.9% uptime, <500ms P99)                            ║
║  • Equipo de ops entrenado                                               ║
║  • Zero-downtime deployment tested                                       ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 11. REUTILIZACIÓN DE COMPONENTES EXISTENTES

### 11.1 Mapa de Reutilización

| Componente Existente | Nueva Ubicación | Reutilización |
|---------------------|-----------------|----------------|
| `LLMGateway.js` | `ExecutionEngine/` | Patrones de providers, fallback |
| `APIKeyManager (Python)` | `APIKeyManager/` | Lógica de encriptación, modelos |
| `ProviderLayer.ts` | `ProviderRegistry/` | Interfaz Runtime, eventos |
| `LiteLLM client` | `LiteLLMAdapter/` | Circuit breaker, retry logic |
| `CapabilityRouter/` | `CapabilityRouter/` | Capability matching |
| `Auth strategies` | `UnifiedGateway/` | JWT validation, OAuth |
| `@librechat/data-schemas` | `packages/data-schemas/` | Modelos Mongoose, tipos |
| `librechat-data-provider` | `packages/data-provider/` | API client patterns |
| `api-key-client` | `packages/api-key-client/` | SDK patterns |
| `client/src/services/EventBus.ts` | `EventBus/` | Event publishing |

### 11.2 Componentes a Crear desde Cero

| Componente | Justificación |
|------------|---------------|
| **PolicyEngine** | No existe lógica centralizada de reglas |
| **AccountManager** | No hay gestión unificada de cuentas |
| **TokenQuotaManager** | Solo existe tracking básico |
| **HealthMonitor** | No existe verificación proactiva |
| **AuditLogger** | No hay log inmutable con hash chain |
| **ProviderManager** | No existe gestión operativa de providers |

---

## 12. DASHBOARD MULTI-LLM

### 12.1 Paneles del Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DASHBOARD MULTI-LLM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TABS: [Overview] [Providers] [Keys] [Quotas] [Observability] [Settings]││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Overview                                                          ││
│  │  ═══════════════                                                        ││
│  │                                                                         ││
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐           ││
│  │  │ Requests   │ │ Latency   │ │   Cost     │ │   Errors   │           ││
│  │  │   12,847  │ │   234ms   │ │  $1,234.56 │ │    0.12%   │           ││
│  │  │  ▲ 15%    │ │  ▼ 8%    │ │  ▲ 3%     │ │  ▼ 50%    │           ││
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘           ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │  Traffic by Provider (Pie Chart)                              │      ││
│  │  │                                                              │      ││
│  │  │    Groq ████████████░░░░░░░░ 35%                             │      ││
│  │  │  Anthropic ██████████░░░░░░░░ 25%                            │      ││
│  │  │  DeepSeek ████████░░░░░░░░░░ 20%                             │      ││
│  │  │  Free CC ██████░░░░░░░░░░░░░ 15%                             │      ││
│  │  │   Other ███░░░░░░░░░░░░░░░░░ 5%                              │      ││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │  Request Latency Over Time (Line Chart)                      │      ││
│  │  │  P50 ─────────────────                                      │      ││
│  │  │  P95 ─────────────────                                      │      ││
│  │  │  P99 ─────────────────                                      │      ││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Providers                                                         ││
│  │  ══════════════════                                                      ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │ Provider      │ Status   │ Latency │ Errors │ Quota   │ Actions ││
│  │  ├───────────────┼──────────┼─────────┼────────┼─────────┼─────────┤│
│  │  │ 🟢 Groq       │ Healthy  │ 145ms   │ 0.1%   │ 78%     │ [⚙️][📊]││
│  │  │ 🟢 Anthropic  │ Healthy  │ 320ms   │ 0.05%  │ 45%     │ [⚙️][📊]││
│  │  │ 🟡 DeepSeek   │ Degraded │ 890ms   │ 2.3%   │ 12% ⚠️  │ [⚙️][📊]││
│  │  │ 🔴 Free CC    │ Unhealthy│ -       │ -      │ 0% ❌   │ [⚙️][📊]││
│  │  │ 🟢 LiteLLM    │ Healthy  │ 210ms   │ 0.2%   │ N/A     │ [⚙️][📊]││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  │  [Enable] [Disable] [Set Priority] [Maintenance Mode] [Refresh]      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: API Keys                                                          ││
│  │  ═════════════                                                          ││
│  │                                                                         ││
│  │  Filter: [All ▼] [Active] [Cooldown] [Exhausted] [Revoked]            ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │ Label      │ Provider │ Status    │ Health │ Usage    │ Action ││
│  │  ├────────────┼──────────┼───────────┼────────┼─────────┼────────┤│
│  │  │ groq-prod  │ Groq     │ 🟢 Active │ ✓      │ 234K    │ [🔄][🗑️]││
│  │  │ groq-test  │ Groq     │ 🟡 Cooldown│ ⚠️     │ 12K     │ [🔄][🗑️]││
│  │  │ deepseek-1 │ DeepSeek │ 🔴 Exhausted│ ✗      │ 500K ❌ │ [🔄][🗑️]││
│  │  │ claude-key │ Anthropic│ 🟢 Active │ ✓      │ 89K     │ [🔄][🗑️]││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  │  [+ Add Key] [Rotate All] [Export Keys]                               ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Quotas                                                            ││
│  │  ═══════════                                                            ││
│  │                                                                         ││
│  │  Scope: [User ▼] [Project ▼] [Organization ▼]                        ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │  User: john@company.com                                     │      ││
│  │  │                                                              │      ││
│  │  │  Daily Tokens     ████████████████████░░░░░ 156K/200K (78%)  │      ││
│  │  │  Monthly Tokens   ██████████░░░░░░░░░░░░░░ 1.2M/5M (24%)   │      ││
│  │  │  Daily Cost       ██████░░░░░░░░░░░░░░░░░ $12.34/$50 (25%)|      ││
│  │  │                                                              │      ││
│  │  │  [Set Limits] [View History] [Configure Alerts]             │      ││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Observability                                                     ││
│  │  ═════════════════════                                                   ││
│  │                                                                         ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                       ││
│  │  │  Logs       │ │   Metrics   │ │   Traces    │                       ││
│  │  │  [▶ Live]   │ │  [Prometheus]│ │  [Jaeger]   │                       ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘                       ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │  2026-07-22 10:23:45 INFO  [api] Request completed        │      ││
│  │  │  trace_id: abc123, provider: groq, latency: 145ms         │      ││
│  │  │  ───────────────────────────────────────────────────────   │      ││
│  │  │  2026-07-22 10:23:44 WARN  [quota] Threshold reached     │      ││
│  │  │  provider: deepseek, remaining: 12%, user: user_456       │      ││
│  │  │  ───────────────────────────────────────────────────────   │      ││
│  │  │  2026-07-22 10:23:43 INFO  [key] Key health check passed │      ││
│  │  │  key_id: key_789, provider: anthropic                     │      ││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  │  [Download Logs] [Configure Alerts] [Dashboards ↗]                   ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. COMPARATIVA Y VALIDACIÓN

### 13.1 Comparativa: Arquitectura Actual vs Propuesta

| Aspecto | Actual | Propuesta | Mejora |
|---------|--------|-----------|--------|
| **Acoplamiento** | Alto (todo junto) | Bajo (módulos independientes) | ✅ |
| **Provider Registry** | Fragmentado (3x GroqProvider) | Unificado (1x por provider) | ✅ |
| **API Key Management** | Variables de entorno | Servicio centralizado | ✅ |
| **Routing** | Básico (primero disponible) | Inteligente (capabilities + health + quota) | ✅ |
| **Fallback** | Solo retry | Cadena completa con scoring | ✅ |
| **Observabilidad** | Logs分散 | Métricas Prometheus + Dashboard | ✅ |
| **Policy Engine** | No existe | Centralizado | ✅ |
| **Free Claude Code** | No integrado | Como provider estándar | ✅ |
| **Costo Tracking** | No existe | Granular por dimensión | ✅ |
| **Audit Trail** | No existe | Hash chain inmutable | ✅ |

### 13.2 Validación contra Requisitos

| Requisito | Implementación | Validación |
|-----------|---------------|------------|
| SRP (única responsabilidad) | Cada componente tiene边界claras | ✅ Interfaces bien definidas |
| DIP (depender de abstracciones) | IProvider, IKeyManager, IRouter | ✅ Contratos TypeScript |
| OCP (extensible sin modificar) | Providers como plugins | ✅ Solo agregar archivos |
| Replaceability | Cualquier provider sustituible | ✅ Interfaz IProvider |
| Escalabilidad horizontal | Stateless services + Redis | ✅ Diseño stateless |
| Observabilidad | Prometheus + Event Bus | ✅ Métricas en todos los componentes |

### 13.3 Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Complejidad de migración | Alta | Medio | Feature flags, coexistencia |
| Breaking changes en API | Media | Alto | Backward compatibility, versioning |
| Performance overhead nuevo código | Baja | Medio | Benchmarks, optimización |
| Vendor lock-in LiteLLM | Media | Medio | Free Claude Code como alternativa |
| Fallo en cascada | Media | Alto | Circuit breakers en todos los niveles |

---

## RESUMEN

Este documento presenta una arquitectura profesional, modular y escalable para el sistema Multi-LLM de Mi LibreChat. Los principios clave son:

1. **Cada componente con única responsabilidad** - SRP aplicado estrictamente
2. **Interfaces bien definidas** - Contracts para todas las comunicaciones
3. **Extensibilidad** - Agregar providers = agregar archivos, no modificar existente
4. **Observabilidad completa** - Métricas, logs, traces en todos los componentes
5. **Seguridad** - API Key Manager centralizado, Audit Logger inmutable
6. **Resiliencia** - Fallbacks automáticos, circuit breakers, health monitoring

La migración se hará de forma incremental, manteniendo la arquitectura actual como fallback hasta validar cada componente nuevo.

---

*Documento generado: 2026-07-22*  
*Versión: 2.0.0*  
*Estado: PARA VALIDACIÓN*
