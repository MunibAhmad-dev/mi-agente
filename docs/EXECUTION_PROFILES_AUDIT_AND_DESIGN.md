# AUDITORÍA Y DISEÑO: Execution Profile System

**Fecha:** 2026-07-19  
**Estado:** FASE 1 (Auditoría) → FASE 2 (Diseño)  
**Repositorio:** https://github.com/aoi555/mi-libre-chat

---

## RESUMEN EJECUTIVO

Este documento presenta la auditoría completa del sistema actual de Constructor de Agentes y el diseño del nuevo **Execution Profile System**, donde cada agente define completamente su comportamiento, recursos y forma de ejecución - no solo prompts.

---

# PARTE 1: AUDITORÍA DEL SISTEMA ACTUAL

## 1.1 ESTADO ACTUAL DEL CÓDIGO

### Archivos Principales Implementados

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `packages/data-provider/src/types/agent-builder.ts` | Tipos completos | ✅ Implementado |
| `api/server/services/AgentBuilder/agent_builder_service.py` | CRUD service | ✅ Implementado |
| `api/server/services/AgentBuilder/memory_service.py` | Memory service | ✅ Implementado |
| `api/server/routes/agent-builder.js` | API routes | ✅ Implementado |
| `client/src/components/AgentBuilder/index.tsx` | UI principal | ✅ Implementado |
| `integrations/agent-builder/discovery/skill_registry.py` | Skill registry | ✅ Implementado |
| `integrations/agent-builder/intelligent/intelligent_agent_creator.py` | Intelligent creator | ✅ Implementado |
| `integrations/litellm-gateway/lib/litellm_client.py` | LiteLLM client | ✅ Implementado |
| `packages/api-key-client/src/index.ts` | API-Key Manager client | ✅ Implementado |

---

## 1.2 CHECKLIST DE AUDITORÍA

### Configuración LLM

| Campo | Estado | Implementación Actual | Notas |
|-------|--------|----------------------|-------|
| Modelo principal | ⚠️ Parcial | `ModelConfig.provider` | Solo proveedor |
| Lista de modelos de respaldo | ❌ No existe | - | No hay fallback ordering |
| Proveedores permitidos | ❌ No existe | - | No whitelist/blacklist |
| Proveedor preferido | ⚠️ Parcial | `ModelConfig.provider` | Funciona |
| Lista negra de proveedores | ❌ No existe | - | No blacklist |
| Temperatura | ⚠️ Parcial | `ModelConfig.temperature` | Implementado |
| Top P | ⚠️ Parcial | `ModelConfig.topP` | Implementado |
| Top K | ⚠️ Parcial | `ModelConfig.topK` | Implementado |
| Max Tokens | ⚠️ Parcial | `ModelConfig.maxTokens` | Implementado |
| Context Window | ⚠️ Parcial | `ModelConfig.contextWindow` | Implementado |
| Tiempo máximo de respuesta | ❌ No existe | - | No timeout configurable |
| Reintentos | ❌ No existe | - | No se propaga a LiteLLM |
| Estrategia de fallback | ⚠️ Parcial | Circuit breaker en LiteLLM client | Implementado |
| Estrategia de balanceo | ❌ No existe | - | No load balancing |
| Estrategia de recuperación | ❌ No existe | - | No recovery strategy |

### Configuración de Herramientas

