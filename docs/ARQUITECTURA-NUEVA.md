# 🏛️ ARQUITECTURA NUEVA: Sistema Multi-LLM Profesional
## Versión 2.0 - Diseño Modular, Escalable y Preparado para Producción

**Fecha:** 2026-07-21
**Versión:** 2.0.0
**Autor:** OpenHands Agent
**Estado:** Diseño Propuesto (Pendiente de Validación)

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Principios de Arquitectura](#2-principios-de-arquitectura)
3. [Arquitectura de Alto Nivel](#3-arquitectura-de-alto-nivel)
4. [Componentes Core](#4-componentes-core)
5. [Flujo de Solicitudes](#5-flujo-de-solicitudes)
6. [Interfaces entre Componentes](#6-interfaces-entre-componentes)
7. [Modelo de Datos](#7-modelo-de-datos)
8. [Eventos del Sistema](#8-eventos-del-sistema)
9. [Seguridad](#9-seguridad)
10. [Escalabilidad](#10-escalabilidad)
11. [Observabilidad](#11-observabilidad)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Visión

Diseñar un sistema Multi-LLM profesional que permita:
- Orquestar múltiples proveedores LLM de forma inteligente
- Gestionar credenciales de manera centralizada y segura
- Escalar horizontalmente sin perder rendimiento
- Evolucionar durante años sin reconstruir la arquitectura

### 1.2 Objetivos de Diseño

| Objetivo | Descripción | Métrica |
|----------|-------------|---------|
| Modularidad | Cada componente tiene responsabilidad única | 0% de acoplamiento |
| Extensibilidad | Agregar proveedores sin modificar código existente | < 50 líneas de código por provider |
| Observabilidad | Monitoreo completo de todas las operaciones | 100% de trazabilidad |
| Seguridad | Cifrado, auditoría, rate limiting | Zero exposed secrets |
| Rendimiento | Latencia < 500ms (excluyendo providers) | P99 < 200ms |

### 1.3 Componentes Principales

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SISTEMA MULTI-LLM - ARQUITECTURA                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CAPA DE PRESENTACIÓN                           │   │
│  │  LibreChat Frontend │ Dashboard │ Admin Panel │ API Externa           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CAPA DE ORQUESTACIÓN                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │  Execution  │  │   Task     │  │  Workflow   │               │   │
│  │  │   Engine    │  │  Planner   │  │   Engine    │               │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │ Capability  │  │   Policy   │  │  Context    │               │   │
│  │  │   Router    │  │   Engine    │  │  Manager    │               │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CAPA DE PROVEEDORES                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │  Provider   │  │   Account   │  │    Token    │               │   │
│  │  │   Manager   │  │   Manager   │  │    Manager  │               │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │  API Key   │  │   Health   │  │   Rate     │               │   │
│  │  │   Manager   │  │   Checker   │  │   Limiter   │               │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CAPA DE GATEWAY                                │   │
│  │              LiteLLM Gateway (Universal Provider)                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      CAPA DE PROVEEDORES LLM                         │   │
│  │  Groq │ DeepSeek │ Gemini │ Claude │ Mistral │ FCC │ 25+ providers    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. PRINCIPIOS DE ARQUITECTURA

### 2.1 Principios Fundamentales

| Principio | Descripción | Aplicación |
|-----------|-------------|------------|
| **Responsabilidad Única (SRP)** | Cada componente hace una cosa | Módulos pequeños y enfocados |
| **Inversión de Dependencias** | Depender de abstracciones | Interfaces para todas las comunicaciones |
| **Ley de Demeter** | No hablar con extraños | Componentes aislados |
| **Principio de Cierre** | Abierto para extensión, cerrado para modificación | Plugins y Registry |
| **Segregación de Interfaces** | Interfaces específicas | No interfaces monolíticas |

### 2.2 Reglas de Comunicación

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REGLAS DE COMUNICACIÓN                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✅ PERMITIDO                                                           │
│  ───────────────────────────────────────────────────────────────────────   │
│  1. Execution Engine → Capability Router                                    │
│  2. Capability Router → Policy Engine                                       │
│  3. Policy Engine → Provider Registry                                      │
│  4. Provider Registry → Provider Manager                                    │
│  5. Provider Manager → Account Manager                                     │
│  6. Account Manager → API Key Manager                                      │
│  7. Provider Manager → Token Manager                                       │
│  8. API Key Manager → LiteLLM Gateway                                      │
│  9. Cualquier componente → Event Bus                                       │
│  10. Cualquier componente → Observability                                   │
│                                                                              │
│  ❌ PROHIBIDO                                                            │
│  ───────────────────────────────────────────────────────────────────────   │
│  1. Execution Engine → API Key Manager (debe pasar por Capability Router)  │
│  2. Provider Manager → API Key Manager directamente (debe usar Account Mgr) │
│  3. LiteLLM Gateway → Provider Registry (debe pasar por Provider Manager) │
│  4. Saltar capas de la arquitectura                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Patrones de Diseño

| Patrón | Uso | Implementación |
|--------|-----|---------------|
| Registry | Registrar componentes dinámicamente | `ProviderRegistry`, `RuntimeRegistry` |
| Adapter | Abstraer dependencias externas | `LiteLLMAdapter`, `FCCAdapter` |
| Factory | Crear instancias de proveedores | `ProviderFactory` |
| Strategy | Algoritmos intercambiables | `SelectionStrategy` en Policy Engine |
| Observer | Reaccionar a eventos | `EventBus` |
| Proxy | Control de acceso a credenciales | `APIKeyProxy` |
| Circuit Breaker | Proteger contra fallos | `HealthChecker` |

---

## 3. ARQUITECTURA DE ALTO NIVEL

### 3.1 Diagrama Completo de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USUARIO                                         │
│                  (Chat, API, Webhook, CLI)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CAPA DE ORQUESTACIÓN (AI-OS)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         EXECUTION ENGINE                             │   │
│  │                                                                      │   │
│  │  Responsabilidad: Coordinar ejecución de solicitudes                  │   │
│  │  No conoce: Proveedores, credenciales, autenticación                 │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface ExecutionRequest {                                        │   │
│  │    capabilities: Capability[];                                      │   │
│  │    messages: Message[];                                             │   │
│  │    constraints?: ExecutionConstraints;                              │   │
│  │    metadata?: Record<string, any>;                                   │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       CAPABILITY ROUTER                              │   │
│  │                                                                      │   │
│  │  Responsabilidad: Determinar capacidades requeridas                   │   │
│  │  Trabaja con: Capacidades (nunca nombres de modelos)                 │   │
│  │                                                                      │   │
│  │  Capacidades soportadas:                                             │   │
│  │  - LLM_CHAT, LLM_VISION, LLM_REASONING, LLM_FUNCTION_CALLING        │   │
│  │  - CODE_EXECUTION, BROWSER_AUTOMATION, WEB_SEARCH                   │   │
│  │  - IMAGE_GENERATION, AUDIO_TTS, AUDIO_STT                          │   │
│  │  - RAG_RETRIEVAL, MULTIMODAL                                        │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface RoutingDecision {                                        │   │
│  │    requiredCapabilities: Capability[];                              │   │
│  │    providerId: string;                                              │   │
│  │    modelId: string;                                                  │   │
│  │    score: number;                                                    │   │
│  │    reason: string;                                                   │   │
│  │    fallbacks: RoutingDecision[];                                     │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        POLICY ENGINE                                  │   │
│  │                                                                      │   │
│  │  Responsabilidad: Centralizar todas las reglas de negocio            │   │
│  │                                                                      │   │
│  │  Reglas implementadas:                                               │   │
│  │  - Priority rules: Prioridad de proveedores                         │   │
│  │  - Cost rules: Coste máximo permitido por request/user/project        │   │
│  │  - Latency rules: Latencia máxima tolerable                          │   │
│  │  - User policies: Políticas específicas por usuario                  │   │
│  │  - Project policies: Políticas por proyecto                          │   │
│  │  - Free tier rules: Uso exclusivo de modelos gratuitos               │   │
│  │  - Paid tier rules: Acceso a modelos premium                        │   │
│  │  - Fallback strategies: Orden de fallback personalizado              │   │
│  │  - Experimental rules: Acceso a modelos experimentales              │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface PolicyContext {                                          │   │
│  │    userId: string;                                                  │   │
│  │    projectId?: string;                                              │   │
│  │    tier: 'free' | 'paid' | 'enterprise';                           │   │
│  │    budget?: BudgetConstraints;                                      │   │
│  │    preferences?: UserPreferences;                                    │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       CONTEXT MANAGER                                │   │
│  │                                                                      │   │
│  │  Responsabilidad: Gestionar contexto de conversación                 │   │
│  │                                                                      │   │
│  │  Funcionalidades:                                                   │   │
│  │  - Token counting: Contar tokens en contexto                       │   │
│  │  - Truncation: Truncar contexto excedente                          │   │
│  │  - Summarization: Resumir cuando sea necesario                     │   │
│  │  - Strategy: Sliding window, semantic, token-based                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CAPA DE PROVEEDORES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       PROVIDER REGISTRY                             │   │
│  │                                                                      │   │
│  │  Responsabilidad: Registro centralizado de proveedores               │   │
│  │                                                                      │   │
│  │  Estructura de Provider:                                            │   │
│  │  interface Provider {                                               │   │
│  │    id: string;                    // ej: "groq", "anthropic"        │   │
│  │    name: string;                                                       │   │
│  │    capabilities: Capability[];   // Capacidades que soporta          │   │
│  │    models: Model[];              // Modelos disponibles              │   │
│  │    authType: AuthType;           // API_KEY, OAUTH, JWT, COOKIE    │   │
│  │    limits: ProviderLimits;       // Rate limits, quotas conocidas   │   │
│  │    features: ProviderFeatures;   // Streaming, tools, multimodal   │   │
│  │    priority: number;             // Prioridad default (1-100)      │   │
│  │    status: ProviderStatus;       // active, degraded, maintenance  │   │
│  │    config: ProviderConfig;       // Configuración específica       │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  │  interface Model {                                                   │   │
│  │    id: string;                    // ej: "llama-3.3-70b-versatile"  │   │
│  │    providerId: string;                                               │   │
│  │    capabilities: Capability[];                                       │   │
│  │    contextWindow: number;        // ej: 131072                      │   │
│  │    costPer1M: CostInfo;         // Input/output costs              │   │
│  │    latency: LatencyStats;        // Media, P50, P95, P99          │   │
│  │    status: 'active' | 'deprecated' | 'new';                       │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      PROVIDER MANAGER                                 │   │
│  │                                                                      │   │
│  │  Responsabilidad: Administrar todos los proveedores disponibles      │   │
│  │                                                                      │   │
│  │  Funcionalidades:                                                   │   │
│  │  - Enable/disable providers                                        │   │
│  │  - Prioritize providers (pesos configurables)                      │   │
│  │  - Balanceo: Round-robin, weighted, least-loaded                    │   │
│  │  - Maintenance mode: Marcar proveedores en mantenimiento            │   │
│  │  - Availability policies: Reglas de disponibilidad                  │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface ProviderManager {                                        │   │
│  │    getProviders(): Provider[];                                      │   │
│  │    getProvider(id: string): Provider | null;                        │   │
│  │    setProviderStatus(id: string, status: ProviderStatus): void;     │   │
│  │    setProviderPriority(id: string, priority: number): void;          │   │
│  │    setProviderWeight(id: string, weight: number): void;             │   │
│  │    getAvailableProviders(capabilities: Capability[]): Provider[];   │   │
│  │    getHealthStatus(): Map<string, HealthStatus>;                     │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      ACCOUNT MANAGER                                 │   │
│  │                                                                      │   │
│  │  Responsabilidad: Gestionar cuentas de proveedores (no solo API Keys)│   │
│  │                                                                      │   │
│  │  Tipos de autenticación soportados:                                  │   │
│  │  - API Keys: Para Groq, DeepSeek, OpenRouter, etc.                  │   │
│  │  - OAuth: Para proveedores que usan OAuth (Google, GitHub)           │   │
│  │  - JWT: Tokens JWT para autenticación                               │   │
│  │  - Cookies: Sesiones basadas en cookies                            │   │
│  │  - Browser Sessions: Para proveedores que requieren navegador       │   │
│  │  - Refresh Tokens: Token de refresh para renovación automática      │   │
│  │                                                                      │   │
│  │  Funcionalidades:                                                   │   │
│  │  - Multiple accounts per provider (balancear carga)                 │   │
│  │  - Multiple organizations per provider (multi-tenant)               │   │
│  │  - Import/export de cuentas                                         │   │
│  │  - Automatic session renewal                                        │   │
│  │  - Health verification                                              │   │
│  │  - Automatic account switching                                      │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface AccountManager {                                         │   │
│  │    getAccounts(providerId: string): Account[];                       │   │
│  │    getActiveAccount(providerId: string): Account | null;             │   │
│  │    addAccount(providerId: string, account: Account): void;           │   │
│  │    removeAccount(providerId: string, accountId: string): void;      │   │
│  │    verifyAccount(providerId: string, accountId: string): Promise<boolean>; │
│  │    renewSession(providerId: string, accountId: string): Promise<void>;     │
│  │    switchAccount(providerId: string, accountId: string): void;       │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       TOKEN MANAGER                                 │   │
│  │                                                                      │   │
│  │  Responsabilidad: Controlar consumo de tokens y cuotas              │   │
│  │                                                                      │   │
│  │  Dimensiones de control:                                            │   │
│  │  - Por conversación: Tokens usados en la conversación actual        │   │
│  │  - Por usuario: Tokens consumidos por el usuario                    │   │
│  │  - Por proyecto: Tokens consumidos en el proyecto                    │   │
│  │  - Por modelo: Tokens consumidos por modelo específico               │   │
│  │  - Por proveedor: Tokens consumidos por proveedor                    │   │
│  │  - Por día: Consumo diario                                         │   │
│  │  - Por mes: Consumo mensual                                        │   │
│  │                                                                      │   │
│  │  Funcionalidades:                                                   │   │
│  │  - Cost estimation: Calcular coste estimado por request              │   │
│  │  - Free limits: Límites para usuarios gratuitos                      │   │
│  │  - Paid limits: Límites para usuarios de pago                       │   │
│  │  - Quota detection: Detectar cuándo la cuota está por agotarse     │   │
│  │  - Quota alerts: Notificar cuando se alcance umbral                 │   │
│  │  - History: Historial completo de consumo                           │   │
│  │  - Rate tracking: Velocidad de consumo (tokens/min)                 │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface TokenManager {                                           │   │
│  │    trackUsage(dimensions: UsageDimensions, tokens: number): void;     │   │
│  │    getUsage(dimensions: UsageDimensions): UsageStats;                │   │
│  │    checkQuota(dimensions: UsageDimensions): QuotaStatus;             │   │
│  │    estimateCost(request: ExecutionRequest): CostEstimate;           │   │
│  │    setLimit(dimensions: UsageDimensions, limit: number): void;       │   │
│  │    getRemaining(dimensions: UsageDimensions): number;                │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  │  Eventos emitritos:                                                  │   │
│  │  - quota.low: Cuando el uso supera el 80%                          │   │
│  │  - quota.exceeded: Cuando se alcanza el límite                      │   │
│  │  - quota.reset: Cuando se reinician los contadores                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CAPA DE CREDENCIALES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       API KEY MANAGER                               │   │
│  │                                                                      │   │
│  │  Responsabilidad: Administrador central de credenciales               │   │
│  │  Acceso: Solo mediante interfaces, nunca acceso directo               │   │
│  │                                                                      │   │
│  │  Funcionalidades:                                                   │   │
│  │  - Secure storage: Almacenamiento cifrado (AES-256)                 │   │
│  │  - Encryption: Cifrado en reposo y en tránsito                     │   │
│  │  - Automatic rotation: Rotación automática de keys                   │   │
│  │  - Rate limits: Control de rate limits por key                      │   │
│  │  - Cooldown: Períodos de espera después de rate limits              │   │
│  │  - Health checks: Verificación periódica de estado                   │   │
│  │  - Invalid detection: Detectar keys inválidas automáticamente       │   │
│  │  - Auto-reactivation: Reactivación después de cooldown              │   │
│  │  - Key balancing: Balanceo entre múltiples keys                    │   │
│  │  - Metrics: Métricas de uso por key                                 │   │
│  │  - Audit: Log completo de todas las operaciones                     │   │
│  │  - Organizations: Soporte multi-organización                       │   │
│  │  - Statistics: Estadísticas de uso agregadas                        │   │
│  │                                                                      │   │
│  │  Estados de Key:                                                    │   │
│  │  - active: Key funcional                                           │   │
│  │  - exhausted: Cuota agotada                                         │   │
│  │  - cooldown: En período de espera                                  │   │
│  │  - invalid: Key inválida                                           │   │
│  │  - revoked: Revocada por el usuario/provider                        │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface APIKeyManager {                                          │   │
│  │    getKey(providerId: string): Promise<EncryptedKey>;               │   │
│  │    addKey(providerId: string, key: string, metadata?: KeyMetadata): Promise<Key>; │
│  │    markExhausted(keyId: string): Promise<void>;                      │   │
│  │    markInvalid(keyId: string, reason?: string): Promise<void>;      │   │
│  │    setCooldown(keyId: string, until: Date): Promise<void>;           │   │
│  │    getCooldownStatus(keyId: string): Promise<CooldownStatus>;        │   │
│  │    checkHealth(keyId: string): Promise<HealthStatus>;                │   │
│  │    getUsageStats(keyId: string): Promise<KeyUsageStats>;            │   │
│  │    getAuditLog(filter?: AuditFilter): Promise<AuditRecord[]>;       │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      HEALTH CHECKER                                  │   │
│  │                                                                      │   │
│  │  Responsabilidad: Verificar salud de providers y cuentas             │   │
│  │                                                                      │   │
│  │  Checks realizados:                                                  │   │
│  │  - Ping test: Verificar conectividad básica                          │   │
│  │  - Latency: Medir tiempo de respuesta                               │   │
│  │  - Error rate: Calcular tasa de errores reciente                    │   │
│  │  - Quota status: Verificar estado de cuota                           │   │
│  │  - Auth validity: Verificar si la credencial sigue válida            │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface HealthChecker {                                           │   │
│  │    checkProvider(providerId: string): Promise<ProviderHealth>;       │   │
│  │    checkKey(keyId: string): Promise<KeyHealth>;                      │   │
│  │    checkAccount(accountId: string): Promise<AccountHealth>;           │   │
│  │    getOverallHealth(): Promise<SystemHealth>;                        │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        RATE LIMITER                                  │   │
│  │                                                                      │   │
│  │  Responsabilidad: Controlar límites de requests                     │   │
│  │                                                                      │   │
│  │  Estrategias:                                                        │   │
│  │  - Fixed window: Límite fijo por ventana de tiempo                  │   │
│  │  - Sliding window: Ventana deslizante                               │   │
│  │  - Token bucket: Token bucket para burst                             │   │
│  │  - Leaky bucket: Leaky bucket para rate uniforme                    │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface RateLimiter {                                            │   │
│  │    check(identifier: string): RateLimitResult;                       │   │
│  │    checkProvider(providerId: string): RateLimitResult;               │   │
│  │    consume(identifier: string, tokens?: number): boolean;             │   │
│  │    setLimit(identifier: string, limit: number, windowMs: number): void; │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CAPA DE GATEWAY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      LITELLM GATEWAY                                 │   │
│  │                                                                      │   │
│  │  Responsabilidad: Comunicación universal con proveedores              │   │
│  │  Reglas de negocio: 0 (todas están en Policy Engine)                 │   │
│  │                                                                      │   │
│  │  Funcionalidades:                                                   │   │
│  │  - Unified API: Interface única para todos los proveedores           │   │
│  │  - Protocol translation: Convertir entre protocolos                 │   │
│  │  - Streaming: Soporte nativo de streaming                           │   │
│  │  - Retry: Reintentos automáticos configurables                       │   │
│  │  - Timeout: Control de timeouts                                     │   │
│  │                                                                      │   │
│  │  Providers soportados:                                              │   │
│  │  - 100+ proveedores vía LiteLLM                                    │   │
│  │  - Free Claude Code vía FCC Adapter                                 │   │
│  │  - Providers custom mediante adapters                               │   │
│  │                                                                      │   │
│  │  Interfaz:                                                          │   │
│  │  interface LLMGateway {                                            │   │
│  │    complete(request: LLMRequest): Promise<LLMResponse>;             │   │
│  │    stream(request: LLMRequest): AsyncIterable<LLMResponse>;          │   │
│  │    embed(request: EmbedRequest): Promise<EmbedResponse>;              │   │
│  │    getModels(): Promise<Model[]>;                                   │   │
│  │  }                                                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CAPA DE PROVEEDORES LLM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │  Groq   │ │DeepSeek │ │ Gemini  │ │Claude  │ │Mistral │ │   FCC   │ │
│  │         │ │         │ │         │ │(Anthro)│ │         │ │         │ │
│  │ llama-3 │ │deepseek│ │gemini-  │ │claude- │ │mistral │ │ nemotron│ │
│  │   70B   │ │-coder  │ │  1.5    │ │  3.5   │ │  small  │ │   120B  │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
│                                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │Cloudflare│ │ Cohere │ │ Hugging │ │  Open  │ │Together │ │ Samba  │ │
│  │ Workers │ │command-r│ │  Face   │ │ Router │ │   AI    │ │  Nova   │ │
│  │   AI   │ │   +    │ │         │ │         │ │         │ │         │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
│                                                                              │
│  ... (25+ providers adicionales)                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Modelo de Datos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MODELO DE DATOS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐              │
│  │  Provider   │       │   Model    │       │  Account    │              │
│  ├─────────────┤       ├─────────────┤       ├─────────────┤              │
│  │ id          │       │ id          │       │ id          │              │
│  │ name        │       │ provider_id │──────▶│ provider_id │              │
│  │ capabilities│       │ name        │       │ auth_type   │              │
│  │ auth_type   │       │ context_win │       │ credentials │ (encrypted) │
│  │ priority    │       │ cost_input  │       │ is_active   │              │
│  │ status      │       │ cost_output │       │ last_verif  │              │
│  │ config      │       │ status      │       │ org_id      │ (optional)  │
│  └─────────────┘       └─────────────┘       └─────────────┘              │
│         │                                           │                      │
│         │              ┌─────────────┐              │                      │
│         └─────────────▶│    APIKey   │◀─────────────┘                      │
│                        ├─────────────┤                                      │
│                        │ id          │                                      │
│                        │ account_id  │                                      │
│                        │ key         │ (encrypted)                          │
│                        │ status      │                                      │
│                        │ cooldown_until│                                     │
│                        │ error_count │                                      │
│                        │ last_used   │                                      │
│                        └─────────────┘                                      │
│                               │                                             │
│                               ▼                                             │
│                        ┌─────────────┐       ┌─────────────┐              │
│                        │ UsageLog    │       │    User     │              │
│                        ├─────────────┤       ├─────────────┤              │
│                        │ id          │       │ id          │              │
│                        │ api_key_id  │──────▶│ tier        │              │
│                        │ tokens_in   │       │ project_ids │              │
│                        │ tokens_out  │       │ preferences │              │
│                        │ cost        │       └─────────────┘              │
│                        │ timestamp   │              │                      │
│                        │ latency_ms  │              ▼                      │
│                        │ status_code │       ┌─────────────┐              │
│                        └─────────────┘       │   Project   │              │
│                                               ├─────────────┤              │
│                                               │ id          │              │
│                                               │ user_id     │──────▶ User  │
│                                               │ name        │              │
│                                               │ policies    │              │
│                                               │ budget      │              │
│                                               └─────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. COMPONENTES CORE

### 4.1 Execution Engine

**Ubicación:** `api/server/services/ExecutionEngine/`
**Responsabilidad:** Coordinar ejecución de solicitudes
**Dependencias:** Capability Router, Context Manager, Event Bus

```typescript
// Interfaz del Execution Engine
interface ExecutionEngine {
  // Ejecutar una solicitud
  execute(request: ExecutionRequest): Promise<ExecutionResponse>;
  
  // Ejecutar con streaming
  executeStream(request: ExecutionRequest): AsyncIterable<ExecutionResponse>;
  
  // Cancelar ejecución
  cancel(executionId: string): Promise<void>;
  
  // Obtener estado
  getStatus(executionId: string): ExecutionStatus;
}

// Estructura de request
interface ExecutionRequest {
  id: string;
  capabilities: Capability[];
  messages: Message[];
  userId: string;
  projectId?: string;
  constraints?: ExecutionConstraints;
  metadata?: Record<string, unknown>;
}

// Estructura de respuesta
interface ExecutionResponse {
  id: string;
  message: Message;
  provider: string;
  model: string;
  usage: UsageInfo;
  latency: number;
  cost: number;
}
```

### 4.2 Capability Router

**Ubicación:** `api/server/services/CapabilityRouter/`
**Responsabilidad:** Determinar mejores capacidades para la solicitud
**Dependencias:** Policy Engine, Provider Registry

```typescript
// Interfaz del Capability Router
interface CapabilityRouter {
  // Route: Seleccionar mejor provider/model
  route(requirements: CapabilityRequirements): Promise<RoutingDecision>;
  
  // Multi-route: Para solicitudes que requieren múltiples capacidades
  multiRoute(requirements: CapabilityRequirements[]): Promise<RoutingDecision[]>;
}

// Requerimientos de capacidades
interface CapabilityRequirements {
  required: Capability[];
  preferred?: Capability[];
  constraints?: {
    maxCost?: number;
    maxLatency?: number;
    preferredProviders?: string[];
    excludedProviders?: string[];
    minContext?: number;
    maxContext?: number;
  };
}
```

### 4.3 Policy Engine

**Ubicación:** `api/server/services/PolicyEngine/` (NUEVO)
**Responsabilidad:** Centralizar reglas de negocio
**Dependencias:** Provider Registry, Token Manager, User/Project Services

```typescript
// Interfaz del Policy Engine
interface PolicyEngine {
  // Evaluar políticas para una solicitud
  evaluate(context: PolicyContext): PolicyDecision;
  
  // Validar si una acción está permitida
  validate(action: PolicyAction, context: PolicyContext): boolean;
  
  // Obtener reglas activas
  getActiveRules(): PolicyRule[];
  
  // Agregar/actualizar reglas
  setRule(rule: PolicyRule): void;
}

// Contexto de política
interface PolicyContext {
  userId: string;
  userTier: 'free' | 'paid' | 'enterprise';
  projectId?: string;
  capabilities: Capability[];
  estimatedCost: number;
  estimatedLatency: number;
}

// Regla de política
interface PolicyRule {
  id: string;
  name: string;
  type: 'priority' | 'cost' | 'latency' | 'fallback' | 'quota';
  condition: (context: PolicyContext) => boolean;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
}
```

### 4.4 Provider Registry

**Ubicación:** `api/server/services/ProviderRegistry/` (EVOLUCIONADO)
**Responsabilidad:** Registro centralizado de proveedores
**Dependencias:** Ninguna (es el registro base)

```typescript
// Interfaz del Provider Registry
interface ProviderRegistry {
  // Registrar proveedor
  register(provider: Provider): void;
  
  // Desregistrar proveedor
  unregister(providerId: string): void;
  
  // Obtener proveedor
  get(providerId: string): Provider | null;
  
  // Listar todos
  list(): Provider[];
  
  // Buscar por capacidades
  findByCapabilities(capabilities: Capability[]): Provider[];
  
  // Buscar por modelo
  findByModel(modelId: string): Provider | null;
  
  // Obtener modelos de proveedor
  getModels(providerId: string): Model[];
}

// Estructura de Provider
interface Provider {
  id: string;
  name: string;
  displayName: string;
  capabilities: Capability[];
  models: Model[];
  authType: AuthType;
  limits: ProviderLimits;
  features: ProviderFeatures;
  priority: number;
  weight: number;
  status: 'active' | 'degraded' | 'maintenance' | 'disabled';
  config: Record<string, unknown>;
}

// Tipos de autenticación
type AuthType = 'api_key' | 'oauth' | 'jwt' | 'cookie' | 'browser_session' | 'refresh_token';

// Características del provider
interface ProviderFeatures {
  streaming: boolean;
  tools: boolean;
  multimodal: boolean;
  vision: boolean;
  functionCalling: boolean;
}
```

### 4.5 Provider Manager

**Ubicación:** `api/server/services/ProviderManager/` (NUEVO)
**Responsabilidad:** Administrar proveedores activos
**Dependencias:** Provider Registry, Health Checker, Account Manager

```typescript
// Interfaz del Provider Manager
interface ProviderManager {
  // Habilitar/deshabilitar proveedor
  setStatus(providerId: string, status: ProviderStatus): void;
  
  // Establecer prioridad
  setPriority(providerId: string, priority: number): void;
  
  // Establecer peso (para balanceo)
  setWeight(providerId: string, weight: number): void;
  
  // Obtener proveedores disponibles
  getAvailable(capabilities: Capability[]): Provider[];
  
  // Balanceo de carga
  selectForLoad(providerIds: string[]): string;
  
  // Estado de salud
  getHealth(): Map<string, HealthStatus>;
}
```

### 4.6 Account Manager

**Ubicación:** `api/server/services/AccountManager/` (NUEVO)
**Responsabilidad:** Gestionar cuentas de proveedores
**Dependencias:** API Key Manager, Health Checker

```typescript
// Interfaz del Account Manager
interface AccountManager {
  // Obtener cuentas de provider
  getAccounts(providerId: string): Account[];
  
  // Obtener cuenta activa
  getActiveAccount(providerId: string): Account | null;
  
  // Agregar cuenta
  addAccount(providerId: string, account: Account): void;
  
  // Remover cuenta
  removeAccount(providerId: string, accountId: string): void;
  
  // Verificar cuenta
  verify(providerId: string, accountId: string): Promise<boolean>;
  
  // Renovar sesión
  renewSession(providerId: string, accountId: string): Promise<void>;
  
  // Cambiar cuenta activa
  switchAccount(providerId: string, accountId: string): void;
}

// Estructura de Account
interface Account {
  id: string;
  providerId: string;
  authType: AuthType;
  credentials: EncryptedCredentials;
  organizationId?: string;
  isActive: boolean;
  lastVerified: Date;
  expiresAt?: Date;
  metadata: Record<string, unknown>;
}
```

### 4.7 Token Manager

**Ubicación:** `api/server/services/TokenManager/` (NUEVO)
**Responsabilidad:** Control de consumo de tokens
**Dependencias:** Ninguna (maneja sus propios datos)

```typescript
// Interfaz del Token Manager
interface TokenManager {
  // Registrar uso
  trackUsage(dimensions: UsageDimensions, tokens: number): void;
  
  // Obtener uso
  getUsage(dimensions: UsageDimensions): UsageStats;
  
  // Verificar cuota
  checkQuota(dimensions: UsageDimensions): QuotaStatus;
  
  // Estimar coste
  estimateCost(modelId: string, tokens: number): CostEstimate;
  
  // Establecer límite
  setLimit(dimensions: UsageDimensions, limit: number): void;
  
  // Obtener restante
  getRemaining(dimensions: UsageDimensions): number;
}

// Dimensiones de uso
interface UsageDimensions {
  conversationId?: string;
  userId?: string;
  projectId?: string;
  modelId?: string;
  providerId?: string;
  date?: Date; // Para filtros de día/mes
}

// Estado de cuota
interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  isNearLimit: boolean; // > 80%
  isExceeded: boolean;
  resetAt?: Date;
}
```

### 4.8 API Key Manager

**Ubicación:** `api/server/services/APIKeyManager/`
**Responsabilidad:** Administrador central de credenciales
**Dependencias:** Ninguna (maneja sus propios datos)

```typescript
// Interfaz del API Key Manager
interface APIKeyManager {
  // Obtener key para provider
  getKey(providerId: string): Promise<EncryptedKey>;
  
  // Obtener todas las keys de provider
  getKeys(providerId: string): Promise<APIKey[]>;
  
  // Agregar key
  addKey(providerId: string, key: string, metadata?: KeyMetadata): Promise<APIKey>;
  
  // Marcar como agotada
  markExhausted(keyId: string): Promise<void>;
  
  // Marcar como inválida
  markInvalid(keyId: string, reason?: string): Promise<void>;
  
  // Establecer cooldown
  setCooldown(keyId: string, until: Date): Promise<void>;
  
  // Obtener estado de cooldown
  getCooldownStatus(keyId: string): Promise<CooldownStatus>;
  
  // Verificar salud
  checkHealth(keyId: string): Promise<KeyHealth>;
  
  // Obtener estadísticas
  getUsageStats(keyId: string): Promise<KeyUsageStats>;
  
  // Obtener log de auditoría
  getAuditLog(filter?: AuditFilter): Promise<AuditRecord[]>;
  
  // Rotación automática
  rotateKey(keyId: string): Promise<APIKey>;
  
  // Reactivar después de cooldown
  reactivateIfReady(keyId: string): Promise<boolean>;
}

// Estados de key
type KeyStatus = 'active' | 'exhausted' | 'cooldown' | 'invalid' | 'revoked';

// Metadata de key
interface KeyMetadata {
  label?: string;
  dailyLimit?: number;
  isPrimary?: boolean;
  tags?: string[];
  userId?: string;
}
```

---

## 5. FLUJO DE SOLICITUDES

### 5.1 Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO DE SOLICITUD                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USUARIO ENVÍA MENSAJE                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  User ──▶ LibreChat Frontend                                                │
│                                                                              │
│                                    │                                          │
│                                    ▼                                          │
│  2. EXECUTION ENGINE RECIBE REQUEST                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ExecutionEngine.execute(request)                                            │
│  │                                                                          │
│  │  - Genera executionId                                                  │
│  │  - Registra en contexto                                                │
│  │  - Publica evento: execution.requested                                  │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  3. CONTEXT MANAGER PROCESA CONTEXTO                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ContextManager.getContext(conversationId)                                   │
│  │                                                                          │
│  │  - Cuenta tokens                                                         │
│  │  - Aplica estrategia de windowing                                       │
│  │  - Trunca o resume si es necesario                                       │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  4. CAPABILITY ROUTER DETERMINA CAPACIDADES                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  CapabilityRouter.route(requirements)                                        │
│  │                                                                          │
│  │  - Analiza capabilities requeridas                                      │
│  │  - Consulta Policy Engine para restricciones                            │
│  │  - Busca providers que soporten las capabilities                        │
│  │  - Genera RoutingDecision con score                                     │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  5. POLICY ENGINE EVALÚA REGLAS                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  PolicyEngine.evaluate(context)                                             │
│  │                                                                          │
│  │  - Valida políticas de usuario/proyecto                                  │
│  │  - Verifica límites de coste                                            │
│  │  - Aplica reglas de prioridad                                          │
│  │  - Genera lista de fallbacks                                           │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  6. PROVIDER MANAGER SELECCIONA PROVIDER                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ProviderManager.getAvailable(capabilities)                                  │
│  │                                                                          │
│  │  - Filtra por status (solo activos)                                      │
│  │  - Ordena por prioridad/peso                                            │
│  │  - Verifica health status                                               │
│  │  - Retorna lista ordenada                                               │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  7. ACCOUNT MANAGER OBTIENE CUENTA                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  AccountManager.getActiveAccount(providerId)                                 │
│  │                                                                          │
│  │  - Verifica si hay cuenta activa                                        │
│  │  - Verifica expiración de sesión                                        │
│  │  - Si es necesario, renueva sesión                                      │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  8. API KEY MANAGER OBTIENE CREDENCIAL                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  APIKeyManager.getKey(providerId)                                            │
│  │                                                                          │
│  │  - Descifra key                                                         │
│  │  - Verifica estado (no en cooldown)                                    │
│  │  - Actualiza last_used                                                  │
│  │  - Registra en auditoría                                                │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  9. TOKEN MANAGER VERIFICA CUOTA                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  TokenManager.checkQuota(dimensions)                                         │
│  │                                                                          │
│  │  - Verifica límites por usuario/proveedor/modelo                        │
│  │  - Si near limit, publica evento quota.low                              │
│  │  - Si exceeded, lanza excepción                                        │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  10. LITELLM GATEWAY ENVÍA REQUEST                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  LiteLLMGateway.complete(request)                                            │
│  │                                                                          │
│  │  - Traduce request al formato del provider                              │
│  │  - Añade credenciales                                                   │
│  │  - Configura timeouts                                                   │
│  │  - Envía request                                                        │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  11. STREAMING DE RESPUESTA                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  LiteLLMGateway.stream(request)                                             │
│  │                                                                          │
│  │  - Retorna AsyncIterable                                               │
│  │  - Execution Engine procesa chunks                                      │
│  │  - Context Manager actualiza contexto                                   │
│  │  - Token Manager registra uso (parcial)                                 │
│  │  - Event Bus publica eventos de progreso                                │
│  │                                                                          │
│                                    │                                          │
│                                    ▼                                          │
│  12. FINALIZACIÓN                                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  - Token Manager registra uso final                                         │
│  - Audit Logger registra operación completa                                 │
│  - Event Bus publica execution.completed                                    │
│  - Retorna respuesta al usuario                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Flujo de Fallback

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FLUJO DE FALLBACK                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Primary Provider Falla                                                     │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────┐                                                        │
│  │ Registrar error │                                                        │
│  │ en HealthCheck │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ Capability      │                                                        │
│  │ Router genera   │                                                        │
│  │ fallback list   │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ Policy Engine   │                                                        │
│  │ valida si se    │                                                        │
│  │ permite fallback │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ Attemptar       │                                                        │
│  │ siguiente in    │                                                        │
│  │ fallback list   │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│     ┌─────┴─────┐                                                           │
│     │           │                                                           │
│   Éxito       Error                                                         │
│     │           │                                                           │
│     ▼           ▼                                                           │
│  ┌──────┐  ┌─────────────┐                                                  │
│  │ OK   │  │ ¿Más       │                                                  │
│  │      │  │ fallbacks? │                                                  │
│  └──────┘  └──────┬──────┘                                                  │
│                     │                                                        │
│                 Sí   No                                                     │
│                  │    │                                                     │
│                  ▼    ▼                                                     │
│             ┌──────┐ ┌─────────┐                                             │
│             │Loop │ │ Return  │                                             │
│             └──────┘ │  error  │                                             │
│                     └─────────┘                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. INTERFACES ENTRE COMPONENTES

### 6.1 Matriz de Interfaces

| De \ A | ExecEngine | CapRouter | PolicyEngine | ProvRegistry | ProvManager | AcctManager | TokenManager | APIKeyMgr | LLMGateway |
|--------|-----------|-----------|--------------|--------------|-------------|-------------|--------------|-----------|------------|
| **ExecEngine** | - | usa | - | - | - | - | - | - | - |
| **CapRouter** | - | - | consulta | consulta | - | - | - | - | - |
| **PolicyEngine** | - | - | - | - | - | - | - | - | - |
| **ProvRegistry** | - | - | - | - | notifica | - | - | - | - |
| **ProvManager** | - | - | - | - | - | usa | - | - | - |
| **AcctManager** | - | - | - | - | - | - | - | usa | - |
| **TokenManager** | - | - | - | - | notifica | - | - | - | - |
| **APIKeyManager** | - | - | - | - | - | - | - | - | - |
| **LLMGateway** | - | - | - | - | - | - | - | usa | - |

### 6.2 Contratos de Interfaz

```typescript
// Contract: ExecutionEngine -> CapabilityRouter
interface ICapabilityRouter {
  route(requirements: CapabilityRequirements): Promise<RoutingDecision>;
}

// Contract: CapabilityRouter -> PolicyEngine
interface IPolicyEngine {
  evaluate(context: PolicyContext): PolicyDecision;
  getConstraints(userId: string, projectId?: string): PolicyConstraints;
}

// Contract: CapabilityRouter -> ProviderRegistry
interface IProviderRegistry {
  findByCapabilities(capabilities: Capability[]): Provider[];
  get(providerId: string): Provider | null;
}

// Contract: ProviderManager -> AccountManager
interface IAccountManager {
  getActiveAccount(providerId: string): Account | null;
  verify(providerId: string, accountId: string): Promise<boolean>;
}

// Contract: AccountManager -> APIKeyManager
interface IAPIKeyManager {
  getKey(providerId: string, accountId?: string): Promise<EncryptedKey>;
  checkHealth(keyId: string): Promise<KeyHealth>;
}

// Contract: LLMGateway -> APIKeyManager (internal)
interface ICredentialProvider {
  getCredentials(providerId: string): Promise<Credentials>;
}
```

---

## 7. MODELO DE DATOS

### 7.1 Entidades Principales

```typescript
// Provider
interface Provider {
  id: string;                    // "groq", "anthropic", "fcc"
  name: string;                  // "Groq", "Anthropic", "Free Claude Code"
  displayName: string;            // "Groq (Free)"
  capabilities: Capability[];     // Capacidades que soporta
  models: Model[];               // Modelos disponibles
  authType: AuthType;            // Tipo de autenticación
  limits: ProviderLimits;         // Límites conocidos
  features: ProviderFeatures;     // Características
  priority: number;               // 1-100 (menor = mayor prioridad)
  weight: number;                // Peso para balanceo (0-1)
  status: ProviderStatus;        // Estado actual
  health: HealthStatus;          // Estado de salud
  config: Record<string, unknown>; // Configuración específica
  createdAt: Date;
  updatedAt: Date;
}

// Model
interface Model {
  id: string;                    // "llama-3.3-70b-versatile"
  providerId: string;            // FK a Provider
  name: string;                  // "Llama 3.3 70B Versatile"
  capabilities: Capability[];     // Capacidades del modelo
  contextWindow: number;         // ej: 131072
  cost: {
    inputPer1M: number;         // Coste por 1M tokens input
    outputPer1M: number;        // Coste por 1M tokens output
  };
  latency: LatencyStats;         // Estadísticas de latencia
  status: 'active' | 'deprecated' | 'new';
}

// Account
interface Account {
  id: string;
  providerId: string;            // FK a Provider
  authType: AuthType;
  credentials: EncryptedCredentials;
  organizationId?: string;       // Para multi-org
  isActive: boolean;
  isDefault: boolean;            // Cuenta por defecto
  lastVerified: Date;
  expiresAt?: Date;
  metadata: Record<string, unknown>;
}

// APIKey
interface APIKey {
  id: string;
  accountId: string;             // FK a Account
  encryptedKey: string;           // Key cifrada
  label?: string;                // Label opcional
  status: KeyStatus;             // Estado
  cooldownUntil?: Date;           // Cuándo termina el cooldown
  errorCount: number;            // Contador de errores
  dailyLimit?: number;           // Límite diario
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// UsageLog
interface UsageLog {
  id: string;
  apiKeyId: string;             // FK a APIKey
  conversationId: string;        // FK a Conversation
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  statusCode: number;
  errorMessage?: string;
  timestamp: Date;
}

// User
interface User {
  id: string;
  email: string;
  tier: 'free' | 'paid' | 'enterprise';
  projectIds: string[];          // FKs a Projects
  preferences: UserPreferences;
  createdAt: Date;
}

// Project
interface Project {
  id: string;
  userId: string;               // FK a User
  name: string;
  policies: ProjectPolicies;
  budget?: Budget;
  createdAt: Date;
}

// AuditLog
interface AuditLog {
  id: string;
  entityType: 'api_key' | 'account' | 'provider' | 'user';
  entityId: string;
  action: string;               // "created", "updated", "deleted", "used"
  actorId?: string;             // User que realizó la acción
  actorType: 'user' | 'system';
  details: Record<string, unknown>;
  timestamp: Date;
}
```

---

## 8. EVENTOS DEL SISTEMA

### 8.1 Categorías de Eventos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TAXONOMÍA DE EVENTOS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EVENTOS DE SISTEMA                                 │   │
│  │  system.started, system.shutdown, system.health_changed              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EVENTOS DE CONFIGURACIÓN                           │   │
│  │  config.changed, provider.registered, provider.removed              │   │
│  │  credential.updated, credential.expired                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EVENTOS DE EJECUCIÓN                               │   │
│  │  execution.requested, execution.started, execution.completed        │   │
│  │  execution.failed, execution.cancelled                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EVENTOS DE ROUTING                                  │   │
│  │  routing.requested, routing.resolved, routing.fallback              │   │
│  │  policy.evaluated, policy.rejected                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EVENTOS DE PROVIDER                                 │   │
│  │  provider.enabled, provider.disabled, provider.health_changed       │   │
│  │  provider.rate_limited, provider.quota_low                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EVENTOS DE CREDENCIALES                            │   │
│  │  key.created, key.exhausted, key.invalidated, key.cooldown           │   │
│  │  key.reactivated, key.rotated                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EVENTOS DE CUOTA                                   │   │
│  │  quota.low, quota.exceeded, quota.reset, quota.warning               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EVENTOS DE AUDITORÍA                               │   │
│  │  audit.created, audit.export_requested                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Formato de Evento

```typescript
interface Event {
  id: string;                    // UUID
  type: EventType;               // Tipo de evento
  source: string;                // Componente que lo emitió
  timestamp: Date;               // Cuándo ocurrió
  correlationId?: string;         // Para trazar requests
  priority: 'critical' | 'high' | 'normal' | 'low';
  data: Record<string, unknown>; // Payload específico
}
```

---

## 9. SEGURIDAD

### 9.1 Principios de Seguridad

| Principio | Implementación |
|-----------|----------------|
| Defense in Depth | Múltiples capas de seguridad |
| Least Privilege | Permisos mínimos necesarios |
| Zero Trust | Verificar siempre, nunca confiar |
| Secure by Default | Configuración segura por defecto |

### 9.2 Medidas de Seguridad

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MEDIDAS DE SEGURIDAD                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ALMACENAMIENTO                                                            │
│  ────────────────────────────────────────────────────────────────────────  │
│  ✅ API Keys cifradas con AES-256                                          │
│  ✅ Credentials cifradas con Fernet                                       │
│  ✅ Keys nunca expuestas en logs                                           │
│  ✅ Keys nunca en variables de entorno en código                          │
│  ✅ Rotación automática de keys de cifrado                                 │
│                                                                              │
│  TRANSMISIÓN                                                               │
│  ────────────────────────────────────────────────────────────────────────  │
│  ✅ TLS 1.3 para todas las comunicaciones                                  │
│  ✅ mTLS para comunicaciones internas                                      │
│  ✅ Headers de seguridad (CSP, X-Frame-Options, etc.)                    │
│                                                                              │
│  ACCESO                                                                    │
│  ────────────────────────────────────────────────────────────────────────  │
│  ✅ JWT con expiración corta                                              │
│  ✅ Refresh tokens para sesiones largas                                   │
│  ✅ Rate limiting por IP y usuario                                        │
│  ✅ 2FA para cuentas privilegiadas                                         │
│                                                                              │
│  AUDITORÍA                                                                │
│  ────────────────────────────────────────────────────────────────────────  │
│  ✅ Log de todas las operaciones con credenciales                         │
│  ✅ Log inmutable (WORM)                                                  │
│  ✅ Alertas para operaciones sospechosas                                 │
│  ✅ Retención configurable (GDPR compliance)                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. ESCALABILIDAD

### 10.1 Estrategia de Escalado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ESTRATEGIA DE ESCALADO                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CAPA DE ORQUESTACIÓN                                                      │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ✅ Stateless: Execution Engine no tiene estado                           │
│  ✅ Horizontal: Múltiples instancias                                       │
│  ✅ Cache distribuido: Redis para contexto compartido                      │
│                                                                              │
│  CAPA DE DATOS                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ✅ PostgreSQL: Datos relacionales                                         │
│  ✅ Redis: Cache, sessions, rate limits                                   │
│  ✅ TimescaleDB (opcional): Métricas temporales                            │
│                                                                              │
│  CAPA DE EVENTOS                                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ✅ Event Bus in-memory para baja latencia                                 │
│  ✅ Kafka (opcional): Para eventos persistentes                             │
│                                                                              │
│  CAPA DE GATEWAY                                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ✅ LiteLLM con pooling de conexiones                                     │
│  ✅ Circuit breakers por provider                                          │
│  ✅ Request coalescing                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Métricas de Escalado

| Métrica | Valor Objetivo | Alerta |
|---------|---------------|--------|
| Latencia P99 | < 500ms | > 1000ms |
| Throughput | > 100 req/s | < 50 req/s |
| Error rate | < 0.1% | > 1% |
| CPU | < 70% | > 85% |
| Memory | < 80% | > 90% |

---

## 11. OBSERVABILIDAD

### 11.1 Pilares de Observabilidad

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PILARES DE OBSERVABILIDAD                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         MÉTRICAS                                       │   │
│  │                                                                      │   │
│  │  • Request rate (req/s)                                            │   │
│  │  • Error rate (%)                                                   │   │
│  │  • Latency (P50, P95, P99)                                         │   │
│  │  • Provider health scores                                           │   │
│  │  • Token consumption                                                │   │
│  │  • Cost per hour                                                    │   │
│  │  • Active providers                                                 │   │
│  │  • Key utilization                                                  │   │
│  │                                                                      │   │
│  │  Export: Prometheus, Datadog, CloudWatch                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         LOGS                                          │   │
│  │                                                                      │   │
│  │  • Structured JSON logs                                             │   │
│  │  • Correlation IDs para trazabilidad                               │   │
│  │  • Log levels: DEBUG, INFO, WARN, ERROR                           │   │
│  │  • Sensitive data masking                                           │   │
│  │                                                                      │   │
│  │  Export: Loki, ELK, CloudWatch Logs                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        TRACING                                        │   │
│  │                                                                      │   │
│  │  • Distributed tracing (OpenTelemetry)                              │   │
│  │  • Span por cada componente                                         │   │
│  │  • Trace completo de request                                        │   │
│  │  • Sampling configurable                                            │   │
│  │                                                                      │   │
│  │  Export: Jaeger, Zipkin, Tempo                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Dashboard Propuesto

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DASHBOARD MULTI-LLM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐ │
│  │ Providers Health     │  │ Token Usage Today    │  │ Cost Estimate    │ │
│  │ ────────────────────│  │ ────────────────────│  │ ────────────────│ │
│  │ 🟢 Groq        98%  │  │ ████████████░░ 78% │  │ $24.56 / $100   │ │
│  │ 🟢 DeepSeek    95%  │  │                    │  │                  │ │
│  │ 🟡 Gemini      82%  │  │ 7.8M / 10M tokens  │  │ ↓ 12% vs ayer   │ │
│  │ 🔴 Anthropic   45%  │  │                    │  │                  │ │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Requests Over Time                                                    │ │
│  │ 100 ┤    ╭─╮    ╭──╮                                                 │ │
│  │  80 ┤ ───╯  ╰────╯  ╰──╮                                             │ │
│  │  60 ┤                    ╰──────╮                                     │ │
│  │  40 ┤                           ╰──╮                                  │ │
│  │  20 ┤                               ╰────────                         │ │
│  │   0 ┼──────────────────────────────────────────────────────────────  │ │
│  │      00:00    06:00    12:00    18:00    24:00                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Recent Events                                                         │ │
│  │ ───────────────────────────────────────────────────────────────────  │ │
│  │ ⚠️ 14:32 - Provider "anthropic" rate limited (key-123)               │ │
│  │ ✅ 14:28 - Key rotated successfully (key-456)                        │ │
│  │ ⚠️ 14:15 - Quota at 92% for user "alice"                            │ │
│  │ ✅ 14:10 - Provider "groq" health restored                           │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. COMPONENTES A CREAR vs. REUTILIZAR

### 12.1 Componentes Existentes (Reutilizar)

| Componente | Ubicación Actual | Acción |
|------------|------------------|--------|
| Execution Engine | `services/ExecutionEngine/` | **Reutilizar** con mejoras |
| Capability Router | `services/CapabilityRouter/` | **Reutilizar** con mejoras |
| Runtime Registry | `services/RuntimeRegistry/` | **Reutilizar** (renombrar a Provider Registry) |
| Context Manager | `services/ContextManager/` | **Reutilizar** |
| Event Bus | `services/EventBus/` | **Reutilizar** |
| Rate Limiter | `services/RateLimiter/` | **Reutilizar** |
| API Key Manager (JS) | `services/APIKeyManager/` | **Reutilizar** como fachada |
| API Key Manager (Python) | `services/APIKeyManager/services/` | **Reutilizar** como implementación |

### 12.2 Componentes Nuevos

| Componente | Descripción | Prioridad |
|------------|-------------|-----------|
| Policy Engine | Motor de políticas centralizado | **Alta** |
| Provider Manager | Gestión de proveedores activos | **Alta** |
| Account Manager | Gestión de cuentas de providers | **Alta** |
| Token Manager | Control de cuotas y tokens | **Alta** |
| Health Checker | Verificación de salud | **Media** |
| Audit Logger | Logging de auditoría | **Media** |
| FCC Adapter | Integración Free Claude Code | **Media** |

### 12.3 Componentes por Evolver

| Componente | Cambios Requeridos |
|------------|-------------------|
| Capability Router | Agregar consulta a Policy Engine |
| Runtime Registry | Renombrar a Provider Registry, agregar campos |
| API Key Manager | Agregar auditoría, métricas, balanceo |
| LLM Gateway | Extraer reglas de negocio a Policy Engine |

---

**Fin del Documento de Arquitectura**
