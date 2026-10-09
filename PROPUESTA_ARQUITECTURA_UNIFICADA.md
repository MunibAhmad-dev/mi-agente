# PROPUESTA DE ARQUITECTURA UNIFICADA
## Mi LibreChat - Fase 3: Integración Profesional

**Versión:** 1.0.0  
**Fecha:** 2026-07-22  
**Estado:** PARA VALIDACIÓN  
**Auditorías base:** AUDITORIA_REPO_APIKEY.md + AUDITORIA_REPO_FREE_CLAUDE_CODE.md

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estado Actual y Análisis](#2-estado-actual-y-análisis)
3. [Arquitectura Objetivo](#3-arquitectura-objetivo)
4. [Componentes del Sistema](#4-componentes-del-sistema)
5. [Flujo de Solicitudes](#5-flujo-de-solicitudes)
6. [API Key Manager - Análisis](#6-api-key-manager---análisis)
7. [Free Claude Code - Integración](#7-free-claude-code---integración)
8. [Capability Router](#8-capability-router)
9. [Capability Orchestrator](#9-capability-orchestrator)
10. [Diagrama de Componentes](#10-diagrama-de-componentes)
11. [Mejoras Propuestas](#11-mejoras-propuestas)
12. [Riesgos Detectados](#12-riesgos-detectados)
13. [Estrategia de Integración por Fases](#13-estrategia-de-integración-por-fases)
14. [Compatibilidad y Extensibilidad](#14-compatibilidad-y-extensibilidad)

---

## 1. RESUMEN EJECUTIVO

Esta propuesta presenta una **arquitectura profesional, escalable y lista para producción** que integra todos los componentes del ecosistema Mi LibreChat:

| Componente | Rol | Estado Actual |
|------------|-----|---------------|
| LibreChat | Interfaz de usuario | ✅ Implementado |
| LiteLLM Gateway | Proxy central de LLM | ✅ En uso |
| API Key Manager | Gestión de credenciales | 🔄 Requiere integración |
| Free Claude Code | Proveedor Claude | 🔄 Requiere integración |
| MCP Server | Extensibilidad | 🔄 En desarrollo |
| Capability Router | Routing por capacidades | 🔄 En desarrollo |
| Capability Orchestrator | Orquestación inteligente | 🔄 En desarrollo |

### Objetivos Principales

1. **Modularidad Total**: Cada componente con única responsabilidad
2. **Sustituibilidad**: Cualquier proveedor puede reemplazarse sin afectar otros
3. **Escalabilidad**: Arquitectura preparada para alta demanda
4. **Resiliencia**: Manejo robusto de errores y fallos
5. **Observabilidad**: Trazabilidad completa del sistema

---

## 2. ESTADO ACTUAL Y ANÁLISIS

### 2.1 Repositorios Analizados

#### API Key Manager (aoi555/api-key)

| Aspecto | Estado | Evaluación |
|---------|--------|------------|
| Arquitectura | Microservicios + Celery | 8/10 |
| Seguridad | JWT + Fernet encryption | 6/10 ⚠️ |
| Escalabilidad | PostgreSQL + Redis | 6/10 ⚠️ |
| Automatización | Provisioning automático | 9/10 ✅ |
| Testing | 8 archivos de test | 5/10 ⚠️ |

**Componentes Clave:**
- FastAPI Backend (10 routers)
- Celery Workers (9 workers)
- PostgreSQL + Redis
- Dashboard WebSocket
- Playwright Automation

**Riesgos Principales:**
- Credenciales en logs
- .env en repos
- No MFA
- LiteLLM como SPOF

#### Free Claude Code (alishahryar1/free-claude-code)

| Aspecto | Estado | Evaluación |
|---------|--------|------------|
| Arquitectura | Hexagonal (Ports & Adapters) | 9/10 ✅ |
| Protocolo | Anthropic completo + OpenAI | 9/10 ✅ |
| Providers | 25+ providers | 9/10 ✅ |
| Testing | Suite comprehensiva | 7/10 ✅ |
| Extensibilidad | Plugin system nativo | 8/10 ✅ |

**Componentes Clave:**
- FastAPI Server
- Provider Runtime (25+)
- CLI Launchers
- Discord/Telegram integration
- SSE Streaming

**Compatibilidad LiteLLM:**
- Free Claude Code → Coding agents (Claude Code, VS Code)
- LiteLLM → Gateway genérico para otras integraciones

### 2.2 Gap Analysis

| Funcionalidad | API Key Manager | Free Claude Code | Mi LibreChat | Gap |
|---------------|-----------------|------------------|--------------|-----|
| Gestión de claves | ✅ Completo | ❌ Externo | ⚠️ Parcial | 🔴 |
| Routing inteligente | ✅ AiRouter | ❌ Externo | ⚠️ Parcial | 🔴 |
| Provider Claude | ❌ No | ✅ Completo | ❌ No | 🔴 |
| Capability routing | ❌ No | ❌ No | ⚠️ Parcial | 🟡 |
| Streaming | ❌ Wontfix | ✅ SSE | ✅ SSE | ✅ |
| Multi-tenancy | ⚠️ Parcial | ❌ No | ⚠️ Parcial | 🟡 |

---

## 3. ARQUITECTURA OBJETIVO

### 3.1 Principios de Diseño

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRINCIPIOS DE ARQUITECTURA                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. SINGLE RESPONSIBILITY (SRP)                                         │
│     Cada componente tiene UNA única responsabilidad                       │
│                                                                          │
│  2. DEPENDENCY INVERSION (DIP)                                         │
│     Depender de abstracciones, no de implementaciones                   │
│                                                                          │
│  3. OPEN/CLOSED (OCP)                                                  │
│     Abierto para extensión, cerrado para modificación                    │
│                                                                          │
│  4. INTERFACE SEGREGATION (ISP)                                         │
│     Interfaces específicas para cada cliente                            │
│                                                                          │
│  5. REPLACEABILITY                                                      │
│     Cualquier proveedor puede sustituirse sin cambios en otros módulos   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Capas de la Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA POR CAPAS                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PRESENTATION LAYER                           │   │
│  │                    (Interfaz de Usuario)                        │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │   │
│  │  │  LibreChat   │ │  OpenWebUI   │ │  Mission Control UI    │ │   │
│  │  │  (React)     │ │              │ │  (Dashboard)           │ │   │
│  │  └──────────────┘ └──────────────┘ └────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       GATEWAY LAYER                             │   │
│  │                    (Punto de Entrada)                            │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │              Unified Gateway (LiteLLM + Custom)         │   │   │
│  │  │  • Authentication    • Rate Limiting    • Logging      │   │   │
│  │  │  • Request Validation • Metrics          • CORS         │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATION LAYER                          │   │
│  │                  (Decisiones Inteligentes)                      │   │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────┐ │   │
│  │  │ Capability       │ │ Context          │ │ Execution       │ │   │
│  │  │ Router           │ │ Manager          │ │ Engine          │ │   │
│  │  └──────────────────┘ └──────────────────┘ └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       SERVICE LAYER                              │   │
│  │                   (Lógica de Negocio)                            │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │   │
│  │  │  Event Bus   │ │  Key Manager │ │  Capability Engine     │ │   │
│  │  │  Service     │ │  (API Keys)  │ │  (Model Selection)    │ │   │
│  │  └──────────────┘ └──────────────┘ └────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PROVIDER LAYER                               │   │
│  │              (Adaptadores de Proveedores)                        │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │   │
│  │  │  OpenAI      │ │  Anthropic    │ │  Free Claude │          │   │
│  │  │  Adapter     │ │  Adapter      │ │  Code Adapter│          │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘          │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │   │
│  │  │  LiteLLM     │ │  Ollama      │ │  Groq        │          │   │
│  │  │  Adapter     │ │  Adapter      │ │  Adapter     │          │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     EXTERNAL PROVIDERS                           │   │
│  │                 (APIs Externas de LLM)                          │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │   │
│  │  │  OpenAI API  │ │  Anthropic   │ │  Groq API    │          │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘          │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │   │
│  │  │  DeepSeek    │ │  Vertex AI   │ │  Local LLMs │          │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. COMPONENTES DEL SISTEMA

### 4.1 Componentes Principales

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        COMPONENTES DEL SISTEMA                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1. UNIFIED GATEWAY                                              │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━                                          │   │
│  │  Responsabilidad: Punto de entrada único para todas las         │   │
│  │                   solicitudes                                    │   │
│  │                                                                  │   │
│  │  Funciones:                                                      │   │
│  │  • Authentication & Authorization                               │   │
│  │  • Request validation & transformation                           │   │
│  │  • Rate limiting (global y por usuario)                          │   │
│  │  • Request logging & audit                                       │   │
│  │  • Metrics collection                                            │   │
│  │  • CORS handling                                                 │   │
│  │                                                                  │   │
│  │  Interfaces:                                                     │   │
│  │  - POST /v1/chat/completions                                     │   │
│  │  - POST /v1/messages                                             │   │
│  │  - POST /v1/responses                                            │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  2. API KEY MANAGER (Central Credential Administrator)         │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │   │
│  │  Responsabilidad: Gestión centralizada de TODAS las credenciales│   │
│  │                                                                  │   │
│  │  Funciones Existentes:                                          │   │
│  │  ✅ CRUD de claves API                                           │   │
│  │  ✅ Encriptación Fernet                                          │   │
│  │  ✅ Routing inteligente (AiRouter)                               │   │
│  │  ✅ Rate limiting Redis                                           │   │
│  │  ✅ Monitoreo de cuotas                                          │   │
│  │  ✅ Auto-provisioning (Playwright)                               │   │
│  │                                                                  │   │
│  │  Funciones Requeridas (Para ser Central):                       │   │
│  │  ⬜ Rotación automática de claves                                │   │
│  │  ⬜ Health checks de claves                                      │   │
│  │  ⬜ Límites de uso por clave                                     │   │
│  │  ⬜ Cooldowns configurables                                      │   │
│  │  ⬜ Priorización de claves                                       │   │
│  │  ⬜ Agrupación por proveedor                                      │   │
│  │  ⬜ Estadísticas de uso                                          │   │
│  │  ⬜ Detección de claves inválidas                                │   │
│  │  ⬜ Desactivación temporal                                       │   │
│  │  ⬜ Reactivación automática                                      │   │
│  │  ⬜ Balanceo entre múltiples claves                               │   │
│  │  ⬜ Auditoría de uso                                             │   │
│  │  ⬜ Integración LiteLLM completa                                 │   │
│  │                                                                  │   │
│  │  Modelo de Datos:                                                │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │   │
│  │  │  Provider    │ │  ApiKey      │ │  UsageLog            │    │   │
│  │  │  - id        │ │  - id        │ │  - id                │    │   │
│  │  │  - name      │ │  - key (enc) │ │  - api_key_id        │    │   │
│  │  │  - api_base  │ │  - status    │ │  - model             │    │   │
│  │  │  - priority  │ │  - remaining  │ │  - input_tokens      │    │   │
│  │  │  - rate_limit│ │  - cooldown   │ │  - output_tokens     │    │   │
│  │  │  - health    │ │  - health     │ │  - latency_ms        │    │   │
│  │  └──────────────┘ │  - priority   │ │  - timestamp        │    │   │
│  │                   │  - provider   │ └──────────────────────┘    │   │
│  │                   └──────────────┘                                │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3. CAPABILITY ROUTER                                           │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━                                          │   │
│  │  Responsabilidad: Seleccionar el mejor modelo basándose en       │   │
│  │                   las capacidades requeridas                      │   │
│  │                                                                  │   │
│  │  Criterios de Decisión:                                         │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ Criterio              │ Peso │ Fuente de Datos          │    │   │
│  │  ├────────────────────────┼──────┼──────────────────────────│    │   │
│  │  │ Rol solicitado         │ Alto │ Request metadata          │    │   │
│  │  │ Capacidades requeridas│ Alto │ Capability Engine          │    │   │
│  │  │ Estado del proveedor   │ Alto │ Health Monitor            │    │   │
│  │  │ Estado de la API Key   │ Alto │ API Key Manager           │    │   │
│  │  │ Latencia              │ Medio│ Historical metrics        │    │   │
│  │  │ Coste                │ Medio│ Provider config            │    │   │
│  │  │ Priority             │ Medio│ Provider config            │    │   │
│  │  │ Límite de contexto   │ Medio│ Model capabilities         │    │   │
│  │  │ Rate limits          │ Medio│ Provider config            │    │   │
│  │  │ Cooldown             │ Medio│ API Key Manager            │    │   │
│  │  │ Disponibilidad       │ Alto │ Real-time health check     │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  Algoritmo de Selección:                                         │   │
│  │                                                                  │   │
│  │  1. Filtrar por capacidades requeridas                          │   │
│  │  2. Filtrar por disponibilidad (health check)                   │   │
│  │  3. Filtrar por estado de API Key (no en cooldown)              │   │
│  │  4. Ordenar por score:                                          │   │
│  │     score = (w1 * capability_match) +                           │   │
│  │              (w2 * health_score) +                             │   │
│  │              (w3 * (1 - latency_norm)) +                       │   │
│  │              (w4 * (1 - cost_norm)) +                          │   │
│  │              (w5 * priority)                                   │   │
│  │  5. Seleccionar el de mayor score                               │   │
│  │  6. Aplicar circuit breaker si es necesario                    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  4. CAPABILITY ORCHESTRATOR                                     │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                  │   │
│  │  Responsabilidad: Orquestar múltiples modelos para tareas        │   │
│  │                   complejas                                       │   │
│  │                                                                  │   │
│  │  Funciones:                                                      │   │
│  │  • Planificar tareas en subtareas                               │   │
│  │  • Asignar modelos apropiados a cada subtarea                   │   │
│  │  • Gestionar contexto compartido entre modelos                  │   │
│  │  • Combinar respuestas                                          │   │
│  │  • Manejar dependencias entre subtareas                          │   │
│  │                                                                  │   │
│  │  Tipos de Orquestación:                                         │   │
│  │  ┌─────────────────┬───────────────────────────────────────┐    │   │
│  │  │ Tipo            │ Descripción                           │    │   │
│  │  ├─────────────────┼───────────────────────────────────────┤    │   │
│  │  │ Sequential      │ Ejecutar en orden, compartir contexto │    │   │
│  │  │ Parallel        │ Ejecutar simultáneamente, fusionar    │    │   │
│  │  │ Pipeline        │ Output de uno = input del siguiente    │    │   │
│  │  │ Conditional     │ Basado en resultado, elegir siguiente  │    │   │
│  │  │ Hierarchical    │ Supervisor + Workers                  │    │   │
│  │  └─────────────────┴───────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  5. CONTEXT MANAGER                                             │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━                                          │   │
│  │  Responsabilidad: Mantener y gestionar el contexto de           │   │
│  │                   conversaciones múltiples                       │   │
│  │                                                                  │   │
│  │  Funciones:                                                      │   │
│  │  • Almacenar historial de mensajes                              │   │
│  │  • Gestionar ventanas de contexto (truncamiento inteligente)     │   │
│  │  • Mantener estado de herramientas                              │   │
│  │  • Compartir contexto entre modelos                            │   │
│  │  • Persistencia de sesión                                       │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  6. EXECUTION ENGINE                                            │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━                                          │   │
│  │  Responsabilidad: Ejecutar las solicitudes a los proveedores     │   │
│  │                                                                  │   │
│  │  Funciones:                                                      │   │
│  │  • Transformación de requests (formato propietario → estándar)   │   │
│  │  • Transformación de responses (estándar → formato cliente)      │   │
│  │  • Streaming support (SSE)                                       │   │
│  │  • Retry con exponential backoff                                │   │
│  │  • Circuit breaker                                              │   │
│  │  • Timeout management                                           │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  7. EVENT BUS                                                   │   │
│  │  ━━━━━━━━━━━━━━                                                 │   │
│  │  Responsabilidad: Sistema de eventos para comunicación           │   │
│  │                   desacoplada entre componentes                   │   │
│  │                                                                  │   │
│  │  Tipos de Eventos:                                             │   │
│  │  ┌────────────────────────┬────────────────────────────────┐   │   │
│  │  │ Evento                │ Descripción                     │   │   │
│  │  ├────────────────────────┼────────────────────────────────┤   │   │
│  │  │ request.received      │ Nueva solicitud recibida        │   │   │
│  │  │ request.routed        │ Solicitud asignada a provider   │   │   │
│  │  │ request.completed     │ Solicitud completada            │   │   │
│  │  │ request.failed        │ Solicitud fallida               │   │   │
│  │  │ key.rotated          │ Clave API rotada                │   │   │
│  │  │ key.deactivated      │ Clave API desactivada           │   │   │
│  │  │ key.cooldown.start   │ Cooldown iniciado               │   │   │
│  │  │ key.cooldown.end     │ Cooldown terminado              │   │   │
│  │  │ provider.health       │ Health check de provider        │   │   │
│  │  │ provider.degraded     │ Provider en estado degradado    │   │   │
│  │  │ provider.down         │ Provider no disponible          │   │   │
│  │  │ usage.warning        │ Umbral de uso acercado          │   │   │
│  │  │ usage.exceeded       │ Límite de uso excedido          │   │   │
│  │  └────────────────────────┴────────────────────────────────┘   │   │
│  │                                                                  │   │
│  │  Canales:                                                        │   │
│  │  • WebSocket (real-time dashboard)                              │   │
│  │  • SSE (streaming responses)                                     │   │
│  │  • Redis Pub/Sub (inter-service)                                 │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  8. SANDBOX MANAGER                                             │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━                                        │   │
│  │  Responsabilidad: Gestionar entornos aislados para ejecución    │   │
│  │                   de código no confiable                         │   │
│  │                                                                  │   │
│  │  Funciones:                                                      │   │
│  │  • Aislamiento de procesos                                      │   │
│  │  • Límites de recursos (CPU, memory, time)                       │   │
│  │  • Whitelist de syscalls                                        │   │
│  │  • Network isolation                                            │   │
│  │  • Filesystem restrictions                                      │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  9. RUNTIME LOGGER                                              │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━                                          │   │
│  │  Responsabilidad: Registro detallado de todas las operaciones    │   │
│  │                                                                  │   │
│  │  Funciones:                                                      │   │
│  │  • Logging estructurado (JSON)                                  │   │
│  │  • Trazabilidad de requests (trace_id)                           │   │
│  │  • Métricas Prometheus                                         │   │
│  │  • OpenTelemetry traces                                        │   │
│  │  • Audit log inmutable                                          │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Proveedores (Provider Adapters)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PROVIDER ADAPTERS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Todos los adapters implementan la interfaz IProvider:                   │
│                                                                          │
│  interface IProvider {                                                   │
│    id: string;                                                           │
│    name: string;                                                        │
│    capabilities: ProviderCapabilities;                                   │
│    healthCheck(): Promise<HealthStatus>;                                │
│    send(request: LLMRequest): Promise<LLMResponse>;                     │
│    stream(request: LLMRequest): AsyncIterator<LLMResponse>;              │
│    getModels(): Promise<ModelInfo[]>;                                   │
│    validateKey(key: string): Promise<boolean>;                           │
│  }                                                                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PROVEEDORES NATIVOS                                             │   │
│  │  ─────────────────────                                           │   │
│  │                                                                  │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │   │
│  │  │  OpenAI Adapter  │  │  Anthropic       │  │  Groq Adapter  │  │   │
│  │  │  ───────────────  │  │  Adapter         │  │  ────────────  │  │   │
│  │  │  • GPT-4o        │  │  • Claude 3.5     │  │  • Llama       │  │   │
│  │  │  • GPT-4 Turbo   │  │  • Claude 3 Opus  │  │  • Mixtral     │  │   │
│  │  │  • GPT-4         │  │  • Claude 3 Sonn │  │  • Gemma       │  │   │
│  │  │  • GPT-3.5 Turbo │  │  • Haiku         │  │                │  │   │
│  │  └──────────────────┘  └──────────────────┘  └────────────────┘  │   │
│  │                                                                  │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │   │
│  │  │  DeepSeek        │  │  Gemini Adapter  │  │  Ollama        │  │   │
│  │  │  Adapter         │  │  ───────────────  │  │  Adapter       │  │   │
│  │  │  • DeepSeek Coder│  │  • Gemini 1.5    │  │  • Llama2      │  │   │
│  │  │  • DeepSeek V3   │  │  • Gemini Pro    │  │  • Mistral     │  │   │
│  │  │                  │  │  • Gemini Flash │  │  • Custom      │  │   │
│  │  └──────────────────┘  └──────────────────┘  └────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  FREE CLAUDE CODE COMO PROVEEDOR                                  │   │
│  │  ─────────────────────────────────────                            │   │
│  │                                                                  │   │
│  │  FreeClaudeCodeAdapter implements IProvider                      │   │
│  │                                                                  │   │
│  │  Características:                                               │   │
│  │  • API completa de Anthropic (/v1/messages)                       │   │
│  │  • 25+ providers de backend                                      │   │
│  │  • Claude Code, Codex, JetBrains integrados                      │   │
│  │  • CLI launchers disponibles                                    │   │
│  │                                                                  │   │
│  │  Integración:                                                    │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │                                                          │    │   │
│  │  │  ┌─────────────┐      ┌─────────────────────────────┐   │    │   │
│  │  │  │   LibreChat │ ──── │  Unified Gateway           │   │    │   │
│  │  │  └─────────────┘      │                             │   │    │   │
│  │  │                               │                       │   │    │   │
│  │  │                               ▼                       │   │    │   │
│  │  │               ┌─────────────────────────────┐        │   │    │   │
│  │  │               │  Capability Router          │        │   │    │   │
│  │  │               │                             │        │   │    │   │
│  │  │               │  "Necesito coding agent"   │        │   │    │   │
│  │  │               └─────────────────────────────┘        │   │    │   │
│  │  │                               │                       │   │    │   │
│  │  │                               ▼                       │   │    │   │
│  │  │               ┌─────────────────────────────┐        │   │    │   │
│  │  │               │  FreeClaudeCodeAdapter      │        │   │    │   │
│  │  │               │  (IProvider implementation) │        │   │    │   │
│  │  │               └─────────────────────────────┘        │   │    │   │
│  │  │                               │                       │   │    │   │
│  │  │                               ▼                       │   │    │   │
│  │  │               ┌─────────────────────────────┐        │   │    │   │
│  │  │               │  free-claude-code Server   │        │   │    │   │
│  │  │               │                             │        │   │    │   │
│  │  │               │  • NVIDIA NIM               │        │   │    │   │
│  │  │               │  • OpenRouter              │        │   │    │   │
│  │  │               │  • DeepSeek                 │        │   │    │   │
│  │  │               │  • ... (25+ providers)    │        │   │    │   │
│  │  │               └─────────────────────────────┘        │   │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LITE LLM COMO PROXY ADICIONAL                                   │   │
│  │  ─────────────────────────────────────                           │   │
│  │                                                                  │   │
│  │  LiteLLM opera como un provider más en la arquitectura:         │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │                                                          │    │   │
│  │  │  Capability Router                                      │    │   │
│  │  │        │                                                 │    │   │
│  │  │        ├─────────────────┐                              │    │   │
│  │  │        │                 │                              │    │   │
│  │  │        ▼                 ▼                              │    │   │
│  │  │  ┌──────────┐    ┌──────────────┐                     │    │   │
│  │  │  │ OpenAI   │    │ LiteLLM      │                     │    │   │
│  │  │  │ Adapter  │    │ Adapter      │                     │    │   │
│  │  │  └──────────┘    └──────┬───────┘                     │    │   │
│  │  │                         │                             │    │   │
│  │  │                         ▼                             │    │   │
│  │  │               ┌─────────────────┐                     │    │   │
│  │  │               │   LiteLLM       │                     │    │   │
│  │  │               │   Proxy         │                     │    │   │
│  │  │               │                 │                     │    │   │
│  │  │               │   100+ models   │                     │    │   │
│  │  │               │   from 25+      │                     │    │   │
│  │  │               │   providers     │                     │    │   │
│  │  │               └────────┬────────┘                     │    │   │
│  │  │                        │                              │    │   │
│  │  │        ┌──────────────┼──────────────┐              │    │   │
│  │  │        ▼              ▼              ▼                │    │   │
│  │  │   ┌─────────┐   ┌─────────┐   ┌─────────┐         │    │   │
│  │  │   │ Azure   │   │ Vertex  │   │  AWS    │         │    │   │
│  │  │   │ OpenAI  │   │  AI     │   │ Bedrock │         │    │   │
│  │  │   └─────────┘   └─────────┘   └─────────┘         │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. FLUJO DE SOLICITUDES

### 5.1 Flujo Completo de una Solicitud

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUJO DE SOLICITUDES                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  USUARIO                                                               │
│     │                                                                  │
│     ▼                                                                  │
│  ┌─────────────────┐                                                   │
│  │  LibreChat UI   │  "Necesito ayuda con código Python"              │
│  │  (React Client) │                                                   │
│  └────────┬────────┘                                                   │
│           │ HTTP Request                                                │
│           │ POST /v1/chat/completions                                   │
│           │ {                                                           │
│           │   "model": "claude-sonnet",                                │
│           │   "messages": [...],                                       │
│           │   "metadata": {                                             │
│           │     "role": "coding_agent",                                │
│           │     "capabilities": ["code_generation", "debugging"]       │
│           │   }                                                         │
│           │ }                                                           │
│           ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    UNIFIED GATEWAY                                │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │   │
│  │                                                                   │   │
│  │  1. Authentication                                                │   │
│  │     • Verify JWT token                                            │   │
│  │     • Extract user_id from claims                                │   │
│  │                                                                   │   │
│  │  2. Rate Limiting                                                 │   │
│  │     • Check user quota (Redis)                                     │   │
│  │     • Increment request counter                                    │   │
│  │     • Return 429 if exceeded                                      │   │
│  │                                                                   │   │
│  │  3. Request Validation                                             │   │
│  │     • Validate message format                                      │   │
│  │     • Check max tokens                                            │   │
│  │     • Sanitize input                                              │   │
│  │                                                                   │   │
│  │  4. Logging                                                        │   │
│  │     • Generate trace_id                                            │   │
│  │     • Log request received                                         │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│           │                                                            │
│           │ (trace_id, user_id, validated_request)                    │
│           ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EVENT BUS                                      │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │   │
│  │                                                                   │   │
│  │  Publish: request.received {                                     │   │
│  │    trace_id,                                                      │   │
│  │    user_id,                                                       │   │
│  │    model_requested,                                               │   │
│  │    timestamp                                                      │   │
│  │  }                                                                │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│           │                                                            │
│           ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CAPABILITY ROUTER                              │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │   │
│  │                                                                   │   │
│  │  INPUT:                                                           │   │
│  │  {                                                                │   │
│  │    "requested_model": "claude-sonnet",                           │   │
│  │    "role": "coding_agent",                                       │   │
│  │    "capabilities": ["code_generation", "debugging"],            │   │
│  │    "max_context": 200000,                                        │   │
│  │    "streaming": true                                             │   │
│  │  }                                                                │   │
│  │                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  STEP 1: Get Available Providers                         │     │   │
│  │  │  ─────────────────────────────────────────────────       │     │   │
│  │  │                                                          │     │   │
│  │  │  providers = [                                          │     │   │
│  │  │    {                                                     │     │   │
│  │  │      id: "anthropic",                                    │     │   │
│  │  │      models: ["claude-3-5-sonnet", "claude-3-opus"],    │     │   │
│  │  │      capabilities: ["code", "reasoning", "analysis"],   │     │   │
│  │  │      health: "healthy",                                   │     │   │
│  │  │      latency_p99: 1200,                                   │     │   │
│  │  │      cost_per_1k: 0.003                                   │     │   │
│  │  │    },                                                     │     │   │
│  │  │    {                                                      │     │   │
│  │  │      id: "free_claude_code",                             │     │   │
│  │  │      models: ["claude-sonnet-4"],                        │     │   │
│  │  │      capabilities: ["code", "reasoning", "analysis"],   │     │   │
│  │  │      health: "healthy",                                   │     │   │
│  │  │      latency_p99: 800,                                    │     │   │
│  │  │      cost_per_1k: 0.0,                                    │     │   │
│  │  │    },                                                     │     │   │
│  │  │    ...                                                    │     │   │
│  │  │  ]                                                        │     │   │
│  │  │                                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                    │                                                │   │
│  │                    ▼                                                │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  STEP 2: Filter by Capabilities                         │     │   │
│  │  │  ─────────────────────────────────────────────────       │     │   │
│  │  │                                                          │     │   │
│  │  │  required_caps = ["code_generation", "debugging"]       │     │   │
│  │  │                                                          │     │   │
│  │  │  filtered = providers.filter(p =>                         │     │   │
│  │  │    required_caps.every(cap => p.capabilities.includes(cap)) │   │   │
│  │  │  )                                                        │     │   │
│  │  │                                                          │     │   │
│  │  │  Result: [anthropic, free_claude_code, openai]           │     │   │
│  │  │                                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                    │                                                │   │
│  │                    ▼                                                │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  STEP 3: Check API Key Health                           │     │   │
│  │  │  ─────────────────────────────────────────────────       │     │   │
│  │  │                                                          │     │   │
│  │  │  ┌─────────────────────────────────────────────────┐    │     │   │
│  │  │  │  API Key Manager Query:                        │    │     │   │
│  │  │  │                                                 │    │     │   │
│  │  │  │  SELECT * FROM api_keys                         │    │     │   │
│  │  │  │  WHERE provider_id = ?                          │    │     │   │
│  │  │  │    AND status = 'active'                        │    │     │   │
│  │  │  │    AND cooldown_until < NOW()                   │    │     │   │
│  │  │  │    AND remaining_quota > 0                      │    │     │   │
│  │  │  │  ORDER BY priority DESC                         │    │     │   │
│  │  │  │  LIMIT 1;                                        │    │     │   │
│  │  │  └─────────────────────────────────────────────────┘    │     │   │
│  │  │                                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                    │                                                │   │
│  │                    ▼                                                │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  STEP 4: Calculate Scores                              │     │   │
│  │  │  ─────────────────────────────────────────────────       │     │   │
│  │  │                                                          │     │   │
│  │  │  For each provider:                                    │     │   │
│  │  │    score = (                                           │     │   │
│  │  │      0.30 * capability_match +                          │     │   │
│  │  │      0.25 * health_score +                             │     │   │
│  │  │      0.20 * (1 - latency_normalized) +                 │     │   │
│  │  │      0.15 * (1 - cost_normalized) +                    │     │   │
│  │  │      0.10 * priority                                   │     │   │
│  │  │    )                                                    │     │   │
│  │  │                                                          │     │   │
│  │  │  Results:                                              │     │   │
│  │  │  ┌────────────────┬───────┐                          │     │   │
│  │  │  │ Provider       │ Score │                          │     │   │
│  │  │  ├────────────────┼───────┤                          │     │   │
│  │  │  │ free_claude_code│ 0.95 │                          │     │   │
│  │  │  │ anthropic      │ 0.72  │                          │     │   │
│  │  │  │ openai         │ 0.68  │                          │     │   │
│  │  │  └────────────────┴───────┘                          │     │   │
│  │  │                                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                    │                                                │   │
│  │                    ▼                                                │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  STEP 5: Select Best Provider                           │     │   │
│  │  │  ─────────────────────────────────────────────────       │     │   │
│  │  │                                                          │     │   │
│  │  │  SELECTED: free_claude_code                              │     │   │
│  │  │  Reason: Highest score (0.95)                           │     │   │
│  │  │  Model: claude-sonnet-4                                  │     │   │
│  │  │  API Key: ak_****1234 (active)                          │     │   │
│  │  │                                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│           │                                                            │
│           │ { selected_provider, model, api_key_id, trace_id }         │
│           ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CONTEXT MANAGER                               │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │   │
│  │                                                                   │   │
│  │  • Load conversation history                                    │   │
│  │  • Apply context window truncation if needed                    │   │
│  │  • Prepare messages with system prompt                           │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│           │                                                            │
│           │ (enhanced_request, context)                                │
│           ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EXECUTION ENGINE                              │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │   │
│  │                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  1. Transform Request                                   │     │   │
│  │  │  ─────────────────────────────────────────────────       │     │   │
│  │  │                                                          │     │   │
│  │  │  Input: OpenAI format                                    │     │   │
│  │  │  {                                                       │     │   │
│  │  │    "model": "claude-sonnet",                            │     │   │
│  │  │    "messages": [...]                                    │     │   │
│  │  │  }                                                       │     │   │
│  │  │                                                          │     │   │
│  │  │  Output: Anthropic format                                │     │   │
│  │  │  {                                                       │     │   │
│  │  │    "model": "claude-sonnet-4",                          │     │   │
│  │  │    "messages": [...],                                   │     │   │
│  │  │    "max_tokens": 8192,                                  │     │   │
│  │  │  }                                                       │     │   │
│  │  │                                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                    │                                                │   │
│  │                    ▼                                                │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  2. Execute Request (SSE Streaming)                     │     │   │
│  │  │  ─────────────────────────────────────────────────       │     │   │
│  │  │                                                          │     │   │
│  │  │  ┌────────────────────┐                                 │     │   │
│  │  │  │ FreeClaudeCode    │                                 │     │   │
│  │  │  │ Adapter           │                                 │     │   │
│  │  │  └─────────┬──────────┘                                 │     │   │
│  │  │            │                                             │     │   │
│  │  │            │ POST /v1/messages                           │     │   │
│  │  │            │ Authorization: Bearer <API_KEY>             │     │   │
│  │  │            ▼                                             │     │   │
│  │  │  ┌────────────────────┐                                 │     │   │
│  │  │  │ free-claude-code  │                                 │     │   │
│  │  │  │ Server            │                                 │     │   │
│  │  │  │                   │                                 │     │   │
│  │  │  │ Routes request to │                                 │     │   │
│  │  │  │ best backend      │                                 │     │   │
│  │  │  │ provider:         │                                 │     │   │
│  │  │  │                   │                                 │     │   │
│  │  │  │ • NVIDIA NIM     │                                 │     │   │
│  │  │  │ • OpenRouter     │                                 │     │   │
│  │  │  │ • DeepSeek       │                                 │     │   │
│  │  │  │ • ...            │                                 │     │   │
│  │  │  └─────────┬──────────┘                                 │     │   │
│  │  │            │                                             │     │   │
│  │  │            │ SSE Stream                                   │     │   │
│  │  │            ▼                                             │     │   │
│  │  │  ┌────────────────────┐                                 │     │   │
│  │  │  │ Backend Provider  │                                 │     │   │
│  │  │  │ (e.g., OpenRouter)│                                 │     │   │
│  │  │  └────────────────────┘                                 │     │   │
│  │  │                                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                    │                                                │   │
│  │                    ▼                                                │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  3. Transform Response                                   │     │   │
│  │  │  ─────────────────────────────────────────────────       │     │   │
│  │  │                                                          │     │   │
│  │  │  Anthropic SSE ──transform──► OpenAI Chat format        │     │   │
│  │  │                                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│           │                                                            │
│           │ SSE Stream                                                 │
│           ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EVENT BUS                                      │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │   │
│  │                                                                   │   │
│  │  Publish: request.completed {                                    │   │
│  │    trace_id,                                                     │   │
│  │    provider: "free_claude_code",                                 │   │
│  │    model: "claude-sonnet-4",                                     │   │
│  │    latency_ms,                                                   │   │
│  │    input_tokens,                                                 │   │
│  │    output_tokens                                                 │   │
│  │  }                                                               │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│           │                                                            │
│           ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    API KEY MANAGER                                │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │   │
│  │                                                                   │   │
│  │  Log Usage:                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │ INSERT INTO usage_logs (                                 │     │   │
│  │  │   api_key_id, provider_id, model,                       │     │   │
│  │  │   input_tokens, output_tokens, latency_ms,              │     │   │
│  │  │   status_code, timestamp                                │     │   │
│  │  │ ) VALUES (...)                                          │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                   │   │
│  │  Update Quota:                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │ UPDATE api_keys SET                                     │     │   │
│  │  │   remaining_quota = remaining_quota - used_quota,       │     │   │
│  │  │   last_used_at = NOW()                                  │     │   │
│  │  │ WHERE id = ?                                            │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                   │   │
│  │  Check for Rotation:                                             │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │ IF remaining_quota < threshold THEN                      │     │   │
│  │  │   Trigger auto-rotation workflow                        │     │   │
│  │  │ END IF                                                   │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│           │                                                            │
│           │ SSE Stream (OpenAI format)                                 │
│           ▼                                                            │
│     LIBRECHAT UI                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Diagrama de Secuencia

```
┌─────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  User   │    │ LibreChat   │    │   Gateway    │    │   Router    │    │ Context Manager │    │   Executor      │
└────┬────┘    └──────┬──────┘    └──────┬───────┘    └──────┬──────┘    └───────┬─────────┘    └───────┬─────────┘
     │               │                  │                    │                   │                     │
     │ 1. Send msg   │                  │                    │                   │                     │
     │──────────────>│                  │                    │                   │                     │
     │               │ 2. HTTP Request  │                    │                   │                     │
     │               │─────────────────>│                    │                   │                     │
     │               │                  │ 3. Auth & Validate │                   │                     │
     │               │                  │ ───────────────────>│                   │                     │
     │               │                  │                    │ 4. Route Request   │                     │
     │               │                  │                    │                   │                     │
     │               │                  │                    │ 5. Query API Keys │                     │
     │               │                  │                    │<──────────────────│                     │
     │               │                  │                    │                   │                     │
     │               │                  │                    │ 6. Best Provider  │                     │
     │               │                  │<───────────────────│                   │                     │
     │               │                  │                    │                   │                     │
     │               │                  │ 7. Enhance Request │                   │                     │
     │               │                  │───────────────────>│                   │                     │
     │               │                  │                    │ 8. Load Context   │                     │
     │               │                  │                    │─────────────────>│                     │
     │               │                  │                    │<─────────────────│                     │
     │               │                  │                    │                   │                     │
     │               │                  │                    │ 9. Enhanced Req   │                     │
     │               │                  │<───────────────────│                   │                     │
     │               │                  │                    │                   │                     │
     │               │                  │ 10. Execute        │                   │                     │
     │               │                  │───────────────────>│                   │                     │
     │               │                  │                    │                   │ 11. Transform       │
     │               │                  │                    │                   │────────────────────>│
     │               │                  │                    │                   │                     │
     │               │                  │                    │                   │ 12. Provider Req    │
     │               │                  │                    │                   │────────────────────>│
     │               │                  │                    │                   │                     │
     │               │                  │                    │                   │                     │    ┌────────────────┐
     │               │                  │                    │                   │                     │    │ FreeClaudeCode │
     │               │                  │                    │                   │                     │    │ Adapter        │
     │               │                  │                    │                   │                     │    └───────┬────────┘
     │               │                  │                    │                   │                     │            │
     │               │                  │                    │                   │                     │<───────────│
     │               │                  │                    │                   │                     │ 13. SSE Response
     │               │                  │                    │                   │                     │            │
     │               │                  │                    │                   │ 14. SSE Stream      │            │
     │               │                  │                    │                   │<────────────────────│            │
     │               │                  │ 15. SSE Stream      │                   │                     │
     │               │ 16. SSE Stream   │<───────────────────│                   │                     │
     │ 17. SSE Stream│<─────────────────│                    │                   │                     │
     │<──────────────│                  │                    │                   │                     │
     │               │                  │                    │                   │                     │
     │               │                  │ 18. Log Usage      │                   │                     │
     │               │                  │───────────────────>│                   │                     │
     │               │                  │                    │ 19. Update Quota  │                     │
     │               │                  │                    │<──────────────────│                     │
     │               │                  │                    │                   │                     │
```

---

## 6. API KEY MANAGER - ANÁLISIS

### 6.1 Evaluación como Administrador Central de Credenciales

| Función | Existe | Calidad | Integrar | Mejora Requerida |
|---------|--------|---------|----------|------------------|
| CRUD de claves API | ✅ | Buena | ✅ | - |
| Encriptación Fernet | ✅ | Buena | ✅ | Usar KMS externo |
| Rate limiting | ✅ | Buena | ✅ | - |
| Health checks | ⚠️ | Parcial | ✅ | Implementar completo |
| Monitoreo de cuotas | ✅ | Buena | ✅ | Alertas proactivas |
| Auto-provisioning | ✅ | Experimental | ⚠️ | Madurar |
| Rotación automática | ⚠️ | Parcial | ✅ | Completar |
| Límites de uso | ⚠️ | Parcial | ✅ | Per-key limits |
| Cooldowns | ⚠️ | Parcial | ✅ | Configurable |
| Priorización | ⚠️ | Parcial | ✅ | Algoritmo mejorado |
| Estadísticas | ⚠️ | Parcial | ✅ | Dashboard completo |
| Detección invalid | ✅ | Buena | ✅ | ML para predicción |
| Desactivación temp | ⚠️ | Manual | ✅ | Automatizar |
| Reactivación auto | ❌ | - | ✅ | Implementar |
| Balanceo keys | ⚠️ | Basic | ✅ | Round-robin + weighted |
| Auditoría | ⚠️ | Parcial | ✅ | Log inmutable |
| Integración LiteLLM | ✅ | Buena | ✅ | - |

### 6.2 Plan de Integración del API Key Manager

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PLAN DE INTEGRACIÓN API KEY MANAGER                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  FASE 1: Integración Básica (1-2 semanas)                               │
│  ═══════════════════════════════════════════════                        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1.1 Conectar con API Key Manager existente                      │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  • Deployar API Key Manager como microservicio                  │   │
│  │  • Configurar red Docker para comunicación                      │   │
│  │  • Crear cliente SDK en Python para consumo                     │   │
│  │                                                                  │   │
│  │  docker-compose.yml additions:                                   │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  api-key-manager:                                        │   │   │
│  │  │    build: ../api-key/backend                            │   │   │
│  │  │    ports: ["8001:8000"]                                 │   │   │
│  │  │    environment:                                          │   │   │
│  │  │      DATABASE_URL: ${DATABASE_URL}                       │   │   │
│  │  │      REDIS_URL: ${REDIS_URL}                            │   │   │
│  │  │      SECRET_KEY: ${API_KEY_MANAGER_SECRET}              │   │   │
│  │  │    depends_on:                                           │   │   │
│  │  │      - postgres                                         │   │   │
│  │  │      - redis                                           │   │   │
│  │  │    networks:                                            │   │   │
│  │  │      - librechat-network                               │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1.2 Crear abstracción IKeyManager                              │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  # key_manager.py (interfaz)                            │    │   │
│  │  │                                                          │    │   │
│  │  │  from abc import ABC, abstractmethod                     │    │   │
│  │  │                                                          │    │   │
│  │  │  class IKeyManager(ABC):                                 │    │   │
│  │  │      @abstractmethod                                     │    │   │
│  │  │      async def get_key(self, provider: str) -> str:     │    │   │
│  │  │          """Obtiene la mejor clave para el provider"""    │    │   │
│  │  │                                                          │    │   │
│  │  │      @abstractmethod                                     │    │   │
│  │  │      async def report_usage(self, key_id: str, usage):   │    │   │
│  │  │          """Reporta uso de una clave"""                  │    │   │
│  │  │                                                          │    │   │
│  │  │      @abstractmethod                                     │    │   │
│  │  │      async def health_check(self, key_id: str) -> bool: │    │   │
│  │  │          """Verifica salud de una clave"""               │    │   │
│  │  │                                                          │    │   │
│  │  │      @abstractmethod                                     │    │   │
│  │  │      async def rotate_key(self, key_id: str) -> str:     │    │   │
│  │  │          """Rota una clave específica"""                 │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1.3 Implementar ApiKeyManagerClient                            │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  # api_key_manager_client.py                            │    │   │
│  │  │                                                          │    │   │
│  │  │  class ApiKeyManagerClient(IKeyManager):                 │    │   │
│  │  │      def __init__(self, base_url: str, api_key: str):   │    │   │
│  │  │          self.base_url = base_url                        │    │   │
│  │  │          self.headers = {"Authorization": f"Bearer {api_key}"}│    │   │
│  │  │                                                          │    │   │
│  │  │      async def get_key(self, provider: str) -> str:     │    │   │
│  │  │          async with httpx.AsyncClient() as client:      │    │   │
│  │  │              response = await client.get(                │    │   │
│  │  │                  f"{self.base_url}/api/v1/keys/best",   │    │   │
│  │  │                  params={"provider": provider},        │    │   │
│  │  │                  headers=self.headers                    │    │   │
│  │  │              )                                          │    │   │
│  │  │              return response.json()["key"]              │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  FASE 2: Mejoras de Resiliencia (2-3 semanas)                          │
│  ═══════════════════════════════════════════════════                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  2.1 Circuit Breaker por Provider                               │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  Implementar circuit breaker para manejar fallos:              │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  class CircuitBreaker:                                   │    │   │
│  │  │      def __init__(self, failure_threshold=5, timeout=60):│    │   │
│  │  │          self.failure_count = 0                          │    │   │
│  │  │          self.failure_threshold = failure_threshold      │    │   │
│  │  │          self.timeout = timeout                          │    │   │
│  │  │          self.state = "closed"  # closed, open, half     │    │   │
│  │  │                                                          │    │   │
│  │  │      def record_failure(self):                           │    │   │
│  │  │          self.failure_count += 1                         │    │   │
│  │  │          if self.failure_count >= self.failure_threshold:│    │   │
│  │  │              self.state = "open"                        │    │   │
│  │  │                                                          │    │   │
│  │  │      def record_success(self):                           │    │   │
│  │  │          self.failure_count = 0                          │    │   │
│  │  │          self.state = "closed"                           │    │   │
│  │  │                                                          │    │   │
│  │  │      def can_execute(self) -> bool:                      │    │   │
│  │  │          if self.state == "closed":                      │    │   │
│  │  │              return True                                 │    │   │
│  │  │          # Implementar timeout recovery                  │    │   │
│  │  │          ...                                             │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  2.2 Retry con Exponential Backoff                               │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  async def execute_with_retry(                           │    │   │
│  │  │      func,                                              │    │   │
│  │  │      max_retries=3,                                     │    │   │
│  │  │      base_delay=1.0,                                    │    │   │
│  │  │      max_delay=60.0                                    │    │   │
│  │  │  ):                                                      │    │   │
│  │  │      for attempt in range(max_retries):                 │    │   │
│  │  │          try:                                            │    │   │
│  │  │              return await func()                         │    │   │
│  │  │          except RetryableError as e:                     │    │   │
│  │  │              if attempt == max_retries - 1:              │    │   │
│  │  │                  raise                                   │    │   │
│  │  │              delay = min(base_delay * (2 ** attempt), max_delay)│    │   │
│  │  │              await asyncio.sleep(delay)                  │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  FASE 3: Automatización Completa (3-4 semanas)                         │
│  ════════════════════════════════════════════════════════               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3.1 Sistema de Cooldowns Configurable                          │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  Configuración por provider:                                     │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  # providers.yaml                                       │    │   │
│  │  │                                                          │    │   │
│  │  │  providers:                                              │    │   │
│  │  │    groq:                                                 │    │   │
│  │  │      cooldown_on_429: 60      # seconds                │    │   │
│  │  │      cooldown_on_429_multi: 300 # seconds              │    │   │
│  │  │      cooldown_on_5xx: 30      # seconds                │    │   │
│  │  │      max_retries: 3                                      │    │   │
│  │  │                                                          │    │   │
│  │  │    openai:                                               │    │   │
│  │  │      cooldown_on_429: 120                               │    │   │
│  │  │      cooldown_on_5xx: 60                                │    │   │
│  │  │      max_retries: 5                                      │    │   │
│  │  │                                                          │    │   │
│  │  │    free_claude_code:                                     │    │   │
│  │  │      cooldown_on_429: 30                                │    │   │
│  │  │      cooldown_on_5xx: 15                               │    │   │
│  │  │      max_retries: 2                                      │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3.2 Reactivación Automática de Claves                         │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  Workflow:                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  1. Clave entra en cooldown                              │    │   │
│  │  │  2. Celery task agenda: reactivate_after_{duration}    │    │   │
│  │  │  3. Cuando expires el cooldown:                          │    │   │
│  │  │     a. Realizar health check                             │    │   │
│  │  │     b. Si pasa -> status = 'active'                      │    │   │
│  │  │     c. Si falla -> extender cooldown o marcar 'invalid'  │    │   │
│  │  │  4. Notificar via Event Bus                              │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3.3 Balanceo de Carga Entre Claves                             │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  Estrategias disponibles:                                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  Strategy        │ Description                         │    │   │
│  │  │  ─────────────────┼───────────────────────────────────── │    │   │
│  │  │  round_robin     │ Distribuir equitativamente          │    │   │
│  │  │  weighted        │ Basado en capacidad/quota           │    │   │
│  │  │  least_used      │ Menor uso reciente                 │    │   │
│  │  │  random          │ Selección aleatoria                 │    │   │
│  │  │  priority        │ Siempre la de mayor prioridad      │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  Implementación:                                                │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  class LoadBalancer:                                    │    │   │
│  │  │      def __init__(self, strategy="weighted"):           │    │   │
│  │  │          self.strategy = strategy                       │    │   │
│  │  │                                                          │    │   │
│  │  │      async def select_key(self, keys: List[ApiKey]) -> ApiKey:│    │   │
│  │  │          if self.strategy == "weighted":                │    │   │
│  │  │              return self._weighted_select(keys)         │    │   │
│  │  │          elif self.strategy == "least_used":           │    │   │
│  │  │              return self._least_used_select(keys)        │    │   │
│  │  │          # ... otros strategies                         │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  FASE 4: Observabilidad (2 semanas)                                     │
│  ═══════════════════════════════════════════                           │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  4.1 Métricas Prometheus                                        │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  # Métricas a exponer                                   │    │   │
│  │  │                                                          │    │   │
│  │  │  librechat_api_keys_total{provider, status}             │    │   │
│  │  │  librechat_api_key_usage_total{provider, model}        │    │   │
│  │  │  librechat_api_key_latency_seconds{provider}            │    │   │
│  │  │  librechat_api_key_cooldown_active{provider}            │    │   │
│  │  │  librechat_circuit_breaker_state{provider}              │    │   │
│  │  │  librechat_request_retries_total{provider, result}      │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  4.2 Audit Log Inmutable                                        │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  # events_audit (append-only table)                     │    │   │
│  │  │                                                          │    │   │
│  │  │  CREATE TABLE events_audit (                            │    │   │
│  │  │      id BIGSERIAL PRIMARY KEY,                          │    │   │
│  │  │      event_type VARCHAR(50) NOT NULL,                   │    │   │
│  │  │      event_data JSONB NOT NULL,                         │    │   │
│  │  │      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),     │    │   │
│  │  │      hash VARCHAR(64) NOT NULL,  -- SHA256 of row       │    │   │
│  │  │      prev_hash VARCHAR(64)       -- Hash of previous row │    │   │
│  │  │  );                                                      │    │   │
│  │  │                                                          │    │   │
│  │  │  -- Trigger para calcular hash automáticamente          │    │   │
│  │  │  CREATE OR REPLACE FUNCTION update_audit_hash()         │    │   │
│  │  │  RETURNS TRIGGER AS $$                                   │    │   │
│  │  │  BEGIN                                                   │    │   │
│  │  │      NEW.prev_hash := (                                  │    │   │
│  │  │          SELECT hash FROM events_audit                 │    │   │
│  │  │          WHERE id = NEW.id - 1                          │    │   │
│  │  │      );                                                  │    │   │
│  │  │      NEW.hash := encode(                                │    │   │
│  │  │          sha256(                                        │    │   │
│  │  │              row_to_json(NEW)::text ||                  │    │   │
│  │  │              COALESCE(NEW.prev_hash, '')                │    │   │
│  │  │          )::bytea,                                      │    │   │
│  │  │          'hex'                                          │    │   │
│  │  │      );                                                  │    │   │
│  │  │      RETURN NEW;                                         │    │   │
│  │  │  END;                                                    │    │   │
│  │  │  $$ LANGUAGE plpgsql;                                   │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. FREE CLAUDE CODE - INTEGRACIÓN

### 7.1 Free Claude Code como Provider

Free Claude Code se integrará como un **provider más** dentro de la arquitectura, no como un sistema independiente.

```
┌─────────────────────────────────────────────────────────────────────────┐
│              FREE CLAUDE CODE COMO PROVEEDOR NATIVO                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OBJECTIVO: Free Claude Code debe ser indistinguible de cualquier       │
│  otro provider en la arquitectura.                                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  INTERFAZ UNIFICADA DE PROVEEDOR                                │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  interface IProvider {                                          │   │
│  │      id: 'free_claude_code';                                    │   │
│  │      name: 'Free Claude Code';                                  │   │
│  │      capabilities: ProviderCapabilities;                        │   │
│  │      api_type: 'anthropic' | 'openai' | 'custom';              │   │
│  │      streaming: boolean;                                        │   │
│  │      tools: boolean;                                            │   │
│  │                                                                  │   │
│  │      async healthCheck(): Promise<HealthStatus>;                │   │
│  │      async send(request: LLMRequest): Promise<LLMResponse>;     │   │
│  │      async stream(request: LLMRequest): AsyncIterator;          │   │
│  │      async getModels(): Promise<ModelInfo[]>;                   │   │
│  │  }                                                              │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PROVEEDOR FREE CLAUDE CODE                                     │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  # free_claude_code_provider.py                          │    │   │
│  │  │                                                          │    │   │
│  │  │  from .base import BaseProvider                          │    │   │
│  │  │  from ...types import LLMRequest, LLMResponse            │    │   │
│  │  │  from ...exceptions import ProviderError                 │    │   │
│  │  │                                                          │    │   │
│  │  │  class FreeClaudeCodeProvider(BaseProvider):            │    │   │
│  │  │      """                                                 │    │   │
│  │  │      Free Claude Code como provider estándar.            │    │   │
│  │  │      Implementa la interfaz IProvider completa.          │    │   │
│  │  │      """                                                 │    │   │
│  │  │                                                          │    │   │
│  │  │      id = "free_claude_code"                             │    │   │
│  │  │      name = "Free Claude Code"                            │    │   │
│  │  │      api_type = "anthropic"                               │    │   │
│  │  │      streaming = True                                    │    │   │
│  │  │      tools = True                                         │    │   │
│  │  │                                                          │    │   │
│  │  │      def __init__(self, config: ProviderConfig):        │    │   │
│  │  │          self.base_url = config.get("base_url",          │    │   │
│  │  │              "http://localhost:8080")                     │    │   │
│  │  │          self.api_key = config.get("api_key")           │    │   │
│  │  │          self.auth_token = config.get("auth_token")      │    │   │
│  │  │          self.rate_limit = config.get("rate_limit", 40)  │    │   │
│  │  │          self.max_concurrency = config.get(              │    │   │
│  │  │              "max_concurrency", 5)                       │    │   │
│  │  │          self._client = httpx.AsyncClient(               │    │   │
│  │  │              timeout=httpx.Timeout(120)                  │    │   │
│  │  │          )                                              │    │   │
│  │  │                                                          │    │   │
│  │  │      @property                                           │    │   │
│  │  │      def capabilities(self) -> ProviderCapabilities:    │    │   │
│  │  │          return ProviderCapabilities(                     │    │   │
│  │  │              supports_streaming=True,                   │    │   │
│  │  │              supports_tools=True,                        │    │   │
│  │  │              supports_vision=True,                       │    │   │
│  │  │              max_context_length=200000,                 │    │   │
│  │  │              models=[                                    │    │   │
│  │  │                  "claude-sonnet-4",                      │    │   │
│  │  │                  "claude-opus-4",                        │    │   │
│  │  │                  "claude-3-5-sonnet",                   │    │   │
│  │  │              ],                                          │    │   │
│  │  │              features=[                                  │    │   │
│  │  │                  "code_generation",                      │    │   │
│  │  │                  "reasoning",                            │    │   │
│  │  │                  "analysis",                             │    │   │
│  │  │                  "debugging",                            │    │   │
│  │  │              ]                                            │    │   │
│  │  │          )                                               │    │   │
│  │  │                                                          │    │   │
│  │  │      async def healthCheck(self) -> HealthStatus:       │    │   │
│  │  │          try:                                            │    │   │
│  │  │              response = await self._client.get(         │    │   │
│  │  │                  f"{self.base_url}/health"               │    │   │
│  │  │              )                                          │    │   │
│  │  │              if response.status_code == 200:            │    │   │
│  │  │                  return HealthStatus(healthy=True)      │    │   │
│  │  │              return HealthStatus(healthy=False,         │    │   │
│  │  │                  reason=f"HTTP {response.status_code}") │    │   │
│  │  │          except Exception as e:                         │    │   │
│  │  │              return HealthStatus(healthy=False,         │    │   │
│  │  │                  reason=str(e))                          │    │   │
│  │  │                                                          │    │   │
│  │  │      async def stream(self, request: LLMRequest) ->      │    │   │
│  │  │              AsyncIterator[StreamChunk]:                 │    │   │
│  │  │          """                                             │    │   │
│  │  │          Ejecuta request con streaming SSE.               │    │   │
│  │  │          Transforma la respuesta al formato estándar.    │    │   │
│  │  │          """                                             │    │   │
│  │  │          # 1. Transform request a formato Anthropic       │    │   │
│  │  │          anthropic_request = self._transform_request(    │    │   │
│  │  │              request                                     │    │   │
│  │  │          )                                               │    │   │
│  │  │                                                          │    │   │
│  │  │          # 2. Headers                                    │    │   │
│  │  │          headers = {                                     │    │   │
│  │  │              "Content-Type": "application/json",        │    │   │
│  │  │              "anthropic-version": "2023-06-01",         │    │   │
│  │  │          }                                               │    │   │
│  │  │          if self.auth_token:                             │    │   │
│  │  │              headers["Authorization"] = f"Bearer {self.auth_token}" │    │   │
│  │  │                                                          │    │   │
│  │  │          # 3. Ejecutar request                           │    │   │
│  │  │          async with self._client.stream(                │    │   │
│  │  │              "POST",                                     │    │   │
│  │  │              f"{self.base_url}/v1/messages",           │    │   │
│  │  │              json=anthropic_request,                    │    │   │
│  │  │              headers=headers                             │    │   │
│  │  │          ) as response:                                 │    │   │
│  │  │              # 4. Parsear SSE y transformar             │    │   │
│  │  │              async for line in response.aiter_lines():  │    │   │
│  │  │                  if line.startswith("data: "):         │    │   │
│  │  │                      data = json.loads(line[6:])        │    │   │
│  │  │                      chunk = self._transform_chunk(data)│    │   │
│  │  │                      yield chunk                         │    │   │
│  │  │                                                          │    │   │
│  │  │      def _transform_request(self, request: LLMRequest)  │    │   │
│  │  │              -> dict:                                    │    │   │
│  │  │          """Transforma formato estándar a Anthropic."""  │    │   │
│  │  │          return {                                        │    │   │
│  │  │              "model": request.model,                    │    │   │
│  │  │              "messages": request.messages,               │    │   │
│  │  │              "max_tokens": request.max_tokens or 4096,  │    │   │
│  │  │              "stream": True,                             │    │   │
│  │  │              "system": request.system_prompt,            │    │   │
│  │  │          }                                               │    │   │
│  │  │                                                          │    │   │
│  │  │      def _transform_chunk(self, data: dict) -> StreamChunk:│    │   │
│  │  │          """Transforma evento SSE a formato estándar.""" │    │   │
│  │  │          event_type = data.get("type")                   │    │   │
│  │  │          if event_type == "content_block_delta":        │    │   │
│  │  │              delta = data.get("delta", {})               │    │   │
│  │  │              if delta.get("type") == "text_delta":      │    │   │
│  │  │                  return StreamChunk(                     │    │   │
│  │  │                      type="content",                     │    │   │
│  │  │                      content=delta.get("text", ""),      │    │   │
│  │  │                  )                                       │    │   │
│  │  │              elif delta.get("type") == "thinking_delta":│    │   │
│  │  │                  return StreamChunk(                     │    │   │
│  │  │                      type="thinking",                    │    │   │
│  │  │                      content=delta.get("thinking", ""), │    │   │
│  │  │                  )                                       │    │   │
│  │  │          elif event_type == "message_stop":             │    │   │
│  │  │              return StreamChunk(type="done")            │    │   │
│  │  │          elif event_type == "error":                    │    │   │
│  │  │              raise ProviderError(data.get("error", {})) │    │   │
│  │  │          return None  # Ignorar eventos no relevantes   │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  REGISTRO EN EL FACTORY DE PROVIDERS                             │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  # provider_factory.py                                   │    │   │
│  │  │                                                          │    │   │
│  │  │  from .openai import OpenAIProvider                      │    │   │
│  │  │  from .anthropic import AnthropicProvider                │    │   │
│  │  │  from .groq import GroqProvider                          │    │   │
│  │  │  from .free_claude_code import FreeClaudeCodeProvider    │    │   │  ← NUEVO
│  │  │                                                          │    │   │
│  │  │  PROVIDER_REGISTRY = {                                   │    │   │
│  │  │      "openai": OpenAIProvider,                          │    │   │
│  │  │      "anthropic": AnthropicProvider,                    │    │   │
│  │  │      "groq": GroqProvider,                              │    │   │
│  │  │      "free_claude_code": FreeClaudeCodeProvider,        │    │   │  ← NUEVO
│  │  │      # ... otros providers                               │    │   │
│  │  │  }                                                       │    │   │
│  │  │                                                          │    │   │
│  │  │  def create_provider(provider_id: str, config: dict) -> IProvider:│    │   │
│  │  │      provider_class = PROVIDER_REGISTRY.get(provider_id)│    │   │
│  │  │      if not provider_class:                              │    │   │
│  │  │          raise ValueError(f"Unknown provider: {provider_id}")│    │   │
│  │  │      return provider_class(config)                       │    │   │
│  │  │                                                          │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Compatibilidad con LiteLLM

Free Claude Code coexiste con LiteLLM de forma complementaria:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COEXISTENCIA FREE CLAUDE CODE + LITELLM              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                           ┌──────────────────┐                           │
│                           │ Capability Router │                           │
│                           └────────┬─────────┘                           │
│                                    │                                     │
│           ┌────────────────────────┼────────────────────────┐           │
│           │                        │                        │           │
│           ▼                        ▼                        ▼           │
│    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
│    │   Request    │         │   Request    │         │   Request    │   │
│    │   metadata:  │         │   metadata:  │         │   metadata:  │   │
│    │  role:       │         │  role:       │         │  role:       │   │
│    │  "coding_    │         │  "general"   │         │  "gemma_     │   │
│    │   agent"     │         │              │         │   worker"     │   │
│    └──────┬───────┘         └──────┬───────┘         └──────┬───────┘   │
│           │                        │                        │           │
│           ▼                        ▼                        ▼           │
│    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
│    │    Free     │         │   LiteLLM    │         │   LiteLLM    │   │
│    │   Claude   │         │  (OpenAI)    │         │  (Custom)    │   │
│    │   Code     │         │              │         │              │   │
│    │  Provider  │         │   Provider   │         │   Provider   │   │
│    └──────┬───────┘         └──────┬───────┘         └──────┬───────┘   │
│           │                        │                        │           │
│           ▼                        ▼                        ▼           │
│    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
│    │ free-claude- │         │    LiteLLM   │         │   LiteLLM    │   │
│    │   code      │         │   Proxy      │         │   Proxy      │   │
│    │   Server   │         │             │         │             │   │
│    │            │         │   (25+      │         │   (Hugging  │   │
│    │  (25+ prov)│         │   providers)│         │    Face)    │   │
│    └─────────────┘         └──────┬───────┘         └──────┬───────┘   │
│                                  │                        │            │
│           ┌──────────────────────┼────────────────────────┘            │
│           │                      │                                      │
│           ▼                      ▼                                      │
│    ┌──────────────┐        ┌──────────────┐                             │
│    │ NVIDIA NIM   │        │  OpenAI API  │                             │
│    │ OpenRouter   │        │  Azure       │                             │
│    │ DeepSeek     │        │  Vertex AI   │                             │
│    │ (25+ more)   │        │  (100+ more) │                             │
│    └──────────────┘        └──────────────┘                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CASOS DE USO                                  │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  Free Claude Code ES MEJOR para:                                   │   │
│  │  • Coding agents (Claude Code, VS Code, JetBrains)               │   │
│  │  • Desarrollo de software (debugging, refactoring)               │   │
│  │  • Proyectos que requieren Claude (claude-sonnet-4, opus-4)     │   │
│  │  • CLI launchers                                                 │   │
│  │  • Integración con Discord/Telegram                              │   │
│  │                                                                  │   │
│  │  LiteLLM ES MEJOR para:                                          │   │
│  │  • Gateway genérico multi-protocolo                              │   │
│  │  • Modelos que NO son Claude (GPT-4, Gemini, etc.)              │   │
│  │  • Proveedores enterprise (Azure, Vertex, Bedrock)              │   │
│  │  • Cuando se requiere uniformidad de API                        │   │
│  │  • Integraciones que ya usan LiteLLM                            │   │
│  │                                                                  │   │
│  │  SE USAN JUNTOS cuando:                                          │   │
│  │  • Se necesita redundancia entre providers                      │   │
│  │  • El Capability Router quiere elegir el mejor                  │   │
│  │  • Se quiere máximo coverage de modelos                         │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. CAPABILITY ROUTER

### 8.1 Especificación Completa

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CAPABILITY ROUTER                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PROPOSITO: Seleccionar automáticamente el mejor provider/modelo        │
│  basándose en las capacidades requeridas y el estado del sistema.      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  CAPABILITY ENGINE                                                │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  Cada modelo tiene un perfil de capacidades:                       │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  {                                                        │    │   │
│  │  │    "model_id": "claude-3-5-sonnet-20240620",             │    │   │
│  │  │    "provider": "anthropic",                             │    │   │
│  │  │    "capabilities": {                                     │    │   │
│  │  │      "code_generation": 0.95,                          │    │   │
│  │  │      "code_review": 0.90,                              │    │   │
│  │  │      "reasoning": 0.95,                                 │    │   │
│  │  │      "analysis": 0.90,                                  │    │   │
│  │  │      "creative_writing": 0.85,                         │    │   │
│  │  │      "math": 0.88,                                     │    │   │
│  │  │      "factual_qa": 0.92,                               │    │   │
│  │  │      "translation": 0.82,                             │    │   │
│  │  │      "summarization": 0.88,                            │    │   │
│  │  │      "debugging": 0.93,                                │    │   │
│  │  │      "refactoring": 0.91,                              │    │   │
│  │  │      "testing": 0.89,                                  │    │   │
│  │  │      "vision": 0.90,                                   │    │   │
│  │  │      "function_calling": 0.95,                         │    │   │
│  │  │    },                                                   │    │   │
│  │  │    "constraints": {                                    │    │   │
│  │  │      "max_tokens": 8192,                               │    │   │
│  │  │      "max_context": 200000,                            │    │   │
│  │  │      "supports_streaming": true,                       │    │   │
│  │  │      "supports_tools": true,                           │    │   │
│  │  │      "supports_vision": true,                          │    │   │
│  │  │      "supports_thinking": true,                        │    │   │
│  │  │    },                                                   │    │   │
│  │  │    "cost": {                                            │    │   │
│  │  │      "input_per_1m": 3.0,                              │    │   │
│  │  │      "output_per_1m": 15.0,                           │    │   │
│  │  │    },                                                   │    │   │
│  │  │    "latency": {                                        │    │   │
│  │  │      "p50_ms": 800,                                    │    │   │
│  │  │      "p95_ms": 1500,                                   │    │   │
│  │  │      "p99_ms": 2500,                                   │    │   │
│  │  │    }                                                    │    │   │
│  │  │  }                                                        │    │   │
│  │  │                                                           │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ALGORITMO DE SELECCIÓN                                          │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  def select_best_model(request: RoutingRequest) -> RoutingResult:│   │
│  │      # 1. Obtener todos los candidatos                          │   │
│  │      candidates = get_all_available_models()                     │   │
│  │                                                                   │   │
│  │      # 2. Filtrar por hard constraints                            │   │
│  │      candidates = filter_hard_constraints(candidates, request)  │   │
│  │                                                                   │   │
│  │      # 3. Calcular scores                                        │   │
│  │      scored = []                                                 │   │
│  │      for model in candidates:                                    │   │
│  │          score = calculate_routing_score(model, request)        │   │
│  │          scored.append((model, score))                           │   │
│  │                                                                   │   │
│  │      # 4. Ordenar por score descendente                          │   │
│  │      scored.sort(key=lambda x: x[1], reverse=True)              │   │
│  │                                                                   │   │
│  │      # 5. Retornar el mejor + fallbacks                          │   │
│  │      return RoutingResult(                                       │   │
│  │          primary=scored[0][0],                                    │   │
│  │          fallbacks=[m for m, _ in scored[1:4]]                  │   │
│  │      )                                                            │   │
│  │                                                                   │   │
│  │  def calculate_routing_score(model, request) -> float:           │   │
│  │      weights = {                                                  │   │
│  │          'capability_match': 0.30,                              │   │
│  │          'health': 0.25,                                         │   │
│  │          'latency': 0.20,                                        │   │
│  │          'cost': 0.15,                                           │   │
│  │          'priority': 0.10,                                       │   │
│  │      }                                                            │   │
│  │                                                                   │   │
│  │      # Capability match score                                    │   │
│  │      required_caps = request.required_capabilities               │   │
│  │      cap_score = sum(                                            │   │
│  │          model.capabilities.get(cap, 0)                          │   │
│  │          for cap in required_caps                                 │   │
│  │      ) / len(required_caps) if required_caps else 1.0           │   │
│  │                                                                   │   │
│  │      # Health score (0-1)                                        │   │
│  │      health_status = get_health_status(model.provider_id)       │   │
│  │      health_score = 1.0 if health_status.is_healthy else 0.0   │   │
│  │                                                                   │   │
│  │      # Latency score (0-1, menor es mejor)                       │   │
│  │      latency = model.latency.p95_ms                             │   │
│  │      latency_score = max(0, 1 - (latency / 5000))  # Normalize  │   │
│  │                                                                   │   │
│  │      # Cost score (0-1, menor es mejor)                         │   │
│  │      cost = (model.cost.input_per_1m + model.cost.output_per_1m) / 2│    │   │
│  │      cost_score = max(0, 1 - (cost / 50))  # Normalize          │   │
│  │                                                                   │   │
│  │      # Priority score                                            │   │
│  │      priority_score = model.priority / 100                       │   │
│  │                                                                   │   │
│  │      # Weighted sum                                              │   │
│  │      total = (                                                   │   │
│  │          weights['capability_match'] * cap_score +               │   │
│  │          weights['health'] * health_score +                      │   │
│  │          weights['latency'] * latency_score +                   │   │
│  │          weights['cost'] * cost_score +                         │   │
│  │          weights['priority'] * priority_score                   │   │
│  │      )                                                            │   │
│  │                                                                   │   │
│  │      return total                                                 │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. CAPABILITY ORCHESTRATOR

### 9.1 Especificación de Orquestación

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       CAPABILITY ORCHESTRATOR                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PROPOSITO: Orquestar múltiples modelos para tareas complejas que       │
│  requieren diferentes capacidades en secuencia o paralelo.             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  TIPOS DE ORQUESTACIÓN                                          │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  ┌─────────────┬────────────────────────────────────────────┐  │   │
│  │  │    Tipo     │ Descripción                                │  │   │
│  │  ├─────────────┼────────────────────────────────────────────┤  │   │
│  │  │ SEQUENTIAL  │ Ejecutar modelos en secuencia, pasando       │  │   │
│  │  │             │ el contexto completo al siguiente            │  │   │
│  │  ├─────────────┼────────────────────────────────────────────┤  │   │
│  │  │ PARALLEL    │ Ejecutar múltiples modelos simultáneamente,  │  │   │
│  │  │             │ fusionar las respuestas                     │  │   │
│  │  ├─────────────┼────────────────────────────────────────────┤  │   │
│  │  │ PIPELINE    │ Output de un modelo = input del siguiente,  │  │   │
│  │  │             │ como una tubería de procesamiento           │  │   │
│  │  ├─────────────┼────────────────────────────────────────────┤  │   │
│  │  │ CONDITIONAL │ Basado en el resultado de un paso,          │  │   │
│  │  │             │ elegir qué modelo usar en el siguiente      │  │   │
│  │  ├─────────────┼────────────────────────────────────────────┤  │   │
│  │  │ HIERARCHICAL │ Un modelo supervisor coordina              │  │   │
│  │  │             │ múltiples workers especializados            │  │   │
│  │  └─────────────┴────────────────────────────────────────────┘  │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  EJEMPLO: SEQUENTIAL PARA REFACTORING COMPLEJO                  │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  Solicitud: "Refactoriza este código para mejor rendimiento"    │   │
│  │                                                                  │   │
│  │  Step 1: Code Analysis (claude-3-5-sonnet)                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐  │   │
│  │  │  Input: Código original                                   │  │   │
│  │  │  Output: Análisis de rendimiento, bottlenecks identificados │  │   │
│  │  │  Model: claude-3-5-sonnet (análisis)                      │  │   │
│  │  └─────────────────────────────────────────────────────────┘  │   │
│  │                          │                                       │   │
│  │                          ▼                                       │   │
│  │  Step 2: Optimization Plan (gpt-4o)                            │   │
│  │  ┌─────────────────────────────────────────────────────────┐  │   │
│  │  │  Input: Código original + Análisis del paso 1            │  │   │
│  │  │  Output: Plan de optimización detallado                  │  │   │
│  │  │  Model: gpt-4o (planificación)                          │  │   │
│  │  └─────────────────────────────────────────────────────────┘  │   │
│  │                          │                                       │   │
│  │                          ▼                                       │   │
│  │  Step 3: Code Generation (claude-3-5-sonnet)                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐  │   │
│  │  │  Input: Código original + Análisis + Plan                │  │   │
│  │  │  Output: Código refactorizado                           │  │   │
│  │  │  Model: claude-3-5-sonnet (código)                     │  │   │
│  │  └─────────────────────────────────────────────────────────┘  │   │
│  │                          │                                       │   │
│  │                          ▼                                       │   │
│  │  Step 4: Code Review (claude-3-opus)                           │   │
│  │  ┌─────────────────────────────────────────────────────────┐  │   │
│  │  │  Input: Código original + Código refactorizado           │  │   │
│  │  │  Output: Review final, verificaciones, tests sugeridos   │  │   │
│  │  │  Model: claude-3-opus (revisión crítica)                │  │   │
│  │  └─────────────────────────────────────────────────────────┘  │   │
│  │                          │                                       │   │
│  │                          ▼                                       │   │
│  │                     RESULTADO FINAL                              │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  IMPLEMENTACIÓN                                                  │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  class OrchestrationTask:                                        │   │
│  │      task_id: str                                               │   │
│  │      orchestration_type: OrchestrationType                      │   │
│  │      steps: List[OrchestrationStep]                             │   │
│  │      context: Dict[str, Any]  # Contexto compartido             │   │
│  │      status: TaskStatus                                         │   │
│  │                                                                   │   │
│  │  class OrchestrationStep:                                        │   │
│  │      step_id: str                                                │   │
│  │      model_requirements: ModelRequirements  # Para CapabilityRouter│    │   │
│  │      input_mapping: Dict[str, str]  # De dónde viene el input   │   │
│  │      output_key: str  # Dónde guardar el output en contexto    │   │
│  │      condition: Optional[Callable]  # Para orquestación cond.  │   │
│  │                                                                   │   │
│  │  class CapabilityOrchestrator:                                   │   │
│  │      def __init__(self, router: CapabilityRouter):               │   │
│  │          self.router = router                                    │   │
│  │          self.context_manager = ContextManager()               │   │
│  │                                                                   │   │
│  │      async def execute_sequential(                              │   │
│  │          self, task: OrchestrationTask                          │   │
│  │      ) -> Dict[str, Any]:                                       │   │
│  │          results = {}                                            │   │
│  │          for step in task.steps:                                 │   │
│  │              # Construir input desde contexto                    │   │
│  │              step_input = self._build_step_input(               │   │
│  │                  step, task.context                              │   │
│  │              )                                                   │   │
│  │                                                                   │   │
│  │              # Seleccionar mejor modelo                         │   │
│  │              routing_result = await self.router.route(          │   │
│  │                  step.model_requirements                         │   │
│  │              )                                                   │   │
│  │                                                                   │   │
│  │              # Ejecutar                                          │   │
│  │              step_result = await self._execute_step(            │   │
│  │                  routing_result.primary, step_input             │   │
│  │              )                                                   │   │
│  │                                                                   │   │
│  │              # Guardar en contexto                                │   │
│  │              task.context[step.output_key] = step_result         │   │
│  │              results[step.step_id] = step_result               │   │
│  │                                                                   │   │
│  │          return results                                          │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. DIAGRAMA DE COMPONENTES

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DIAGRAMA DE COMPONENTES COMPLETO                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                         ┌─────────────────────────────────────────────┐   │
│                         │                    USUARIOS                  │   │
│                         └────────────────────────┬──────────────────┘   │
│                                                  │                       │
│                          ┌───────────────────────┼───────────────────────┐
│                          │                       │                       │
│                          ▼                       ▼                       │
│               ┌──────────────────┐     ┌──────────────────┐              │
│               │   LibreChat UI  │     │   OpenWebUI      │              │
│               │    (React)       │     │                 │              │
│               └────────┬─────────┘     └────────┬─────────┘              │
│                        │                          │                       │
│                        └──────────┬───────────────┘                       │
│                                   │                                       │
│                                   ▼                                       │
│                    ┌──────────────────────────────┐                       │
│                    │      UNIFIED GATEWAY         │                       │
│                    │  ┌────────────────────────┐  │                       │
│                    │  │ • Authentication      │  │                       │
│                    │  │ • Rate Limiting        │  │                       │
│                    │  │ • Request Validation   │  │                       │
│                    │  │ • Metrics Collection   │  │                       │
│                    │  │ • CORS                 │  │                       │
│                    │  └────────────────────────┘  │                       │
│                    └─────────────┬─────────────────┘                       │
│                                  │                                         │
│              ┌───────────────────┼───────────────────┐                    │
│              │                   │                   │                    │
│              ▼                   ▼                   ▼                    │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐         │
│  │   EVENT BUS     │ │  CAPABILITY      │ │     CONTEXT      │         │
│  │                 │ │    ROUTER        │ │    MANAGER       │         │
│  │  ┌────────────┐ │ │                  │ │                  │         │
│  │  │• Pub/Sub   │ │ │  ┌────────────┐ │ │  ┌────────────┐ │         │
│  │  │• SSE       │ │ │  │• Match     │ │ │  │• Sessions  │ │         │
│  │  │• WebSocket │ │ │  │  Scores    │ │ │  │• History   │ │         │
│  │  │• Redis     │ │ │  │• Filter    │ │ │  │• Truncate  │ │         │
│  │  └────────────┘ │ │  │• Fallbacks │ │ │  │• Tools     │ │         │
│  │                  │ │  └────────────┘ │ │  └────────────┘ │         │
│  └────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘         │
│           │                      │                     │                    │
│           │                      │                     │                    │
│           │            ┌─────────┴─────────┐          │                    │
│           │            │                   │          │                    │
│           │            ▼                   ▼          │                    │
│           │  ┌──────────────────┐ ┌──────────────────┐│                   │
│           │  │   CAPABILITY     │ │    EXECUTION     ││                   │
│           │  │   ORCHESTRATOR   │ │    ENGINE        ││                   │
│           │  │                  │ │                  ││                   │
│           │  │  ┌────────────┐  │ │  ┌────────────┐  ││                   │
│           │  │  │• Sequential│  │ │  │• Transform │  ││                   │
│           │  │  │• Parallel  │  │ │  │• Retry     │  ││                   │
│           │  │  │• Pipeline  │  │ │  │• Circuit   │  ││                   │
│           │  │  │• Conditional│ │ │  │• Timeout   │  ││                   │
│           │  │  └────────────┘  │ │  └────────────┘  ││                   │
│           │  └────────┬─────────┘ └────────┬─────────┘                    │
│           │           │                    │                              │
│           │           │                    │                              │
│           │           │            ┌───────┴───────┐                      │
│           │           │            │               │                      │
│           │           │            ▼               ▼                      │
│           │           │  ┌──────────────────┐ ┌──────────────────┐       │
│           │           │  │  PROVIDER        │ │   API KEY        │       │
│           │           │  │  REGISTRY        │ │   MANAGER        │       │
│           │           │  │                  │ │                  │       │
│           │           │  │  ┌────────────┐  │ │  ┌────────────┐  │       │
│           │           │  │  │ Factory    │  │ │  │• CRUD Keys │  │       │
│           │           │  │  │ Method     │  │ │  │• Health    │  │       │
│           │           │  │  │ Selector   │  │ │  │• Rotation  │  │       │
│           │           │  │  └────────────┘  │ │  │• Cooldown  │  │       │
│           │           │  └────────┬─────────┘ │  │• Balance   │  │       │
│           │           │           │           │  │• Audit     │  │       │
│           │           │           │           │  └──────┬─────┘  │       │
│           │           │           │                  │              │
│           │           │           │                  │              │
│           │           │           └──────────┬─────────┘              │
│           │           │                      │                          │
│           │           │                      ▼                          │
│           │           │           ┌──────────────────┐                 │
│           │           │           │   RUNTIME LOG    │                 │
│           │           │           │                  │                 │
│           │           │           │  ┌────────────┐  │                 │
│           │           │           │  │• Trace ID │  │                 │
│           │           │           │  │• Metrics  │  │                 │
│           │           │           │  │• Audit    │  │                 │
│           │           │           │  └────────────┘  │                 │
│           │           │           └──────────────────┘                 │
│           │           │                                                  │
│           │           ▼                                                  │
│           │  ┌─────────────────────────────────────────────────────────┐ │
│           │  │                    PROVIDER ADAPTERS                    │ │
│           │  │                                                          │ │
│           │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │ │
│           │  │  │  OpenAI  │  │ Anthropic│  │   Groq   │  │ DeepSeek│  │ │
│           │  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘  │ │
│           │  │       │              │              │              │      │ │
│           │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │ │
│           │  │  │ LiteLLM  │  │  Gemini  │  │ Ollama   │  │ Vertex  │  │ │
│           │  │  │ Adapter │  │ Adapter  │  │ Adapter  │  │ Adapter │  │ │
│           │  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘  │ │
│           │  │       │              │              │              │      │ │
│           │  │       │       ┌──────┴──────┐      │              │      │ │
│           │  │       │       │              │      │              │      │ │
│           │  │       │       ▼              ▼      │              │      │ │
│           │  │       │  ┌─────────────────────────────┐           │      │ │
│           │  │       │  │    FREE CLAUDE CODE         │           │      │ │
│           │  │       │  │       ADAPTER              │           │      │ │
│           │  │       │  │                             │           │      │ │
│           │  │       │  │  ┌───────────────────────┐  │           │      │ │
│           │  │       │  │  │ • Protocol Transform │  │           │      │ │
│           │  │       │  │  │ • SSE Streaming       │  │           │      │ │
│           │  │       │  │  │ • 25+ Backends       │  │           │      │ │
│           │  │       │  │  └───────────┬───────────┘  │           │      │ │
│           │  │       │  └──────────────┼──────────────┘           │      │ │
│           │  │       │                 │                          │      │ │
│           │  └───────┼─────────────────┼──────────────────────────┘      │ │
│           │          │                 │                                 │ │
│           └──────────┴─────────────────┴─────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│                    ┌─────────────────────┐                                 │
│                    │   SANDBOX MANAGER  │                                 │
│                    │                    │                                 │
│                    │  ┌────────────────┐ │                                 │
│                    │  │• Isolation     │ │                                 │
│                    │  │• Resource Lim  │ │                                 │
│                    │  │• Network Ctrl │ │                                 │
│                    │  └────────────────┘ │                                 │
│                    └─────────────────────┘                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. MEJORAS PROPUESTAS

### 11.1 Lista Completa de Mejoras

| ID | Mejora | Prioridad | Complejidad | Impacto |
|----|--------|-----------|------------|---------|
| M01 | Circuit Breaker por Provider | Alta | Media | Alto |
| M02 | Retry con Exponential Backoff | Alta | Baja | Alto |
| M03 | Secrets Management (Vault/KMS) | Alta | Alta | Crítico |
| M04 | Streaming Support en API Key Manager | Alta | Media | Medio |
| M05 | Multi-tenancy Real | Alta | Alta | Alto |
| M06 | GraphQL API | Media | Alta | Medio |
| M07 | Advanced Analytics Dashboard | Media | Media | Medio |
| M08 | OpenTelemetry Integration | Media | Media | Alto |
| M09 | OAuth2 SSO | Media | Alta | Medio |
| M10 | Audit Log Inmutable | Media | Media | Alto |
| M11 | Script Versioning (Playwright) | Media | Baja | Medio |
| M12 | Webhook System | Baja | Media | Medio |
| M13 | API Key Versioning | Baja | Media | Bajo |
| M14 | Kubernetes HPA | Baja | Alta | Alto |
| M15 | gRPC API | Baja | Alta | Medio |
| M16 | Health Check Proactivo | Alta | Baja | Alto |
| M17 | Rate Limiting por IP | Alta | Baja | Alto |
| M18 | Input Sanitization | Media | Baja | Alto |
| M19 | Multi-turn Memory | Alta | Alta | Alto |
| M20 | WebSocket Support | Media | Media | Medio |

### 11.2 Mejoras Críticas Detalladas

#### M01: Circuit Breaker

```python
class CircuitBreakerConfig:
    failure_threshold: int = 5
    success_threshold: int = 2
    timeout_seconds: int = 60
    half_open_max_calls: int = 3

class CircuitBreaker:
    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        
    async def call(self, func, *args, **kwargs):
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
            else:
                raise CircuitOpenError()
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
```

#### M03: Secrets Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SECRETS MANAGEMENT ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Opción 1: HashiCorp Vault                                              │
│  ══════════════════════                                                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   ┌──────────────┐         ┌──────────────┐                   │   │
│  │   │  Application  │ ──────> │    Vault     │                   │   │
│  │   │   Service    │         │   Server     │                   │   │
│  │   └──────────────┘         └───────┬──────┘                   │   │
│  │                                   │                             │   │
│  │                    ┌─────────────┼─────────────┐              │   │
│  │                    │             │             │              │   │
│  │                    ▼             ▼             ▼              │   │
│  │             ┌───────────┐ ┌───────────┐ ┌───────────┐       │   │
│  │             │   API     │ │ Database  │ │  Redis    │       │   │
│  │             │   Keys    │ │  Creds    │ │  Creds    │       │   │
│  │             └───────────┘ └───────────┘ └───────────┘       │   │
│  │                                                                  │   │
│  │   Ventajas:                                                       │   │
│  │   • Auditoría completa de accesos                                │   │
│  │   • Rotación automática                                          │   │
│  │   • Encryption at rest y in transit                              │   │
│  │   • Policies granulares                                           │   │
│  │   • Integración con Kubernetes                                   │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Opción 2: AWS Secrets Manager / KMS                                    │
│  ═════════════════════════════════════════                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   ┌──────────────┐         ┌──────────────┐                   │   │
│  │   │  Application  │ ──────> │ AWS Secrets  │                   │   │
│  │   │   Service    │         │   Manager    │                   │   │
│  │   └──────────────┘         └───────┬──────┘                   │   │
│  │                                   │                             │   │
│  │                    ┌─────────────┼─────────────┐              │   │
│  │                    │             │             │              │   │
│  │                    ▼             ▼             ▼              │   │
│  │             ┌───────────┐ ┌───────────┐ ┌───────────┐       │   │
│  │             │   API     │ │ Database  │ │   JWT     │       │   │
│  │             │   Keys    │ │  Master   │ │  Secret   │       │   │
│  │             └───────────┘ └───────────┘ └───────────┘       │   │
│  │                                                                  │   │
│  │   Ventajas:                                                       │   │
│  │   • Si ya usas AWS, integración nativa                          │   │
│  │   • KMS para encryption keys                                     │   │
│  │   • CloudTrail para auditoría                                    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. RIESGOS DETECTADOS

### 12.1 Matriz de Riesgos

| ID | Riesgo | Probabilidad | Impacto | Severidad | Mitigation |
|----|--------|--------------|---------|-----------|------------|
| R01 | Proveedor cambia UI (Playwright) | Alta | Alto | 🔴 Crítico | Script versioning, detection early |
| R02 | Rate limits providers | Media | Alto | 🟠 Alto | Circuit breaker, múltiples keys |
| R03 | Bloqueo de IPs | Media | Medio | 🟡 Medio | Rotación de proxies |
| R04 | Credenciales en logs | Alta | Crítico | 🔴 Crítico | Sanitización de logs |
| R05 | .env en repos | Media | Crítico | 🔴 Crítico | Secrets management |
| R06 | LiteLLM como SPOF | Media | Alto | 🟠 Alto | Free Claude Code como fallback |
| R07 | Sin MFA | Alta | Alto | 🟠 Alto | Implementar OAuth2/OIDC |
| R08 | Free Claude Code downtime | Media | Medio | 🟡 Medio | Fallback a otros providers |
| R09 | Modelo depreca | Media | Medio | 🟡 Medio | Dynamic model discovery |
| R10 | Exposición de API keys | Media | Crítico | 🔴 Crítico | Encriptación, rotación |
| R11 | SSRF en web_fetch | Media | Alto | 🟠 Alto | Allowlists estrictos |
| R12 | Dependencias obsoletas | Baja | Medio | 🟢 Bajo | Dependabot, updates regulares |

### 12.2 Planes de Mitigación

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PLANES DE MITIGACIÓN                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  R01: Proveedor cambia UI                                                │
│  ═══════════════════════════                                            │
│  • Monitoreo proactivo de cambios                                       │
│  • Scripts versionados con checksums                                    │
│  • Alertas tempranas porfallo de detection                              │
│  • Equipo dedicado para mantenimiento de scripts                        │
│                                                                          │
│  R04: Credenciales en logs                                               │
│  ═════════════════════════════════                                      │
│  • Sanitizador centralizado de logs                                     │
│  • Librería de logging custom que filtra secrets                        │
│  • Revisión de código con linter anti-secrets                          │
│  • Pruebas automatizadas de sanitización                               │
│                                                                          │
│  R06: LiteLLM como SPOF                                                 │
│  ═══════════════════════════                                           │
│  • Free Claude Code como fallback directo                              │
│  • Capability Router con múltiples targets                             │
│  • Health checks cruzados                                               │
│  • Documentación clara de fallbacks                                    │
│                                                                          │
│  R07: Sin MFA                                                           │
│  ═══════════════════════════                                            │
│  • Implementar OAuth2/OIDC con proveedor existente                      │
│  • Soporte TOTP como segunda factor                                    │
│  • Política de contraseñas fuertes                                      │
│  • Sesiones con refresh tokens                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 13. ESTRATEGIA DE INTEGRACIÓN POR FASES

### 13.1 Roadmap de Implementación

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ROADMAP DE INTEGRACIÓN POR FASES                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ╔═══════════════════════════════════════════════════════════════════╗ │
│  ║  FASE 1: FUNDACIÓN (Semanas 1-4)                                    ║ │
│  ║  ═══════════════════════════════════════════                       ║ │
│  ║                                                                    ║ │
│  ║  Objetivo: Establecer la base para integración modular             ║ │
│  ║                                                                    ║ │
│  ║  Tareas:                                                            ║ │
│  ║  ┌─────────────────────────────────────────────────────────────┐  ║ │
│  ║  │ □ 1.1 Crear estructura de directorios del proyecto          │  ║ │
│  ║  │ □ 1.2 Implementar interfaces base (IProvider, IKeyManager)  │  ║ │
│  ║  │ □ 1.3 Configurar Docker Compose con todos los servicios    │  ║ │
│  ║  │ □ 1.4 Implementar logging centralizado                    │  ║ │
│  ║  │ □ 1.5 Crear cliente API Key Manager                        │  ║ │
│  ║  │ □ 1.6 Implementar Event Bus básico                        │  ║ │
│  ║  │ □ 1.7 Configurar Prometheus + Grafana                       │  ║ │
│  ║  │ □ 1.8 Escribir tests de integración                        │  ║ │
│  ║  └─────────────────────────────────────────────────────────────┘  ║ │
│  ║                                                                    ║ │
│  ║  Deliverables:                                                      ║ │
│  ║  • Arquitectura base documentada                                    ║ │
│  ║  • Interfaces verificadas con tests                               ║ │
│  ║  • Docker Compose funcional                                       ║ │
│  ║                                                                    ║ │
│  ╚═══════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│  ╔═══════════════════════════════════════════════════════════════════╗ │
│  ║  FASE 2: API KEY MANAGER (Semanas 5-8)                              ║ │
│  ║  ═══════════════════════════════════════                            ║ │
│  ║                                                                    ║ │
│  ║  Objetivo: Integrar y mejorar API Key Manager                      ║ │
│  ║                                                                    ║ │
│  ║  Tareas:                                                            ║ │
│  ║  ┌─────────────────────────────────────────────────────────────┐  ║ │
│  ║  │ □ 2.1 Deploy API Key Manager como microservicio           │  ║ │
│  ║  │ □ 2.2 Implementar abstracción IKeyManager                  │  ║ │
│  ║  │ □ 2.3 Añadir Circuit Breaker por provider                  │  ║ │
│  ║  │ □ 2.4 Implementar retry con exponential backoff           │  ║ │
│  ║  │ □ 2.5 Añadir cooldowns configurables                       │  ║ │
│  ║  │ □ 2.6 Implementar balanceo de carga (estrategias)         │  ║ │
│  ║  │ □ 2.7 Crear dashboard de métricas                          │  ║ │
│  ║  │ □ 2.8 Auditoría de seguridad                               │  ║ │
│  ║  └─────────────────────────────────────────────────────────────┘  ║ │
│  ║                                                                    ║ │
│  ║  Deliverables:                                                      ║ │
│  ║  • API Key Manager integrado                                      ║ │
│  ║  • Circuit breaker funcional                                     ║ │
│  ║  • Dashboard de monitoreo                                        ║ │
│  ║                                                                    ║ │
│  ╚═══════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│  ╔═══════════════════════════════════════════════════════════════════╗ │
│  ║  FASE 3: FREE CLAUDE CODE (Semanas 9-12)                            ║ │
│  ║  ═══════════════════════════════════════════                        ║ │
│  ║                                                                    ║ │
│  ║  Objetivo: Integrar Free Claude Code como provider estándar        ║ │
│  ║                                                                    ║ │
│  ║  Tareas:                                                            ║ │
│  ║  ┌─────────────────────────────────────────────────────────────┐  ║ │
│  ║  │ □ 3.1 Crear FreeClaudeCodeProvider adapter                │  ║ │
│  ║  │ □ 3.2 Implementar transformación de requests/responses    │  ║ │
│  ║  │ □ 3.3 Añadir soporte SSE streaming                        │  ║ │
│  ║  │ □ 3.4 Implementar health checks                           │  ║ │
│  ║  │ □ 3.5 Registrar en provider factory                        │  ║ │
│  ║  │ □ 3.6 Integrar con Capability Router                       │  ║ │
│  ║  │ □ 3.7 Tests de integración                                │  ║ │
│  ║  │ □ 3.8 Documentar como provider estándar                    │  ║ │
│  ║  └─────────────────────────────────────────────────────────────┘  ║ │
│  ║                                                                    ║ │
│  ║  Deliverables:                                                      ║ │
│  ║  • Free Claude Code como provider estándar                        ║ │
│  ║  • Seamless integration con routing                               ║ │
│  ║  • Documentación de uso                                           ║ │
│  ║                                                                    ║ │
│  ╚═══════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│  ╔═══════════════════════════════════════════════════════════════════╗ │
│  ║  FASE 4: CAPABILITY ROUTER (Semanas 13-16)                          ║ │
│  ║  ══════════════════════════════════════════                         ║ │
│  ║                                                                    ║ │
│  ║  Objetivo: Implementar routing inteligente por capacidades         ║ │
│  ║                                                                    ║ │
│  ║  Tareas:                                                            ║ │
│  ║  ┌─────────────────────────────────────────────────────────────┐  ║ │
│  ║  │ □ 4.1 Definir modelo de capacidades                        │  ║ │
│  ║  │ □ 4.2 Implementar Capability Engine                        │  ║ │
│  ║  │ □ 4.3 Crear algoritmo de scoring                           │  ║ │
│  ║  │ □ 4.4 Implementar sistema de fallbacks                     │  ║ │
│  ║  │ □ 4.5 Integrar con API Key Manager                         │  ║ │
│  ║  │ □ 4.6 Añadir health checks dinámicos                       │  ║ │
│  ║  │ □ 4.7 Tests de stress y load                               │  ║ │
│  ║  │ □ 4.8 Tuning de pesos y parámetros                          │  ║ │
│  ║  └─────────────────────────────────────────────────────────────┘  ║ │
│  ║                                                                    ║ │
│  ║  Deliverables:                                                      ║ │
│  ║  • Capability Router completamente funcional                     ║ │
│  ║  • Selección inteligente de modelos                              ║ │
│  ║  • Fallbacks automáticos                                         ║ │
│  ║                                                                    ║ │
│  ╚═══════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│  ╔═══════════════════════════════════════════════════════════════════╗ │
│  ║  FASE 5: CAPABILITY ORCHESTRATOR (Semanas 17-20)                  ║ │
│  ║  ═════════════════════════════════════════════                     ║ │
│  ║                                                                    ║ │
│  ║  Objetivo: Implementar orquestación de múltiples modelos          ║ │
│  ║                                                                    ║ │
│  ║  Tareas:                                                            ║ │
│  ║  ┌─────────────────────────────────────────────────────────────┐  ║ │
│  ║  │ □ 5.1 Implementar tipos de orquestación                    │  ║ │
│  ║  │ □ 5.2 Crear Context Manager compartido                     │  ║ │
│  ║  │ □ 5.3 Implementar Execution Engine                         │  ║ │
│  ║  │ □ 5.4 Añadir soporte para pipelines complejos              │  ║ │
│  ║  │ □ 5.5 Tests de orquestación                                │  ║ │
│  ║  │ □ 5.6 Optimización de latencia                             │  ║ │
│  ║  │ □ 5.7 Documentación de ejemplos                            │  ║ │
│  ║  └─────────────────────────────────────────────────────────────┘  ║ │
│  ║                                                                    ║ │
│  ║  Deliverables:                                                      ║ │
│  ║  • Capability Orchestrator funcional                             ║ │
│  ║  • Orquestación multi-modelo                                    ║ │
│  ║  • Casos de uso documentados                                     ║ │
│  ║                                                                    ║ │
│  ╚═══════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│  ╔═══════════════════════════════════════════════════════════════════╗ │
│  ║  FASE 6: RESILIENCIA Y PRODUCCIÓN (Semanas 21-24)                 ║ │
│  ║  ════════════════════════════════════════════════════              ║ │
│  ║                                                                    ║ │
│  ║  Objetivo: Fortalecer el sistema para producción                   ║ │
│  ║                                                                    ║ │
│  ║  Tareas:                                                            ║ │
│  ║  ┌─────────────────────────────────────────────────────────────┐  ║ │
│  ║  │ □ 6.1 Implementar Secrets Management (Vault/KMS)          │  ║ │
│  ║  │ □ 6.2 Audit log inmutable                                  │  ║ │
│  ║  │ □ 6.3 OpenTelemetry integration                            │  ║ │
│  ║  │ □ 6.4 Load testing y optimization                          │  ║ │
│  ║  │ □ 6.5 Chaos engineering                                   │  ║ │
│  ║  │ □ 6.6 Runbooks de operaciones                              │  ║ │
│  ║  │ □ 6.7 Documentación de producción                          │  ║ │
│  ║  │ □ 6.8 Plan de rollback                                     │  ║ │
│  ║  └─────────────────────────────────────────────────────────────┘  ║ │
│  ║                                                                    ║ │
│  ║  Deliverables:                                                      ║ │
│  ║  • Sistema listo para producción                                 ║ │
│  ║  • Documentación operacional completa                            ║ │
│  ║  • Plan de recuperación ante desastres                           ║ │
│  ║                                                                    ║ │
│  ╚═══════════════════════════════════════════════════════════════════╝ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Timeline Visual

```
2026                              2027
Julio    Agosto   Sept    Oct     Nov     Dic     Ene     Feb
  │        │       │       │       │       │       │       │
  ▼        ▼       ▼       ▼       ▼       ▼       ▼       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FASE 1  │  FASE 2  │  FASE 3  │  FASE 4  │  FASE 5  │    FASE 6    │
│ Fundacion│API Key Mgr│  Free CC │Cap Router│Cap Orches│Resiliencia   │
└──────────────────────────────────────────────────────────────────────┘
  ▲        ▲         ▲         ▲         ▲         ▲
  │        │         │         │         │         │
  │        │         │         │         │         └─► Producción
  │        │         │         │         │
  │        │         │         │         └────────────► Feature freeze
  │        │         │         │
  │        │         │         └─────────────────────► Beta testing
  │        │         │
  │        │         └─────────────────────────────► Free CC integrado
  │        │
  │        └────────────────────────────────────────► API Key Manager v2
  │
  └───────────────────────────────────────────────► MVP funcional
```

---

## 14. COMPATIBILIDAD Y EXTENSIBILIDAD

### 14.1 Agregar Nuevos Proveedores

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GUÍA: AGREGAR NUEVO PROVEEDOR                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Para agregar un nuevo provider, solo necesitas:                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PASO 1: Crear el archivo del adapter                           │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  # providers/mi_proveedor.py                                    │   │
│  │                                                                  │   │
│  │  from .base import BaseProvider                                  │   │
│  │  from ...types import LLMRequest, LLMResponse                    │   │
│  │                                                                  │   │
│  │  class MiProveedorProvider(BaseProvider):                       │   │
│  │      id = "mi_proveedor"                                        │   │
│  │      name = "Mi Proveedor"                                       │   │
│  │      api_type = "openai"  # o "anthropic", "custom"             │   │
│  │                                                                   │   │
│  │      async def healthCheck(self):                                │   │
│  │          ...                                                     │   │
│  │                                                                   │   │
│  │      async def stream(self, request):                            │   │
│  │          ...                                                     │   │
│  │                                                                   │   │
│  │      async def send(self, request):                              │   │
│  │          ...                                                     │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PASO 2: Definir capacidades                                     │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  # capabilities/mi_proveedor.yaml                                │   │
│  │                                                                  │   │
│  │  mi_proveedor:                                                   │   │
│  │    models:                                                       │   │
│  │      - mi-modelo-v1                                              │   │
│  │      - mi-modelo-v2                                              │   │
│  │    capabilities:                                                 │   │
│  │      code_generation: 0.85                                       │   │
│  │      reasoning: 0.80                                             │   │
│  │      analysis: 0.75                                              │   │
│  │    constraints:                                                  │   │
│  │      max_tokens: 4096                                             │   │
│  │      max_context: 128000                                          │   │
│  │      supports_streaming: true                                    │   │
│  │      supports_tools: false                                       │   │
│  │    cost:                                                         │   │
│  │      input_per_1m: 1.0                                           │   │
│  │      output_per_1m: 2.0                                          │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PASO 3: Registrar en el factory                                 │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  # providers/__init__.py                                         │   │
│  │                                                                  │   │
│  │  from .mi_proveedor import MiProveedorProvider                   │   │
│  │                                                                  │   │
│  │  PROVIDER_REGISTRY = {                                           │   │
│  │      # ... otros providers                                       │   │
│  │      "mi_proveedor": MiProveedorProvider,                        │   │
│  │  }                                                               │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PASO 4: Agregar API keys                                        │   │
│  │  ───────────────────────────────────────────────                 │   │
│  │                                                                  │   │
│  │  POST /api/v1/providers                                          │   │
│  │  {                                                              │   │
│  │    "name": "mi_proveedor",                                       │   │
│  │    "api_base": "https://api.miproveedor.com/v1",                │   │
│  │    "priority": 50,                                               │   │
│  │    "supported_models": ["mi-modelo-v1", "mi-modelo-v2"]         │   │
│  │  }                                                              │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ¡Listo! El nuevo provider ahora está disponible en todo el sistema.    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Reemplazar Cualquier Proveedor

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    REEMPLAZO DE PROVEEDOR                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Escenario: Quieres migrar de Anthropic (oficial) a Free Claude Code   │
│                                                                          │
│  SIN CAMBIOS EN EL CÓDIGO DE APLICACIÓN:                                │
│                                                                          │
│  Opción A: Cambiar prioridad                                            │
│  ────────────────────────────────                                       │
│                                                                          │
│  POST /api/v1/providers/anthropic                                        │
│  {                                                                      │
│    "priority": 10  # Reducir prioridad                                   │
│  }                                                                      │
│                                                                          │
│  POST /api/v1/providers/free_claude_code                                 │
│  {                                                                      │
│    "priority": 100  # Aumentar prioridad                                 │
│  }                                                                      │
│                                                                          │
│  El Capability Router automáticamente usará Free Claude Code primero.  │
│                                                                          │
│  ────────────────────────────────────────────────────────────────────   │
│                                                                          │
│  Opción B: Cambiar modelo de API Key                                     │
│  ─────────────────────────────────────────                              │
│                                                                          │
│  Las API keys de "anthropic" ahora apuntan al servidor Free Claude Code. │
│                                                                          │
│  UPDATE api_keys SET provider_id = 'free_claude_code'                   │
│  WHERE provider_id = 'anthropic' AND status = 'active';                │
│                                                                          │
│  ────────────────────────────────────────────────────────────────────   │
│                                                                          │
│  Opción C: Deshabilitar provider                                        │
│  ────────────────────────────────────────                               │
│                                                                          │
│  DELETE /api/v1/providers/anthropic  # O marcar como deleted           │
│                                                                          │
│  El router simplemente ignorará ese provider.                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## RESUMEN EJECUTIVO DE ENTREGABLES

| # | Entregable | Estado | Ubicación |
|---|------------|--------|-----------|
| 1 | ✅ Auditoría API Key Manager | Completado | `AUDITORIA_REPO_APIKEY.md` |
| 2 | ✅ Auditoría Free Claude Code | Completado | `AUDITORIA_REPO_FREE_CLAUDE_CODE.md` |
| 3 | ✅ Propuesta Arquitectura Unificada | Completado | `PROPUESTA_ARQUITECTURA_UNIFICADA.md` (este documento) |
| 4 | ✅ Diagrama de Componentes | Completado | Sección 10 |
| 5 | ✅ Diagrama de Flujo | Completado | Sección 5 |
| 6 | ✅ Lista de Mejoras | Completado | Sección 11 |
| 7 | ✅ Riesgos Detectados | Completado | Sección 12 |
| 8 | ✅ Estrategia por Fases | Completado | Sección 13 |

---

## PRÓXIMOS PASOS

Una vez validada esta propuesta:

1. **Revisión**: Analizar y aprobar/rechazar componentes
2. **Priorización**: Ajustar el roadmap según recursos
3. **Kickoff FASE 1**: Iniciar implementación de la base
4. **Iteración**: Revisiones semanales de progreso

---

*Documento generado: 2026-07-22*  
*Versión: 1.0.0*  
*Estado: PARA VALIDACIÓN*