| Herramienta | Estado | Implementación Actual | Notas |
|-------------|--------|----------------------|-------|
| Free Claude Code | ❌ No existe | - | No integrado |
| MCP | ⚠️ Parcial | `ToolsConfig.mcp` | Array básico |
| Browser Use | ⚠️ Parcial | `BrowserConfig` | Toggle simple |
| GitHub | ❌ No existe | - | No config específica |
| Git | ❌ No existe | - | No integrado |
| Docker | ❌ No existe | - | No integrado |
| Terminal | ⚠️ Parcial | `CodeConfig` | Solo enable/disable |
| Python | ⚠️ Parcial | `CodeConfig.language` | Array básico |
| Editor de archivos | ❌ No existe | - | No path restrictions |
| Web Search | ❌ No existe | - | No config específica |
| API externas | ❌ No existe | - | No whitelist |
| Base de datos | ❌ No existe | - | No query restrictions |
| RAG | ⚠️ Parcial | `RAGConfig` | Toggle + config |
| Memoria | ⚠️ Parcial | `MemoryConfig` | 4 tipos |
| ComfyUI | ⚠️ Parcial | `ComfyUIConfig` | Toggle simple |
| Stable Diffusion | ❌ No existe | - | No integrado |
| WAN | ❌ No existe | - | No integrado |
| FLUX | ❌ No existe | - | No integrado |
| TTS | ❌ No existe | - | No integrado |
| STT | ❌ No existe | - | No integrado |
| OCR | ❌ No existe | - | No integrado |
| Vision | ❌ No existe | - | No específico |
| Video | ❌ No existe | - | No integrado |
| Audio | ❌ No existe | - | No integrado |

### Permisos

| Permiso | Estado | Implementación Actual | Notas |
|---------|--------|----------------------|-------|
| Navegar Internet | ❌ No existe | - | No granular |
| Modificar archivos | ❌ No existe | - | No path restrictions |
| Ejecutar código | ⚠️ Parcial | `CodeConfig.enabled` | Toggle global |
| Acceso al SO | ❌ No existe | - | No sandbox config |
| Usar Docker | ❌ No existe | - | No integración |
| Instalar dependencias | ❌ No existe | - | No control |
| Eliminar archivos | ❌ No existe | - | No restricciones |
| Browser Automation | ⚠️ Parcial | `BrowserConfig.enabled` | Toggle global |
| Acceder a GitHub | ❌ No existe | - | No OAuth scope |
| APIs externas | ❌ No existe | - | No whitelist |
| Generar imágenes | ❌ No existe | - | No granular |
| Generar vídeo | ❌ No existe | - | No granular |
| Sintetizar voz | ❌ No existe | - | No granular |
| Acceder a RAG | ⚠️ Parcial | `RAGConfig.enabled` | Toggle global |
| Acceder a memorias | ⚠️ Parcial | `MemoryConfig` | Tipos configurables |

### Memoria

| Tipo | Estado | Implementación Actual | Notas |
|------|--------|----------------------|-------|
| Sin memoria | ✅ Implementado | `MemoryType.SHORT` | Configurado |
| Memoria temporal | ⚠️ Parcial | `persist: false` | Básico |
| Memoria persistente | ⚠️ Parcial | `persist: true` | Básico |
| Memoria compartida | ❌ No existe | - | No multi-agent |
| Memoria exclusiva | ❌ No existe | - | No isolation |
| Vector Store | ⚠️ Parcial | `MemoryType.VECTOR` | TF-IDF simple |
| RAG | ⚠️ Parcial | `RAGConfig` | Toggle + collection |
| Base documental | ❌ No existe | - | No doc store |
| Historial de conversación | ⚠️ Parcial | Context window | Básico |

### Perfil Multimodal

| Capacidad | Estado | Implementación Actual | Notas |
|-----------|--------|----------------------|-------|
| Texto | ✅ Implementado | Default | Habilitado |
| Código | ⚠️ Parcial | `CodeConfig` | Toggle |
| Imagen | ⚠️ Parcial | ComfyUI bridge | Parcial |
| Vídeo | ❌ No existe | - | No soporte |
| Audio | ❌ No existe | - | No soporte |
| OCR | ❌ No existe | - | No soporte |
| Vision | ❌ No existe | - | No específico |
| Documentos | ❌ No existe | - | No parser config |
| PDF | ❌ No existe | - | No específico |
| Excel | ❌ No existe | - | No específico |
| Presentaciones | ❌ No existe | - | No específico |

### Configuración de Recursos

