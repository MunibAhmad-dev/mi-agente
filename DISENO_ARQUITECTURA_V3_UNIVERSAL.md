# DISEÑO DE ARQUITECTURA UNIVERSAL v3.0
## Universal AI Gateway Platform

**Versión:** 3.0.0  
**Fecha:** 2026-07-22  
**Estado:** PARA VALIDACIÓN  
**Visión:** Plataforma universal para integrar cualquier proveedor, modelo, motor de inferencia o proyecto de IA.

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Filosofía de Diseño](#2-filosofía-de-diseño)
3. [Arquitectura Universal](#3-arquitectura-universal)
4. [Sistema de Plugins](#4-sistema-de-plugins)
5. [Modelo de Proveedores](#5-modelo-de-proveedores)
6. [Modelo de Modelos](#6-modelo-de-modelos)
7. [Sistema de Autenticación Universal](#7-sistema-de-autenticación-universal)
8. [Sistema de Cuotas y Límites](#8-sistema-de-cuotas-y-límites)
9. [Interfaces de Adaptadores](#9-interfaces-de-adaptadores)
10. [Flujo de Solicitud Universal](#10-flujo-de-solicitud-universal)
11. [Centro de Administración (Dashboard)](#11-centro-de-administración-dashboard)
12. [Extensibilidad Demostrable](#12-extensibilidad-demostrable)
13. [Comparativa y Mejoras](#13-comparativa-y-mejoras)
14. [Plan de Implementación](#14-plan-de-implementación)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Visión

Construir una **Universal AI Gateway Platform** donde:

- **LiteLLM es UNO de muchos adaptadores**, no el centro
- **Cualquier proveedor puede agregarse** mediante plugins
- **El núcleo nunca cambia** al agregar nuevas integraciones
- **Modelos y proveedores están completamente separados**
- **La plataforma evoluciona sin dependencias锁定**

### 1.2 Principios Fundamentales

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRINCIPIOS DE DISEÑO UNIVERSAL                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. PLUGIN-FIRST                                                          │
│     ───────────                                                            │
│     Todo es un plugin. El núcleo solo conoce interfaces.                     │
│                                                                             │
│  2. PROVIDER-AGNOSTIC                                                     │
│     ─────────────────                                                       │
│     El sistema no asume NADA sobre cómo funciona un proveedor.              │
│     Cada proveedor se adapta a través de su propio adaptador.               │
│                                                                             │
│  3. MODEL-PROVIDER SEPARATION                                              │
│     ────────────────────────────                                            │
│     Un modelo puede existir en múltiples proveedores.                        │
│     Un proveedor puede ofrecer múltiples modelos.                             │
│     Son entidades completamente independientes.                               │
│                                                                             │
│  4. PROTOCOL TRANSPARENCY                                                  │
│     ──────────────────────────                                              │
│     El núcleo no conoce protocolos (OpenAI, Anthropic, REST, gRPC).         │
│     Los adaptadores traducen todo al formato interno.                       │
│                                                                             │
│  5. ZERO COUPLING                                                          │
│     ───────────────                                                        │
│     Agregar un nuevo proveedor = crear un archivo.                            │
│     No se modifica el núcleo, solo se extiende.                             │
│                                                                             │
│  6. PROVIDER ISOLATION                                                     │
│     ────────────────────                                                   │
│     Cada proveedor está aislado. Fallos de uno no afectan a otros.           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     UNIVERSAL AI GATEWAY PLATFORM                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      PRESENTATION LAYER                                │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │  │
│  │  │ LibreChat  │ │ OpenWebUI  │ │   Custom   │ │  Partner   │   │  │
│  │  │     UI     │ │            │ │   Apps     │ │    Apps    │   │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      CORE GATEWAY (NÚCLEO)                           │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │                                                             │   │  │
│  │  │   NO CONOCE NINGÚN PROVEEDOR ESPECÍFICO                    │   │  │
│  │  │   NO CONOCE NINGÚN MODELO ESPECÍFICO                       │   │  │
│  │  │   SOLO CONOCE INTERFACES ABSTRACTAS                        │   │  │
│  │  │                                                             │   │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │   │  │
│  │  │  │  Auth   │ │  Router │ │ Policy  │ │ Context │    │   │  │
│  │  │  │  Core   │ │  Core   │ │  Core   │ │ Manager │    │   │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │   │  │
│  │  │                                                             │   │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │   │  │
│  │  │  │  Event  │ │ Metric  │ │  Cache   │ │  Audit  │    │   │  │
│  │  │  │   Bus   │ │  Core   │ │  Core   │ │   Core   │    │   │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │   │  │
│  │  │                                                             │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      PLUGIN LAYER (EXTENSIONES)                     │  │
│  │                                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │                  PROVIDER ADAPTERS                            │   │  │
│  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │   │  │
│  │  │  │OpenAI │ │Anthropic│ │Gemini │ │  Groq │ │DeepSeek│    │   │  │
│  │  │  │Plugin │ │Plugin │ │Plugin │ │Plugin │ │Plugin │    │   │  │
│  │  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘    │   │  │
│  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │   │  │
│  │  │  │LiteLLM│ │Ollama │ │LM Studio│ │ vLLM │ │LocalAI │    │   │  │
│  │  │  │Plugin │ │Plugin │ │ Plugin │ │Plugin │ │Plugin │    │   │  │
│  │  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘    │   │  │
│  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │   │  │
│  │  │  │FreeCC │ │ Hugging│ │Together│ │Cohere │ │Mistral│    │   │  │
│  │  │  │Plugin │ │ Face  │ │Plugin │ │Plugin │ │Plugin │    │   │  │
│  │  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘    │   │  │
│  │  │                        ... + ANY FUTURE PROVIDER ...       │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │                  AUTHENTICATION PLUGINS                      │   │  │
│  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │   │  │
│  │  │  │API Key│ │ OAuth │ │  JWT  │ │Cookies│ │SAML   │    │   │  │
│  │  │  │Plugin │ │Plugin │ │Plugin │ │Plugin │ │Plugin │    │   │  │
│  │  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘    │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │                    OTHER PLUGINS                             │   │  │
│  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │   │  │
│  │  │  │  MCP  │ │Tools  │ │Memory  │ │Agents │ │Custom │    │   │  │
│  │  │  │Plugins│ │Plugins│ │Plugins │ │Plugins │ │Plugins│    │   │  │
│  │  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘    │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      EXTERNAL WORLD                                   │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │  │
│  │  │ OpenAI  │ │Anthropic│ │ Google │ │   Any  │ │Enterprise│    │  │
│  │  │  API    │ │   API   │ │   API   │ │  LLM   │ │   Gateways│   │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │  │
│  │  │ Ollama  │ │LM Studio│ │  vLLM  │ │LocalAI  │ │FreeClaude│    │  │
│  │  │ Server  │ │ Server  │ │ Server  │ │ Server  │ │   Code  │     │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. FILOSOFÍA DE DISEÑO

### 2.1 El Núcleo Solo Conoce Abstracciones

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EL NÚCLEO NO SABE NADA DE...                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ❌ No sabe qué es OpenAI                                                  │
│  ❌ No sabe qué es Anthropic                                               │
│  ❌ No sabe qué es LiteLLM                                                 │
│  ❌ No sabe qué es Ollama                                                  │
│  ❌ No sabe qué protocolo usa cada proveedor                                │
│  ❌ No sabe cómo autenticar contra ningún servicio                          │
│  ❌ No sabe qué modelos existen                                             │
│  ❌ No sabe cómo funcionan las APIs específicas                            │
│                                                                             │
│  ✅ SÍ sabe qué es un IProvider (interfaz abstracta)                     │
│  ✅ SÍ sabe qué es un IAuthPlugin (interfaz abstracta)                   │
│  ✅ SÍ sabe qué es un IModel (interfaz abstracta)                         │
│  ✅ SÍ sabe cómo enrutar entre plugins                                     │
│  ✅ SÍ sabe cómo aplicar políticas                                          │
│  ✅ SÍ sabe cómo trackear uso                                             │
│  ✅ SÍ sabe cómo auditear                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Patrones de Diseño Utilizados

| Patrón | Uso | Beneficio |
|--------|-----|-----------|
| **Adapter** | Traducir entre protocolos externos y internos | Neutralidad de protocolo |
| **Factory** | Crear instancias de plugins | Plugin discovery automático |
| **Strategy** | Seleccionar algoritmo de routing/balanceo | Flexibilidad de selección |
| **Plugin** | Extender funcionalidad sin modificar núcleo | Extensibilidad infinita |
| **Observer** | Notificar eventos a múltiples suscriptores | Desacoplamiento |
| **Decorator** | Añadir funcionalidad a plugins | Composición sin herencia |

### 2.3 Comparativa: Centralizado vs Universal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   ENFOQUE CENTRALIZADO (❌ EVITAR)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│     ┌─────────┐                                                           │
│     │ LiteLLM │  ◀── Todo pasa por aquí                                  │
│     │ Gateway │                                                           │
│     └────┬────┘                                                           │
│          │                                                                 │
│     ┌────┴────┐     ┌─────────┐     ┌─────────┐                         │
│     │ OpenAI  │     │Anthropic│     │  Groq   │  ◀── LiteLLM conoce    │
│     │ Adapter │     │ Adapter │     │ Adapter │     cada uno            │
│     └─────────┘     └─────────┘     └─────────┘                         │
│                                                                             │
│  Problema: Si LiteLLM desaparece o cambia, TODO cambia.                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                   ENFOQUE UNIVERSAL (✅ DESEADO)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│     ┌─────────────────────────────────────────────────────────────┐         │
│     │                      CORE GATEWAY                            │         │
│     │                                                             │         │
│     │  ┌─────────────────────────────────────────────────────┐   │         │
│     │  │              Plugin Registry                        │   │         │
│     │  │                                                     │   │         │
│     │  │   plugins.register('openai', OpenAIAdapter)        │   │         │
│     │  │   plugins.register('anthropic', AnthropicAdapter)    │   │         │
│     │  │   plugins.register('litellm', LiteLLMAdapter)       │   │         │
│     │  │   plugins.register('ollama', OllamaAdapter)          │   │         │
│     │  │   plugins.register('free-claude-code', FreeCCAdapter)│  │         │
│     │  │                          ...                         │   │         │
│     │  └─────────────────────────────────────────────────────┘   │         │
│     └─────────────────────────────────────────────────────────────┘         │
│                               │                                             │
│                               ▼                                             │
│     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐         │
│     │ OpenAI  │     │Anthropic│     │ LiteLLM │     │  Ollama │         │
│     │ Plugin  │     │ Plugin  │     │ Plugin  │     │  Plugin │         │
│     └─────────┘     └─────────┘     └─────────┘     └─────────┘         │
│                                                                             │
│  ✅ El núcleo NO cambia si agregas/quitas plugins                          │
│  ✅ LiteLLM es solo UN plugin más                                         │
│  ✅ Puedes quitar LiteLLM completamente y todo sigue funcionando           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. ARQUITECTURA UNIVERSAL

### 3.1 Vista de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA DE COMPONENTES                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         CORE (NÚCLEO)                                  │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐     │ │
│  │  │                    PluginManager                             │     │ │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ │     │ │
│  │  │  │ Discover  │ │  Load    │ │  Reload  │ │  Unload  │ │     │ │
│  │  │  │           │ │           │ │           │ │           │ │     │ │
│  │  │  │ • Scan    │ │ • Import  │ │ • Hot    │ │ • Cleanup │ │     │ │
│  │  │  │ • Validate│ │ • Init    │ │  Reload  │ │ • Events │ │     │ │
│  │  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘ │     │ │
│  │  └─────────────────────────────────────────────────────────────┘     │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐     │ │
│  │  │                    RequestOrchestrator                        │     │ │
│  │  │                                                             │     │ │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ │     │ │
│  │  │  │ Validate │ │   Route  │ │ Transform│ │  Execute │ │     │ │
│  │  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘ │     │ │
│  │  │                                                             │     │ │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐                 │     │ │
│  │  │  │  Policy  │ │  Context │ │  Metrics │                 │     │ │
│  │  │  │  Check   │ │  Load    │ │  Record  │                 │     │ │
│  │  │  └───────────┘ └───────────┘ └───────────┘                 │     │ │
│  │  └─────────────────────────────────────────────────────────────┘     │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐     │ │
│  │  │                    ModelRegistry                             │     │ │
│  │  │                                                             │     │ │
│  │  │  Un modelo puede estar en MULTIPLES proveedores             │     │ │
│  │  │                                                             │     │ │
│  │  │  ┌─────────────────────────────────────────────────────┐   │     │ │
│  │  │  │  Model: "claude-3-5-sonnet"                       │   │     │ │
│  │  │  │  ├── Provider: "anthropic" (original)            │   │     │ │
│  │  │  │  ├── Provider: "free-claude-code" (via NVIDIA)    │   │     │ │
│  │  │  │  └── Provider: "openrouter" (via Anthropic)      │   │     │ │
│  │  │  └─────────────────────────────────────────────────────┘   │     │ │
│  │  │                                                             │     │ │
│  │  └─────────────────────────────────────────────────────────────┘     │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐     │ │
│  │  │                   ProviderRegistry                          │     │ │
│  │  │                                                             │     │ │
│  │  │  Cada provider es un plugin independiente                   │     │ │
│  │  │                                                             │     │ │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │     │ │
│  │  │  │OpenAI   │ │Anthropic│ │ LiteLLM │ │ Ollama  │  ...    │     │ │
│  │  │  │Provider │ │Provider │ │Provider │ │Provider │         │     │ │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │     │ │
│  │  │                                                             │     │ │
│  │  └─────────────────────────────────────────────────────────────┘     │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│  ┌────────────────────────────────┼────────────────────────────────────┐ │
│  │                                │                                     │ │
│  │  ┌─────────────────────────────┴───────────────────────────────┐ │ │
│  │  │                    PLUGIN LAYER                             │ │ │
│  │  │                                                           │ │ │
│  │  │  Los plugins SOLO conocen la interfaz IProvider            │ │ │
│  │  │  El núcleo SOLO conoce la interfaz IProvider               │ │ │
│  │  │                                                           │ │ │
│  │  │  ┌─────────────────────────────────────────────────────┐ │ │ │
│  │  │  │              IProvider Interface                     │ │ │ │
│  │  │  │  ┌───────────────────────────────────────────────┐ │ │ │ │
│  │  │  │  │ execute(request: Request): Response         │ │ │ │ │
│  │  │  │  │ stream(request: Request): AsyncIterator    │ │ │ │ │
│  │  │  │  │ healthCheck(): Promise<Health>             │ │ │ │ │
│  │  │  │  │ listModels(): Promise<Model[]>            │ │ │ │ │
│  │  │  │  │ getCapabilities(): ProviderCapabilities    │ │ │ │ │
│  │  │  │  └───────────────────────────────────────────────┘ │ │ │ │
│  │  │  └─────────────────────────────────────────────────────┘ │ │ │
│  │  │                                                           │ │ │
│  │  └───────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Arquitectura Detallada por Capas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAPAS DE LA ARQUITECTURA                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗   │
│  ║  LAYER 1: PRESENTATION (Interfaces de Usuario)                      ║   │
│  ╠═══════════════════════════════════════════════════════════════════════╣   │
│  ║                                                                       ║   │
│  ║  • LibreChat UI         • OpenWebUI                                  ║   │
│  ║  • Custom Applications   • Partner Integrations                       ║   │
│  ║  • API Gateway (REST)   • WebSocket Gateway                          ║   │
│  ║                                                                       ║   │
│  ║  Responsabilidad: Traducir requests del cliente al formato interno   ║   │
│  ╚═══════════════════════════════════════════════════════════════════════╝   │
│                                    │                                         │
│                                    ▼                                         │
│  ╔═══════════════════════════════════════════════════════════════════════╗   │
│  ║  LAYER 2: CORE GATEWAY (Núcleo - NUNCA CAMBIA PARA AGREGAR)        ║   │
│  ╠═══════════════════════════════════════════════════════════════════════╣   │
│  ║                                                                       ║   │
│  ║  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    ║   │
│  ║  │  AuthCore      │  │  RouterCore     │  │  PolicyCore     │    ║   │
│  ║  │                 │  │                 │  │                 │    ║   │
│  ║  │ • Validate JWT │  │ • Match request │  │ • Apply rules  │    ║   │
│  ║  │ • Check perms   │  │   to providers │  │ • Check limits │    ║   │
│  ║  │ • Rate limit    │  │ • Select best   │  │ • Enforce     │    ║   │
│  ║  └─────────────────┘  └─────────────────┘  └─────────────────┘    ║   │
│  ║                                                                       ║   │
│  ║  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    ║   │
│  ║  │  ContextCore   │  │  MetricsCore    │  │  CacheCore      │    ║   │
│  ║  │                 │  │                 │  │                 │    ║   │
│  ║  │ • Load history │  │ • Record usage  │  │ • Cache requests│    ║   │
│  ║  │ • Truncate ctx │  │ • Track latency │  │ • Invalidate   │    ║   │
│  ║  │ • Share state  │  │ • Export metrics│  │ • TTL manage   │    ║   │
│  ║  └─────────────────┘  └─────────────────┘  └─────────────────┘    ║   │
│  ║                                                                       ║   │
│  ║  Responsabilidad: Lógica de negocio común, independiene de plugins  ║   │
│  ╚═══════════════════════════════════════════════════════════════════════╝   │
│                                    │                                         │
│                                    ▼                                         │
│  ╔═══════════════════════════════════════════════════════════════════════╗   │
│  ║  LAYER 3: PLUGIN LAYER (Extensiones - SE AGREGA SIN MODIFICAR CORE) ║   │
│  ╠═══════════════════════════════════════════════════════════════════════╣   │
│  ║                                                                       ║   │
│  ║  ┌───────────────────────────────────────────────────────────────┐  ║   │
│  ║  │                    PROVIDER ADAPTERS                           │  ║   │
│  ║  │                                                               │  ║   │
│  ║  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │  ║   │
│  ║  │  │ OpenAI  │ │Anthropic│ │ Gemini  │ │  Groq   │           │  ║   │
│  ║  │  │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │           │  ║   │
│  ║  │  │ Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin  │           │  ║   │
│  ║  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │  ║   │
│  ║  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │  ║   │
│  ║  │  │ DeepSeek│ │Cohere   │ │Mistral  │ │Together │           │  ║   │
│  ║  │  │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │           │  ║   │
│  ║  │  │ Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin  │           │  ║   │
│  ║  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │  ║   │
│  ║  │                        ...                                    │  ║   │
│  ║  └───────────────────────────────────────────────────────────────┘  ║   │
│  ║                                                                       ║   │
│  ║  ┌───────────────────────────────────────────────────────────────┐  ║   │
│  ║  │                    LOCAL/OSS ADAPTERS                           │  ║   │
│  ║  │                                                               │  ║   │
│  ║  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │  ║   │
│  ║  │  │ LiteLLM │ │ Ollama  │ │ LMStudio│ │  vLLM   │ │LocalAI  │ │  ║   │
│  ║  │  │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │ │  ║   │
│  ║  │  │ Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin  │ │  ║   │
│  ║  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │  ║   │
│  ║  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │  ║   │
│  ║  │  │FreeClaude│ │ TGI    │ │SGLang   │ │FastChat │ │Custom  │ │  ║   │
│  ║  │  │  Code   │ │ Adapter │ │ Adapter │ │ Adapter │ │ Local  │ │  ║   │
│  ║  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │  ║   │
│  ║  └───────────────────────────────────────────────────────────────┘  ║   │
│  ║                                                                       ║   │
│  ║  ┌───────────────────────────────────────────────────────────────┐  ║   │
│  ║  │                  AUTHENTICATION PLUGINS                        │  ║   │
│  ║  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │  ║   │
│  ║  │  │API Keys │ │ OAuth  │ │  JWT   │ │Cookies  │ │SAML/OIDC│ │  ║   │
│  ║  │  │ Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin  │ │  ║   │
│  ║  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │  ║   │
│  ║  └───────────────────────────────────────────────────────────────┘  ║   │
│  ║                                                                       ║   │
│  ║  ┌───────────────────────────────────────────────────────────────┐  ║   │
│  ║  │                      OTHER PLUGINS                            │  ║   │
│  ║  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │  ║   │
│  ║  │  │   MCP   │ │ Tools  │ │ Memory  │ │ Agents  │ │Custom   │ │  ║   │
│  ║  │  │Plugins │ │Plugins │ │Plugins │ │Plugins  │ │Plugins  │ │  ║   │
│  ║  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │  ║   │
│  ║  │                                                               │  ║   │
│  ║  │  + ANY FUTURE PLUGIN TYPE                                    │  ║   │
│  ║  │                                                               │  ║   │
│  ║  └───────────────────────────────────────────────────────────────┘  ║   │
│  ║                                                                       ║   │
│  ╚═══════════════════════════════════════════════════════════════════════╝   │
│                                    │                                         │
│                                    ▼                                         │
│  ╔═══════════════════════════════════════════════════════════════════════╗   │
│  ║  LAYER 4: EXTERNAL PROVIDERS (El mundo exterior)                     ║   │
│  ╠═══════════════════════════════════════════════════════════════════════╣   │
│  ║                                                                       ║   │
│  ║  ┌───────────────────────────────────────────────────────────────┐  ║   │
│  ║  │                    COMMERCIAL APIS                            │  ║   │
│  ║  │  OpenAI • Anthropic • Google • Groq • DeepSeek • Cohere     │  ║   │
│  ║  │  Mistral • Together • NVIDIA • Perplexity • OpenRouter      │  ║   │
│  ║  └───────────────────────────────────────────────────────────────┘  ║   │
│  ║                                                                       ║   │
│  ║  ┌───────────────────────────────────────────────────────────────┐  ║   │
│  ║  │                    OPEN SOURCE SERVERS                       │  ║   │
│  ║  │  Ollama • LM Studio • vLLM • LocalAI • TGI • SGLang        │  ║   │
│  ║  │  FastChat • LiteLLM Proxy • Free Claude Code Server         │  ║   │
│  ║  └───────────────────────────────────────────────────────────────┘  ║   │
│  ║                                                                       ║   │
│  ║  ┌───────────────────────────────────────────────────────────────┐  ║   │
│  ║  │                  ENTERPRISE SOLUTIONS                        │  ║   │
│  ║  │  Azure OpenAI • Vertex AI • AWS Bedrock • Enterprise Gates  │  ║   │
│  ║  └───────────────────────────────────────────────────────────────┘  ║   │
│  ║                                                                       ║   │
│  ╚═══════════════════════════════════════════════════════════════════════╝   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. SISTEMA DE PLUGINS

### 4.1 Arquitectura del Plugin System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN SYSTEM ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                        PluginManager                                    │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │                                                              │   │ │
│  │  │  responsibility:                                             │   │ │
│  │  │  • Discover plugins en tiempo de ejecución                   │   │ │
│  │  │  • Validar que implementan interfaces correctas              │   │ │
│  │  │  • Mantener registry de plugins activos                     │   │ │
│  │  │  • Manejar ciclo de vida (load/unload/reload)                │   │ │
│  │  │  • Resolver dependencias entre plugins                      │   │ │
│  │  │  • Notificar eventos de plugin lifecycle                     │   │ │
│  │  │                                                              │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                     Plugin Registry                                     │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │  {                                                          │   │ │
│  │  │    "openai": {                                              │   │ │
│  │  │      "id": "openai",                                       │   │ │
│  │  │      "name": "OpenAI",                                     │   │ │
│  │  │      "version": "1.0.0",                                  │   │ │
│  │  │      "type": "provider",                                   │   │ │
│  │  │      "status": "active",                                   │   │ │
│  │  │      "instance": OpenAIAdapter,                            │   │ │
│  │  │      "config": {...},                                       │   │ │
│  │  │      "capabilities": [...],                                │   │ │
│  │  │      "models": [...],                                      │   │ │
│  │  │      "dependencies": []                                    │   │ │
│  │  │    },                                                       │   │ │
│  │  │    "anthropic": {...},                                      │   │ │
│  │  │    "ollama": {...},                                        │   │ │
│  │  │    "free-claude-code": {...},                              │   │ │
│  │  │    // ... cualquier plugin futuro                            │   │ │
│  │  │  }                                                          │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      Plugin Interfaces                                   │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │                                                              │   │ │
│  │  │  interface IPlugin {                                        │   │ │
│  │  │    readonly id: string;                                     │   │ │
│  │  │    readonly name: string;                                    │   │ │
│  │  │    readonly version: string;                                 │   │ │
│  │  │    readonly type: PluginType;                               │   │ │
│  │  │                                                              │   │ │
│  │  │    initialize(config: PluginConfig): Promise<void>;        │   │ │
│  │  │    shutdown(): Promise<void>;                               │   │ │
│  │  │    getHealth(): Promise<PluginHealth>;                      │   │ │
│  │  │  }                                                          │   │ │
│  │  │                                                              │   │ │
│  │  │  // Provider Plugin Interface                                 │   │ │
│  │  │  interface IProviderPlugin extends IPlugin {                │   │ │
│  │  │    readonly provider: ProviderDefinition;                     │   │ │
│  │  │    execute(request: AIRequest): Promise<AIResponse>;        │   │ │
│  │  │    stream(request: AIRequest): AsyncIterator<StreamChunk>; │   │ │
│  │  │    listModels(): Promise<Model[]>;                          │   │ │
│  │  │  }                                                          │   │ │
│  │  │                                                              │   │ │
│  │  │  // Tool Plugin Interface                                    │   │ │
│  │  │  interface IToolPlugin extends IPlugin {                    │   │ │
│  │  │    readonly tools: ToolDefinition[];                          │   │ │
│  │  │    execute(tool: ToolCall): Promise<ToolResult>;            │   │ │
│  │  │  }                                                          │   │ │
│  │  │                                                              │   │ │
│  │  │  // Memory Plugin Interface                                  │   │ │
│  │  │  interface IMemoryPlugin extends IPlugin {                   │   │ │
│  │  │    readonly memoryType: MemoryType;                          │   │ │
│  │  │    store(key: string, value: any): Promise<void>;           │   │ │
│  │  │    retrieve(key: string): Promise<any>;                    │   │ │
│  │  │    search(query: string): Promise<MemoryResult[]>;          │   │ │
│  │  │  }                                                          │   │ │
│  │  │                                                              │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Plugin Discovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PLUGIN DISCOVERY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Los plugins pueden descubrirase de múltiples formas:                        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  MÉTODO 1: Directory Scan                                             │ │
│  │  ────────────────────────────                                          │ │
│  │                                                                        │ │
│  │  plugins/                                                             │ │
│  │  ├── providers/                                                       │ │
│  │  │   ├── openai/           → openai.ts, manifest.json                │ │
│  │  │   ├── anthropic/        → anthropic.ts, manifest.json             │ │
│  │  │   ├── ollama/          → ollama.ts, manifest.json               │ │
│  │  │   ├── litellm/         → litellm.ts, manifest.json              │ │
│  │  │   └── free-claude-code/→ freeClaudeCode.ts, manifest.json        │ │
│  │  │                        ... + cualquier carpeta futura          │ │
│  │  │                                                                       │ │
│  │  ├── auth/                                                            │ │
│  │  │   ├── api-key/        → apiKey.ts, manifest.json                 │ │
│  │  │   ├── oauth/          → oauth.ts, manifest.json                 │ │
│  │  │   └── jwt/           → jwt.ts, manifest.json                   │ │
│  │  │                        ... + cualquier método futuro            │ │
│  │  │                                                                       │ │
│  │  ├── tools/                                                           │ │
│  │  │   └── ...                                                         │ │
│  │  │                                                                       │ │
│  │  └── memory/                                                         │ │
│  │      └── ...                                                         │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  MÉTODO 2: NPM Package Registry                                       │ │
│  │  ────────────────────────────────────                                │ │
│  │                                                                        │ │
│  │  npm install @universal-ai/provider-openai                           │ │
│  │  npm install @universal-ai/provider-anthropic                         │ │
│  │  npm install @universal-ai/provider-litellm                           │ │
│  │  npm install @universal-ai/auth-oauth                                 │ │
│  │  npm install @universal-ai/tool-search                                │ │
│  │                                                                        │ │
│  │  El PluginManager detecta automáticamente el nuevo package            │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  MÉTODO 3: Dynamic Loading (Runtime)                                  │ │
│  │  ────────────────────────────────────                                 │ │
│  │                                                                        │ │
│  │  POST /api/v1/admin/plugins/install                                   │ │
│  │  {                                                                    │ │
│  │    "source": "https://github.com/user/custom-provider",              │ │
│  │    "type": "provider"                                                │ │
│  │  }                                                                    │ │
│  │                                                                        │ │
│  │  El sistema descarga, valida y carga el plugin en runtime           │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Plugin Manifest

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN MANIFEST (manifest.json)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cada plugin DEBE tener un manifest.json:                                   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  {                                                                      │ │
│  │    "id": "openai",                     // Identificador único        │ │
│  │    "name": "OpenAI Provider",          // Nombre para display        │ │
│  │    "version": "1.0.0",                 // Semver                      │ │
│  │    "type": "provider",                  // provider | auth | tool | ...│ │
│  │    "description": "OpenAI GPT models",  // Descripción               │ │
│  │    "author": "Universal AI Team",        // Autor                     │ │
│  │    "license": "MIT",                    // Licencia                   │ │
│  │    "homepage": "https://openai.com",    // Homepage                 │ │
│  │    "repository": "...",                // Repo                       │ │
│  │    "keywords": ["openai", "gpt", "chat"], // Búsqueda               │ │
│  │                                                                       │ │
│  │    "requires": {                        // Dependencias               │ │
│  │      "core": ">=3.0.0",               // Versión mínima del core   │ │
│  │      "auth": ["api-key"]               // Plugins requeridos        │ │
│  │    },                                                                       │ │
│  │                                                                       │ │
│  │    "provides": {                       // Lo que provee              │ │
│  │      "models": ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],        │ │
│  │      "capabilities": ["chat", "function_calling", "vision"],       │ │
│  │      "protocols": ["openai"]                                           │ │
│  │    },                                                                       │ │
│  │                                                                       │ │
│  │    "config": {                         // Configuración requerida   │ │
│  │      "apiKey": {                       // Clave requerida           │ │
│  │        "required": true,                                               │ │
│  │        "description": "OpenAI API Key",                              │ │
│  │        "envVar": "OPENAI_API_KEY"                                    │ │
│  │      },                                                                     │ │
│  │      "organization": {                                                  │ │
│  │        "required": false,                                              │ │
│  │        "description": "OpenAI Organization ID"                         │ │
│  │      }                                                                     │ │
│  │    },                                                                     │ │
│  │                                                                       │ │
│  │    "entryPoint": "./dist/index.js",    // Punto de entrada           │ │
│  │    "interfaces": ["IProviderPlugin"],   // Interfaces implementadas │ │
│  │    "compatibility": {                   // Compatibilidad             │ │
│  │      "os": ["linux", "darwin", "win32"],                                 │ │
│  │      "node": ">=18.0.0"                                                │ │
│  │    }                                                                       │ │
│  │  }                                                                      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Crear un Nuevo Plugin (Ejemplo)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              GUÍA: CREAR UN NUEVO PROVIDER PLUGIN                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PASOS PARA AGREGAR CUALQUIER NUEVO PROVEEDOR:                            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PASO 1: Crear directorio del plugin                                  │ │
│  │  ───────────────────────────────────                                 │ │
│  │                                                                        │ │
│  │  mkdir -p plugins/providers/mi-nuevo-proveedor                       │ │
│  │  cd plugins/providers/mi-nuevo-proveedor                             │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PASO 2: Crear manifest.json                                           │ │
│  │  ───────────────────────────────────                                 │ │
│  │                                                                        │ │
│  │  {                                                                      │ │
│  │    "id": "mi-nuevo-proveedor",                                       │ │
│  │    "name": "Mi Nuevo Proveedor",                                      │ │
│  │    "version": "1.0.0",                                               │ │
│  │    "type": "provider",                                                 │ │
│  │    "entryPoint": "./index.ts",                                        │ │
│  │    "interfaces": ["IProviderPlugin"]                                  │ │
│  │  }                                                                     │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PASO 3: Implementar el plugin                                         │ │
│  │  ───────────────────────────────────                                 │ │
│  │                                                                        │ │
│  │  // index.ts                                                           │ │
│  │  import { IProviderPlugin, AIRequest, AIResponse } from '@core/interfaces';│ │
│  │                                                                        │ │
│  │  export class MiNuevoProveedorPlugin implements IProviderPlugin {        │ │
│  │    readonly id = 'mi-nuevo-proveedor';                                │ │
│  │    readonly name = 'Mi Nuevo Proveedor';                               │ │
│  │    readonly version = '1.0.0';                                         │ │
│  │    readonly type = 'provider' as const;                                 │ │
│  │                                                                        │ │
│  │    async initialize(config: PluginConfig): Promise<void> {            │ │
│  │      // Inicializar conexión con el proveedor                         │ │
│  │    }                                                                  │ │
│  │                                                                        │ │
│  │    async execute(request: AIRequest): Promise<AIResponse> {           │ │
│  │      // Ejecutar request contra la API del proveedor                  │ │
│  │      // Transformar request al formato del proveedor                 │ │
│  │      // Hacer la llamada HTTP                                         │ │
│  │      // Transformar respuesta al formato interno                      │ │
│  │    }                                                                  │ │
│  │                                                                        │ │
│  │    async *stream(request: AIRequest): AsyncIterator<StreamChunk> {    │ │
│  │      // Streaming si el proveedor lo soporta                         │ │
│  │    }                                                                  │ │
│  │                                                                        │ │
│  │    async listModels(): Promise<Model[]> {                             │ │
│  │      // Retornar lista de modelos disponibles                         │ │
│  │    }                                                                  │ │
│  │                                                                        │ │
│  │    async shutdown(): Promise<void> {                                   │ │
│  │      // Limpiar recursos                                             │ │
│  │    }                                                                  │ │
│  │  }                                                                    │ │
│  │                                                                        │ │
│  │  // Exportar la fábrica                                               │ │
│  │  export const createPlugin = (config: PluginConfig) => {               │ │
│  │    return new MiNuevoProveedorPlugin(config);                          │ │
│  │  };                                                                   │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PASO 4: Registrar en PluginManager                                    │ │
│  │  ───────────────────────────────────                                 │ │
│  │                                                                        │ │
│  │  // plugins/index.ts                                                   │ │
│  │  import { MiNuevoProveedorPlugin } from './mi-nuevo-proveedor';        │ │
│  │                                                                        │ │
│  │  export const pluginRegistry = {                                        │ │
│  │    providers: {                                                        │ │
│  │      'mi-nuevo-proveedor': MiNuevoProveedorPlugin,                    │ │
│  │      // ... otros plugins                                             │ │
│  │    }                                                                   │ │
│  │  };                                                                    │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════════ │
│  ║                                                                       ║   │
│  ║  ✅ NÚCLEO NO SE MODIFICA                                              ║   │
│  ║  ✅ Solo se agrega un archivo nuevo                                     ║   │
│  ║  ✅ El plugin es completamente independiente                           ║   │
│  ║  ✅ Puede removerse sin afectar al resto                               ║   │
│  ║                                                                       ║   │
│  ╚═══════════════════════════════════════════════════════════════════════════ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. MODELO DE PROVEEDORES

### 5.1 Entidad Proveedor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENTIDAD PROVEEDOR                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  interface Provider {                                                   │ │
│  │    // Identificación                                                   │ │
│  │    id: string;                    // ID único                         │ │
│  │    name: string;                  // Nombre técnico                   │ │
│  │    displayName: string;            // Nombre para mostrar               │ │
│  │    description?: string;          // Descripción                      │ │
│  │                                                                       │ │
│  │    // Clasificación                                                     │ │
│  │    category: ProviderCategory;                                        │ │
│  │    // commercial | opensource | self_hosted | community                │ │
│  │                                                                       │ │
│  │    // Protocolo y conexión                                             │ │
│  │    protocol: Protocol;               // openai | anthropic | rest | ... │ │
│  │    baseUrl: string;                // URL base del API                 │ │
│  │    apiVersion?: string;            // Versión de API si aplica          │ │
│  │                                                                       │ │
│  │    // Autenticación                                                    │ │
│  │    authMethods: AuthMethod[];     // api_key | oauth | jwt | ...      │ │
│  │    defaultAuth?: AuthMethod;       // Método de auth por defecto        │ │
│  │                                                                       │ │
│  │    // Capacidadades                                                    │ │
│  │    capabilities: ProviderCapabilities;                                │ │
│  │    supportedFeatures: Feature[];   // streaming | tools | vision | ...│ │
│  │                                                                       │ │
│  │    // Modelos soportados (referencia)                                  │ │
│  │    modelIds: string[];             // IDs de modelos disponibles     │ │
│  │                                                                       │ │
│  │    // Configuración                                                     │ │
│  │    config: Record<string, any>;    // Config específica del provider   │ │
│  │    rateLimits?: RateLimitConfig;   // Límites de rate limiting         │ │
│  │                                                                       │ │
│  │    // Estado y prioridad                                               │ │
│  │    enabled: boolean;                // Habilitado/Deshabilitado        │ │
│  │    priority: number;               // 1-100, mayor = preferido       │ │
│  │    weight: number;                // Para load balancing              │ │
│  │    maintenance?: MaintenanceInfo;  // Info de mantenimiento           │ │
│  │                                                                       │ │
│  │    // Metadatos                                                       │ │
│  │    tags?: string[];               // Tags para búsqueda               │ │
│  │    website?: string;              // Sitio web                       │ │
│  │    documentation?: string;        // Link a docs                    │ │
│  │  }                                                                          │ │
│  │                                                                              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  enum ProviderCategory {                                                 │ │
│  │    COMMERCIAL = 'commercial',        // OpenAI, Anthropic, Google       │ │
│  │    OPEN_SOURCE = 'opensource',       // Ollama, vLLM, LocalAI          │ │
│  │    SELF_HOSTED = 'self_hosted',     // LiteLLM, Custom deployments    │ │
│  │    COMMUNITY = 'community',          // Free Claude Code, HuggingFace  │ │
│  │    ENTERPRISE = 'enterprise'        // Azure, Vertex, Bedrock        │ │
│  │  }                                                                          │ │
│  │                                                                              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
```

### 5.2 Registro de Proveedores

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PROVIDER REGISTRY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  class ProviderRegistry {                                               │ │
│  │                                                                       │ │
│  │    // Registro de providers (desde plugins)                             │ │
│  │    private providers: Map<string, Provider> = new Map();              │ │
│  │                                                                       │ │
│  │    // Registrar un provider (llamado por PluginManager)               │ │
│  │    register(provider: Provider): void {                                │ │
│  │      this.providers.set(provider.id, provider);                       │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Obtener todos los providers                                     │ │
│  │    getAll(): Provider[] {                                            │ │
│  │      return Array.from(this.providers.values());                      │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Obtener por ID                                                  │ │
│  │    getById(id: string): Provider | undefined {                       │ │
│  │      return this.providers.get(id);                                   │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Filtrar por categoría                                            │ │
│  │    getByCategory(category: ProviderCategory): Provider[] {            │ │
│  │      return this.getAll().filter(p => p.category === category);      │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Filtrar por capacidad                                            │ │
│  │    getByCapability(capability: Capability): Provider[] {              │ │
│  │      return this.getAll().filter(p =>                                  │ │
│  │        p.capabilities.includes(capability)                            │ │
│  │      );                                                               │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Filtrar por modelo                                               │ │
│  │    getByModel(modelId: string): Provider[] {                         │ │
│  │      return this.getAll().filter(p =>                                 │ │
│  │        p.modelIds.includes(modelId)                                   │ │
│  │      );                                                               │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Filtrar providers habilitados                                    │ │
│  │    getEnabled(): Provider[] {                                         │ │
│  │      return this.getAll().filter(p => p.enabled && !p.maintenance);   │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Deshabilitar provider                                            │ │
│  │    disable(id: string): void {                                        │ │
│  │      const provider = this.providers.get(id);                          │ │
│  │      if (provider) provider.enabled = false;                           │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Habilitar provider                                              │ │
│  │    enable(id: string): void {                                         │ │
│  │      const provider = this.providers.get(id);                          │ │
│  │      if (provider) provider.enabled = true;                            │ │
│  │    }                                                                  │ │
│  │                                                                       │ │
│  │    // Actualizar prioridad                                            │ │
│  │    setPriority(id: string, priority: number): void {                  │ │
│  │      const provider = this.providers.get(id);                          │ │
│  │      if (provider) provider.priority = priority;                       │ │
│  │    }                                                                  │ │
│  │  }                                                                      │ │
│  │                                                                              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. MODELO DE MODELOS

### 6.1 Entidad Modelo (Separada de Proveedor)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENTIDAD MODELO                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  // ⚠️ MODELO ES INDEPENDIENTE DE PROVEEDOR                          │ │
│  │  // Un modelo puede existir en MÚLTIPLES proveedores                   │ │
│  │                                                                              │ │
│  │  interface Model {                                                         │ │
│  │    // Identificación                                                       │ │
│  │    id: string;                      // ID global del modelo            │ │
│  │    name: string;                     // Nombre técnico                   │ │
│  │    displayName: string;              // Nombre para mostrar             │ │
│  │    providerId: string;               // Proveedor "principal"         │ │
│  │    otherProviders?: string[];        // Otros providers con este model │ │
│  │                                                                              │ │
│  │    // Clasificación                                                        │ │
│  │    category: ModelCategory;          // chat | reasoning | embedding | ..│ │
│  │    family?: string;                  // Familia del modelo (GPT-4, etc)│ │
│  │    version?: string;                 // Versión específica             │ │
│  │                                                                              │ │
│  │    // Capacidades                                                         │ │
│  │    capabilities: ModelCapabilities;                                      │ │
│  │    // capabilities = {                                                   │ │
│  │    //   chat: boolean;                                                    │ │
│  │    //   reasoning: boolean;                                              │ │
│  │    //   code: boolean;                                                    │ │
│  │    //   vision: boolean;                                                   │ │
│  │    //   audio: boolean;                                                   │ │
│  │    //   functionCalling: boolean;                                        │ │
│  │    //   streaming: boolean;                                               │ │
│  │    //   ...                                                              │ │
│  │    // }                                                                  │ │
│  │                                                                              │ │
│  │    // Contexto                                                             │ │
│  │    contextWindow: number;               // Tokens máximos de contexto    │ │
│  │    maxOutputTokens?: number;           // Tokens máximos de output       │ │
│  │                                                                              │ │
│  │    // Modalidades                                                          │ │
│  │    modalities: Modality[];            // text | image | audio | video  │ │
│  │                                                                              │ │
│  │    // Herramientas                                                         │ │
│  │    supportedTools?: Tool[];           // Herramientas que soporta     │ │
│  │    supportsCustomTools: boolean;       // Permite tools custom         │ │
│  │                                                                              │ │
│  │    // Rendimiento                                                           │ │
│  │    latency: LatencyProfile;            // Perfil de latencia            │ │
│  │    throughput?: ThroughputProfile;     // Tokens por segundo           │ │
│  │                                                                              │ │
│  │    // Costo                                                                │ │
│  │    pricing: Pricing;                   // Costo por 1M tokens           │ │
│  │    pricingModel: 'per_token' | 'per_call' | 'free';                   │ │
│  │                                                                              │ │
│  │    // Estado                                                                │ │
│  │    status: ModelStatus;              // available | deprecated | new    │ │
│  │    releaseDate?: Date;               // Fecha de lanzamiento           │ │
│  │    deprecationDate?: Date;           // Fecha de deprecated            │ │
│  │                                                                              │ │
│  │    // Metadatos                                                           │ │
│  │    benchmarks?: BenchmarkResult[];     // Resultados de benchmarks       │ │
│  │    tags?: string[];                  // Tags para búsqueda              │ │
│  │    documentation?: string;           // Link a docs del modelo         │ │
│  │  }                                                                              │ │
│  │                                                                              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Model Registry (Separado de Provider Registry)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MODEL REGISTRY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  class ModelRegistry {                                                  │ │
│  │                                                                       │ │
│  │    // Los modelos son independientes de los proveedores                │ │
│  │    private models: Map<string, Model> = new Map();                    │ │
│  │                                                                       │ │
│  │    // Modelo → Proveedores (índice inverso)                            │ │
│  │    // Un modelo puede estar en múltiples proveedores                    │ │
│  │    private modelToProviders: Map<string, Set<string>> = new Map();    │ │
│  │                                                                       │ │
│  │    // Registrar un modelo                                               │ │
│  │    register(model: Model): void {                                     │ │
│  │      this.models.set(model.id, model);                                │ │
│  │      if (!this.modelToProviders.has(model.id)) {                      │ │
│  │        this.modelToProviders.set(model.id, new Set());                │ │
│  │      }                                                                │ │
│  │      this.modelToProviders.get(model.id)!.add(model.providerId);       │ │
│  │    }                                                                   │ │
│  │                                                                       │ │
│  │    // Vincular un modelo existente a otro provider                     │ │
│  │    linkToProvider(modelId: string, providerId: string): void {          │ │
│  │      if (!this.modelToProviders.has(modelId)) {                       │ │
│  │        this.modelToProviders.set(modelId, new Set());                 │ │
│  │      }                                                                 │ │
│  │      this.modelToProviders.get(modelId)!.add(providerId);              │ │
│  │    }                                                                   │ │
│  │                                                                       │ │
│  │    // Obtener modelo por ID                                             │ │
│  │    getById(id: string): Model | undefined {                            │ │
│  │      return this.models.get(id);                                       │ │
│  │    }                                                                   │ │
│  │                                                                       │ │
│  │    // Obtener todos los proveedores de un modelo                        │ │
│  │    getProvidersForModel(modelId: string): string[] {                   │ │
│  │      return Array.from(this.modelToProviders.get(modelId) || []);      │ │
│  │    }                                                                   │ │
│  │                                                                       │ │
│  │    // Buscar modelos por capacidad                                     │ │
│  │    findByCapability(required: Capability[]): Model[] {                  │ │
│  │      return this.getAll().filter(model =>                             │ │
│  │        required.every(cap => model.capabilities[cap])                 │ │
│  │      );                                                                │ │
│  │    }                                                                   │ │
│  │                                                                       │ │
│  │    // Buscar modelos por categoría                                     │ │
│  │    findByCategory(category: ModelCategory): Model[] {                   │ │
│  │      return this.getAll().filter(m => m.category === category);         │ │
│  │    }                                                                   │ │
│  │                                                                       │ │
│  │    // Buscar modelos free                                              │ │
│  │    findFreeModels(): Model[] {                                         │ │
│  │      return this.getAll().filter(m => m.pricingModel === 'free');      │ │
│  │    }                                                                   │ │
│  │                                                                       │ │
│  │    // Ejemplo: Encontrar proveedores para "claude-3-5-sonnet"          │ │
│  │    // 1. Buscar modelo por ID                                          │ │
│  │    // 2. Obtener todos los providers donde está disponible             │ │
│  │    findProvidersForModel('claude-3-5-sonnet') {                       │ │
│  │      return ['anthropic', 'free-claude-code', 'openrouter'];          │ │
│  │    }                                                                   │ │
│  │  }                                                                     │ │
│  │                                                                              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  EJEMPLO PRÁCTICO:                                                         │
│  ───────────────────                                                         │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Model: "claude-3-5-sonnet"                                           │ │
│  │  ├── Provider Principal: "anthropic" (API oficial)                   │ │
│  │  ├── Other Providers:                                                │ │
│  │  │   ├── "free-claude-code" (vía NVIDIA NIM)                        │ │
│  │  │   ├── "openrouter" (vía proxy)                                    │ │
│  │  │   └── "litellm" (vía proxy genérico)                             │ │
│  │  │                                                                       │ │
│  │  El Router puede elegir cuál usar basándose en:                       │ │
│  │  • Costo (anthropic > free-claude-code)                               │ │
│  │  • Latencia (free-claude-code puede ser más rápido)                   │ │
│  │  • Disponibilidad (si uno falla, usar otro)                           │ │
│  │  • Políticas (usuario prefiere free)                                   │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Routing: Modelo → Proveedor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ROUTING: MODELO → PROVEEDOR                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  El router debe poder elegir entre múltiples proveedores para un mismo     │
│  modelo.                                                                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  Solicitud: "Quiero usar claude-3-5-sonnet"                          │ │
│  │                                                                        │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  ModelRegistry.findProvidersForModel('claude-3-5-sonnet')      │  │ │
│  │  │  → ['anthropic', 'free-claude-code', 'openrouter']            │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                              │                                          │ │
│  │                              ▼                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Para cada provider, obtener:                                   │  │ │
│  │  │                                                                   │  │ │
│  │  │  1. Health Status (HealthMonitor)                             │  │ │
│  │  │  2. Quota Remaining (TokenQuotaManager)                         │  │ │
│  │  │  3. API Key Health (APIKeyManager)                              │  │ │
│  │  │  4. Current Latency (Metrics)                                   │  │ │
│  │  │  5. Cost (from Model.pricing)                                   │  │ │
│  │  │                                                                   │  │ │
│  │  │  ┌──────────────────┬───────────┬──────────┬────────┬──────┐  │ │ │
│  │  │  │ Provider        │ Health    │ Quota    │ Latency│ Cost │  │ │ │
│  │  │  ├──────────────────┼───────────┼──────────┼────────┼──────┤  │ │ │
│  │  │  │ anthropic        │ ✅        │ 45%      │ 320ms  │ $3   │  │ │ │
│  │  │  │ free-claude-code │ ✅        │ 80%      │ 180ms  │ $0   │  │ │ │
│  │  │  │ openrouter       │ ⚠️        │ 20% ⚠️  │ 450ms  │ $3   │  │ │ │
│  │  │  └──────────────────┴───────────┴──────────┴────────┴──────┘  │ │ │
│  │  │                                                                   │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                              │                                          │ │
│  │                              ▼                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Scoring (Policy Engine + Router)                              │  │ │
│  │  │                                                                   │  │ │
│  │  │  score =                                                           │  │ │
│  │  │    (0.25 * health) +                                             │  │ │
│  │  │    (0.20 * quota) +                                              │  │ │
│  │  │    (0.20 * (1/latency)) +                                        │  │ │
│  │  │    (0.20 * (1/cost)) +                                           │  │ │
│  │  │    (0.15 * policy_preference)                                    │  │ │
│  │  │                                                                   │  │ │
│  │  │  → free-claude-code: 0.89 (BEST)                               │  │ │
│  │  │  → anthropic: 0.72                                              │  │ │
│  │  │  → openrouter: 0.45 (⚠️ quota baja)                           │  │ │
│  │  │                                                                   │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                              │                                          │ │
│  │                              ▼                                          │ │
│  │                    ┌──────────────────┐                                │ │
│  │                    │ SELECTED        │                                │ │
│  │                    │ free-claude-code │                                │ │
│  │                    │ Fallbacks:       │                                │ │
│  │                    │ 1. anthropic    │                                │ │
│  │                    │ 2. openrouter    │                                │ │
│  │                    └──────────────────┘                                │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. SISTEMA DE AUTENTICACIÓN UNIVERSAL

### 7.1 Arquitectura de Auth Plugins

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIVERSAL AUTHENTICATION SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    AuthenticationManager                               │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │                                                              │   │ │
│  │  │  El AuthManager conoce ÚNICAMENTE la interfaz IAuthPlugin  │   │ │
│  │  │  NO conoce implementaciones específicas                       │   │ │
│  │  │                                                              │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      AUTH PLUGIN INTERFACE                              │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │                                                              │   │ │
│  │  │  interface IAuthPlugin extends IPlugin {                   │   │ │
│  │  │    readonly authType: AuthType;                              │   │ │
│  │  │    readonly supportedProviders: string[];                   │   │ │
│  │  │                                                              │   │ │
│  │  │    // Autenticar usuario                                      │   │ │
│  │  │    authenticate(credentials: Credentials): Promise<AuthResult>;│ │ │
│  │  │                                                              │   │ │
│  │  │    // Validar token/sesión                                   │   │ │
│  │  │    validate(authContext: AuthContext): Promise<ValidationResult>;│ │ │
│  │  │                                                              │   │ │
│  │  │    // Refrescar token                                        │   │ │
│  │  │    refresh(refreshToken: string): Promise<AuthResult>;        │   │ │
│  │  │                                                              │   │ │
│  │  │    // Revocar sesión/token                                    │   │ │
│  │  │    revoke(authContext: AuthContext): Promise<void>;            │   │ │
│  │  │  }                                                              │   │ │
│  │  │                                                              │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│  ┌────────────────────────────────┼────────────────────────────────────┐ │
│  │                                │                                     │ │
│  │  ┌────────────────────────────┴────────────────────────────┐      │ │
│  │  │                    AUTH PLUGINS                           │      │ │
│  │  │                                                           │      │ │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │      │ │
│  │  │  │API Key │ │ OAuth  │ │  JWT    │ │OAuth2   │       │      │ │
│  │  │  │Plugin  │ │Plugin  │ │Plugin  │ │Plugin   │       │      │ │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │      │ │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │      │ │
│  │  │  │Cookies  │ │Browser  │ │SAML     │ │Custom   │       │      │ │
│  │  │  │Plugin   │ │Session  │ │Plugin   │ │Plugin   │       │      │ │
│  │  │  │         │ │Plugin   │ │         │ │         │       │      │ │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │      │ │
│  │  │                         + ANY FUTURE AUTH METHOD           │      │ │
│  │  │                                                           │      │ │
│  │  └───────────────────────────────────────────────────────────┘      │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Auth Plugin Example

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 CREAR UN NUEVO AUTH PLUGIN (Ejemplo)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // plugins/auth/biometric/index.ts                                        │
│  import { IAuthPlugin, Credentials, AuthResult } from '@core/interfaces'; │
│                                                                             │
│  export class BiometricAuthPlugin implements IAuthPlugin {                │
│    readonly id = 'biometric';                                             │
│    readonly name = 'Biometric Authentication';                              │
│    readonly version = '1.0.0';                                            │
│    readonly type = 'auth' as const;                                       │
│    readonly authType = 'biometric';                                        │
│    readonly supportedProviders = ['*'];  // Soporta todos                 │
│                                                                             │
│    async authenticate(credentials: Credentials): Promise<AuthResult> {      │
│      // Validar credenciales biométricas                                    │
│      const { fingerprint, faceId } = credentials;                         │
│      const user = await biometricService.verify(fingerprint, faceId);     │
│                                                                             │
│      return {                                                              │
│        success: true,                                                      │
│        userId: user.id,                                                    │
│        token: jwtService.generate({ userId: user.id }),                  │
│        expiresAt: Date.now() + 3600000                                     │
│      };                                                                    │
│    }                                                                       │
│                                                                             │
│    async validate(authContext: AuthContext): Promise<ValidationResult> {     │
│      // Validar token JWT                                                  │
│      return jwtService.verify(authContext.token);                          │
│    }                                                                       │
│                                                                             │
│    async refresh(refreshToken: string): Promise<AuthResult> {              │
│      // No aplica para biometric                                           │
│      throw new NotSupportedError();                                         │
│    }                                                                       │
│                                                                             │
│    async revoke(authContext: AuthContext): Promise<void> {                │
│      // Eliminar sesión biométrica                                         │
│      await biometricService.removeSession(authContext.userId);              │
│    }                                                                       │
│  }                                                                         │
│                                                                             │
│  export const createPlugin = (config: PluginConfig) => {                  │
│    return new BiometricAuthPlugin(config);                                   │
│  };                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. SISTEMA DE CUOTAS Y LÍMITES

### 8.1 Arquitectura de Quota System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TOKEN & QUOTA MANAGEMENT SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                     QuotaManager                                         │ │
│  │                                                                       │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │  DIMENSIONES DE CUOTA                                          │   │ │
│  │  │  ───────────────────────────────────────────                  │   │ │
│  │  │                                                               │   │ │
│  │  │  Por Usuario:           Por Organización:                    │   │ │
│  │  │  • tokens/día          • tokens/día                          │   │ │
│  │  │  • tokens/mes          • tokens/mes                          │   │ │
│  │  │  • costo/día          • costo/mes                           │   │ │
│  │  │  • requests/día       • requests/día                        │   │ │
│  │  │                        • usuarios/máx                         │   │ │
│  │  │                                                               │   │ │
│  │  │  Por Proveedor:        Por Modelo:                           │   │ │
│  │  │  • tokens/día          • tokens/día                         │   │ │
│  │  │  • costo/día           • costo/día                          │   │ │
│  │  │  • requests/día        • requests/día                       │   │ │
│  │  │                                                               │   │ │
│  │  │  Por Proyecto:         Tipo de Límite:                       │   │ │
│  │  │  • tokens/día          • free (sin costo)                   │   │ │
│  │  │  • costo/día           • paid (con costo)                   │   │ │
│  │  │                        • trial (periodo de prueba)           │   │ │
│  │  │                        • enterprise (custom)                 │   │ │
│  │  │                                                               │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      ALERTS & AUTO-SWITCH                              │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │                                                              │   │ │
│  │  │  threshold_warning = 80%  ──▶ Emitir alerta, aún permite    │   │ │
│  │  │                               uso pero warn al usuario        │   │ │
│  │  │                                                              │   │ │
│  │  │  threshold_critical = 95% ──▶ Emitir alerta crítica,        │   │ │
│  │  │                               auto-switch a provider alternativo│  │ │
│  │  │                                                              │   │ │
│  │  │  threshold_exceeded = 100% ──▶ Bloquear uso, notificar     │   │ │
│  │  │                              usuario, sugerir upgrade          │   │ │
│  │  │                                                              │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    AUTO-SWITCH EXAMPLE                                  │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │                                                              │   │ │
│  │  │  Usuario solicita: claude-3-5-sonnet                        │   │ │
│  │  │  Provider: anthropic                                         │   │ │
│  │  │  Cuota Anthropic: 95% usada                                 │   │ │
│  │  │                                                              │   │ │
│  │  │  ┌─────────────────────────────────────────────────────┐   │   │ │
│  │  │  │  QuotaManager.check(providerId='anthropic')          │   │   │ │
│  │  │  │  → { remaining: '5%', status: 'critical' }          │   │   │ │
│  │  │  └─────────────────────────────────────────────────────┘   │   │ │
│  │  │                          │                                 │   │ │
│  │  │                          ▼                                 │   │ │
│  │  │  ┌─────────────────────────────────────────────────────┐   │   │ │
│  │  │  │  PolicyEngine.applyAutoSwitch(request)             │   │   │ │
│  │  │  │                                                       │   │   │ │
│  │  │  │  1. Buscar modelo en otros providers                 │   │   │ │
│  │  │  │  2. ModelRegistry.findProvidersForModel('claude-3-5-sonnet')│   │ │
│  │  │  │  3. Filtrar por cuota disponible                    │   │   │ │
│  │  │  │  4. Seleccionar mejor alternativa                   │   │   │ │
│  │  │  │  5. Ejecutar en: free-claude-code                   │   │   │ │
│  │  │  │                                                       │   │   │
│  │  │  └─────────────────────────────────────────────────────┘   │   │ │
│  │  │                                                              │   │ │
│  │  │  Resultado: Request ejecutada sin interrumpir al usuario    │   │ │
│  │  │  Usuario ve: "Usando free-claude-code (claude-3-5-sonnet)"  │   │ │
│  │  │                                                              │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. INTERFACES DE ADAPTADORES

### 9.1 Interfaz Base IProvider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IProvider INTERFACE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // La única interfaz que el núcleo conoce para providers                   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                          │ │
│  │  interface IProvider extends IPlugin {                                   │ │
│  │                                                                          │ │
│  │    // ═══════════════════════════════════════════════════════════════    │ │
│  │    // PROPIEDADES                                                        │ │
│  │    // ═══════════════════════════════════════════════════════════════    │ │
│  │                                                                          │ │
│  │    readonly id: string;                     // ID único                 │ │
│  │    readonly name: string;                   // Nombre técnico           │ │
│  │    readonly displayName: string;            // Nombre para mostrar    │ │
│  │    readonly version: string;                  // Versión del plugin     │ │
│  │                                                                          │ │
│  │    // ═══════════════════════════════════════════════════════════════    │ │
│  │    // PROVEEDOR (Cómo se presenta al mundo)                            │ │
│  │    // ═══════════════════════════════════════════════════════════════    │ │
│  │                                                                          │ │
│  │    readonly provider: ProviderDefinition;                               │ │
│  │    // provider = {                                                       │ │
│  │    //   id: 'openai',                                                  │ │
│  │    //   name: 'OpenAI',                                                 │ │
│  │    //   category: 'commercial',                                         │ │
│  │    //   protocol: 'openai',                                            │ │
│  │    //   baseUrl: 'https://api.openai.com/v1',                         │ │
│  │    //   authMethods: ['api_key'],                                      │ │
│  │    //   capabilities: [...],                                          │ │
│  │    // }                                                                 │ │
│  │                                                                          │ │
│  │    // ═══════════════════════════════════════════════════════════════    │ │
│  │    // MODELOS                                                           │ │
│  │    // ═══════════════════════════════════════════════════════════════    │ │
│  │                                                                          │ │
│  │    readonly models: ModelDefinition[];                                 │ │
│  │    // models = [                                                         │ │
│  │    //   { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, ... }, │ │
│  │    //   { id: 'gpt-4-turbo', ... },                                    │ │
│  │    // ]                                                                 │ │
│  │                                                                          │ │
│  │    // ═══════════════════════════════════════════════════════════════    │ │
│  │    // MÉTODOS                                                           │ │
│  │    // ═══════════════════════════════════════════════════════════════    │ │
│  │                                                                          │ │
│  │    /**                                                                   │ │
│  │     * Ejecutar request no-streaming                                     │ │
│  │     * @param request Request en formato interno                          │ │
│  │     * @param credentials Credenciales de autenticación                   │ │
│  │     * @returns Response en formato interno                                │ │
│  │     */                                                                  │ │
│  │    execute(                                                              │ │
│  │      request: InternalRequest,                                           │ │
│  │      credentials: ProviderCredentials                                    │ │
│  │    ): Promise<InternalResponse>;                                        │ │
│  │                                                                          │ │
│  │    /**                                                                   │ │
│  │     * Ejecutar request con streaming                                      │ │
│  │     * @param request Request en formato interno                          │ │
│  │     * @param credentials Credenciales de autenticación                   │ │
│  │     * @returns AsyncIterator de chunks de streaming                      │ │
│  │     */                                                                  │ │
│  │    stream(                                                               │ │
│  │      request: InternalRequest,                                           │ │
│  │      credentials: ProviderCredentials                                    │ │
│  │    ): AsyncIterator<StreamChunk>;                                        │ │
│  │                                                                          │ │
│  │    /**                                                                   │ │
│  │     * Listar modelos disponibles                                        │ │
│  │     * @returns Lista de modelos                                         │ │
│  │     */                                                                  │ │
│  │    listModels(): Promise<ModelDefinition[]>;                            │ │
│  │                                                                          │ │
│  │    /**                                                                   │ │
│  │     * Verificar salud del provider                                      │ │
│  │     * @returns Estado de salud                                          │ │
│  │     */                                                                  │ │
│  │    healthCheck(): Promise<ProviderHealth>;                              │ │
│  │                                                                          │ │
│  │    /**                                                                   │ │
│  │     * Obtener credenciales específicas para este provider                │ │
│  │     * (Ej: OAuth flow, etc.)                                            │ │
│  │     */                                                                  │ │
│  │    getAuthFlow?(): AuthFlow;                                            │ │
│  │  }                                                                      │ │
│  │                                                                          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  FORMATOS INTERNOS (Lo que el núcleo entiende):                           │
│  ───────────────────────────────────────────────                            │
│                                                                             │
│  InternalRequest = {                                                        │
│    model: string;                    // ID del modelo                     │
│    messages: Message[];              // Mensajes                         │
│    temperature?: number;             // 0-2                             │
│    maxTokens?: number;                // Max tokens de output             │
│    stream?: boolean;                  // Streaming                        │
│    tools?: Tool[];                   // Herramientas                      │
│    // ... otros parámetros comunes                                        │
│  }                                                                           │
│                                                                             │
│  InternalResponse = {                                                        │
│    model: string;                     // Modelo usado                     │
│    content: string;                   // Contenido                       │
│    usage: {                           // Usage info                     │
│      inputTokens: number;                                            │
│      outputTokens: number;                                           │
│    };                                                                       │
│    finishReason: string;              // stop | length | etc.            │
│    provider: string;                  // Provider usado                  │
│    latencyMs: number;                 // Latencia                        │
│  }                                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Ejemplo: OpenAI Adapter

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPENAI ADAPTER IMPLEMENTATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // plugins/providers/openai/index.ts                                       │
│  import { IProvider, InternalRequest, InternalResponse, StreamChunk } from '@core/interfaces'; │
│                                                                             │
│  export class OpenAIProvider implements IProvider {                         │
│    readonly id = 'openai';                                                │
│    readonly name = 'OpenAI';                                               │
│    readonly displayName = 'OpenAI';                                        │
│    readonly version = '1.0.0';                                             │
│    readonly type = 'provider' as const;                                    │
│                                                                             │
│    // Definición del provider                                              │
│    readonly provider: ProviderDefinition = {                                 │
│      id: 'openai',                                                        │
│      name: 'OpenAI',                                                       │
│      category: 'commercial',                                               │
│      protocol: 'openai',                                                   │
│      baseUrl: 'https://api.openai.com/v1',                                │
│      authMethods: ['api_key'],                                             │
│      capabilities: ['chat', 'function_calling', 'vision'],                 │
│      // ...                                                                 │
│    };                                                                      │
│                                                                             │
│    // Modelos disponibles                                                   │
│    readonly models: ModelDefinition[] = [                                   │
│      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, ... },       │
│      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, ... }, │
│      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16385, ... }, │
│    ];                                                                      │
│                                                                             │
│    // Ejecutar request                                                      │
│    async execute(request: InternalRequest): Promise<InternalResponse> {    │
│      // 1. Transformar request interno → formato OpenAI                     │
│      const openAIRequest = this.toOpenAIFormat(request);                   │
│                                                                             │
│      // 2. Hacer llamada HTTP                                               │
│      const response = await fetch(`${this.baseUrl}/chat/completions`, {    │
│        method: 'POST',                                                     │
│        headers: {                                                          │
│          'Content-Type': 'application/json',                              │
│          'Authorization': `Bearer ${this.apiKey}`                        │
│        },                                                                  │
│        body: JSON.stringify(openAIRequest)                                 │
│      });                                                                   │
│                                                                             │
│      // 3. Transformar respuesta OpenAI → formato interno                   │
│      return this.fromOpenAIFormat(await response.json());                  │
│    }                                                                       │
│                                                                             │
│    // Streaming                                                             │
│    async *stream(request: InternalRequest): AsyncIterator<StreamChunk> {   │
│      const response = await fetch(`${this.baseUrl}/chat/completions`, {    │
│        method: 'POST',                                                     │
│        headers: {...},                                                      │
│        body: JSON.stringify({ ...this.toOpenAIFormat(request), stream: true }) │
│      });                                                                   │
│                                                                             │
│      for await (const line of response.body) {                             │
│        if (line.startsWith('data: ')) {                                   │
│          const data = JSON.parse(line.slice(6));                          │
│          if (data.choices[0].delta.content) {                            │
│            yield { type: 'content', content: data.choices[0].delta.content }; │
│          }                                                                │
│        }                                                                  │
│      }                                                                     │
│    }                                                                       │
│                                                                             │
│    // Transformaciones                                                      │
│    private toOpenAIFormat(request: InternalRequest) {                      │
│      return {                                                              │
│        model: request.model,                                                │
│        messages: request.messages,                                          │
│        temperature: request.temperature,                                    │
│        max_tokens: request.maxTokens,                                      │
│        tools: request.tools?.map(tool => ({                                │
│          type: 'function',                                                 │
│          function: { name: tool.name, parameters: tool.parameters }        │
│        }))                                                                 │
│      };                                                                    │
│    }                                                                       │
│                                                                             │
│    private fromOpenAIFormat(response: any): InternalResponse {             │
│      return {                                                               │
│        model: response.model,                                               │
│        content: response.choices[0].message.content,                       │
│        usage: {                                                             │
│          inputTokens: response.usage.prompt_tokens,                         │
│          outputTokens: response.usage.completion_tokens                     │
│        },                                                                   │
│        finishReason: response.choices[0].finish_reason,                   │
│        provider: 'openai',                                                  │
│        latencyMs: response.latency                                          │
│      };                                                                    │
│    }                                                                       │
│  }                                                                          │
│                                                                             │
│  export const createPlugin = (config: PluginConfig) => {                   │
│    return new OpenAIProvider(config);                                       │
│  };                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. FLUJO DE SOLICITUD UNIVERSAL

### 10.1 Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIVERSAL REQUEST FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USER ────▶ LibreChat UI                                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  UNIFIED GATEWAY (Core Layer 1)                                        │ │
│  │  ════════════════════════════════════════════                        │ │
│  │                                                                       │ │
│  │  1. AUTHENTICATE                                                      │ │
│  │     AuthCore.validate(request)                                        │ │
│  │     → IAuthPlugin.validate(token)                                     │ │
│  │                                                                       │ │
│  │  2. RATE LIMIT                                                        │ │
│  │     AuthCore.checkRateLimit(userId, providerId)                      │ │
│  │     → Redis counter + window                                          │ │
│  │                                                                       │ │
│  │  3. VALIDATE REQUEST                                                  │ │
│  │     RequestOrchestrator.validate(request)                             │ │
│  │     → Check model exists, params valid, etc.                         │ │
│  │                                                                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  ORCHESTRATION LAYER (Core Layer 2)                                   │ │
│  │  ════════════════════════════════════════════                          │ │
│  │                                                                       │ │
│  │  4. POLICY CHECK                                                       │ │
│  │     PolicyCore.evaluate(request, userPolicies)                        │ │
│  │     → Apply cost limits, model restrictions, etc.                    │ │
│  │                                                                       │ │
│  │  5. CONTEXT LOAD                                                      │ │
│  │     ContextCore.load(request.conversationId)                          │ │
│  │     → Load history, truncate if needed, inject system prompt          │ │
│  │                                                                       │ │
│  │  6. ROUTE                                                             │ │
│  │     RouterCore.route(request)                                         │ │
│  │     → See detailed routing below                                      │ │
│  │                                                                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  ROUTING (Detailed)                                                   │ │
│  │  ════════════════════════════════════════════                        │ │
│  │                                                                       │ │
│  │  6.1 MODEL → PROVIDERS                                                │ │
│  │      ModelRegistry.findProvidersForModel(request.model)               │ │
│  │      → [provider1, provider2, provider3]                              │ │
│  │                                                                       │ │
│  │  6.2 FILTER BY HEALTH                                                 │ │
│  │      For each provider: HealthCheck(provider)                         │ │
│  │      → Remove unhealthy                                              │ │
│  │                                                                       │ │
│  │  6.3 FILTER BY QUOTA                                                  │ │
│  │      For each provider: QuotaManager.getRemaining(provider)           │ │
│  │      → Remove exhausted, warn on low                                  │ │
│  │                                                                       │ │
│  │  6.4 SCORE & SELECT                                                   │ │
│  │      For each candidate:                                              │ │
│  │        score = PolicyCore.calculateScore(provider, request)            │ │
│  │      → Select highest score                                           │ │
│  │      → Generate fallbacks list                                        │ │
│  │                                                                       │ │
│  │  6.5 CHECK AUTO-SWITCH                                               │ │
│  │      If selected provider quota < threshold:                           │ │
│  │        → Find alternative provider for same model                     │ │
│  │        → Execute on alternative (transparent to user)                 │ │
│  │                                                                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  EXECUTION (Plugin Layer)                                             │ │
│  │  ════════════════════════════════════════════                          │ │
│  │                                                                       │ │
│  │  7. GET CREDENTIALS                                                   │ │
│  │     CredentialManager.getForProvider(selectedProvider)                 │ │
│  │     → Decrypt API key, OAuth token, etc.                             │ │
│  │                                                                       │ │
│  │  8. EXECUTE PLUGIN                                                    │ │
│  │     PluginManager.getPlugin(selectedProvider)                          │ │
│  │     → IProvider.execute(request, credentials)                         │ │
│  │     → Provider translates to its protocol, calls external API          │ │
│  │     → Translates response back to InternalResponse                     │ │
│  │                                                                       │ │
│  │  9. RETRY ON FALLBACK (if needed)                                     │ │
│  │     If error and fallbacks available:                                  │ │
│  │       → Select next fallback                                         │ │
│  │       → Retry from step 7                                            │ │
│  │                                                                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  POST-EXECUTION (Core Layer 3)                                       │ │
│  │  ══════════════════════════════════════════════                        │ │
│  │                                                                       │ │
│  │  10. RECORD USAGE                                                     │ │
│  │      TokenQuotaManager.record({                                        │ │
│  │        userId, providerId, model,                                     │ │
│  │        inputTokens, outputTokens, cost                                │ │
│  │      })                                                               │ │
│  │                                                                       │ │
│  │  11. CHECK QUOTA ALERTS                                               │ │
│  │      If quota.threshold_warning:                                       │ │
│  │        → Emit event: quota.warning                                    │ │
│  │      If quota.threshold_critical:                                      │ │
│  │        → Emit event: quota.critical                                   │ │
│  │        → Trigger auto-switch for future requests                      │ │
│  │                                                                       │ │
│  │  12. RECORD METRICS                                                   │ │
│  │      MetricsCore.record({                                             │ │
│  │        providerId, model, latency, success, cost                     │ │
│  │      })                                                               │ │
│  │                                                                       │ │
│  │  13. AUDIT LOG                                                        │ │
│  │      AuditLogger.log({                                                │ │
│  │        action: 'request.completed',                                   │ │
│  │        userId, providerId, model, cost                                │ │
│  │      })                                                               │ │
│  │                                                                       │ │
│  │  14. PUBLISH EVENT                                                    │ │
│  │      EventBus.publish('request.completed', {                          │ │
│  │        traceId, userId, providerId, model                            │ │
│  │      })                                                               │ │
│  │                                                                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  RESPONSE ────▶ LibreChat UI ────▶ USER                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. CENTRO DE ADMINISTRACIÓN (DASHBOARD)

### 11.1 Paneles del Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIVERSAL AI GATEWAY DASHBOARD                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ NAVIGATION: [Overview] [Providers] [Models] [Auth] [Quotas] [Costs]  ││
│  │            [Performance] [Errors] [History] [Audit] [Settings]        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Overview                                                          ││
│  │  ═══════════════                                                        ││
│  │                                                                         ││
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐         ││
│  │  │ Requests   │ │ Latency   │ │   Cost    │ │ Providers  │         ││
│  │  │  125,847  │ │   234ms   │ │  $12,345  │ │   12/15    │         ││
│  │  │  ▲ 15%    │ │  ▼ 8%    │ │  ▲ 3%     │ │  3 warnings│         ││
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘         ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │  Provider Distribution (Live)                                 │      ││
│  │  │                                                              │      ││
│  │  │  OpenAI    ████████████████████████░░░░░░░░░  35%           │      ││
│  │  │  Anthropic ██████████████████░░░░░░░░░░░░░░░  25%           │      ││
│  │  │  FreeCC    ██████████████░░░░░░░░░░░░░░░░░░░  20%           │      ││
│  │  │  Ollama    ████████████░░░░░░░░░░░░░░░░░░░░░  15%           │      ││
│  │  │  Other     █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░   5%           │      ││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Providers                                                         ││
│  │  ══════════════════                                                      ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │ Name        │Category│Status│Latency│Quota│Health│Actions│      ││
│  │  ├─────────────┼────────┼───────┼────────┼─────┼───────┼────────┤      ││
│  │  │ 🟢 OpenAI  │Commercial│Active │ 145ms │ 78% │  ✓    │[⚙️][📊]│      ││
│  │  │ 🟢 Anthropic│Commercial│Active │ 320ms │ 45% │  ✓    │[⚙️][📊]│      ││
│  │  │ 🟡 FreeCC   │Community│Active │ 180ms │ 80% │  ✓    │[⚙️][📊]│      ││
│  │  │ 🟢 Ollama   │Opensource│Active │  50ms │100% │  ✓    │[⚙️][📊]│      ││
│  │  │ 🔴 LiteLLM  │SelfHosted│ Error │   -   │  -  │  ✗    │[⚙️][📊]│      ││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  │  [+ Add Provider] [Enable All] [Disable All] [Refresh Status]        ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Models                                                            ││
│  │  ═════════════                                                          ││
│  │                                                                         ││
│  │  Filter: [All] [Chat] [Reasoning] [Vision] [Code] | Provider ▼       ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │ Model                │ Provider(s)       │Quota│ Cost │Status│      ││
│  │  ├─────────────────────┼───────────────────┼─────┼──────┼──────┤      ││
│  │  │ Claude 3.5 Sonnet  │ Anthropic, FreeCC│ 45% │ $3   │ 🟢   │      ││
│  │  │ GPT-4o             │ OpenAI           │ 78% │ $5   │ 🟢   │      ││
│  │  │ Llama 3.1 70B      │ Ollama, LiteLLM  │100% │ $0   │ 🟢   │      ││
│  │  │ Gemini 1.5 Pro     │ Google           │ 12% │$0.5  │ 🟡   │      ││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  │  Note: Same model across multiple providers shows availability         ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Quotas                                                            ││
│  │  ═══════════                                                            ││
│  │                                                                         ││
│  │  Scope: [Organization: Acme Corp ▼] [Project: All ▼]                 ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │  Daily Tokens       ████████████████████░░░░░░░ 156K/200K 78%│      ││
│  │  │  Monthly Tokens     ██████████░░░░░░░░░░░░░░░ 1.2M/5M   24%│      ││
│  │  │  Daily Cost         ██████░░░░░░░░░░░░░░░░░░ $234/$1000 23%│      ││
│  │  │                                                              │      ││
│  │  │  ⚠️ Google Gemini: 12% remaining - Consider adding quota    │      ││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  │  [+ Set Limit] [Configure Alerts] [View by User] [View by Model]      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TAB: Audit (Immutable Log)                                             ││
│  │  ═══════════════════════                                                ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────┐      ││
│  │  │ Time          │ Action                │ User      │ Result │Hash ││
│  │  ├───────────────┼──────────────────────┼───────────┼────────┼─────┤│
│  │  │ 2026-07-22 10 │ request.completed   │ john@...  │ ✅     │abc..││
│  │  │ 2026-07-22 09 │ quota.warning       │ system    │ ✅     │def..││
│  │  │ 2026-07-22 08 │ api_key.rotated    │ admin     │ ✅     │ghi..││
│  │  │ 2026-07-22 07 │ provider.enabled   │ admin     │ ✅     │jkl..││
│  │  └──────────────────────────────────────────────────────────────┘      ││
│  │                                                                         ││
│  │  [Download CSV] [Verify Integrity] [Filter by Action] [Date Range]    ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. EXTENSIBILIDAD DEMOSTRABLE

### 12.1 Cómo Agregar Cualquier Cosa Sin Modificar el Núcleo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EXTENSIBILITY PROOF                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════════╗ │
│  ║  CASO 1: Agregar un NUEVO PROVEEDOR                                     ║ │
│  ╠═══════════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                            ║ │
│  ║  ACCIÓN: Agregar soporte para "Mistral AI"                             ║ │
│  ║                                                                            ║ │
│  ║  PASOS:                                                                 ║ │
│  ║  1. mkdir plugins/providers/mistral                                      ║ │
│  ║  2. Crear index.ts implements IProvider                                  ║ │
│  ║  3. Crear manifest.json                                                  ║ │
│  ║  4. Registrar en pluginRegistry                                         ║ │
│  ║                                                                            ║ │
│  ║  NÚCLEO: ❌ NO CAMBIA                                                   ║ │
│  ║                                                                            ║ │
║  ╚═══════════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════════╗ │
│  ║  CASO 2: Agregar un NUEVO MODELO a proveedor existente                  ║ │
│  ╠═══════════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                            ║ │
│  ║  ACCIÓN: Agregar "gpt-4o-2024-08-13" a OpenAI                         ║ │
│  ║                                                                            ║ │
│  ║  PASOS:                                                                 ║ │
│  ║  1. OpenAIProvider.models.push({ id: 'gpt-4o-2024-08-13', ... })      ║ │
│  ║  2. ModelRegistry.register({ id: 'gpt-4o-2024-08-13', ... })          ║ │
│  ║                                                                            ║ │
│  ║  NÚCLEO: ❌ NO CAMBIA                                                   ║ │
│  ║                                                                            ║ │
║  ╚═══════════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════════╗ │
│  ║  CASO 3: Agregar un NUEVO MÉTODO DE AUTENTICACIÓN                       ║ │
│  ╠═══════════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                            ║ │
│  ║  ACCIÓN: Agregar autenticación biométrica (TouchID, FaceID)            ║ │
│  ║                                                                            ║ │
│  ║  PASOS:                                                                 ║ │
│  ║  1. mkdir plugins/auth/biometric                                         ║ │
│  ║  2. Crear index.ts implements IAuthPlugin                               ║ │
│  ║  3. AuthenticationManager.register(biometricPlugin)                     ║ │
│  ║                                                                            ║ │
│  ║  NÚCLEO: ❌ NO CAMBIA                                                   ║ │
│  ║                                                                            ║ │
║  ╚═══════════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════════╗ │
│  ║  CASO 4: Agregar un NUEVO MOTOR DE INFERENCIA (Local)                  ║ │
│  ╠═══════════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                            ║ │
│  ║  ACCIÓN: Agregar soporte para "SGLang" (nuevo proyecto)                ║ │
│  ║                                                                            ║ │
│  ║  PASOS:                                                                 ║ │
│  ║  1. mkdir plugins/providers/sglang                                       ║ │
│  ║  2. Implementar IProvider con protocolo propio de SGLang                  ║ │
│  ║  3. Registrar en pluginRegistry                                         ║ │
│  ║                                                                            ║ │
│  ║  NÚCLEO: ❌ NO CAMBIA                                                   ║ │
│  ║                                                                            ║ │
║  ╚═══════════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════════╗ │
│  ║  CASO 5: Agregar una NUEVA API GRATUITA (ej: novita.ai)                ║ │
│  ╠═══════════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                            ║ │
│  ║  ACCIÓN: Agregar proveedor gratuito "novita.ai"                         ║ │
│  ║                                                                            ║ │
│  ║  PASOS:                                                                 ║ │
│  ║  1. mkdir plugins/providers/novita                                       ║ │
│  ║  2. Implementar IProvider                                               ║ │
│  ║  3. Registrar                                                            ║ │
│  ║                                                                            ║ │
│  ║  NÚCLEO: ❌ NO CAMBIA                                                   ║ │
│  ║                                                                            ║ │
║  ╚═══════════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════════╗ │
│  ║  CASO 6: Agregar un NUEVO PROTOCOLO DE COMUNICACIÓN                    ║ │
│  ╠═══════════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                            ║ │
│  ║  ACCIÓN: Soportar protocolo gRPC para algún provider                    ║ │
│  ║                                                                            ║ │
│  ║  PASOS:                                                                 ║ │
│  ║  1. Crear plugins/providers/enterprise-grpc                             ║ │
│  ║  2. Implementar IProvider usando cliente gRPC                          ║ │
│  ║  3. Registrar                                                            ║ │
│  ║                                                                            ║ │
│  ║  NÚCLEO: ❌ NO CAMBIA                                                   ║ │
│  ║                                                                            ║ │
║  ╚═══════════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════════╗ │
│  ║  CASO 7: ELIMINAR LiteLLM COMPLETAMENTE                                ║ │
│  ╠═══════════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                            ║ │
│  ║  ACCIÓN: Quitar LiteLLM como proveedor                                  ║ │
│  ║                                                                            ║ │
│  ║  PASOS:                                                                 ║ │
│  ║  1. Comment out: PluginManager.unregister('litellm')                    ║ │
│  ║  2. Eliminar carpeta plugins/providers/litellm                           ║ │
│  ║                                                                            ║ │
│  ║  SISTEMA: ✅ Sigue funcionando con todos los demás providers             ║ │
│  ║  LiteLLM: ❌ Ya no está disponible                                      ║ │
│  ║                                                                            ║ │
║  ╚═══════════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  CONCLUSIÓN:                                                                │
│                                                                             │
│  ✅ El núcleo NUNCA cambia                                                  │
│  ✅ Cualquier extensión = agregar archivo(s) nuevo(s)                         │
│  ✅ Cualquier extensión puede removerse sin afectar otras                    │
│  ✅ LiteLLM es UN plugin más, puede eliminarse si se desea                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. COMPARATIVA Y MEJORAS

### 13.1 Comparativa: Arquitectura Anterior vs Universal

| Aspecto | v2.0 (Anterior) | v3.0 (Universal) |
|---------|------------------|-------------------|
| **LiteLLM** | Centro del sistema | Solo un plugin más |
| **Proveedores** | Acoplados al gateway | Plugins independientes |
| **Modelos** | Ligados a providers | Entidades separadas |
| **Autenticación** | Fija | Plugins de auth |
| **Extensibilidad** | Moderada | Infinita |
| **Dependencias** | Fuertes (LiteLLM) | Cero |
| **Plugin System** | No existe | Full-featured |
| **Auto-switch** | Básico | Completo con model registry |

### 13.2 Mejoras Clave

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MEJORAS vs ARQUITECTURA ANTERIOR                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. PROVIDER-AGNOSTIC                                                      │
│     ─────────────────────                                                   │
│     ANTES: El gateway conocía todos los proveedores directamente           │
│     AHORA: El gateway solo conoce la interfaz IProvider                     │
│                                                                             │
│  2. MODEL-PROVIDER SEPARATION                                              │
│     ───────────────────────────                                             │
│     ANTES: Modelo → Provider era 1:1                                       │
│     AHORA: Modelo → Providers puede ser 1:N                                  │
│                                                                             │
│  3. ZERO LOCK-IN                                                            │
│     ─────────────                                                          │
│     ANTES: LiteLLM era esencial para el sistema                            │
│     AHORA: LiteLLM es opcional, puede eliminarse completamente              │
│                                                                             │
│  4. PLUGIN ARCHITECTURE                                                     │
│     ────────────────────                                                   │
│     ANTES: Agregar provider requería modificar gateway                       │
│     AHORA: Agregar provider = crear carpeta + archivos                       │
│                                                                             │
│  5. UNIVERSAL AUTH                                                         │
│     ───────────────                                                        │
│     ANTES: Solo API Keys y OAuth fijos                                      │
│     AHORA: Cualquier método de auth como plugin                             │
│                                                                             │
│  6. ADVANCED ROUTING                                                        │
│     ──────────────────                                                     │
│     ANTES: Seleccionar provider por modelo                                   │
│     AHORA: Seleccionar provider por modelo, luego provider óptimo           │
│            considerando salud, cuota, costo, latencia                       │
│                                                                             │
│  7. AUTO-SWITCH COMPLETO                                                   │
│     ───────────────────                                                     │
│     ANTES: No había auto-switch                                             │
│     AHORA: Si quota baja, automáticamente usar otro provider              │
│            para el mismo modelo                                             │
│                                                                             │
│  8. FULL OBSERVABILITY                                                     │
│     ───────────────────                                                    │
│     ANTES: Métricas básicas                                                │
│     AHORA: Dashboard completo con tabs dedicados                            │
│            Providers, Models, Quotas, Costs, Audit                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. PLAN DE IMPLEMENTACIÓN

### 14.1 Fases de Implementación

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 1: CORE FOUNDATION (Semanas 1-4)                                      ║
║  ══════════════════════════════════════════════════                          ║
║                                                                            ║
║  Objetivo: Establecer el núcleo de la plataforma universal                  ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 1.1 PluginManager (discovery, load, unload, reload)                 │ ║
║  │ □ 1.2 IProvider interface + internal request/response formats         │ ║
║  │ □ 1.3 IAuthPlugin interface                                          │ ║
║  │ □ 1.4 ProviderRegistry + ModelRegistry (separados)                     │ ║
║  │ □ 1.5 Basic RequestOrchestrator                                      │ ║
║  │ □ 1.6 EventBus (Pub/Sub)                                             │ ║
║  │ □ 1.7 Plugin manifest.json schema                                     │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 2: PLUGIN ADAPTERS (Semanas 5-8)                                     ║
║  ═══════════════════════════════════════════                                 ║
║                                                                            ║
║  Objetivo: Implementar plugins para los providers principales               ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 2.1 OpenAI Plugin                                                 │ ║
║  │ □ 2.2 Anthropic Plugin                                               │ ║
║  │ □ 2.3 Ollama Plugin (Open Source)                                    │ ║
║  │ □ 2.4 LiteLLM Plugin (como UNO de muchos, no especial)             │ ║
║  │ □ 2.5 Free Claude Code Plugin                                        │ ║
║  │ □ 2.6 OpenWebUI Compatible Plugin (para clientes existentes)        │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 3: ROUTING & POLICY (Semanas 9-12)                                  ║
║  ═════════════════════════════════════════════                              ║
║                                                                            ║
║  Objetivo: Sistema de routing inteligente y políticas                      ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 3.1 Model → Provider routing (multi-provider per model)            │ ║
║  │ □ 3.2 Health Monitor integration                                     │ ║
║  │ □ 3.3 Quota Manager (tokens, costs, dimensions)                       │ ║
║  │ □ 3.4 Auto-switch when quota low                                     │ ║
║  │ □ 3.5 Policy Engine (cost limits, model restrictions)               │ ║
║  │ □ 3.6 Fallback chain implementation                                   │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 4: AUTH & SECURITY (Semanas 13-16)                                   ║
║  ══════════════════════════════════════════════                               ║
║                                                                            ║
║  Objetivo: Sistema de autenticación universal y seguridad                   ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 4.1 API Key Auth Plugin                                            │ ║
║  │ □ 4.2 OAuth Plugin                                                   │ ║
║  │ □ 4.3 JWT Plugin                                                    │ ║
║  │ □ 4.4 CredentialManager (encrypted storage)                           │ ║
║  │ □ 4.5 AuditLogger (hash chain)                                      │ ║
║  │ □ 4.6 Rate Limiting (per-user, per-provider)                        │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 5: DASHBOARD & OBSERVABILITY (Semanas 17-20)                        ║
║  ═══════════════════════════════════════════════════════════                ║
║                                                                            ║
║  Objetivo: Centro de administración completo                               ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 5.1 Dashboard: Overview                                           │ ║
║  │ □ 5.2 Dashboard: Providers (status, health, latency)                │ ║
║  │ □ 5.3 Dashboard: Models (multi-provider view)                       │ ║
║  │ □ 5.4 Dashboard: Quotas & Costs                                     │ ║
║  │ □ 5.5 Dashboard: Audit Log (immutable)                             │ ║
║  │ □ 5.6 Prometheus metrics endpoint                                    │ ║
║  │ □ 5.7 Real-time updates (WebSocket/SSE)                              │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 6: ADDITIONAL PROVIDERS (Semanas 21-24)                             ║
║  ════════════════════════════════════════════════════                       ║
║                                                                            ║
║  Objetivo: Agregar más providers como plugins                              ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 6.1 Google Gemini Plugin                                            │ ║
║  │ □ 6.2 Groq Plugin                                                    │ ║
║  │ □ 6.3 DeepSeek Plugin                                                │ ║
║  │ □ 6.4 Cohere Plugin                                                  │ ║
║  │ □ 6.5 Mistral Plugin                                                 │ ║
║  │ □ 6.6 Together AI Plugin                                            │ ║
║  │ □ 6.7 LM Studio Plugin (Local)                                       │ ║
║  │ □ 6.8 vLLM Plugin (Local)                                            │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║  FASE 7: PRODUCTION HARDENING (Semanas 25-28)                             ║
║  ══════════════════════════════════════════════════════════                  ║
║                                                                            ║
║  Objetivo: Estabilización para producción                                   ║
║                                                                            ║
║  Entregables:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │ □ 7.1 Load testing & optimization                                   │ ║
║  │ □ 7.2 Chaos engineering (simulate failures)                          │ ║
║  │ □ 7.3 Security audit                                                 │ ║
║  │ □ 7.4 Documentation complete                                       │ ║
║  │ □ 7.5 Runbooks de operaciones                                        │ ║
║  │ □ 7.6 Rollback procedures                                            │ ║
║  │ □ 7.7 v3.0.0 Release                                                │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## RESUMEN

Esta arquitectura **Universal AI Gateway Platform** garantiza:

| Garantía | Cómo se Logra |
|----------|---------------|
| **LiteLLM es opcional** | Es UN plugin más, puede eliminarse |
| **Núcleo estable** | Solo interfaces, nunca cambia |
| **Extensibilidad infinita** | Agregar = crear archivos |
| **Model-Provider separation** | Un modelo, múltiples providers |
| **Zero coupling** | Plugins completamente aislados |
| **Provider isolation** | Fallos no se propagan |
| **Auto-switch** | Transparent failover |
| **Universal auth** | Cualquier método como plugin |

---

*Documento generado: 2026-07-22*  
*Versión: 3.0.0*  
*Estado: PARA VALIDACIÓN*
