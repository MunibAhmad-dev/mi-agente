# 🏛️ ARQUITECTURA EMPRESARIAL v3.0
## Sistema de Orquestación de Inteligencia Artificial

**Fecha:** 2026-07-19  
**Auditor:** OpenHands AI Agent (Principal Software Architect, Enterprise Architect, AI Systems Architect)  
**Versión:** 3.0 Enterprise  
**Clasificación:** Proprietaria  

---

# PARTE I: ANÁLISIS CRÍTICO DE LA PROPUESTA ORIGINAL

## 1.1 PROBLEMA FUNDAMENTAL

### La propuesta original es "LLM-Centric"

La arquitectura propuesta organiza todo alrededor de los LLM:

```
User → LibreChat → AI-OS → LLMGateway → Providers
```

**Este enfoque tiene defectos arquitecturales fundamentales:**

| Defecto | Impacto |
|---------|---------|
| LLM como centro | Todo se convierte en "llamada a LLM" |
| Multimedia como after-thought | No hay abstracción para img/video/audio |
| Routing por proveedor | No por capacidad |
| Sin concepto de tareas compuestas | No hay descomposición |
| Free Claude Code como núcleo | Acoplamiento innecesario |

### ¿Por qué los LLM NO deben ser el centro?

1. **Los LLM son solo UN tipo de recurso computacional**
   - También existen: código, imágenes, video, audio, búsqueda, almacenamiento
   - Son igualmente importantes para completar tareas

2. **El usuario quiere una TAREA completada**
   - No quiere "usar Claude" o "usar GPT-4"
   - El modelo es un detalle de implementación

3. **El centro debe ser: EL TRABAJO (TASK)**
   - Descomponer la intención del usuario
   - Seleccionar el recurso apropiado para cada tarea
   - Coordinar la ejecución

---

## 1.2 EVALUACIÓN: Execution Engine vs LLM Gateway como centro

### Opción A: LLM Gateway como centro (Propuesta actual)

```
User → LibreChat → LLM Gateway → Providers
```

| Aspecto | Evaluación |
|---------|------------|
| Complejidad | Media |
| Extensibilidad | Limitada a LLMs |
| Testabilidad | Media |
| Mantenibilidad | Baja (acoplamiento) |

### Opción B: Execution Engine como centro (SUPERIOR)

```
User → LibreChat → Execution Engine → Runtimes → Providers
```

| Aspecto | Evaluación |
|---------|------------|
| Complejidad | Media-Alta |
| Extensibilidad | Alta (nuevos runtimes) |
| Testabilidad | Alta |
| Mantenibilidad | Alta |

### ✅ DECISIÓN: Execution Engine como centro

**Justificación técnica:**

1. **Separación de concerns**
   - Task Planner: qué hacer
   - Workflow Engine: cómo coordinar
   - Runtimes: cómo ejecutar

2. **Extensibilidad**
   - Agregar nuevo runtime = agregar plugin
   - No modificar el core

3. **Testabilidad**
   - Cada componente testeable independientemente

4. **Evolutividad**
   - Nuevos tipos de IA (agents, workflows, multimedia)
   - Sin reescribir el núcleo

---

# PARTE II: ARQUITECTURA EMPRESARIAL v3.0