| Recurso | Estado | Implementación Actual | Notas |
|---------|--------|----------------------|-------|
| Uso máximo de contexto | ⚠️ Parcial | `contextWindow` | Configurado |
| Uso máximo de tokens | ⚠️ Parcial | `maxTokens` | Configurado |
| Max herramientas simultáneas | ❌ No existe | - | No limit |
| Max tareas simultáneas | ❌ No existe | - | No limit |
| Paralelismo | ⚠️ Parcial | `WorkflowType.PARALLEL` | Workflow level |
| Prioridad | ❌ No existe | - | No agent priority |
| Timeout | ❌ No existe | - | No configurable |
| Cooldown | ❌ No existe | - | No cooldown config |

### Configuración de Orquestación

| Capacidad | Estado | Implementación Actual | Notas |
|-----------|--------|----------------------|-------|
| Puede llamar otros agentes | ⚠️ Parcial | `SubagentsConfig.enabled` | Toggle global |
| Puede ser llamado | ⚠️ Parcial | `SubagentsConfig` | Array básico |
| Puede crear subagentes | ⚠️ Parcial | `SubagentsConfig.enabled` | Toggle global |
| Puede actuar como supervisor | ⚠️ Parcial | `SupervisorConfig` | Config básico |
| Puede participar en workflows | ⚠️ Parcial | `WorkflowConfig` | Config básico |
| Puede actuar como Router | ❌ No existe | - | No routing logic |
| Puede actuar como Evaluador | ❌ No existe | - | No evaluation |
| Puede actuar como Manager | ❌ No existe | - | No management |

---

## 1.3 SISTEMAS EXISTENTES

### LiteLLM Gateway (ya existe)

```python
# integrations/litellm-gateway/lib/litellm_client.py

@dataclass
class RetryConfig:
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0
    exponential_base: float = 2.0
    retry_on_status: List[int] = field(default_factory=lambda: [429, 500, 502, 503, 504])

@dataclass
class RateLimitConfig:
    requests_per_minute: int = 60
    requests_per_second: int = 10
    tokens_per_minute: int = 100000

@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    success_threshold: int = 2
    timeout: float = 60.0
    half_open_max_calls: int = 3
```

### API-Key Manager (ya existe)

```typescript
// packages/api-key-client/src/index.ts

export interface ChatRequest {
  model?: string;
  preferred_providers?: string[];
  excluded_providers?: string[];
  selection_strategy?: 'priority' | 'cost' | 'latency' | 'availability' | 'hybrid';
}

export interface Provider {
  id: number;
  name: string;
  status: 'active' | 'degraded' | 'offline';
  priority: number;
  cooldown_seconds: number;
  max_retries: number;
}
```

---

# PARTE 2: DISEÑO DEL EXECUTION PROFILE SYSTEM

## 2.1 ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXECUTION PROFILE SYSTEM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PROFILE LAYER                                      │    │
│  │                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │   LLM       │  │  Tools      │  │  Memory     │  │ Permissions │ │    │
│  │  │   Profile   │  │  Profile   │  │  Profile    │  │  Profile    │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  │                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │  Resources  │  │Multimodal  │  │Orchestration│  │  Security   │ │    │
│  │  │  Profile    │  │  Profile    │  │  Profile    │  │  Profile    │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                     │                                        │
│                                     ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    EXECUTION ENGINE                                    │    │
│  │                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │    │
│  │  │   LiteLLM  │  │ API-Key     │  │   AI-OS     │                  │    │
│  │  │  Gateway   │  │  Manager    │  │             │                  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2.2 TIPOS COMPLETOS DEL EXECUTION PROFILE

