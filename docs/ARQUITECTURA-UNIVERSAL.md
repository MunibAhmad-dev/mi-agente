# 🌍 ARQUITECTURA UNIVERSAL: Universal AI Gateway
## Plataforma de Integración Multi-Provider para Inteligencia Artificial

**Fecha:** 2026-07-21
**Versión:** 1.0
**Autor:** OpenHands Agent
**Estado:** Diseño Propuesto

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Principios de Arquitectura Universal](#2-principios-de-arquitectura-universal)
3. [Arquitectura de Alto Nivel](#3-arquitectura-de-alto-nivel)
4. [Universal AI Gateway](#4-universal-ai-gateway)
5. [AI Provider Adapter Layer](#5-ai-provider-adapter-layer)
6. [Model Registry](#6-model-registry)
7. [Provider Registry](#7-provider-registry)
8. [Authentication Center](#8-authentication-center)
9. [Plugin System](#9-plugin-system)
10. [Flujo de Solicitudes](#10-flujo-de-solicitudes)
11. [Interfaces del Sistema](#11-interfaces-del-sistema)
12. [Comparativa con Anterior](#12-comparativa-con-anterior)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Visión

Construir una **Plataforma Universal de Integración de IA** que permita:

- Conectar con **cualquier** proveedor de IA (OpenAI, Anthropic, Groq, Ollama, etc.)
- Integrar **cualquier** proyecto open source (LiteLLM, Ollama, vLLM, llama.cpp, etc.)
- Soportar **cualquier** protocolo de comunicación (OpenAI, Anthropic, custom)
- Agregar nuevos proveedores **sin modificar el núcleo**
- Evolver durante años **sin dependencias de proyectos específicos**

### 1.2 Objetivo Principal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA ANTERIOR (Problemática)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐                                                         │
│  │ LibreChat   │                                                         │
│  └──────┬───────┘                                                         │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │              LITE LL M GATEWAY (Acoplado)                    │           │
│  │                                                              │           │
│  │  ⚠️ SI LITE LL M FALLA, TODO FALLA                       │           │
│  │  ⚠️ SI LITE LL M CAMBIA, TODO CAMBIA                     │           │
│  │  ⚠️ DEPENDENCIA FUERTE DE LITE LL M                       │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                   ARQUITECTURA UNIVERSAL (Propuesta)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐                                                         │
│  │ LibreChat   │                                                         │
│  └──────┬───────┘                                                         │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │                    UNIVERSAL AI GATEWAY                        │           │
│  │                                                              │           │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │           │
│  │  │LiteLLM │ │ OpenAI │ │Ollama  │ │  vLLM  │ │Custom │ │           │
│  │  │Adapter │ │Adapter │ │Adapter │ │Adapter │ │Adapter│ │           │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │           │
│  │                                                              │           │
│  │  ✅ CUALQUIER ADAPTADOR PUEDE FALLAR SIN AFECTAR OTROS     │           │
│  │  ✅ AGREGAR NUEVOS PROVEEDORES SIN MODIFICAR NÚCLEO       │           │
│  │  ✅ CERO DEPENDENCIAS FUERTES                               │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Principios Fundamentales

| Principio | Descripción | Beneficio |
|-----------|-------------|-----------|
| **Abstracción Total** | El núcleo no conoce adaptadores específicos | Flexibilidad máxima |
| **Plugin Architecture** | Cada cosa es un plugin instalable | Extensibilidad |
| **Interface Segregation** | Interfaces pequeñas y específicas | Mantenibilidad |
| **Dependency Inversion** | Depender de abstracciones | Testabilidad |
| **Open/Closed** | Abierto para extensión, cerrado para modificación | Estabilidad |

---

## 2. PRINCIPIOS DE ARQUITECTURA UNIVERSAL

### 2.1 No Hay Tecnología Dominante

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NO HAY TECNOLOGÍA "PRINCIPAL"                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ❌ INCORRECTO:                                                           │
│  ─────────────────                                                       │
│  LiteLLM → Provider principal                                              │
│  Ollama → Provider fallback                                                │
│  Others → Excepciones                                                     │
│                                                                              │
│  ✅ CORRECTO:                                                             │
│  ─────────────────                                                       │
│  LiteLLM → Adapter #1                                                     │
│  Ollama → Adapter #2                                                      │
│  OpenAI → Adapter #3                                                      │
│  vLLM → Adapter #4                                                       │
│  Custom → Adapter #N                                                      │
│                                                                              │
│  Todos son IGUALES. Todos son PLUGINS.                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 El Núcleo Solo Conoce Abstracciones

```typescript
// El núcleo NUNCA conoce implementaciones concretas

// ❌ INCORRECTO
import { LiteLLMAdapter } from './adapters/LiteLLMAdapter';

// ✅ CORRECTO
import { AIProviderAdapter } from './interfaces/AIProviderAdapter';
// El núcleo solo sabe que existe AIProviderAdapter
```

### 2.3 Regla de Oro

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REGLA DE ORO                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  El núcleo del sistema DEBE funcionar si TODOS los adaptadores             │
│  son removidos o reemplazados.                                             │
│                                                                              │
│  Si el núcleo deja de funcionar sin un adaptador específico,                │
│  entonces el diseño está ACOPLADO y debe corregirse.                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. ARQUITECTURA DE ALTO NIVEL

### 3.1 Diagrama Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA UNIVERSAL - VISTA COMPLETA                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        PRESENTATION LAYER                             │   │
│  │  LibreChat │ Dashboard │ API │ CLI │ SDK                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    UNIVERSAL AI GATEWAY (Núcleo)                     │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │  Routing    │  │   Policy    │  │   Metrics   │           │   │
│  │  │  Engine     │  │   Engine    │  │   Collector │           │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │   Model     │  │  Provider  │  │  Auth       │           │   │
│  │  │  Registry   │  │  Registry  │  │  Center     │           │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
│  │                                                                      │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │                  EVENT BUS (Pub/Sub)                       │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    AI PROVIDER ADAPTER LAYER                         │   │
│  │                                                                      │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │   │
│  │  │LiteLLM │  │ OpenAI │  │Ollama  │  │  vLLM  │  │Custom  │     │   │
│  │  │Adapter │  │Adapter │  │Adapter │  │Adapter │  │Adapter │     │   │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘     │   │
│  │                                                                      │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │   │
│  │  │Anthropic│  │ Gemini │  │  Groq  │  │DeepSeek│  │Cohere  │     │   │
│  │  │Adapter │  │Adapter │  │Adapter │  │Adapter │  │Adapter │     │   │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘     │   │
│  │                                                                      │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │   │
│  │  │Mistral │  │Together│  │ Hugging│  │NVIDIA  │  │ llama  │     │   │
│  │  │Adapter │  │Adapter │  │ Face   │  │  NIM   │  │.cpp    │     │   │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Capas de la Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAPAS DE LA ARQUITECTURA                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 1: PRESENTATION                                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • LibreChat Frontend                                                      │
│  • Admin Dashboard                                                         │
│  • REST API                                                                │
│  • WebSocket API                                                           │
│  • CLI                                                                     │
│  • SDK (Node.js, Python)                                                   │
│                                                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                              │
│  LAYER 2: UNIVERSAL AI GATEWAY (NÚCLEO)                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Routing Engine                                                          │
│  • Policy Engine                                                           │
│  • Model Registry (independiente de providers)                             │
│  • Provider Registry (desacoplado de modelos)                              │
│  • Authentication Center                                                   │
│  • Token & Quota Manager                                                   │
│  • Event Bus                                                               │
│  • Metrics & Observability                                                 │
│                                                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                              │
│  LAYER 3: ADAPTER LAYER (PLUGINS)                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • LiteLLM Adapter                                                        │
│  • OpenAI Adapter                                                         │
│  • Anthropic Adapter                                                      │
│  • Ollama Adapter                                                         │
│  • vLLM Adapter                                                           │
│  • llama.cpp Adapter                                                      │
│  • LocalAI Adapter                                                        │
│  • Custom Adapters (user-defined)                                          │
│                                                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                              │
│  LAYER 4: EXTERNAL SERVICES                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • OpenAI API                                                             │
│  • Anthropic API                                                           │
│  • Google AI API                                                          │
│  • Groq API                                                               │
│  • Ollama (local)                                                         │
│  • vLLM (self-hosted)                                                     │
│  • LiteLLM Proxy                                                          │
│  • Custom deployments                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. UNIVERSAL AI GATEWAY

### 4.1 Responsabilidades del Gateway

El **Universal AI Gateway** es el núcleo del sistema. Sus responsabilidades son:

| Responsabilidad | Descripción |
|----------------|-------------|
| **Enrutamiento** | Dirigir solicitudes al adaptador correcto |
| **Políticas** | Aplicar reglas de negocio |
| **Registro** | Mantener catálogos de modelos y providers |
| **Autenticación** | Gestionar credenciales de forma centralizada |
| **Control de cuotas** | Limitar y monitorear consumo |
| **Observabilidad** | Métricas, logs, tracing |
| **Plugin Management** | Cargar y gestionar adaptadores |

### 4.2 El Gateway NO Conoce

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LO QUE EL GATEWAY NO CONOCE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  El Gateway NUNCA debe conocer:                                           │
│                                                                              │
│  ❌ El nombre de ningún adaptador específico                               │
│  ❌ La URL de ningún provider                                             │
│  ❌ El formato de request de ningún provider                               │
│  ❌ La implementación de autenticación de ningún provider                 │
│  ❌ Los modelos específicos de ningún provider                            │
│  ❌ Los rate limits específicos de ningún provider                        │
│                                                                              │
│  El Gateway SOLO conoce las INTERFACES abstractas.                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Interfaz del Gateway

```typescript
// api/universal-gateway/types.ts

/**
 * Interfaz principal del Universal AI Gateway
 * El gateway expone esta interfaz al exterior
 */
export interface UniversalAIGateway {
  // Ejecución
  complete(request: AIRequest): Promise<AIResponse>;
  stream(request: AIRequest): AsyncIterable<AIResponse>;
  
  // Modelos y Providers
  getModels(filter?: ModelFilter): Promise<Model[]>;
  getProviders(filter?: ProviderFilter): Promise<Provider[]>;
  
  // Gestión de credenciales
  getCredentials(providerId: string): Promise<Credentials>;
  verifyCredentials(providerId: string): Promise<CredentialHealth>;
  
  // Cuotas
  checkQuota(dimensions: QuotaDimensions): Promise<QuotaStatus>;
  trackUsage(usage: UsageRecord): void;
  
  // Métricas
  getMetrics(): Promise<GatewayMetrics>;
}

/**
 * Request estándar que el gateway acepta
 * Provider-agnóstico
 */
export interface AIRequest {
  // Identificación
  requestId: string;
  userId?: string;
  
  // Modelo (puede ser abstracto o concreto)
  model?: string;                    // ej: "gpt-4" o "claude-3"
  capabilities?: Capability[];       // ej: ["chat", "vision"]
  
  // Contenido
  messages: Message[];
  systemPrompt?: string;
  
  // Parámetros de generación
  parameters?: GenerationParameters;
  
  // Preferencias
  preferredProviders?: string[];      // Sugerencias, no requisitos
  fallbackEnabled?: boolean;          // Habilitar fallback automático
  
  // Contexto
  metadata?: Record<string, unknown>;
}

/**
 * Response estándar del gateway
 * Formato unificado independientemente del provider
 */
export interface AIResponse {
  requestId: string;
  model: string;
  provider: string;
  message: Message;
  usage: UsageInfo;
  latencyMs: number;
  finishReason: 'stop' | 'length' | 'error';
}
```

---

## 5. AI PROVIDER ADAPTER LAYER

### 5.1 Concepto de Adapter

Un **AI Provider Adapter** es un plugin que:

1. Traduce requests del formato estándar al formato del provider
2. Traduce responses del formato del provider al formato estándar
3. Maneja la autenticación específica del provider
4. Implementa retry logic específica
5. Maneja errores específicos del provider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ADAPTER ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      UNIVERSAL AI GATEWAY                              │ │
│  │                                                                      │ │
│  │  Request: AIRequest { model: "gpt-4", messages: [...] }             │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    ADAPTER INTERFACE                                   │ │
│  │                                                                      │ │
│  │  interface AIProviderAdapter {                                       │ │
│  │    providerId: string;                                              │ │
│  │    capabilities: Capability[];                                       │ │
│  │    complete(request: StandardRequest): Promise<StandardResponse>;    │ │
│  │    stream(request: StandardRequest): AsyncIterable<StandardResp>;  │ │
│  │    getModels(): Promise<Model[]>;                                    │ │
│  │    healthCheck(): Promise<boolean>;                                  │ │
│  │  }                                                                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                        CONCRETE ADAPTERS                               │ │
│  │                                                                      │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐      │ │
│  │  │   LiteLLM     │  │    OpenAI     │  │   Anthropic   │      │ │
│  │  │   Adapter     │  │    Adapter    │  │    Adapter   │      │ │
│  │  │              │  │              │  │              │      │ │
│  │  │ OpenAI →     │  │ OpenAI API  │  │ Anthropic  │      │ │
│  │  │ LiteLLM     │  │ format     │  │   format  │      │ │
│  │  └────────────────┘  └────────────────┘  └────────────────┘      │ │
│  │                                                                      │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐      │ │
│  │  │    Ollama     │  │     vLLM      │  │   Custom     │      │ │
│  │  │   Adapter     │  │    Adapter    │  │   Adapter   │      │ │
│  │  │              │  │              │  │              │      │ │
│  │  │ Ollama API  │  │ OpenAI compat│  │  Your impl  │      │ │
│  │  │ format     │  │ format     │  │  format   │      │ │
│  │  └────────────────┘  └────────────────┘  └────────────────┘      │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Interfaz Base de Adaptadores

```typescript
// api/adapters/base/AIProviderAdapter.ts

/**
 * Interfaz base que TODOS los adaptadores deben implementar
 * Esta es la ÚNICA interfaz que el gateway conoce
 */
export interface AIProviderAdapter {
  // === Metadatos ===
  readonly adapterId: string;           // Identificador único: "openai", "ollama", "litellm"
  readonly adapterName: string;         // Nombre amigable: "OpenAI", "Ollama (Local)"
  readonly adapterVersion: string;      // Versión del adapter
  readonly capabilities: Capability[];   // Capacidades que soporta
  
  // === Configuración ===
  readonly configSchema: JSONSchema;     // Schema de configuración del adapter
  configure(config: AdapterConfig): void;
  
  // === Operaciones Core ===
  
  /**
   * Completa una solicitud de forma síncrona
   */
  complete(request: AdapterRequest): Promise<AdapterResponse>;
  
  /**
   * Completa una solicitud con streaming
   */
  stream(request: AdapterRequest): AsyncIterable<AdapterStreamChunk>;
  
  // === Información ===
  
  /**
   * Lista modelos disponibles
   */
  getModels(): Promise<AdapterModel[]>;
  
  /**
   * Verifica salud del adapter/provider
   */
  healthCheck(): Promise<AdapterHealth>;
  
  /**
   * Obtiene credenciales necesarias
   */
  getCredentialRequirements(): CredentialRequirement[];
  
  // === Lifecycle ===
  
  /**
   * Inicializa el adapter (se llama al cargar)
   */
  initialize(): Promise<void>;
  
  /**
   * Detiene el adapter (se llama al descargar)
   */
  shutdown(): Promise<void>;
}

/**
 * Request que el adapter espera (formato interno del adapter)
 */
export interface AdapterRequest {
  model: string;
  messages: Message[];
  parameters?: GenerationParameters;
  credentials: ProviderCredentials;
  signal?: AbortSignal;
}

/**
 * Response del adapter (formato interno)
 */
export interface AdapterResponse {
  model: string;
  message: Message;
  usage: UsageInfo;
  finishReason: string;
  rawResponse?: unknown;  // Respuesta original para debugging
}

/**
 * Chunk de streaming
 */
export interface AdapterStreamChunk {
  type: 'content' | 'usage' | 'done' | 'error';
  content?: string;
  usage?: UsageInfo;
  error?: string;
  rawChunk?: unknown;
}

/**
 * Modelo info del adapter
 */
export interface AdapterModel {
  id: string;                    // ej: "gpt-4", "llama-3.1-70b"
  name: string;                  // ej: "GPT-4", "Llama 3.1 70B"
  capabilities: Capability[];     // Capacidades del modelo
  contextWindow: number;          // ej: 128000
  supportedParameters: string[];   // ej: ["temperature", "top_p"]
  isActive: boolean;
}

/**
 * Estado de salud del adapter
 */
export interface AdapterHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs?: number;
  errorMessage?: string;
  lastChecked: Date;
}
```

### 5.3 Sistema de Adapters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE ADAPTERS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ADAPTER REGISTRY                                  │   │
│  │                                                                      │   │
│  │  Adapters registrados:                                               │   │
│  │  - openai: OpenAIAdapter                                          │   │
│  │  - anthropic: AnthropicAdapter                                    │   │
│  │  - litellm: LiteLLMAdapter                                        │   │
│  │  - ollama: OllamaAdapter                                          │   │
│  │  - vllm: VLLMAdapter                                              │   │
│  │  - custom: CustomAdapter[]                                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ADAPTER FACTORY                                    │   │
│  │                                                                      │   │
│  │  createAdapter(type: string, config: AdapterConfig): AIProviderAdapter │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ADAPTER CATEGORIES                                 │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                           │   │
│  │  │   OFFICIAL     │  │   OPEN SOURCE  │                           │   │
│  │  │   APIs        │  │   PROJECTS    │                           │   │
│  │  │               │  │               │                           │   │
│  │  │ • OpenAI     │  │ • LiteLLM    │                           │   │
│  │  │ • Anthropic  │  │ • Ollama     │                           │   │
│  │  │ • Google     │  │ • vLLM      │                           │   │
│  │  │ • Groq      │  │ • llama.cpp │                           │   │
│  │  │ • DeepSeek  │  │ • LocalAI   │                           │   │
│  │  │ • Cohere    │  │ • SGLang    │                           │   │
│  │  │ • Mistral   │  │ • TGI       │                           │   │
│  │  └─────────────────┘  └─────────────────┘                           │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                           │   │
│  │  │   ENTERPRISE   │  │    CUSTOM     │                           │   │
│  │  │   SOLUTIONS   │  │   ADAPTERS    │                           │   │
│  │  │               │  │               │                           │   │
│  │  │ • Azure      │  │ • User-defined│                           │   │
│  │  │ • AWS Bedrock│  │ • Private    │                           │   │
│  │  │ • Vertex AI │  │ • Custom     │                           │   │
│  │  └─────────────────┘  └─────────────────┘                           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Ejemplo: OpenAI Adapter

```typescript
// api/adapters/official/OpenAIAdapter.ts

export class OpenAIAdapter implements AIProviderAdapter {
  readonly adapterId = 'openai';
  readonly adapterName = 'OpenAI';
  readonly adapterVersion = '1.0.0';
  readonly capabilities = [
    Capability.LLM_CHAT,
    Capability.LLM_FUNCTION_CALLING,
    Capability.LLM_VISION,      // GPT-4 Vision
    Capability.LLM_STREAMING,
  ];
  
  private config: OpenAIConfig;
  private client: OpenAIClient;
  
  constructor(config: OpenAIConfig) {
    this.config = config;
    this.client = new OpenAIClient(config.apiKey, config.baseUrl);
  }
  
  async complete(request: AdapterRequest): Promise<AdapterResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: this.toOpenAIMessages(request.messages),
      ...request.parameters,
    });
    
    return this.fromOpenAIResponse(response);
  }
  
  async *stream(request: AdapterRequest): AsyncIterable<AdapterStreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: this.toOpenAIMessages(request.messages),
      ...request.parameters,
      stream: true,
    });
    
    for await (const chunk of stream) {
      yield this.fromOpenAIChunk(chunk);
    }
  }
  
  async getModels(): Promise<AdapterModel[]> {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        capabilities: [Capability.LLM_CHAT, Capability.LLM_VISION],
        contextWindow: 128000,
        supportedParameters: ['temperature', 'max_tokens', 'top_p'],
        isActive: true,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        capabilities: [Capability.LLM_CHAT],
        contextWindow: 128000,
        supportedParameters: ['temperature', 'max_tokens', 'top_p'],
        isActive: true,
      },
      // ... más modelos
    ];
  }
  
  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      await this.client.models.list();
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        errorMessage: error.message,
        lastChecked: new Date(),
      };
    }
  }
  
  // Helpers de traducción
  private toOpenAIMessages(messages: Message[]): OpenAIMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.name && { name: msg.name }),
    }));
  }
  
  private fromOpenAIResponse(response: OpenAIChatCompletion): AdapterResponse {
    const choice = response.choices[0];
    return {
      model: response.model,
      message: {
        role: 'assistant',
        content: choice.message.content,
      },
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      finishReason: choice.finish_reason,
    };
  }
}
```

### 5.5 Ejemplo: Ollama Adapter (Local)

```typescript
// api/adapters/open-source/OllamaAdapter.ts

export class OllamaAdapter implements AIProviderAdapter {
  readonly adapterId = 'ollama';
  readonly adapterName = 'Ollama (Local)';
  readonly adapterVersion = '1.0.0';
  readonly capabilities = [
    Capability.LLM_CHAT,
    Capability.LLM_STREAMING,
    // NOTA: Ollama no soporta function calling oficialmente
  ];
  
  private config: OllamaConfig;
  private baseUrl: string;
  
  async complete(request: AdapterRequest): Promise<AdapterResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        options: request.parameters,
      }),
    });
    
    const data = await response.json();
    return this.fromOllamaResponse(data);
  }
  
  // NOTA: Ollama usa formato propio, diferente de OpenAI
  // El adapter traduce entre formatos
  
  private fromOllamaResponse(data: OllamaChatResponse): AdapterResponse {
    return {
      model: data.model,
      message: {
        role: data.message.role,
        content: data.message.content,
      },
      usage: {
        // Ollama no devuelve usage en todas las respuestas
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      finishReason: data.done ? 'stop' : 'length',
    };
  }
}
```

### 5.6 Lista de Adapters Predefinidos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ADAPTERS DISPONIBLES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CATEGORÍA          ADAPTER              PROVIDER/API                      │
│  ─────────────────────────────────────────────────────────────────────────
│                                                                              │
│  OFFICIAL APIs     OpenAIAdapter        OpenAI API                        │
│                     AnthropicAdapter     Anthropic API (Claude)             │
│                     GoogleAIAdapter      Google AI Studio / Vertex          │
│                     GroqAdapter          Groq API                           │
│                     DeepSeekAdapter      DeepSeek API                       │
│                     MistralAdapter       Mistral API                        │
│                     CohereAdapter        Cohere API                         │
│                     TogetherAIAdapter     Together AI API                    │
│                     NVIDIAAdapter        NVIDIA NIM                         │
│                     HuggingFaceAdapter   HuggingFace Inference API          │
│                                                                              │
│  OPEN SOURCE       LiteLLMAdapter       LiteLLM Proxy                     │
│  PROJECTS          OllamaAdapter        Ollama (Local)                     │
│                     VLLMAdapter          vLLM                               │
│                     LlamaCppAdapter      llama.cpp                          │
│                     LocalAIAdapter       LocalAI                            │
│                     SGLangAdapter        SGLang                             │
│                     TGIAdapter           Text Generation Inference           │
│                     FastChatAdapter      FastChat                           │
│                                                                              │
│  ENTERPRISE        AzureAdapter         Microsoft Azure OpenAI              │
│                     BedrockAdapter       AWS Bedrock                        │
│                     VertexAdapter         Google Cloud Vertex AI             │
│                                                                              │
│  FREE/COMMUNITY    FreeClaudeCodeAdapter Free Claude Code                  │
│                     OpenRouterAdapter    OpenRouter                         │
│                     CloudflareAdapter    Cloudflare Workers AI              │
│                                                                              │
│  CUSTOM            CustomAdapter        Define tu propio adapter            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. MODEL REGISTRY

### 6.1 Concepto

El **Model Registry** es un registro **independiente** de modelos que:

- NO está coupled a ningún provider
- Puede registrar el mismo modelo en múltiples providers
- Mantiene metadata unificada de modelos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MODEL REGISTRY vs PROVIDER                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MODEL REGISTRY (Catálogo Unificado)                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                      │ │
│  │  Model: "llama-3.1-70b"                                           │ │
│  │  ├── Provider: "groq"        → context: 131072, cost: $0.59/M   │ │
│  │  ├── Provider: "ollama"      → context: 32768, cost: $0          │ │
│  │  ├── Provider: "llama.cpp"   → context: configurable, cost: $0  │ │
│  │  └── Provider: "vllm"        → context: 131072, cost: $0         │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  El Model Registry sabe que "llama-3.1-70b" existe en varios providers    │
│  El Provider Registry sabe qué providers están disponibles                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Estructura del Model Registry

```typescript
// api/core/ModelRegistry/types.ts

/**
 * Modelo en el registry (formato unificado)
 */
export interface RegisteredModel {
  // Identificación
  modelId: string;               // ej: "llama-3.1-70b"
  displayName: string;            // ej: "Llama 3.1 70B Instruct"
  description?: string;
  
  // Metadata
  organization?: string;           // ej: "meta", "mistralai"
  releaseDate?: Date;
  deprecated?: boolean;
  tags: string[];
  
  // Especificaciones técnicas
  specifications: ModelSpecifications;
  
  // Proveedores donde está disponible
  providerInstances: ModelProviderInstance[];
  
  // Estados
  status: 'active' | 'deprecated' | 'new';
}

/**
 * Especificaciones técnicas del modelo
 */
export interface ModelSpecifications {
  // Capacidades
  capabilities: Capability[];
  
  // Contexto
  contextWindow: number;          // ej: 131072 tokens
  maxOutputTokens?: number;
  
  // Multimodalidad
  modalities: ('text' | 'image' | 'audio' | 'video')[];
  
  // Características
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsSystemPrompt: boolean;
  
  // Idioma
  supportedLanguages: string[];  // ej: ["en", "es", "fr"]
  
  // Seguridad
  safetyTraining: boolean;
  contentFiltering: boolean;
}

/**
 * Instancia del modelo en un provider específico
 */
export interface ModelProviderInstance {
  // Referencia
  providerId: string;            // ej: "groq", "ollama"
  modelOnProvider: string;       // ej: "llama-3.1-70b-versatile"
  
  // Coste (en el provider específico)
  pricing: {
    inputPer1M: number;          // ej: 0.59 (dólares)
    outputPer1M: number;         // ej: 0.79
    currency: string;            // ej: "USD"
  };
  
  // Disponibilidad
  availability: {
    status: 'available' | 'limited' | 'unavailable';
    region?: string;             // ej: "us-east-1"
    waitlist?: boolean;
  };
  
  // Rate limits del provider para este modelo
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    concurrentRequests?: number;
  };
  
  // Performance en este provider
  performance?: {
    avgLatencyMs?: number;
    p50LatencyMs?: number;
    p95LatencyMs?: number;
    p99LatencyMs?: number;
  };
}

/**
 * Interface del Model Registry
 */
export interface ModelRegistry {
  // CRUD
  registerModel(model: RegisteredModel): void;
  unregisterModel(modelId: string): void;
  updateModel(modelId: string, updates: Partial<RegisteredModel>): void;
  
  // Queries
  getModel(modelId: string): RegisteredModel | null;
  listModels(filter?: ModelFilter): RegisteredModel[];
  findModels(criteria: ModelSearchCriteria): RegisteredModel[];
  
  // Providers
  getProvidersForModel(modelId: string): ModelProviderInstance[];
  addProviderInstance(modelId: string, instance: ModelProviderInstance): void;
  removeProviderInstance(modelId: string, providerId: string): void;
  
  // Búsqueda avanzada
  findBestModel(criteria: ModelSearchCriteria): RegisteredModel | null;
  findModelsByCapability(capability: Capability): RegisteredModel[];
}
```

### 6.3 Ejemplo: Registro de Modelo

```typescript
// Registrar un modelo una vez, disponible en múltiples providers

modelRegistry.registerModel({
  modelId: 'llama-3.1-70b',
  displayName: 'Meta Llama 3.1 70B Instruct',
  description: 'Large language model by Meta',
  organization: 'meta',
  tags: ['open-source', 'chat', 'code'],
  
  specifications: {
    capabilities: [
      Capability.LLM_CHAT,
      Capability.LLM_REASONING,
      Capability.LLM_FUNCTION_CALLING,
    ],
    contextWindow: 131072,
    modalities: ['text'],
    supportsFunctionCalling: true,
    supportsVision: false,
    supportsStreaming: true,
    supportedLanguages: ['en', 'es', 'de', 'fr', 'it', 'pt'],
    safetyTraining: true,
    contentFiltering: false,
  },
  
  providerInstances: [
    {
      providerId: 'groq',
      modelOnProvider: 'llama-3.1-70b-versatile',
      pricing: { inputPer1M: 0.59, outputPer1M: 0.79, currency: 'USD' },
      availability: { status: 'available' },
      performance: { avgLatencyMs: 120, p95LatencyMs: 200 },
    },
    {
      providerId: 'ollama',
      modelOnProvider: 'llama3.1:70b',
      pricing: { inputPer1M: 0, outputPer1M: 0, currency: 'USD' },
      availability: { status: 'available' },
      performance: { avgLatencyMs: 500 }, // Variable depending on hardware
    },
    {
      providerId: 'vllm',
      modelOnProvider: 'meta-llama/Llama-3.1-70B-Instruct',
      pricing: { inputPer1M: 0, outputPer1M: 0, currency: 'USD' },
      availability: { status: 'available', region: 'us-west-2' },
    },
  ],
  
  status: 'active',
});
```

---

## 7. PROVIDER REGISTRY

### 7.1 Concepto

El **Provider Registry** mantiene información sobre **proveedores de servicios** que pueden ser adapters:

- NO conoce modelos específicos (eso es Model Registry)
- Mantiene configuración de conexión
- Gestiona estado y salud

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SEPARACIÓN DE RESPONSABILIDADES                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROVIDER REGISTRY                          MODEL REGISTRY                  │
│  ─────────────────────────────────       ──────────────────────────────   │
│                                                                              │
│  ¿Qué proveedores existen?                   ¿Qué modelos existen?        │
│  └─ Groq, OpenAI, Ollama, etc.            └─ GPT-4, Claude, Llama, etc.  │
│                                                                              │
│  ¿Cómo me conecto?                         ¿Qué capacidades tiene?         │
│  └─ URL, auth type, config                └─ Chat, Vision, Code, etc.     │
│                                                                              │
│  ¿Está disponible?                         ¿Cuánto cuesta?                 │
│  └─ Health, status, region                 └─ $/1M tokens                  │
│                                                                              │
│  El Provider Registry puede existir SIN modelos                             │
│  El Model Registry puede existir SIN providers                              │
│  Juntos permiten el routing inteligente                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Estructura del Provider Registry

```typescript
// api/core/ProviderRegistry/types.ts

/**
 * Provider registrado
 */
export interface RegisteredProvider {
  // Identificación
  providerId: string;             // ej: "groq", "ollama", "openai"
  providerName: string;           // ej: "Groq", "Ollama (Local)"
  providerType: ProviderType;
  
  // Adapter
  adapterId: string;              // ej: "groq-adapter" (referencia al adapter)
  adapterVersion: string;        // Versión del adapter
  
  // Configuración de conexión
  connection: ProviderConnection;
  
  // Autenticación
  authConfig: AuthConfiguration;
  
  // Estado
  status: ProviderStatus;
  health: ProviderHealth;
  
  // Metadatos
  metadata: {
    website?: string;
    documentation?: string;
    supportUrl?: string;
    pricingUrl?: string;
  };
  
  // Capabilities generales del provider
  capabilities: ProviderCapabilities;
  
  // Rate limits del provider
  rateLimits: ProviderRateLimits;
}

/**
 * Tipo de provider
 */
export type ProviderType = 
  | 'official_api'      // OpenAI, Anthropic, Google, etc.
  | 'open_source'       // Ollama, vLLM, llama.cpp, etc.
  | 'enterprise'        // Azure, Bedrock, Vertex
  | 'aggregator'        // LiteLLM, OpenRouter
  | 'custom';           // Personalizado

/**
 * Configuración de conexión
 */
export interface ProviderConnection {
  baseUrl: string;               // ej: "https://api.groq.com"
  timeout: number;               // Timeout en ms
  retries: number;               // Número de reintentos
  sslVerification: boolean;       // Verificar SSL
  proxy?: ProxyConfig;
}

/**
 * Configuración de autenticación
 */
export interface AuthConfiguration {
  authType: AuthType;
  credentialsRef: string;         // Referencia al credentials store
  refreshStrategy?: RefreshStrategy;
}

/**
 * Estados de provider
 */
export type ProviderStatus = 
  | 'active'             // Completamente operativo
  | 'degraded'           // Funcionando con limitaciones
  | 'maintenance'        // En mantenimiento
  | 'disabled'            // Deshabilitado manualmente
  | 'unavailable';        // No disponible

/**
 * Interface del Provider Registry
 */
export interface ProviderRegistry {
  // CRUD
  registerProvider(provider: RegisteredProvider): void;
  unregisterProvider(providerId: string): void;
  updateProvider(providerId: string, updates: Partial<RegisteredProvider>): void;
  
  // Queries
  getProvider(providerId: string): RegisteredProvider | null;
  listProviders(filter?: ProviderFilter): RegisteredProvider[];
  
  // Estado
  setStatus(providerId: string, status: ProviderStatus): void;
  updateHealth(providerId: string, health: ProviderHealth): void;
  
  // Queries especializadas
  getProvidersByType(type: ProviderType): RegisteredProvider[];
  getActiveProviders(): RegisteredProvider[];
  getProvidersByCapability(capability: Capability): RegisteredProvider[];
}
```

### 7.3 Ejemplo: Registro de Provider

```typescript
// Registrar un provider

providerRegistry.registerProvider({
  providerId: 'ollama',
  providerName: 'Ollama (Local)',
  providerType: 'open_source',
  adapterId: 'ollama-adapter',
  adapterVersion: '1.0.0',
  
  connection: {
    baseUrl: 'http://localhost:11434',
    timeout: 60000,
    retries: 3,
    sslVerification: false,
  },
  
  authConfig: {
    authType: 'none',  // Ollama local no requiere auth
    credentialsRef: 'ollama-local',
  },
  
  status: 'active',
  health: {
    status: 'healthy',
    latencyMs: 5,
    lastChecked: new Date(),
  },
  
  metadata: {
    website: 'https://ollama.com',
    documentation: 'https://github.com/ollama/ollama',
  },
  
  capabilities: {
    streaming: true,
    functionCalling: false,  // Ollama no soporta nativamente
    vision: false,
    embedding: true,
  },
  
  rateLimits: {
    requestsPerMinute: Infinity,  // Sin límite local
    tokensPerMinute: Infinity,
  },
});
```

---

## 8. AUTHENTICATION CENTER

### 8.1 Concepto

El **Authentication Center** es el sistema centralizado de gestión de credenciales:

- Abstrae TODOS los tipos de autenticación
- Permite agregar nuevos métodos sin modificar providers
- Mantiene credenciales cifradas
- Gestiona refresh tokens

### 8.2 Tipos de Autenticación Soportados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TIPOS DE AUTENTICACIÓN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │   API KEY      │  │    OAuth       │  │     JWT        │          │
│  │                │  │                │  │                │          │
│  │ • Simple      │  │ • Authorization│  │ • Token Bearer │          │
│  │ • Stateless   │  │   Code Flow   │  │ • Signed       │          │
│  │ • Stateless   │  │ • PKCE       │  │ • Stateless    │          │
│  │ • Rate limits │  │ • Auto-refresh│  │ • Expiry      │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │    COOKIE       │  │   BROWSER       │  │ REFRESH TOKEN  │          │
│  │                │  │   SESSION      │  │                │          │
│  │ • Session-based │  │ • Headless    │  │ • Auto-refresh │          │
│  │ • HttpOnly    │  │   browser     │  │ • Long-lived  │          │
│  │ • Secure      │  │ • Cookies    │  │ • Token rotate│          │
│  │ • SameSite   │  │ • JS render  │  │ • Grace period│          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │     BASIC       │  │    CERT        │  │   CUSTOM       │          │
│  │   AUTH         │  │   (mTLS)       │  │   (Extensible) │          │
│  │                │  │                │  │                │          │
│  │ • Username/   │  │ • Client cert │  │ • Implement   │          │
│  │   Password   │  │ • Mutual TLS │  │   your own  │          │
│  │ • Legacy     │  │ • Enterprise │  │   auth type │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Interfaz del Authentication Center

```typescript
// api/core/AuthCenter/types.ts

export interface AuthenticationCenter {
  // Obtener credenciales para un provider
  getCredentials(providerId: string): Promise<Credentials>;
  
  // Verificar credenciales
  verifyCredentials(providerId: string): Promise<CredentialHealth>;
  
  // Agregar/actualizar credenciales
  setCredentials(providerId: string, credentials: Credentials): Promise<void>;
  
  // Eliminar credenciales
  deleteCredentials(providerId: string): Promise<void>;
  
  // Refrescar credenciales (si aplica)
  refreshCredentials(providerId: string): Promise<Credentials>;
  
  // Listar providers con credenciales configuradas
  listConfiguredProviders(): string[];
}

/**
 * Credenciales (formato unificado)
 */
export type Credentials = 
  | APIKeyCredentials
  | OAuthCredentials
  | JWTCredentials
  | CookieCredentials
  | BrowserSessionCredentials
  | RefreshTokenCredentials
  | BasicAuthCredentials
  | CustomCredentials;

/**
 * API Key Credentials
 */
export interface APIKeyCredentials {
  type: 'api_key';
  key: string;              // La key real (cifrada en storage)
  keyId?: string;           // Identificador (para logging)
  label?: string;
  expiresAt?: Date;
}

/**
 * OAuth Credentials
 */
export interface OAuthCredentials {
  type: 'oauth';
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: string;
  scope: string;
}

/**
 * Interface extensible para auth types custom
 */
export interface CustomCredentials {
  type: string;              // ej: "custom_api", "ldap"
  data: Record<string, unknown>;  // Datos específicos del custom type
}
```

---

## 9. PLUGIN SYSTEM

### 9.1 Arquitectura de Plugins

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    PLUGIN MANAGER                                    │ │
│  │                                                                      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │ │
│  │  │ Adapter  │  │  Model   │  │   Auth   │  │  Tool   │           │ │
│  │  │ Plugins  │  │  Plugins │  │  Plugins │  │  Plugins │           │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                          │
│         ┌─────────────────────────┼─────────────────────────┐          │
│         ▼                         ▼                         ▼          │
│  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐  │
│  │   Loader    │          │  Registry    │          │   Config     │  │
│  │             │          │             │          │   Manager    │  │
│  │ • Discover │          │ • Register  │          │ • Schema    │  │
│  │ • Load    │          │ • Activate  │          │ • Validate  │  │
│  │ • Validate │          │ • Deactivate│          │ • Store    │  │
│  └──────────────┘          └──────────────┘          └──────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Tipos de Plugins

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TIPOS DE PLUGINS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PLUGIN TYPE              DESCRIPCIÓN              INTERFAZ                │
│  ─────────────────────────────────────────────────────────────────────────
│                                                                              │
│  Provider Adapter         Conectar a un provider      AIProviderAdapter      │
│                                                                              │
│  Model Provider           Registrar modelos          ModelProvider            │
│                                                                              │
│  Auth Strategy           Nuevo método auth          AuthStrategy            │
│                                                                              │
│  Tool                    Herramientas disponibles   Tool                     │
│                                                                              │
│  Memory System           Sistema de memoria        MemorySystem             │
│                                                                              │
│  Workflow Engine         Motor de workflows        WorkflowEngine           │
│                                                                              │
│  Agent                  Definición de agente      Agent                    │
│                                                                              │
│  MCP Server              MCP server integration    MCPServer                │
│                                                                              │
│  Inference Engine        Motor de inferencia      InferenceEngine           │
│                                                                              │
│  Embedding Provider     Sistema de embeddings     EmbeddingProvider         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Interface de Plugin

```typescript
// api/plugin-system/types.ts

/**
 * Interface base que TODOS los plugins deben implementar
 */
export interface Plugin {
  // Metadatos
  readonly pluginId: string;
  readonly pluginName: string;
  readonly version: string;
  readonly description: string;
  readonly author: string;
  
  // Tipo de plugin
  readonly pluginType: PluginType;
  
  // Dependencias
  readonly dependencies?: PluginDependency[];
  
  // Lifecycle
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
  
  // Información
  getManifest(): PluginManifest;
}

/**
 * Tipos de plugins disponibles
 */
export type PluginType = 
  | 'provider-adapter'
  | 'model-provider'
  | 'auth-strategy'
  | 'tool'
  | 'memory-system'
  | 'workflow-engine'
  | 'agent'
  | 'mcp-server'
  | 'inference-engine'
  | 'embedding-provider'
  | 'custom';

/**
 * Contexto proporcionado al plugin
 */
export interface PluginContext {
  // Accesos a registries
  modelRegistry: ModelRegistry;
  providerRegistry: ProviderRegistry;
  authCenter: AuthenticationCenter;
  
  // Servicios
  eventBus: EventBus;
  logger: Logger;
  config: ConfigManager;
  
  // Utilidades
  httpClient: HTTPClient;
  crypto: CryptoService;
}

/**
 * Manifest del plugin (exportado para discovery)
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  description: string;
  author: string;
  license?: string;
  homepage?: string;
  repository?: string;
  
  // API expuesta
  exports: string[];
  
  // Hooks
  hooks?: string[];
  
  // Configuración
  configSchema?: JSONSchema;
}
```

### 9.4 Ejemplo: Plugin de Provider Adapter

```typescript
// plugins/my-custom-adapter/index.ts

import { Plugin, PluginContext, AIProviderAdapter } from '@universal-ai-gateway/plugin-system';

export class MyCustomAdapter implements Plugin, AIProviderAdapter {
  readonly pluginId = 'my-custom-adapter';
  readonly pluginName = 'My Custom Provider Adapter';
  readonly version = '1.0.0';
  readonly description = 'Adapter for my custom AI provider';
  readonly pluginType = 'provider-adapter' as const;
  readonly author = 'Your Name';
  
  readonly capabilities = [Capability.LLM_CHAT, Capability.LLM_STREAMING];
  
  // Plugin lifecycle
  async initialize(context: PluginContext): Promise<void> {
    // Inicializar cliente, configurar, etc.
    this.context = context;
    this.client = new CustomAIClient(context.config.get('endpoint'));
  }
  
  async shutdown(): Promise<void> {
    await this.client.close();
  }
  
  // AIProviderAdapter implementation
  async complete(request: AdapterRequest): Promise<AdapterResponse> {
    // Implementar lógica del adapter
  }
  
  async *stream(request: AdapterRequest): AsyncIterable<AdapterStreamChunk> {
    // Implementar streaming
  }
  
  async getModels(): Promise<AdapterModel[]> {
    return this.models;
  }
  
  async healthCheck(): Promise<AdapterHealth> {
    // Verificar conectividad
  }
  
  getManifest(): PluginManifest {
    return {
      id: this.pluginId,
      name: this.pluginName,
      version: this.version,
      type: this.pluginType,
      description: this.description,
      author: this.author,
      exports: ['complete', 'stream', 'getModels', 'healthCheck'],
      configSchema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', format: 'uri' },
          apiKey: { type: 'string' },
        },
        required: ['endpoint'],
      },
    };
  }
}

// Exportar para el plugin system
export default MyCustomAdapter;
module.exports = MyCustomAdapter;
```

---

## 10. FLUJO DE SOLICITUDES

### 10.1 Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO DE SOLICITUD UNIVERSAL                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER REQUEST                                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  User: "Generate code for..."                                              │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                  UNIVERSAL AI GATEWAY                                │ │
│  │                                                                      │ │
│  │  2. PARSE REQUEST                                                   │ │
│  │  ─────────────────────────────────────────────────────────────────  │ │
│  │  AIRequest {                                                       │ │
│  │    model: "gpt-4",       // O puede ser capability: ["chat", "code"]│ │
│  │    messages: [...],                                                  │ │
│  │    userId: "user-123"                                              │ │
│  │  }                                                                  │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                  MODEL REGISTRY LOOKUP                               │ │
│  │                                                                      │ │
│  │  3. RESOLVE MODEL                                                  │ │
│  │  ─────────────────────────────────────────────────────────────────  │ │
│  │  "gpt-4" → {                                                       │ │
│  │    modelId: "gpt-4",                                               │ │
│  │    providerInstances: [                                               │ │
│  │      { providerId: "openai", ... },                                   │ │
│  │      { providerId: "azure", ... },                                   │ │
│  │    ]                                                                 │ │
│  │  }                                                                  │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                  PROVIDER REGISTRY LOOKUP                             │ │
│  │                                                                      │ │
│  │  4. SELECT PROVIDER                                                │ │
│  │  ─────────────────────────────────────────────────────────────────  │ │
│  │  - Filter by status (active, not degraded)                          │ │
│  │  - Check auth credentials configured                                │ │
│  │  - Check quota availability                                          │ │
│  │  - Apply policies                                                   │ │
│  │  Result: "openai" (providerId)                                      │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                  ADAPTER SELECTION                                   │ │
│  │                                                                      │ │
│  │  5. GET ADAPTER                                                    │ │
│  │  ─────────────────────────────────────────────────────────────────  │ │
│  │  const adapter = adapterRegistry.get("openai");                    │ │
│  │  // adapter es OpenAIAdapter                                        │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                  AUTHENTICATION CENTER                               │ │
│  │                                                                      │ │
│  │  6. GET CREDENTIALS                                                │ │
│  │  ─────────────────────────────────────────────────────────────────  │ │
│  │  const creds = await authCenter.getCredentials("openai");          │ │
│  │  // creds = { type: "api_key", key: "sk-..." }                    │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                  ADAPTER EXECUTION                                   │ │
│  │                                                                      │ │
│  │  7. TRANSLATE & EXECUTE                                            │ │
│  │  ─────────────────────────────────────────────────────────────────  │ │
│  │  adapter.complete({                                                │ │
│  │    model: "gpt-4",                                                 │ │
│  │    messages: [...],                                                  │ │
│  │    credentials: creds,                                              │ │
│  │  });                                                                │ │
│  │                                                                      │ │
│  │  // Internally:                                                    │ │
│  │  // OpenAIAdapter.toOpenAIFormat(request)                          │ │
│  │  // → POST https://api.openai.com/v1/chat/completions               │ │
│  │  // ← Response                                                       │ │
│  │  // OpenAIAdapter.fromOpenAIFormat(response)                        │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  8. RESPONSE                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  AIResponse {                                                            │
│    model: "gpt-4",                                                      │
│    provider: "openai",                                                   │
│    message: { role: "assistant", content: "..." },                       │
│    usage: { inputTokens: 50, outputTokens: 200 },                        │
│    latencyMs: 450,                                                       │
│  }                                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Flujo de Fallback

```
Provider Primario Falla
         │
         ▼
┌─────────────────┐
│ Registrar error │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Consultar Model │
│ Registry para   │
│ otros providers │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ¿Hay providers  │
│ alternativos?   │
└────────┬────────┘
         │
    ┌────┴────┐
   Sí         No
    │          │
    ▼          ▼
┌─────────┐ ┌─────────┐
│ Selecc. │ │Retornar │
│ siguiente│ │  error  │
│ provider │ └─────────┘
└────┬────┘
     │
     ▼
┌─────────────┐
│ Repetir con  │
│ nuevo adapter│
└─────────────┘
```

---

## 11. INTERFACES DEL SISTEMA

### 11.1 Matriz de Interfaces

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTERFACES DEL SISTEMA                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐       │
│  │   Gateway     │────▶│ ModelRegistry │     │ProviderRegistry│       │
│  │   Interface    │     │   Interface   │     │   Interface   │       │
│  └────────────────┘     └────────────────┘     └────────────────┘       │
│          │                                            │                     │
│          │              ┌────────────────┐          │                     │
│          └─────────────▶│   AuthCenter   │◀────────┘                     │
│                         │   Interface    │                              │
│                         └────────────────┘                              │
│                                                                              │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐       │
│  │  Adapter      │────▶│  ModelRegistry│     │   EventBus    │       │
│  │  Interface    │     │   (subscribe) │     │   Interface   │       │
│  └────────────────┘     └────────────────┘     └────────────────┘       │
│                                                                              │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐       │
│  │  Plugin       │────▶│    Gateway    │     │    Metrics    │       │
│  │  Interface    │     │   Interface   │     │   Interface   │       │
│  └────────────────┘     └────────────────┘     └────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Resumen de Interfaces

| Interface | Ubicación | Descripción |
|-----------|-----------|-------------|
| `UniversalAIGateway` | `gateway/` | Punto de entrada principal |
| `AIProviderAdapter` | `adapters/base/` | Interface de adapter |
| `ModelRegistry` | `core/ModelRegistry/` | Registro de modelos |
| `ProviderRegistry` | `core/ProviderRegistry/` | Registro de providers |
| `AuthenticationCenter` | `core/AuthCenter/` | Gestión de credenciales |
| `Plugin` | `plugin-system/` | Interface de plugin |
| `EventBus` | `core/EventBus/` | Sistema de eventos |
| `TokenManager` | `core/TokenManager/` | Control de cuotas |

---

## 12. COMPARATIVA CON ANTERIOR

### 12.1 Arquitectura Anterior (LiteLLM-centric)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA ANTERIOR                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LibreChat                                                                │
│     │                                                                     │
│     ▼                                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                    LITE LL M GATEWAY                               │   │
│  │  ⚠️ Acoplado a LiteLLM                                          │   │
│  │  ⚠️ Si LiteLLM no soporta algo, hay que esperar                │   │
│  │  ⚠️ Dependencia directa                                          │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│     │                                                                     │
│     ▼                                                                     │
│  LiteLLM                                                                 │
│     │                                                                     │
│     ▼                                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  Proveedores (Hardcoded en LiteLLM)                             │   │
│  │  • OpenAI                                                          │   │
│  │  • Anthropic                                                       │   │
│  │  • Azure                                                          │   │
│  │  • ...                                                             │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  PROBLEMAS:                                                               │
│  ❌ LiteLLM es el centro de todo                                         │
│  ❌ Agregar provider requiere modificar LiteLLM o esperar soporte         │
│  ❌ No se pueden agregar providers que LiteLLM no soporta                  │
│  ❌ LiteLLM es una dependencia crítica                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Arquitectura Nueva (Universal)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA UNIVERSAL                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LibreChat                                                                │
│     │                                                                     │
│     ▼                                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                    UNIVERSAL AI GATEWAY                            │   │
│  │  ✅ NÚCLEO PURO - No conoce adapters específicos                │   │
│  │  ✅ Trabaja SOLO con interfaces abstractas                        │   │
│  │  ✅ Si un adapter falla, los demás funcionan                    │   │
│  │  ✅ Agregar nuevo provider = instalar plugin                     │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│     │                                                                     │
│     ▼                                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │               ADAPTER LAYER (PLUGINS)                             │   │
│  │  • LiteLLM Adapter     ← Puede removerse                       │   │
│  │  • OpenAI Adapter      ← Puede removerse                        │   │
│  │  • Ollama Adapter      ← Puede removerse                        │   │
│  │  • Custom Adapter      ← Puedes crear el tuyo                   │   │
│  │  ...                                                              │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  BENEFICIOS:                                                              │
│  ✅ LiteLLM es UN adapter, no el centro                                   │
│  ✅ Agregar provider = escribir un adapter e instalarlo                     │
│  ✅ El núcleo NUNCA cambia                                                 │
│  ✅ Puedes tener LiteLLM, Ollama, y tu custom todo funcionando           │
│  ✅ Cada adapter es independiente                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.3 Comparación Directa

| Aspecto | Anterior | Nueva |
|---------|----------|-------|
| **Centro del sistema** | LiteLLM | Universal Gateway |
| **Proveedores** | Hardcoded en LiteLLM | Plugins instalables |
| **Dependencia** | Fuerte de LiteLLM | Cero (LiteLLM es opcional) |
| **Agregar provider** | Modificar LiteLLM | Escribir adapter |
| **Fallback** | Limitado a LiteLLM | Entre cualquier adapter |
| **Testing** | Difícil (acoplado) | Fácil (interfaces) |
| **Nuevo provider** | Esperar soporte | Escribir adapter |
| **Providers custom** | No soportado | Totalmente soportado |

---

## 13. EXTENSIBILIDAD DEMOSTRADA

### 13.1 Agregar Nuevo Provider

**Paso 1:** Crear el adapter
```typescript
// plugins/new-provider/index.ts
export class NewProviderAdapter implements AIProviderAdapter { ... }
```

**Paso 2:** Registrar el adapter
```typescript
// En el plugin system
pluginManager.registerPlugin(new NewProviderAdapter());
```

**Paso 3:** Registrar provider y modelos
```typescript
providerRegistry.registerProvider({
  providerId: 'new-provider',
  adapterId: 'new-provider-adapter',
  ...
});

modelRegistry.registerModel({
  modelId: 'their-model',
  providerInstances: [{ providerId: 'new-provider', ... }],
  ...
});
```

**Resultado:** El nuevo provider está disponible sin modificar ningún código del núcleo.

### 13.2 Agregar Nuevo Método de Auth

**Paso 1:** Implementar el strategy
```typescript
class MyAuthStrategy implements AuthStrategy {
  async authenticate(config: MyAuthConfig): Promise<Credentials> { ... }
  async refresh(credentials: Credentials): Promise<Credentials> { ... }
}
```

**Paso 2:** Registrar en Authentication Center
```typescript
authCenter.registerStrategy('my-auth', new MyAuthStrategy());
```

**Resultado:** El nuevo método de auth está disponible para cualquier provider.

### 13.3 Agregar Nuevo Inference Engine

**Paso 1:** Crear adapter para el engine
```typescript
class MyInferenceEngineAdapter implements AIProviderAdapter { ... }
```

**Paso 2:** Registrar
```typescript
adapterRegistry.register('my-engine', new MyInferenceEngineAdapter());
```

**Resultado:** El nuevo engine se integra sin cambios en el gateway.

---

## 14. CONCLUSIÓN

### 14.1 Beneficios de la Arquitectura Universal

| Beneficio | Descripción |
|-----------|-------------|
| **Zero Vendor Lock-in** | LiteLLM es opcional, no requerido |
| **Máxima Flexibilidad** | Agregar cualquier provider/technology |
| **Testabilidad** | Cada componente es independiente |
| **Mantenibilidad** | Cambios locales no afectan otros componentes |
| **Escalabilidad** | Agregar capacidad sin cambiar arquitectura |
| **Futuro-proof** | Soporta tecnologías que aún no existen |

### 14.2 Principios Clave

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRINCIPIOS CLAVE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. EL NÚCLEO NUNCA CAMBIA                                                │
│     └─ Solo los adapters cambian                                            │
│                                                                              │
│  2. CUALQUIER COSA ES UN PLUGIN                                            │
│     └─ Provider, auth, models, tools, agents                              │
│                                                                              │
│  3. DEPENDER DE ABSTRACCIONES, NO CONCRECIONES                             │
│     └─ Interfaces > implementaciones                                        │
│                                                                              │
│  4. EL SISTEMA FUNCIONA SIN NINGÚN ADAPTER                                 │
│     └─ Demostrable en isolation                                             │
│                                                                              │
│  5. AGREGAR NUEVA TECNOLOGÍA = ESCRIBIR PLUGIN                             │
│     └─ Sin modificar núcleo                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**Fin del Documento de Arquitectura Universal**