## 2.1 VISIÓN DE ALTO NIVEL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USUARIO                                         │
│                   "Completa esta investigación, genera imágenes               │
│                    y escribe un PDF con los resultados"                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LIBRECHAT                                        │
│        (UI, Chat, Dashboard, Estado de conversación, Memoria)               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI-OS                                          │
│   (Orquestación global, Configuración centralizada, Context Manager)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION ENGINE                                    │
│                    "Motor de Ejecución - Decide QUÉ ejecutar"              │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐ │
│  │  Task Planner    │ ──▶ │ Workflow Engine  │ ──▶ │  Task Scheduler  │ │
│  │  (Descomposición)│     │   (DAG + Sync)  │     │   (Cola)        │ │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RUNTIME REGISTRY                                    │
│              "Registro de todos los runtimes disponibles"                  │
│                                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │   LLM    │ │  Code    │ │  Media   │ │ Search   │ │ Storage  │    │
│  │ Runtime  │ │ Runtime  │ │ Runtime  │ │ Runtime  │ │ Runtime  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│  │ Browser  │ │   MCP    │ │   RAG    │ │ Custom   │                   │
│  │ Runtime  │ │ Runtime  │ │ Runtime  │ │ Runtimes │                   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CAPABILITY ROUTER                                     │
│         "Selecciona runtime por CAPACIDADES, no por nombre"               │
│                                                                             │
│  Input: { required: [code, vision, fast], preferred: [cheap] }         │
│  Output: { runtime: 'llm', provider: 'groq', model: 'llama-3-70b' }     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EXECUTION PROFILE                                     │
│                    "Contrato de ejecución"                                 │
│                                                                             │
│  {                                                                          │
│    runtime: 'llm',                                                         │
│    tools: ['web_search', 'file_write', 'image_gen'],                     │
│    model: 'groq-llama-3.3-70b',                                          │
│    max_tokens: 4096,                                                       │
│    temperature: 0.7,                                                       │
│    timeout: 60000,                                                         │
│    retry: { max_attempts: 3, backoff: 'exponential' }                   │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RUNTIME ESPECÍFICO                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                         LLM RUNTIME                               │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │     │
│  │  │LLM Gateway  │─▶│ApiKey Manager│─▶│  Provider    │       │     │
│  │  │ (Coordinador)│  │  (Keys)     │  │  Adapter     │       │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                        CODE RUNTIME                              │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │     │
│  │  │   Sandbox   │─▶│  Executor   │─▶│   Output     │       │     │
│  │  │  (Docker)   │  │  (Python)  │  │   Manager    │       │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                       MEDIA RUNTIME                               │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │     │
│  │  │  ComfyUI   │─▶│   Stable    │─▶│    WAN      │       │     │
│  │  │  Runtime   │  │  Diffusion  │  │   Runtime   │       │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │     │
│  └─────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SHARED SERVICES                                   │
│                   "Servicios transversales"                               │
│                                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│  │  API-Key    │ │   Metrics    │ │   Health     │ │    Cost      ││
│  │   Manager   │ │   Manager    │ │   Manager    │ │   Manager    ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘│
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│  │    Audit    │ │  Telemetry   │ │     Rate     │ │   Quota      ││
│  │   Manager   │ │   Manager    │ │   Limiter    │ │   Manager    ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2.2 COMPONENTES CORE

### 2.2.1 AI-OS (Orquestador Global)

**No es un agente. Es el sistema operativo de IA.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI-OS                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  RESPONSABILIDADES:                                                         │
│  • Gestión de contexto global                                              │
│  • Memoria persistente                                                      │
│  • Configuración centralizada                                              │
│  • Dashboard de monitoreo                                                   │
│  • Autenticación y autorización                                             │
│                                                                             │
│  NO hace:                                                                  │
│  • ❌ No ejecuta tareas directamente                                        │
│  • ❌ No conoce detalles de proveedores                                     │
│  • ❌ No selecciona modelos                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Interfaz:**
```typescript
interface AIOS {
  // Contexto
  getContext(sessionId: string): Promise<ExecutionContext>;
  setContext(sessionId: string, context: Partial<ExecutionContext>): Promise<void>;
  
  // Memoria
  getMemory(sessionId: string): Promise<Memory>;
  addToMemory(sessionId: string, data: MemoryEntry): Promise<void>;
  
  // Configuración
  getConfig(): Promise<SystemConfig>;
  updateConfig(config: Partial<SystemConfig>): Promise<void>;
  
  // Monitoreo
  getMetrics(): Promise<SystemMetrics>;
  subscribeToEvents(handler: EventHandler): Promise<Unsubscribe>;
}
```

---

### 2.2.2 Execution Engine

**El corazón de la arquitectura. Decide QUÉ ejecutar.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION ENGINE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SUB-COMPONENTES:                                                          │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                        TASK PLANNER                              │    │
│  │                                                                    │    │
│  │  Input: "Investiga sobre IA, genera imágenes y escribe PDF"       │    │
│  │                                                                    │    │
│  │  Output: [                                                       │    │
│  │    { type: 'research', deps: [] },                             │    │
│  │    { type: 'image_gen', deps: ['research'] },                  │    │
│  │    { type: 'pdf_write', deps: ['research', 'image_gen'] }     │    │
│  │  ]                                                               │    │
│  │                                                                    │    │
│  │  Responsabilidades:                                                │    │
│  │  • Parsear intención del usuario                                  │    │
│  │  • Descomponer en tareas atómicas                                 │    │
│  │  • Identificar dependencias                                      │    │
│  │  • Clasificar por tipo de runtime                                │    │
│  │  • Estimar costo y duración                                      │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                      WORKFLOW ENGINE                             │    │
│  │                                                                    │    │
│  │  Responsabilidades:                                                │    │
│  │  • Construcción de DAG (Directed Acyclic Graph)                   │    │
│  │  • Ejecución paralela de tareas independientes                     │    │
│  │  • Gestión de dependencias                                       │    │
│  │  • Manejo de errores con retry                                  │    │
│  │  • Compensación (rollback) en caso de falla                     │    │
│  │  • Streaming de resultados parciales                              │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                       TASK SCHEDULER                             │    │
│  │                                                                    │    │
│  │  Responsabilidades:                                                │    │
│  │  • Cola de tareas                                               │    │
│  │  • Priorización                                                  │    │
│  │  • Balanceo de carga                                            │    │
│  │  • Throttling                                                   │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Interfaz Task Planner:**
```typescript
interface TaskPlanner {
  // Descomponer intención en tareas
  plan(intent: string, context: ExecutionContext): Promise<TaskGraph>;
  
  // Refinar plan basado en feedback
  refine(plan: TaskGraph, feedback: ExecutionFeedback): Promise<TaskGraph>;
}

interface TaskGraph {
  tasks: Task[];
  edges: TaskDependency[];
  estimatedCost: CostEstimate;
  estimatedDuration: number;
}

interface Task {
  id: string;
  type: TaskType;  // 'llm' | 'code' | 'media' | 'search' | 'storage' | ...
  description: string;
  requiredCapabilities: Capability[];
  executionProfile: Partial<ExecutionProfile>;
  constraints: TaskConstraints;
}
```

---

### 2.2.3 Runtime Registry

**Patrón plugin para ejecutar diferentes tipos de tareas.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RUNTIME REGISTRY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PATRÓN: Plugin System                                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    Runtime Interface                             │     │
│  │                                                                  │     │
│  │  interface Runtime {                                          │     │
│  │    readonly name: string;                                     │     │
│  │    readonly capabilities: Capability[];                       │     │
│  │    readonly supportedTaskTypes: TaskType[];                    │     │
│  │                                                                  │     │
│  │    canExecute(task: Task): boolean;                            │     │
│  │    execute(task: Task, profile: ExecutionProfile): Promise<Result>;   │     │
│  │    abort(executionId: string): Promise<void>;                  │     │
│  │    getStatus(executionId: string): ExecutionStatus;             │     │
│  │  }                                                             │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  RUNTIMES REGISTRADOS:                                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  LLM RUNTIME           │  CODE RUNTIME         │  MEDIA RUNTIME  │     │
│  │  ───────────────────  │  ─────────────────── │  ─────────────  │     │
│  │  • Claude Code        │  • Python Sandbox    │  • ComfyUI     │     │
│  │  • Groq               │  • Node.js            │  • SD WebUI     │     │
│  │  • DeepSeek           │  • Bash              │  • Fooocus      │     │
│  │  • Gemini             │  • WASM              │  • Forge         │     │
│  │  • OpenAI             │                      │                 │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  SEARCH RUNTIME        │  STORAGE RUNTIME     │  MCP RUNTIME   │     │
│  │  ───────────────────  │  ─────────────────── │  ─────────────  │     │
│  │  • Tavily              │  • S3                 │  • MCP Server   │     │
│  │  • Serper              │  • GCS                │  • Custom MCP   │     │
│  │  • DuckDuckGo         │  • Local FS          │                 │     │
│  │  • Brave              │  • Database          │                 │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2.4 Capability Router

**Selecciona runtime por capacidades, no por nombre.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CAPABILITY ROUTER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PROBLEMA: El usuario no debe conocer los modelos.                       │
│  SOLUCIÓN: Seleccionar por capacidades requeridas.                       │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                        CAPABILITY REGISTRY                      │    │
│  │                                                                    │    │
│  │  vision:        [Claude 3.5, GPT-4V, Gemini 1.5]              │    │
│  │  code:          [Claude 3.5, GPT-4, DeepSeek Coder]            │    │
│  │  long_context:  [Gemini 1M, Claude 200K, GPT-4 128K]          │    │
│  │  fast:          [Groq, Gemini Flash, Claude 3 Haiku]            │    │
│  │  cheap:         [Groq, DeepSeek, Cloudflare]                  │    │
│  │  reasoning:     [Claude 3.5, o1-preview, Gemini 2.0]         │    │
│  │  function_call: [GPT-4, Claude 3.5, Gemini]                  │    │
│  │  search:        [Perplexity, Gemini, GPT-4]                   │    │
│  │                                                                    │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  EJEMPLO DE SELECCIÓN:                                                  │
│                                                                             │
│  Input:  { required: [code, fast], preferred: [cheap] }               │
│                                                                             │
│  Step 1: Filter runtimes que soportan 'code'                            │
│           Result: [LLM Runtime: Groq, DeepSeek, Claude]                 │
│                                                                             │
│  Step 2: Filter por 'fast'                                              │
│           Result: [LLM Runtime: Groq]                                   │
│                                                                             │
│  Step 3: Ordenar por 'cheap'                                            │
│           Result: [LLM Runtime: Groq (score: 95)]                       │
│                                                                             │
│  Output: {                                                              │
│    runtime: 'llm',                                                      │
│    provider: 'groq',                                                   │
│    model: 'llama-3.3-70b-versatile',                                   │
│    reason: 'Best match for code + fast + cheap'                          │
│  }                                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Interfaz:**
```typescript
interface CapabilityRouter {
  // Seleccionar runtime y configuración óptima
  route(requirements: CapabilityRequirements): Promise<RouteDecision>;
  
  // Actualizar registry de capacidades
  updateCapabilities(provider: string, capabilities: Capability[]): Promise<void>;
  
  // Obtener recomendaciones
  getRecommendations(taskType: TaskType): Promise<RuntimeRecommendation[]>;
}

interface RouteDecision {
  runtime: string;
  provider: string;
  model: string;
  executionProfile: ExecutionProfile;
  reason: string;
  fallbackProviders: string[];
}
```

---

### 2.2.5 Execution Profile

**El contrato entre el planificador y el ejecutor.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EXECUTION PROFILE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DEFINICIÓN:                                                              │
│  Un Execution Profile define TODA la configuración necesaria para          │
│  ejecutar una tarea en un runtime específico.                            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                    PROFILE STRUCTURE                           │    │
│  │                                                                    │    │
│  │  {                                                                  │    │
│  │    // Identificación                                                │    │
│  │    id: string;                                                      │    │
│  │    name: string;                                                   │    │
│  │    version: string;                                                │    │
│  │                                                                    │    │
│  │    // Runtime                                                       │    │
│  │    runtime: 'llm' | 'code' | 'media' | ...;                      │    │
│  │    provider?: string;  // Opcional, el router decide             │    │
│  │    model?: string;    // Opcional                                  │    │
│  │                                                                    │    │
│  │    // Configuración de ejecución                                    │    │
│  │    temperature?: number;                                           │    │
│  │    maxTokens?: number;                                              │    │
│  │    timeout?: number;                                                │    │
│  │    streaming?: boolean;                                             │    │
│  │                                                                    │    │
│  │    // Herramientas                                                  │    │
│  │    tools: ToolDefinition[];                                        │    │
│  │    toolChoice?: 'auto' | 'none' | ToolChoice;                     │    │
│  │                                                                    │    │
│  │    // Permisos y límites                                            │    │
│  │    permissions: Permission[];                                       │    │
│  │    limits: {                                                        │    │
│  │      maxIterations?: number;                                        │    │
│  │      maxCost?: number;                                             │    │
│  │      maxTime?: number;                                             │    │
│  │    };                                                              │    │
│  │                                                                    │    │
│  │    // Recursos                                                       │    │
│  │    resources: ResourceRequirement[];                                │    │
│  │                                                                    │    │
│  │    // Retry y fallback                                             │    │
│  │    retry?: {                                                       │    │
│  │      maxAttempts: number;                                          │    │
│  │      backoff: 'linear' | 'exponential';                           │    │
│  │      retryOn: string[];  // Códigos de error                       │    │
│  │    };                                                              │    │
│  │    fallbackProfiles?: ExecutionProfile[];                           │    │
│  │  }                                                                  │    │
│  │                                                                    │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2.3 RUNTIME ESPECÍFICO: LLM Runtime

### 2.3.1 Arquitectura del LLM Runtime

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LLM RUNTIME                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PROPÓSITO: Ejecutar tareas que requieren modelos de lenguaje.          │
│                                                                             │
│  NO es un God Object. Es un COORDINADOR que delega.                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                      LLM GATEWAY (Coordinador)                  │     │
│  │                                                                  │     │
│  │  Responsabilidad ÚNICA: Coordinación                          │     │
│  │                                                                  │     │
│  │  DELega a:                                                     │     │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │     │
│  │  │Retry Manager │ │Health Manager│ │Metrics Manager│       │     │
│  │  └──────────────┘ └──────────────┘ └──────────────┘        │     │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │     │
│  │  │ Cost Manager │ │ Audit Manager │ │ Telemetry    │        │     │
│  │  └──────────────┘ └──────────────┘ └──────────────┘        │     │
│  │                                                                  │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                  │                                         │
│                                  ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    PROVIDER REGISTRY                             │     │
│  │                                                                  │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │     │
│  │  │  Groq   │ │ DeepSeek│ │Cloudflare│ │Mistral  │           │     │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │     │
│  │  │Anthropic│ │ Google  │ │ Cohere  │ │Together  │           │     │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │     │
│  │                                                                  │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                  │                                         │
│                                  ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    PROVIDER ADAPTERS                             │     │
│  │                                                                  │     │
│  │  interface LLMAdapter {                                        │     │
│  │    readonly provider: string;                                   │     │
│  │    readonly supportedModels: string[];                          │     │
│  │    readonly capabilities: Capability[];                           │     │
│  │                                                                  │     │
│  │    complete(params: LLMParams): Promise<LLMResponse>;          │     │
│  │    stream(params: LLMParams): AsyncGenerator<LLMDelta>;          │     │
│  │    embed(params: EmbedParams): Promise<EmbedResponse>;           │     │
│  │  }                                                              │     │
│  │                                                                  │     │
│  │  Implementaciones:                                               │     │
│  │  • OpenAIAdapter                                                 │     │
│  │  • AnthropicAdapter                                              │     │
│  │  • GoogleAdapter                                                 │     │
│  │  • GroqAdapter                                                   │     │
│  │  • DeepSeekAdapter                                               │     │
│  │  • ... (extensible)                                             │     │
│  │                                                                  │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3.2 Módulos Especializados del LLM Gateway

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MÓDULOS ESPECIALIZADOS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                │
│  │   RETRY         │ │    HEALTH       │ │   METRICS      │                │
│  │   MANAGER      │ │   MANAGER      │ │   MANAGER     │                │
│  │                 │ │                 │ │                 │                │
│  │ • Exponential   │ │ • Health checks │ │ • Token count  │                │
│  │   backoff      │ │ • Latency mon   │ │ • Cost track   │                │
│  │ • Retry on     │ │ • Error rate   │ │ • Request/sec  │                │
│  │   specific     │ │ • Provider     │ │ • User usage   │                │
│  │   errors       │ │   status       │ │                 │                │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘                │
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                │
│  │     COST       │ │     AUDIT       │ │   TELEMETRY     │                │
│  │   MANAGER      │ │   MANAGER      │ │   MANAGER     │                │
│  │                 │ │                 │ │                 │                │
│  │ • Real-time    │ │ • All requests │ │ • Distributed  │                │
│  │   tracking     │ │ • User actions │ │   tracing      │                │
│  │ • Budget       │ │ • API keys     │ │ • Spans        │                │
│  │   alerts       │ │ • Data access  │ │ • Events       │                │
│  │ • Optimizations │ │                 │ │ • Logs         │                │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘                │
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                │
│  │     RATE       │ │     QUOTA       │ │   TELEMETRY     │                │
│  │   LIMITER     │ │   MANAGER      │ │   PROVIDER      │                │
│  │                 │ │                 │ │   ADAPTERS     │                │
│  │ • Per-provider │ │ • Per-user     │ │ • OpenAI        │                │
│  │   limits       │ │   quotas       │ │ • Anthropic    │                │
│  │ • Per-user     │ │ • Org limits   │ │ • Google        │                │
│  │   limits       │ │ • Usage alerts │ │ • Groq          │                │
│  │ • Queue mgmt   │ │                 │ │ • ...          │                │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2.4 FREE CLAUDE CODE: Runtime Especializado

### 2.4.1 Posición en la Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FREE CLAUDE CODE: Runtime Especializado                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ❌ NO es el centro del sistema.                                          │
│  ✅ ES un Runtime especializado que se usa CUANDO corresponde.            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                    CUÁNDO USAR CLAUDE CODE                        │    │
│  │                                                                    │    │
│  │  ✓ Tarea requiere filesystem                                     │    │
│  │  ✓ Tarea requiere terminal/bash                                   │    │
│  │  ✓ Tarea requiere edición de archivos                            │    │
│  │  ✓ Tarea requiere patches/git                                     │    │
│  │  ✓ Tarea requiere planificación de código                         │    │
│  │  ✓ Tarea requiere browser automation                              │    │
│  │                                                                    │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                    CUÁNDO NO USAR CLAUDE CODE                      │    │
│  │                                                                    │    │
│  │  ✗ Simple chat sin herramientas                                  │    │
│  │  ✗ Generación de imágenes (usar ComfyUI Runtime)                  │    │
│  │  ✗ Búsqueda web simple (usar Search Runtime)                    │    │
│  │  ✗ TTS/STT (usar Audio Runtime)                                │    │
│  │  ✗ Tasks que no necesitan filesystem                             │    │
│  │                                                                    │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  INTEGRACIÓN EN RUNTIME REGISTRY:                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  RuntimeRegistry                                                │     │
│  │  ├── register('claude-code', ClaudeCodeRuntime)                │     │
│  │  ├── register('groq', GroqRuntime)                              │     │
│  │  ├── register('comfyui', ComfyUIRuntime)                       │     │
│  │  └── register('browser-use', BrowserUseRuntime)                 │     │
│  │                                                                  │     │
│  │  CapabilityRouter                                               │     │
│  │  └── canExecute(task) {                                        │     │
│  │        if (task.needsFilesystem) return 'claude-code';        │     │
│  │        if (task.needsImages) return 'comfyui';                 │     │
│  │        // ...                                                   │     │
│  │  }                                                             │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2.5 API-KEY MANAGER: Servicio Transversal

### 2.5.1 Arquitectura Extendida

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API-KEY MANAGER                                   │
│                   "Administración centralizada de TODAS las APIs"        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ❌ NO es solo para LLM.                                                │
│  ✅ Administra CUALQUIER API externa.                                     │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                    CAPACIDADES                                   │    │
│  │                                                                    │    │
│  │  • Gestión de lifecycle (crear, rotar, revocar)                 │    │
│  │  • Rate limiting por provider y usuario                          │    │
│  │  • Cuotas y presupuestos                                         │    │
│  │  • Cooldown automático por errores                               │    │
│  │  • Cost tracking y optimización                                  │    │
│  │  • Auditoría completa de uso                                      │    │
│  │  • Health monitoring por provider                                 │    │
│  │  • Prioridades y failover                                       │    │
│  │  • Blacklisting de keys comprometidas                           │    │
│  │  • Encriptación en reposo                                       │    │
│  │  • Multiusuario y multi-tenant                                  │    │
│  │  • Multi-proveedor                                               │    │
│  │                                                                    │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                    PROVIDERS SOPORTADOS                           │    │
│  │                                                                    │    │
│  │  LLM:                                                              │    │
│  │  • OpenAI, Anthropic, Google, Groq, DeepSeek, Mistral, etc.    │    │
│  │                                                                    │    │
│  │  Imagen:                                                           │    │
│  │  • DALL-E, Stable Diffusion, Midjourney, Leonardo, etc.          │    │
│  │                                                                    │    │
│  │  Video:                                                           │    │
│  │  • Runway, Luma AI, Sora, Kling, etc.                          │    │
│  │                                                                    │    │
│  │  Audio:                                                           │    │
│  │  • ElevenLabs, Deepgram, AssemblyAI, etc.                       │    │
│  │                                                                    │    │
│  │  Búsqueda:                                                        │    │
│  │  • Tavily, Serper, Brave, Google Search, etc.                 │    │
│  │                                                                    │    │
│  │  Almacenamiento:                                                  │    │
│  │  • AWS, GCS, Azure Blob, S3-compatible, etc.                   │    │
│  │                                                                    │    │
│  │  Otros:                                                           │    │
│  │  • GitHub, GitLab, Jira, Linear, Notion, Slack, etc.         │    │
│  │                                                                    │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# PARTE III: MATRIZ DE RESPONSABILIDADES

## 3.1 TABLA DE RESPONSABILIDADES EXCLUSIVAS

```
┌────────────────────┬───────────────────────────────────────┬───────────────────────────────────────┐
│ COMPONENTE       │ RESPONSABLE DE                        │ NO ES RESPONSABLE DE                 │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ AI-OS             │ • Contexto global                     │ • Ejecución de tareas                │
│                  │ • Memoria persistente                  │ • Routing de capabilities            │
│                  │ • Config centralizada                 │ • Llamadas a providers               │
│                  │ • Dashboard                           │ • Lógica de negocio de ejecución     │
│                  │ • Auth/Authz                          │                                      │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ Execution Engine   │ • Task Planning                      │ • Contexto global                    │
│                  │ • Workflow orchestration               │ • Proveedores específicos            │
│                  │ • Scheduling                          │ • API keys                          │
│                  │ • DAG execution                       │ • UI                                 │
│                  │ • Paralelismo                        │                                      │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ Task Planner      │ • Parsear intención                  │ • Ejecutar tareas                     │
│                  │ • Descomponer tareas                 │ • Conocer runtimes                   │
│                  │ • Identificar deps                   │ • Providers                          │
│                  │ • Estimar costos                      │                                      │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ Workflow Engine   │ • DAG execution                      │ • Planificación de tareas             │
│                  │ • Sync/async execution               │ • Implementación de runtimes          │
│                  │ • Manejo de errores                 │ • API keys                           │
│                  │ • Compensación                       │                                      │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ Runtime Registry   │ • Registrar runtimes                 │ • Planificación de tareas             │
│                  │ • Discovery de capacidades            │ • Ejecución directa                  │
│                  │ • Lifecycle management               │ • Providers                          │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ Capability Router │ • Seleccionar runtime               │ • Ejecutar tareas                     │
│                  │ • Matching de capabilities           │ • Contexto global                    │
│                  │ • Fallback chain                     │ • Providers                          │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ LLM Runtime       │ • Coordinar LLMs                    │ • Tareas no-LLM                     │
│                  │ • Retry/fallback                     │ • UI                                 │
│                  │ • Health checks                      │ • Auth global                        │
│                  │ • Metrics                           │                                      │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ Claude Code       │ • Tareas con filesystem              │ • Tareas sin filesystem              │
│   Runtime        │ • Terminal/bash                      │ • Generación de imágenes            │
│                  │ • Patches                            │ • Búsqueda simple                  │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ Media Runtime     │ • Generación de imágenes             │ • Tareas LLM                        │
│                  │ • Video                              │ • Código                             │
│                  │ • Audio (TTS/STT)                   │ • Búsqueda                           │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ API-Key Manager   │ • TODAS las API keys               │ • Planificación                     │
│                  │ • Rate limiting                     │ • Ejecución de tareas              │
│                  │ • Cuotas/presupuestos               │ • UI                                │
│                  │ • Auditoría                         │                                      │
│                  │ • Cost tracking                     │                                      │
├────────────────────┼───────────────────────────────────────┼───────────────────────────────────────┤
│ Provider Adapter  │ • Llamadas a provider específico    │ • Routing                           │
│                  │ • Normalizar request/response       │ • Credenciales                      │
│                  │ • Error mapping                      │ • Scheduling                        │
└────────────────────┴───────────────────────────────────────┴───────────────────────────────────────┘
```

---

# PARTE IV: INTEGRACIÓN API-KEY

## 4.1 RAMAS AUDITADAS

| Rama | Puntuación | Contenido a Fusionar | No Fusionar |
|------|-------------|----------------------|--------------|
| **main** | 8.1/10 | Base de gestión de keys, encriptación | Tests con mocks |
| **LLM** | 8.8/10 | Circuit breaker, health checks, análisis predictivo | Tests redundantes |
| **dev** | 6.5/10 | ❌ NADA | Todo (reescritura incompatible) |
| **nuevas-ia** | 9.0/10 | 100+ proveedores, multimodal, cost tracking | Tests legacy |
| **severnity-fixes** | 9.5/10 | Seguridad endurecida, blacklist Redis | - |

## 4.2 ESTRATEGIA DE FUSIÓN

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PLAN DE FUSIÓN                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FASE 1: BASE SEGURA                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │ main + severnity-fixes                                         │     │
│  │                                                                 │     │
│  │ Resultado: api-key-base-secure                                  │     │
│  │ ✓ Credenciales obligatorias                                     │     │
│  │ ✓ Blacklist persistente (Redis)                                 │     │
│  │ ✓ Graceful degradation                                          │     │
│  │ ✓ Pre-flight validation                                         │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                       │
│                                    ▼                                       │
│  FASE 2: MULTIMODAL                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │ api-key-base-secure + LLM                                       │     │
│  │                                                                 │     │
│  │ Resultado: api-key-multimodal                                    │     │
│  │ ✓ Circuit breaker                                               │     │
│  │ ✓ Health checks robustos                                        │     │
│  │ ✓ Análisis predictivo (usage_analyzer)                           │     │
│  │ ✓ TTS, STT, Imagen, Video                                      │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                       │
│                                    ▼                                       │
│  FASE 3: PROVEEDORES                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │ api-key-multimodal + nuevas-ia                                  │     │
│  │                                                                 │     │
│  │ Resultado: api-key-production                                    │     │
│  │ ✓ 100+ proveedores                                             │     │
│  │ ✓ Cost tracking completo                                        │     │
│  │ ✓ System API                                                   │     │
│  │ ✓ Webhooks                                                     │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  NOTA: La rama "dev" NO DEBE SER MERGEADA. Es una reescritura.         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# PARTE V: FLUJO COMPLETO DE EJECUCIÓN

## 5.1 FLUJO: "Investiga sobre IA y genera imágenes"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO COMPLETO DE EJECUCIÓN                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. USUARIO ENVÍA PETICIÓN
   │
   │ "Investiga sobre las últimas tendencias en IA, genera 3 imágenes
   │  de ejemplo y escribe un resumen en PDF"
   │
   ▼
   
2. LIBRECHAT → AI-OS
   │
   │ Crea ExecutionContext
   │ Inicializa memoria
   │ Registra en dashboard
   │
   ▼
   
3. AI-OS → EXECUTION ENGINE
   │
   │ Pasa contexto
   │ Notifica inicio
   │
   ▼
   
4. TASK PLANNER (Descomposición)
   │
   │ Input: "Investiga tendencias IA, genera imágenes, escribe PDF"
   │
   │ Output:
   │ Task 1: research_ia (type: 'search' | 'llm')
   │ Task 2: generate_images (type: 'media', deps: [1])
   │ Task 3: write_pdf (type: 'llm', deps: [1, 2])
   │
   ▼
   
5. WORKFLOW ENGINE (Construcción DAG)
   │
   │        ┌─────────────┐
   │        │ research_ia │
   │        └──────┬──────┘
   │               │
   │        ┌──────┴──────┐
   │        ▼             ▼
   │ ┌───────────┐ ┌───────────┐
   │ │ generate  │ │  write   │
   │ │ _images   │ │   _pdf   │
   │ └───────────┘ └───────────┘
   │
   ▼
   
6. CAPABILITY ROUTER (Selección de runtime)
   │
   │ Task 1: { capabilities: [search, fast] }
   │   → Runtime: 'search' | Provider: 'tavily'
   │
   │ Task 2: { capabilities: [image_gen, fast] }
   │   → Runtime: 'media' | Provider: 'comfyui'
   │
   │ Task 3: { capabilities: [text_gen] }
   │   → Runtime: 'llm' | Provider: 'groq'
   │
   ▼
   
7. EXECUTION PROFILES (Contratos)
   │
   │ Profile 1 (Research):
   │   runtime: 'search'
   │   provider: 'tavily'
   │   tools: ['web_search']
   │
   │ Profile 2 (Images):
   │   runtime: 'media'
   │   provider: 'comfyui'
   │   workflow: 'image_gen_standard'
   │
   │ Profile 3 (PDF):
   │   runtime: 'llm'
   │   provider: 'groq'
   │   model: 'llama-3.3-70b'
   │   tools: ['file_write']
   │
   ▼
   
8. EJECUCIÓN EN PARALELO
   │
   │ ┌──────────────────────────────────────────────────────────────┐
   │ │                    WORKFLOW ENGINE                          │
   │ │                                                           │
   │ │  Step 1: Execute research_ia (parallel with others)      │
   │ │     │                                                     │
   │ │     └───▶ SEARCH RUNTIME ──▶ Tavily API                │
   │ │                                                           │
   │ │  Step 2: Execute generate_images (after 1)              │
   │ │     │                                                     │
   │ │     └───▶ MEDIA RUNTIME ──▶ ComfyUI ──▶ Stable Diffusion│
   │ │                                                           │
   │ │  Step 3: Execute write_pdf (after 1, 2)                │
   │ │     │                                                     │
   │ │     └───▶ LLM RUNTIME ──▶ Groq API                       │
   │ │                                                           │
   │ │  Step 4: Compile PDF (after 3)                          │
   │ │     │                                                     │
   │ │     └───▶ CODE RUNTIME ──▶ Python ──▶ WeasyPrint         │
   │ │                                                           │
   │ └──────────────────────────────────────────────────────────────┘
   │
   ▼
   
9. SHARED SERVICES (Transversal)
   │
   │ ┌──────────────────────────────────────────────────────────────┐
   │ │ API-KEY MANAGER                                           │
   │ │                                                           │
   │ │ • Validate quota for each task                           │
   │ │ • Get API keys (Tavily, ComfyUI, Groq)                   │
   │ │ • Track costs                                            │
   │ │ • Log usage for audit                                   │
   │ └──────────────────────────────────────────────────────────┘
   │
   ▼
   
10. RESULTADOS AL USUARIO
    │
    │ Final PDF con:
    │ • Investigación de tendencias IA
    │ • 3 imágenes generadas
    │ • Resumen ejecutivo
    │
    ▼
    
11. AI-OS (Post-execution)
    │
    │ • Guardar en memoria
    │ • Actualizar dashboard
    │ • Notificar completion
    │
    ▼
    
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESPUESTA AL USUARIO                               │
│                                                                             │
│  ✓ PDF generado con investigación completa                                │
│  ✓ 3 imágenes incluidas                                                   │
│  ✓ Tiempo total: ~45 segundos                                            │
│  ✓ Costo total: $0.023                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# PARTE VI: PLAN DE IMPLEMENTACIÓN

## 6.1 FASES DE IMPLEMENTACIÓN

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PLAN DE IMPLEMENTACIÓN (24 semanas)                      │
└─────────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1: FUNDAMENTOS (Semanas 1-6)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Objetivo: Establecer el núcleo de la arquitectura

┌─────────────────────────────────────────────────────────────────────────────┐
│ 1.1 Runtime Registry Core (Semanas 1-2)                                 │
│                                                                             │
│ Crear:                                                                    │
│ • RuntimeRegistry class                                                    │
│ • Runtime interface base                                                  │
│ • Plugin loader                                                          │
│ • CapabilityRegistry base                                                  │
│                                                                             │
│ Testing:                                                                 │
│ • Unit tests para Registry                                                │
│ • Integration tests para plugin loading                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1.2 Execution Engine Core (Semanas 3-4)                                   │
│                                                                             │
│ Crear:                                                                    │
│ • TaskPlanner base                                                        │
│ • WorkflowEngine (DAG simple)                                           │
│ • TaskScheduler                                                           │
│ • Basic execution context                                                 │
│                                                                             │
│ Testing:                                                                 │
│ • Unit tests para planificación                                           │
│ • Integration tests para workflows                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1.3 API-Key Manager Integration (Semanas 5-6)                              │
│                                                                             │
│ Integrar:                                                                │
│ • api-key (basado en fusión de ramas)                                    │
│ • Rate limiter                                                           │
│ • Quota manager                                                          │
│ • Audit manager                                                          │
│                                                                             │
│ Testing:                                                                 │
│ • Integration tests                                                       │
│ • Load tests                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2: RUNTIMES (Semanas 7-12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────────────────────┐
│ 2.1 LLM Runtime (Semanas 7-8)                                            │
│                                                                             │
│ Implementar:                                                             │
│ • LLM Gateway (coordinador)                                              │
│ • Provider adapters (OpenAI, Anthropic, Groq, DeepSeek)                    │
│ • Retry Manager                                                          │
│ • Health Manager                                                         │
│                                                                             │
│ Testing:                                                                 │
│ • Integration tests con providers                                          │
│ • Load tests                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2.2 Capability Router (Semanas 9-10)                                       │
│                                                                             │
│ Implementar:                                                             │
│ • CapabilityRegistry (actualizar con providers)                            │
│ • Routing algorithm                                                      │
│ • Fallback chain                                                         │
│ • Cost optimizer                                                         │
│                                                                             │
│ Testing:                                                                 │
│ • Unit tests                                                             │
│ • E2E tests                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2.3 Additional Runtimes (Semanas 11-12)                                   │
│                                                                             │
│ Implementar:                                                             │
│ • Search Runtime (Tavily, Serper)                                        │
│ • Code Runtime (sandbox)                                                 │
│ • Media Runtime (ComfyUI placeholder)                                     │
│                                                                             │
│ Testing:                                                                 │
│ • Integration tests                                                       │
└─────────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 3: FREE CLAUDE CODE + INTEGRACIONES (Semanas 13-18)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────────────────────┐
│ 3.1 Claude Code Runtime (Semanas 13-14)                                    │
│                                                                             │
│ Implementar:                                                             │
│ • ClaudeCodeRuntime (integración existente)                               │
│ • Filesystem tools                                                        │
│ • Terminal integration                                                   │
│ • Patch system                                                           │
│                                                                             │
│ Testing:                                                                 │
│ • E2E tests                                                             │
│ • Security tests                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3.2 Media Runtime (Semanas 15-16)                                         │
│                                                                             │
│ Implementar:                                                             │
│ • ComfyUI Runtime                                                        │
│ • Stable Diffusion adapter                                               │
│ • Image generation workflow                                               │
│ • Video generation (placeholder)                                          │
│                                                                             │
│ Testing:                                                                 │
│ • Integration tests                                                       │
│ • Quality tests                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3.3 MCP + Browser Use (Semanas 17-18)                                     │
│                                                                             │
│ Implementar:                                                             │
│ • MCPRuntime                                                            │
│ • BrowserUseRuntime                                                      │
│ • Custom runtime support                                                 │
│                                                                             │
│ Testing:                                                                 │
│ • Integration tests                                                       │
└─────────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 4: POLISH Y VALIDACIÓN (Semanas 19-24)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────────────────────┐
│ 4.1 Testing Completo (Semanas 19-20)                                       │
│                                                                             │
│ • Unit tests (cobertura >80%)                                             │
│ • Integration tests                                                       │
│ • E2E tests                                                             │
│ • Load tests                                                             │
│ • Security audit                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4.2 Documentación (Semanas 21-22)                                         │
│                                                                             │
│ • API documentation                                                      │
│ • Architecture documentation                                             │
│ • Developer guide                                                        │
│ • Runbooks                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4.3 Deployment + Monitoreo (Semanas 23-24)                                │
│                                                                             │
│ • Docker compose                                                         │
│ • Kubernetes manifests                                                   │
│ • Prometheus/Grafana setup                                                │
│ • Alerting rules                                                         │
│ • SLOs and SLIs                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# PARTE VII: RIESGOS Y MITIGACIONES

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MATRIZ DE RIESGOS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ #  │ Riesgo                    │ Prob │ Impact │ Mitigación              │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 1  │ Scope creep               │ Alta │ Alto  │ Strict phase gates      │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 2  │ Performance degradation    │ Media│ Alto  │ Load tests en cada fase│
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 3  │ Provider API changes      │ Alta │ Medio │ Abstraction layer       │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 4  │ Security vulnerabilities   │ Media│ Crític│ Security audit en F4    │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 5  │ Team skill gaps           │ Media│ Medio │ Training + pair prog   │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 6  │ Integration complexity    │ Alta │ Alto  │ Early integration tests │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 7  │ Data migration issues      │ Baja │ Alto  │ Backup + dry-run       │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 8  │ Dependency conflicts       │ Media│ Medio │ Careful dependency mgmt │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 9  │ API backward compat.      │ Media│ Alto  │ Versioning + deprecate │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│ 10 │ Vendor lock-in           │ Baja │ Medio │ Abstraction providers    │
│────┼───────────────────────────┼──────┼────────┼─────────────────────────│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# PARTE VIII: CONCLUSIONES

## 8.1 JUSTIFICACIÓN TÉCNICA DE LA ARQUITECTURA

### ¿Por qué Execution Engine como centro?

| Razón | Explicación |
|-------|-------------|
| **Task-centric** | El usuario quiere tareas completadas, no usar modelos específicos |
| **Extensibilidad** | Nuevos runtimes = nuevos plugins, sin modificar core |
| **Testabilidad** | Cada componente testeable independientemente |
| **Mantenibilidad** | Separación clara de responsabilidades |
| **Evolutividad** | Listo para nuevos tipos de IA sin reescribir |

### ¿Por qué Capability Router?

| Razón | Explicación |
|-------|-------------|
| **Abstracción** | El usuario no debe conocer modelos |
| **Flexibilidad** | Cambiar modelos sin cambiar código |
| **Optimización** | Seleccionar por costo/calidad/velocidad |
| **Fallback** |自动切换 proveedor si uno falla |

### ¿Por qué Free Claude Code como Runtime?

| Razón | Explicación |
|-------|-------------|
| **Especialización** | No todo necesita filesystem |
| **Performance** | Más barato para tareas simples |
| **Simplicidad** | Menos overhead que Claude Code para chat |
| **Elección** | El usuario/planificador decide qué usar |

## 8.2 COMPARACIÓN FINAL

| Aspecto | Propuesta Original | Arquitectura v3.0 | Mejora |
|--------|-------------------|------------------|--------|
| Centro | LLM | Task | ✅ |
| Runtimes | Solo LLM | Multi-tipo | ✅ |
| Free Claude Code | Núcleo | Runtime | ✅ |
| API-Key Manager | LLM-only | Multi-API | ✅ |
| Extensibilidad | Media | Alta | ✅ |
| Testabilidad | Baja | Alta | ✅ |
| Separation | Parcial | Completa | ✅ |

## 8.3 APROBACIÓN REQUERIDA

Antes de proceder con la implementación, confirmar:

- [ ] Arquitectura aprobada como TASK-CENTRIC
- [ ] Execution Engine como centro
- [ ] Capability Router para selección
- [ ] Free Claude Code como Runtime
- [ ] API-Key Manager transversal
- [ ] Plan de 24 semanas aprobado
- [ ] Budget para 24 semanas aprobado
- [ ] Equipo asignado

---

*Documento generado: 2026-07-19*  
*Auditor: OpenHands AI Agent*  
*Versión: 3.0 Enterprise*  
*Clasificación: Proprietaria*