```typescript
// packages/data-provider/src/types/execution-profile.ts

/**
 * Execution Profile System
 * =======================
 * 
 * Sistema completo de perfiles de ejecución para agentes.
 * Cada perfil define completamente cómo opera un agente.
 */

// ============================================================================
// LLM PROFILE
// ============================================================================

export interface LLMProfile {
  // Modelo principal
  primaryModel: {
    provider: string;
    model: string;
  };
  
  // Modelos de respaldo (en orden de prioridad)
  fallbackModels: Array<{
    provider: string;
    model: string;
    priority: number;
    triggerOn?: string[];  // Errores que activan este fallback
  }>;
  
  // Restricciones de proveedores
  providerConfig: {
    allowed: string[];      // Whitelist de proveedores
    blocked: string[];     // Blacklist de proveedores
    preferred: string[];    // Orden de preferencia
  };
  
  // Parámetros de generación
  generation: {
    temperature: number;           // 0-2
    topP: number;               // 0-1
    topK: number;               // > 0
    maxTokens: number;           // > 0
    stopSequences: string[];
    presencePenalty: number;     // -2 to 2
    frequencyPenalty: number;     // -2 to 2
    responseFormat?: 'text' | 'json_object';
  };
  
  // Context
  context: {
    maxContextTokens: number;
    maxHistoryTokens: number;
    truncateStrategy: 'truncate_start' | 'truncate_end' | 'summarize';
  };
  
  // Timeouts y reintentos
  retry: {
    maxRetries: number;
    timeoutMs: number;
    retryDelayMs: number;
    exponentialBackoff: boolean;
    retryableErrors: string[];
  };
  
  // Estrategia de selección
  selectionStrategy: {
    strategy: 'priority' | 'cost' | 'latency' | 'availability' | 'load_balance' | 'hybrid';
    costLimit?: number;
    latencyLimit?: number;
    availabilityWeight?: number;
  };
  
  // Balanceo de carga
  loadBalancing: {
    enabled: boolean;
    algorithm: 'round_robin' | 'least_connections' | 'weighted_random';
    weights?: Record<string, number>;
  };
}

// ============================================================================
// TOOLS PROFILE
// ============================================================================

export interface ToolsProfile {
  // Habilitación global
  enabled: boolean;
  
  // Herramientas específicas
  tools: {
    // Computación
    terminal: ToolConfig;
    codeExecution: ToolConfig & {
      allowedLanguages: string[];
      maxExecutionTime: number;
      sandboxMode: 'docker' | 'vm' | 'native';
    };
    
    // Navegación y web
    browserUse: ToolConfig & {
      headless: boolean;
      screenshotOnError: boolean;
      allowedDomains: string[];
    };
    webSearch: ToolConfig & {
      engines: ('google' | 'bing' | 'duckduckgo')[];
      maxResults: number;
    };
    
    // Archivos
    fileManager: ToolConfig & {
      allowedPaths: string[];
      blockedPaths: string[];
      maxFileSize: number;
    };
    
    // Version control
    git: ToolConfig & {
      allowedRepositories: string[];
      maxCommitSize: number;
    };
    github: ToolConfig & {
      scopes: ('repo' | 'read' | 'write')[];
      allowedOrgs: string[];
    };
    
    // Docker
    docker: ToolConfig & {
      allowedImages: string[];
      networkAccess: 'none' | 'bridge' | 'host';
      privilegedMode: boolean;
    };
    
    // Database
    database: ToolConfig & {
      allowedConnections: string[];
      readonly: boolean;
      maxQueryTime: number;
    };
    
    // APIs
    apiClient: ToolConfig & {
      allowedEndpoints: string[];
      blockedEndpoints: string[];
      authRequired: boolean;
    };
    
    // ComfyUI
    comfyui: ToolConfig & {
      workflowTemplates: string[];
      autoExecute: boolean;
    };
    
    // Image/Video
    stableDiffusion: ToolConfig;
    flux: ToolConfig;
    wan: ToolConfig;
    video: ToolConfig;
    
    // Audio
    tts: ToolConfig;
    stt: ToolConfig;
    audio: ToolConfig;
    
    // Other
    ocr: ToolConfig;
    vision: ToolConfig;
  };
  
  // MCP Servers
  mcp: Array<{
    id: string;
    name: string;
    enabled: boolean;
    allowedTools: string[];  // Tools específicas del MCP
    config: Record<string, unknown>;
  }>;
  
  // Skills
  skills: Array<{
    id: string;
    enabled: boolean;
    config: Record<string, unknown>;
  }>;
  
  // Límites
  limits: {
    maxConcurrentTools: number;
    maxToolCallsPerRequest: number;
    maxToolResultSize: number;
  };
}

export interface ToolConfig {
  enabled: boolean;
  timeout?: number;
  retries?: number;
}

// ============================================================================
// PERMISSIONS PROFILE
// ============================================================================

export interface PermissionsProfile {
  // Permisos de red
  network: {
    canAccessInternet: boolean;
    allowedDomains: string[];
    blockedDomains: string[];
    canMakeApiCalls: boolean;
    allowedEndpoints: string[];
  };
  
  // Permisos de sistema
  system: {
    canAccessTerminal: boolean;
    canInstallPackages: boolean;
    canDeleteFiles: boolean;
    canModifySystemFiles: boolean;
    sudoAccess: boolean;
  };
  
  // Permisos de Docker
  docker: {
    canUseDocker: boolean;
    allowedImages: string[];
    canCreateContainers: boolean;
    canRemoveContainers: boolean;
    networkMode: 'none' | 'bridge' | 'host';
  };
  
  // Permisos de datos
  data: {
    canAccessDatabases: boolean;
    allowedDatabases: string[];
    canWriteData: boolean;
    canDeleteData: boolean;
    canExportData: boolean;
  };
  
  // Permisos de generación de contenido
  content: {
    canGenerateImages: boolean;
    canGenerateVideo: boolean;
    canGenerateAudio: boolean;
    canSynthesizeVoice: boolean;
    contentFilter: 'strict' | 'moderate' | 'none';
  };
  
  // Permisos de RAG/Memoria
  knowledge: {
    canAccessRAG: boolean;
    canAccessVectorStore: boolean;
    canAccessMemory: boolean;
    canCreateMemory: boolean;
    memoryIsolation: 'shared' | 'exclusive' | 'team';
  };
  
  // Permisos de agente
  agent: {
    canCreateSubagents: boolean;
    canCallOtherAgents: boolean;
    canBeCalled: boolean;
    maxSubagents: number;
    canEscalate: boolean;
  };
}

// ============================================================================
// MEMORY PROFILE
// ============================================================================

export interface MemoryProfile {
  // Tipo de memoria
  type: 'none' | 'short' | 'long' | 'shared' | 'exclusive' | 'vector' | 'hybrid';
  
  // Short-term (contexto de conversación)
  shortTerm: {
    enabled: boolean;
    maxItems: number;
    autoSummarize: boolean;
    summarizeAfter: number;  // Items before summarize
  };
  
  // Long-term (persistente)
  longTerm: {
    enabled: boolean;
    storage: 'database' | 'filesystem' | 's3';
    retentionDays: number;
    compression: boolean;
  };
  
  // Vector store
  vectorStore: {
    enabled: boolean;
    provider: 'pinecone' | 'weaviate' | 'chroma' | 'qdrant' | 'milvus' | 'local';
    collection: string;
    dimension: number;
    similarityMetric: 'cosine' | 'euclidean' | 'dotproduct';
    topK: number;
    similarityThreshold: number;
  };
  
  // RAG
  rag: {
    enabled: boolean;
    sources: Array<{
      type: 'document' | 'web' | 'database' | 'api';
      config: Record<string, unknown>;
    }>;
    chunkSize: number;
    chunkOverlap: number;
  };
  
  // Document store
  documentStore: {
    enabled: boolean;
    provider: 'filesystem' | 's3' | 'mongodb';
    collections: string[];
  };
  
  // Aislamiento
  isolation: {
    mode: 'shared' | 'exclusive' | 'team';
    teamId?: string;
    shareWithAgents: string[];
  };
  
  // Historial
  history: {
    enabled: boolean;
    maxMessages: number;
    includeToolCalls: boolean;
    includeMetadata: boolean;
  };
}

// ============================================================================
// MULTIMODAL PROFILE
// ============================================================================

export interface MultimodalProfile {
  // Capacidades habilitadas
  capabilities: {
    text: boolean;
    code: boolean;
    image: boolean;
    video: boolean;
    audio: boolean;
    document: boolean;
    pdf: boolean;
    excel: boolean;
    presentation: boolean;
  };
  
  // Configuración por tipo
  image: {
    maxSize: number;
    allowedFormats: string[];
    generateEnabled: boolean;
    editEnabled: boolean;
    provider: 'dalle' | 'midjourney' | 'stable' | 'comfyui';
  };
  
  video: {
    maxDuration: number;
    generateEnabled: boolean;
    provider: 'runway' | 'pika' | 'sora';
  };
  
  audio: {
    tts: {
      enabled: boolean;
      voices: string[];
      provider: 'openai' | 'elevenlabs' | 'google';
    };
    stt: {
      enabled: boolean;
      language: string;
      provider: 'openai' | 'whisper';
    };
  };
  
  document: {
    pdf: {
      enabled: boolean;
      ocr: boolean;
      maxPages: number;
    };
    excel: {
      enabled: boolean;
      maxRows: number;
    };
    presentation: {
      enabled: boolean;
      maxSlides: number;
    };
  };
}

// ============================================================================
// RESOURCES PROFILE
// ============================================================================

export interface ResourcesProfile {
  // Context
  context: {
    maxContextTokens: number;
    maxHistoryTokens: number;
    windowStrategy: 'sliding' | 'summary';
  };
  
  // Tokens
  tokens: {
    maxInputTokens: number;
    maxOutputTokens: number;
    maxTotalTokens: number;
  };
  
  // Concurrencia
  concurrency: {
    maxConcurrentRequests: number;
    maxToolCalls: number;
    maxParallelAgents: number;
    maxTasks: number;
  };
  
  // Tiempo
  timing: {
    requestTimeoutMs: number;
    toolTimeoutMs: number;
    agentTimeoutMs: number;
    cooldownMs: number;
    idleTimeoutMs: number;
  };
  
  // Prioridad
  priority: {
    level: 'low' | 'normal' | 'high' | 'critical';
    weight: number;  // 1-100
    preemption: boolean;
  };
  
  // Rate limiting
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
    tokensPerMinute: number;
  };
}

// ============================================================================
// ORCHESTRATION PROFILE
// ============================================================================

export interface OrchestrationProfile {
  // Rol del agente
  role: {
    canCallAgents: boolean;
    canBeCalled: boolean;
    canCreateSubagents: boolean;
    canSupervise: boolean;
    canParticipateInWorkflows: boolean;
    canActAsRouter: boolean;
    canActAsEvaluator: boolean;
    canActAsManager: boolean;
  };
  
  // Subagentes
  subagents: {
    enabled: boolean;
    maxAgents: number;
    autoCreate: boolean;
    templates: string[];  // Templates de subagentes permitidos
  };
  
  // Supervisor
  supervisor: {
    enabled: boolean;
    supervisorAgentId?: string;
    interventionPolicy: 'never' | 'on_error' | 'always';
    maxInterventions: number;
  };
  
  // Workflow
  workflow: {
    enabled: boolean;
    allowedPatterns: ('sequential' | 'parallel' | 'dag' | 'debate')[];
    maxSteps: number;
    autoContinue: boolean;
  };
  
  // Comunicación
  communication: {
    canSendMessages: boolean;
    canReceiveMessages: boolean;
    messageRetention: 'ephemeral' | 'persistent';
    channels: string[];
  };
}

// ============================================================================
// SECURITY PROFILE
// ============================================================================

export interface SecurityProfile {
  // Autenticación
  authentication: {
    required: boolean;
    methods: ('api_key' | 'oauth' | 'jwt')[];
    tokenExpiry: number;
  };
  
  // Encriptación
  encryption: {
    encryptAtRest: boolean;
    encryptInTransit: boolean;
    keyManagement: 'librechat' | 'external' | 'aws_kms';
  };
  
  // Rate limiting
  rateLimit: {
    enabled: boolean;
    maxRequestsPerMinute: number;
    maxTokensPerMinute: number;
  };
  
  // Auditoría
  audit: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warning' | 'error';
    includeToolCalls: boolean;
    includeMessages: boolean;
    retentionDays: number;
  };
  
  // Sandboxing
  sandbox: {
    enabled: boolean;
    isolation: 'process' | 'container' | 'vm';
    networkIsolation: boolean;
    filesystemIsolation: boolean;
  };
}

// ============================================================================
// COMPLETE EXECUTION PROFILE
// ============================================================================

export interface ExecutionProfile {
  id: string;
  name: string;
  description: string;
  version: number;
  
  // Sub-perfiles
  llm: LLMProfile;
  tools: ToolsProfile;
  permissions: PermissionsProfile;
  memory: MemoryProfile;
  multimodal: MultimodalProfile;
  resources: ResourcesProfile;
  orchestration: OrchestrationProfile;
  security: SecurityProfile;
  
  // Metadatos
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    isTemplate: boolean;
    isPublic: boolean;
    tags: string[];
    category: string;
  };
}
```

---

## 2.3 DIAGRAMA DE INTEGRACIÓN

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXECUTION PROFILE SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PROFILE EDITOR (Frontend)                           │    │
│  │                                                                       │    │
│  │  [General] [LLM] [Tools] [Permissions] [Memory] [Multimodal]       │    │
│  │  [Resources] [Orchestration] [Security] [Advanced]                  │    │
│  └────────────────────────────┬────────────────────────────────────────────┘    │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    EXECUTION PROFILE STORE                             │    │
│  │                                                                       │    │
│  │  {profile_id: "exec_001", llm: {...}, tools: {...}, ...}             │    │
│  └────────────────────────────┬────────────────────────────────────────────┘    │
│                               │                                             │
│         ┌────────────────────┼────────────────────┐                       │
│         │                    │                    │                        │
│         ▼                    ▼                    ▼                        │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                 │
│  │   LITE     │     │  API-KEY   │     │   AI-OS    │                 │
│  │  GATEWAY   │     │  MANAGER   │     │            │                 │
│  │            │     │            │     │            │                 │
│  │ • Retry    │     │ • Keys    │     │ • Exec    │                 │
│  │ • Circuit  │     │ • Quota   │     │ • Sandbox │                 │
│  │ • Fallback │     │ • Routing │     │ • Tools   │                 │
│  └──────┬─────┘     └──────┬─────┘     └──────┬─────┘                 │
│         │                   │                   │                        │
│         └───────────────────┼───────────────────┘                        │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    AGENT EXECUTOR                                   │    │
│  │                                                                       │    │
│  │  1. Load Execution Profile                                          │    │
│  │  2. Initialize LLM with LLMProfile                                │    │
│  │  3. Configure Tools with ToolsProfile                              │    │
│  │  4. Set up Memory with MemoryProfile                               │    │
│  │  5. Apply Permissions with PermissionsProfile                        │    │
│  │  6. Start execution with ResourcesProfile                           │    │
│  │  7. Monitor with OrchestrationProfile                              │    │
│  │  8. Audit with SecurityProfile                                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2.4 RESPONSABILIDADES DE CADA COMPONENTE

### LiteLLM Gateway

| Responsabilidad | Descripción |
|---------------|-------------|
| Routing de modelos | Selección inteligente de modelos |
| Retry logic | Reintentos con exponential backoff |
| Circuit breaker | Protección contra fallos en cascada |
| Rate limiting | Control de rate por provider |
| Cost optimization | Selección por costo |

**YA EXISTE** - No reinventar, solo configurar.

### API-Key Manager

| Responsabilidad | Descripción |
|---------------|-------------|
| Gestión de claves | CRUD de API keys |
| Quota tracking | Seguimiento de uso por usuario |
| Failover | Cambio automático entre claves |
| Priority routing | Selección por prioridad |

**YA EXISTE** - No reinventar, solo usar.

### AI-OS

| Responsabilidad | Descripción |
|---------------|-------------|
| Ejecución de código | Sandbox y ejecución |
| Tool execution | Llamadas a herramientas |
| Agent orchestration | Coordinación de subagentes |
| Memory management | Persistencia y búsqueda |

**A IMPLEMENTAR** - Nuevo componente.

### Execution Profile System (NUEVO)

| Responsabilidad | Descripción |
|---------------|-------------|
| Profile definition | Definir perfiles completos |
| Profile storage | Persistencia en DB |
| Profile editor | UI para edición |
| Profile validation | Validación de configuraciones |
| Profile inheritance | Templates y herencia |

---

## 2.5 COMPARACIÓN CON PROYECTOS OPEN SOURCE

| Proyecto | Lo mejor | Adaptar a este proyecto |
|----------|----------|------------------------|
| **AutoGen Studio** | Agent collaboration patterns | Sistema de supervisor |
| **CrewAI Studio** | Role-based agents | Profiles de roles |
| **Langflow** | Visual node config | Editor visual de profiles |
| **Flowise** | Drag-drop components | Componentización de tools |
| **Dify** | Prompt engineering | Templates de prompts |
| **AnythingLLM** | Multi-modal RAG | Config de memoria |
| **OpenManus** | Task orchestration | Workflow profiles |

---

## 2.6 DECISIONES DE DISEÑO

### 1. Perfiles vs Prompts

**Decisión:** Los perfiles son independientes del prompt.

**Justificación:**
- Un mismo perfil puede usarse con diferentes prompts
- Un mismo prompt puede ejecutarse con diferentes perfiles
- Permite configuración sin modificar código

### 2. Jerarquía de Configuración

```
System Default
    ↓
Profile Template
    ↓
Agent Profile
    ↓
Execution Context
```

**Justificación:**
- Valores heredados pueden sobreescribirse
- Templates para crear perfiles rápidamente
- Flexibilidad máxima

### 3. Validación en Tiempo de Creación

**Decisión:** Validar perfiles al crearlos, no al ejecutarlos.

**Justificación:**
- Errores tempranos
- UI amigable
- Performance en ejecución

### 4. Inmutabilidad de Perfiles en Ejecución

**Decisión:** Perfiles no se modifican durante ejecución.

**Justificación:**
- Consistencia
- Reproducibilidad
- Auditoría simple

---

## 2.7 ARCHIVOS A MODIFICAR/CREAR

### Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `packages/data-provider/src/types/agent-builder.ts` | Renombrar a `execution-profile.ts` |
| `packages/data-provider/src/config.ts` | Agregar AgentCapabilities nuevos |
| `api/server/routes/agent-builder.js` | Agregar routes de profiles |
| `client/src/components/AgentBuilder/index.tsx` | Agregar tabs de edición |

### Archivos a Crear

| Archivo | Descripción |
|---------|-------------|
| `packages/data-provider/src/types/execution-profile.ts` | Tipos completos |
| `api/server/services/ExecutionProfile/` | Servicio de profiles |
| `api/server/routes/execution-profile.js` | API routes |
| `client/src/components/ExecutionProfileEditor/` | Editor UI |
| `client/src/hooks/useExecutionProfile.ts` | Hooks de React |

---

## 2.8 PRÓXIMOS PASOS

### Fase 3: Implementación (Futuro)

1. Crear tipos completos `execution-profile.ts`
2. Implementar servicio de persistencia
3. Crear API routes
4. Implementar editor visual
5. Integrar con LiteLLM Gateway
6. Integrar con API-Key Manager
7. Testing E2E

---

**Documento preparado para revisión y aprobación.**
