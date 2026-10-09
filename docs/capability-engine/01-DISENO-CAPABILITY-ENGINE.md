# 🎯 Motor de Orquestación Multi-LLM Basado en Capacidades

**Proyecto:** Mi-LibreChat Enterprise  
**Versión:** 1.0  
**Fecha:** 2026-07-20  
**Licencia:** Documento de Diseño

---

## 1. FILOSOFÍA DEL DISEÑO

### 1.1 Principio Fundamental

> **"Los agentes solicitan capacidades, no modelos. Los modelos son únicamente proveedores de capacidades."**

Este principio transforma radicalmente la arquitectura:

| Arquitectura Actual | Arquitectura Propuesta |
|---------------------|------------------------|
| Seleccionar modelo específico | Solicitar conjunto de capacidades |
| Hardcoded en código | Configuración dinámica |
| Un modelo por request | Múltiples modelos coordinados |
| Modelo = Función | Modelo = Recurso de capacidades |
| Routing por heurísticas | Routing por políticas |

### 1.2 Objetivos de Diseño

1. **Desacoplamiento total** - Componentes sin dependencias rígidas
2. **Extensibilidad** - Agregar capacidades sin modificar código existente
3. **Configurabilidad** - Todo editable sin redeploy
4. **Observabilidad** - Métricas en tiempo real
5. **Resiliencia** - Fallbacks automáticos y circuit breakers
6. **Performance** - Caching, pooling, selección inteligente

---

## 2. ARQUITECTURA DE ALTO NIVEL

### 2.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT REQUEST                                │
│                              { capabilities, context }                           │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          CapabilityOrchestrator                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           REQUEST PARSER                                 │   │
│  │  - Extrae capabilities requeridas                                        │   │
│  │  - Detecta contexto y constraints                                        │   │
│  │  - Aplica filtros del usuario                                           │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         CAPABILITY MATCHER                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │ Capability  │  │  Provider   │  │  Constraint  │                   │   │
│  │  │ Registry    │  │  Registry   │  │  Evaluator   │                   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         STRATEGY ENGINE                                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │   │
│  │  │ Priority │ │ Latency  │ │  Cost    │ │Consensus │ │   Auto   │     │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        EXECUTION MODE                                    │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │   │
│  │  │  Single  │ │ Parallel │ │Sequential│ │ Consensus│                   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
└──────────────────────────────────────┼───────────────────────────────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
            ▼                          ▼                          ▼
    ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
    │ Provider A   │          │ Provider B   │          │ Provider N   │
    │ ┌─────────┐ │          │ ┌─────────┐ │          │ ┌─────────┐ │
    │ │ Model 1 │ │          │ │ Model 1 │ │          │ │ Model 1 │ │
    │ │ Model 2 │ │          │ │ Model 2 │ │          │ │ Model 2 │ │
    │ └─────────┘ │          │ └─────────┘ │          │ └─────────┘ │
    └───────────────┘          └───────────────┘          └───────────────┘
```

### 2.2 Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    REQUEST FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   1. Parser                                                                   │
│      Request → { capabilities[], constraints, preferences }                     │
│                 │                                                              │
│                 ▼                                                              │
│   2. Capability Matcher                                                        │
│      { capabilities[] } → FilteredModelCandidates[]                            │
│                 │                                                              │
│                 ▼                                                              │
│   3. Constraint Evaluator                                                      │
│      Candidates + Constraints → ValidCandidates[]                                │
│                 │                                                              │
│                 ▼                                                              │
│   4. Strategy Selector                                                         │
│      ValidCandidates + Strategy → RankedCandidates[]                            │
│                 │                                                              │
│                 ▼                                                              │
│   5. Execution Mode                                                           │
│      RankedCandidates + Mode → ExecutionPlan                                   │
│                 │                                                              │
│                 ▼                                                              │
│   6. Provider Executor                                                       │
│      ExecutionPlan → Response(s)                                              │
│                 │                                                              │
│                 ▼                                                              │
│   7. Response Aggregator                                                      │
│      Responses → UnifiedResponse                                              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. CAPABILITY REGISTRY

### 3.1 Sistema de Capacidades

```typescript
/**
 * Capability - Capacidad atómica de un modelo
 * Las capacidades son jerárquicas y composables
 */
const Capability = {
  // Core
  CHAT: 'chat',                    // Conversación general
  REASONING: 'reasoning',          // Razonamiento complejo
  CODE: 'code',                    // Generación de código
  ANALYSIS: 'analysis',            // Análisis de datos/textos
  
  // Domain-specific
  FRONTEND: 'frontend',           // UI/UX, HTML/CSS/JS
  BACKEND: 'backend',             // APIs, servidores
  ARCHITECTURE: 'architecture',   // Diseño de sistemas
  SECURITY: 'security',           // Análisis de vulnerabilidades
  DEVOPS: 'devops',               // CI/CD, infraestructura
  DATABASE: 'database',           // SQL, NoSQL, modelado
  
  // Multimodal
  VISION: 'vision',               // Análisis de imágenes
  AUDIO: 'audio',                 // Procesamiento de audio
  MULTIMODAL: 'multimodal',       // Múltiples modalidades
  
  // Advanced
  TOOL_CALLING: 'tool_calling',   // Llamada de funciones/herramientas
  FUNCTION_CALLING: 'function_calling', // Alias de tool_calling
  LONG_CONTEXT: 'long_context',   // Contexto > 100K tokens
  MATH: 'math',                   // Operaciones matemáticas
  REASONING_CHAIN: 'reasoning_chain', // Chain-of-thought
  
  // Utility
  SEARCH: 'search',               // Búsqueda web
  TRANSLATION: 'translation',      // Traducción
  SUMMARIZATION: 'summarization', // Resúmenes
  CLASSIFICATION: 'classification', // Clasificación
  EMBEDDINGS: 'embeddings',       // Generar embeddings
  RAG: 'rag',                     // Retrieval augmented generation
  
  // Creative
  CREATIVE: 'creative',           // Generación creativa
  WRITING: 'writing',            // Escritura general
  IMAGE_GEN: 'image_generation', // Generación de imágenes
  VIDEO_GEN: 'video_generation', // Generación de video
} as const;

type CapabilityType = typeof Capability[keyof typeof Capability];

/**
 * CapabilityMetadata - Metadatos de una capacidad
 */
interface CapabilityMetadata {
  name: CapabilityType;
  description: string;
  requiredFor: CapabilityType[];  // Capacidades que requieren esta
  incompatibleWith: CapabilityType[]; // Capacidades incompatibles
  weights: Record<string, number>; // Pesos para scoring
}

/**
 * Capability Registry - Registro centralizado de capacidades
 */
class CapabilityRegistry {
  private capabilities: Map<CapabilityType, CapabilityMetadata>;
  private implications: Map<CapabilityType, Set<CapabilityType>>;
  
  constructor() {
    this.capabilities = new Map();
    this.implications = new Map();
    this.initializeDefaultCapabilities();
  }
  
  /**
   * Registrar una nueva capacidad
   */
  register(
    capability: CapabilityType,
    metadata: Partial<CapabilityMetadata> = {}
  ): void {
    const fullMetadata: CapabilityMetadata = {
      name: capability,
      description: metadata.description || `${capability} capability`,
      requiredFor: metadata.requiredFor || [],
      incompatibleWith: metadata.incompatibleWith || [],
      weights: metadata.weights || {}
    };
    
    this.capabilities.set(capability, fullMetadata);
  }
  
  /**
   * Agregar implicación: si tienes A, también tienes B
   */
  addImplication(capability: CapabilityType, implies: CapabilityType): void {
    if (!this.implications.has(capability)) {
      this.implications.set(capability, new Set());
    }
    this.implications.get(capability)!.add(implies);
  }
  
  /**
   * Obtener todas las capacidades que implica una dada
   */
  getImplications(capability: CapabilityType): Set<CapabilityType> {
    const result = new Set<CapabilityType>();
    const queue = [capability];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const implied = this.implications.get(current);
      
      if (implied) {
        for (const imp of implied) {
          if (!result.has(imp)) {
            result.add(imp);
            queue.push(imp);
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * Verificar compatibilidad entre capacidades
   */
  isCompatible(capabilities: CapabilityType[]): boolean {
    for (const cap of capabilities) {
      const metadata = this.capabilities.get(cap);
      if (!metadata) continue;
      
      for (const incompatible of metadata.incompatibleWith) {
        if (capabilities.includes(incompatible)) {
          return false;
        }
      }
    }
    return true;
  }
  
  /**
   * Expandir capacidades con sus implicaciones
   */
  expandCapabilities(requested: CapabilityType[]): CapabilityType[] {
    const expanded = new Set(requested);
    
    for (const cap of requested) {
      for (const implied of this.getImplications(cap)) {
        expanded.add(implied);
      }
    }
    
    return [...expanded];
  }
}
```

### 3.2 Capacidades Predefinidas

```typescript
// Inicialización de capacidades por defecto
const DEFAULT_CAPABILITIES: CapabilityMetadata[] = [
  {
    name: Capability.CHAT,
    description: 'Conversación general en lenguaje natural',
    implies: [Capability.REASONING],
    incompatibleWith: []
  },
  {
    name: Capability.CODE,
    description: 'Generación y análisis de código',
    implies: [Capability.REASONING],
    incompatibleWith: [],
    weights: { syntax_accuracy: 1.0, latest_languages: 0.8 }
  },
  {
    name: Capability.VISION,
    description: 'Análisis de imágenes y contenido visual',
    implies: [Capability.CHAT],
    incompatibleWith: []
  },
  {
    name: Capability.TOOL_CALLING,
    description: 'Llamada de funciones y herramientas externas',
    implies: [Capability.CODE],
    incompatibleWith: []
  },
  {
    name: Capability.LONG_CONTEXT,
    description: 'Procesamiento de contexto > 100K tokens',
    implies: [Capability.CHAT],
    incompatibleWith: [],
    weights: { memory_efficiency: 1.0 }
  },
  // ... más capacidades
];
```

---

## 4. MODEL REGISTRY

### 4.1 Modelo de Datos

```typescript
/**
 * ModelCapabilities - Capacidades de un modelo específico
 */
interface ModelCapabilities {
  // Capacidades soportadas
  capabilities: CapabilityType[];
  
  // Capacidades inferidas (auto-detectadas)
  inferredCapabilities?: CapabilityType[];
  
  // Niveles de competencia (0-1)
  competencyLevels?: Record<CapabilityType, number>;
  
  // Limitaciones conocidas
  limitations?: {
    maxTokens?: number;
    maxContext?: number;
    maxImageSize?: string;
    unsupportedFeatures?: string[];
  };
}

/**
 * ModelProvider - Información del proveedor
 */
interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiType: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';
  authType: 'api_key' | 'oauth' | 'none';
  
  // Configuración
  config: {
    timeout?: number;
    retries?: number;
    cacheEnabled?: boolean;
  };
}

/**
 * ModelInfo - Información completa de un modelo
 */
interface ModelInfo {
  // Identificación
  id: string;                    // ID único: "provider/model-name"
  provider: ModelProvider;
  
  // Metadata
  name: string;                  // Nombre amigable
  version?: string;
  releaseDate?: Date;
  deprecationDate?: Date;
  
  // Capacidades
  capabilities: ModelCapabilities;
  
  // Métricas (calculadas dinámicamente)
  metrics: {
    avgLatency: number;           // ms
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    successRate: number;         // 0-1
    totalRequests: number;
    totalErrors: number;
    avgCostPer1K: number;       // USD
    lastUsed?: Date;
  };
  
  // Límites
  limits: {
    maxTokens: number;
    maxContext: number;
    maxBatchSize?: number;
    rpm?: number;                // Requests per minute
    tpm?: number;                // Tokens per minute
  };
  
  // Estado
  status: 'active' | 'degraded' | 'unavailable' | 'deprecated';
  healthCheck?: {
    lastCheck: Date;
    isHealthy: boolean;
    errorMessage?: string;
  };
}

/**
 * ModelCandidate - Modelo candidato para una solicitud
 */
interface ModelCandidate {
  model: ModelInfo;
  matchScore: number;            // 0-1
  matchedCapabilities: CapabilityType[];
  missingCapabilities: CapabilityType[];
  estimatedLatency: number;
  estimatedCost: number;
}
```

### 4.2 Registro de Modelos

```typescript
/**
 * ModelRegistry - Registro centralizado de modelos
 */
class ModelRegistry {
  private models: Map<string, ModelInfo>;
  private capabilityIndex: Map<CapabilityType, Set<string>>; // modelId por capability
  private providerIndex: Map<string, Set<string>>; // modelId por provider
  
  constructor(
    private capabilityRegistry: CapabilityRegistry,
    private configService: MultiLLMConfigService
  ) {
    this.models = new Map();
    this.capabilityIndex = new Map();
    this.providerIndex = new Map();
  }
  
  /**
   * Registrar un nuevo modelo dinámicamente
   */
  async registerModel(modelInfo: ModelInfo): Promise<void> {
    // Validar
    this.validateModelInfo(modelInfo);
    
    // Almacenar
    const modelId = this.buildModelId(modelInfo);
    this.models.set(modelId, modelInfo);
    
    // Actualizar índices
    this.updateIndices(modelId, modelInfo);
    
    // Notificar
    EventBus.emit('model:registered', { modelId, modelInfo });
  }
  
  /**
   * Registrar modelo desde provider (auto-detección)
   */
  async registerFromProvider(provider: ModelProvider): Promise<ModelInfo[]> {
    const response = await fetch(`${provider.baseUrl}/models`, {
      headers: this.buildAuthHeaders(provider)
    });
    
    const data = await response.json();
    const models = this.parseProviderModels(data, provider);
    
    for (const model of models) {
      // Auto-detectar capacidades
      model.capabilities = this.detectCapabilities(model);
      await this.registerModel(model);
    }
    
    return models;
  }
  
  /**
   * Auto-detectar capacidades de un modelo
   */
  private detectCapabilities(model: Partial<ModelInfo>): ModelCapabilities {
    const capabilities: CapabilityType[] = [];
    const competencyLevels: Record<string, number> = {};
    
    // Inferir por nombre del modelo
    const modelName = model.id.toLowerCase();
    
    // Visión
    if (modelName.includes('vision') || modelName.includes('gpt-4v') || 
        modelName.includes('claude-3') || modelName.includes('gemini-pro-vision')) {
      capabilities.push(Capability.VISION);
      competencyLevels[Capability.VISION] = 0.9;
    }
    
    // Código
    if (modelName.includes('coder') || modelName.includes('code') || 
        modelName.includes('deepseek-coder')) {
      capabilities.push(Capability.CODE);
      competencyLevels[Capability.CODE] = 0.95;
    }
    
    // Contexto largo
    if (modelName.includes('32k') || modelName.includes('128k') || 
        modelName.includes('200k') || modelName.includes('1m')) {
      capabilities.push(Capability.LONG_CONTEXT);
      competencyLevels[Capability.LONG_CONTEXT] = 1.0;
    }
    
    // Tool calling
    if (modelName.includes('function') || modelName.includes('tools') ||
        model.provider.id === 'anthropic' || model.provider.id === 'openai') {
      capabilities.push(Capability.TOOL_CALLING);
      competencyLevels[Capability.TOOL_CALLING] = 0.9;
    }
    
    // Default: chat básico
    if (capabilities.length === 0) {
      capabilities.push(Capability.CHAT, Capability.REASONING);
      competencyLevels[Capability.CHAT] = 0.8;
      competencyLevels[Capability.REASONING] = 0.7;
    }
    
    return { capabilities, competencyLevels };
  }
  
  /**
   * Buscar modelos por capacidades requeridas
   */
  findByCapabilities(
    required: CapabilityType[],
    options: {
      exclude?: string[];
      minCompetency?: number;
      maxLatency?: number;
      maxCost?: number;
    } = {}
  ): ModelCandidate[] {
    const candidates: ModelCandidate[] = [];
    
    // Expandir capacidades (incluir implicaciones)
    const expanded = this.capabilityRegistry.expandCapabilities(required);
    
    for (const [modelId, model] of this.models) {
      // Exclusiones
      if (options.exclude?.includes(modelId)) continue;
      
      // Verificar estado
      if (model.status === 'unavailable') continue;
      
      // Verificar salud
      if (model.healthCheck && !model.healthCheck.isHealthy) continue;
      
      // Calcular matched y missing
      const matched = expanded.filter(cap => 
        model.capabilities.capabilities.includes(cap)
      );
      const missing = expanded.filter(cap => 
        !model.capabilities.capabilities.includes(cap)
      );
      
      // Filtrar por competency mínima
      if (options.minCompetency) {
        const hasMinCompetency = required.every(cap => {
          const level = model.capabilities.competencyLevels?.[cap] || 0.5;
          return level >= options.minCompetency!;
        });
        if (!hasMinCompetency) continue;
      }
      
      // Filtrar por latencia máxima
      if (options.maxLatency && model.metrics.avgLatency > options.maxLatency) {
        continue;
      }
      
      // Calcular score
      const matchScore = matched.length / expanded.length;
      
      candidates.push({
        model,
        matchScore,
        matchedCapabilities: matched,
        missingCapabilities: missing,
        estimatedLatency: model.metrics.avgLatency,
        estimatedCost: model.metrics.avgCostPer1K
      });
    }
    
    // Ordenar por match score descendente
    return candidates.sort((a, b) => b.matchScore - a.matchScore);
  }
  
  /**
   * Actualizar métricas de un modelo
   */
  updateMetrics(modelId: string, metrics: Partial<ModelInfo['metrics']>): void {
    const model = this.models.get(modelId);
    if (model) {
      model.metrics = { ...model.metrics, ...metrics };
      EventBus.emit('model:metrics_updated', { modelId, metrics });
    }
  }
}
```

---

## 5. CONFIGURATION SERVICE

### 5.1 Modelo de Configuración

```typescript
/**
 * ExecutionMode - Modo de ejecución
 */
const ExecutionMode = {
  SIMPLE: 'simple',           // Un modelo para todo
  SPECIALIZED: 'specialized', // Modelos por rol/tarea
  INTELLIGENT: 'intelligent'  // Routing automático
} as const;

type ExecutionModeType = typeof ExecutionMode[keyof typeof ExecutionMode];

/**
 * Strategy - Estrategia de selección
 */
const Strategy = {
  // Básicas
  FIXED: 'fixed',             // Modelo fijo configurado
  ROUND_ROBIN: 'round_robin', // Rotación entre modelos
  PRIORITY: 'priority',       // Por prioridad configurada
  
  // Optimización
  LATENCY: 'latency',         // Menor latencia
  COST: 'cost',               // Menor costo
  CONTEXT: 'context',         // Mayor contexto disponible
  
  // Avanzadas
  REASONING: 'reasoning',     // Mejor razonamiento
  CONSENSUS: 'consensus',     // Consenso entre modelos
  PARALLEL: 'parallel',       // Ejecución paralela
  
  // Híbridas
  AUTO: 'auto',               // Selección automática
  FALLBACK: 'fallback',       // Chain de fallback
  LOAD_BALANCE: 'load_balance' // Balance de carga
} as const;

type StrategyType = typeof Strategy[keyof typeof Strategy];

/**
 * RoleDefinition - Definición de un rol
 */
interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  
  // Capacidades requeridas
  requiredCapabilities: CapabilityType[];
  preferredCapabilities?: CapabilityType[];
  
  // Configuración del rol
  config: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
  };
  
  // Modelos permitidos para este rol
  allowedModels?: string[];  // Si vacío, todos los activos
  excludedModels?: string[]; // Modelos prohibidos
  
  // Prioridad de modelos
  modelPriorities: Array<{
    modelId: string;
    priority: number;         // 1-100
    maxRetries?: number;
  }>;
  
  // Estrategia para este rol
  strategy: StrategyType;
  
  // Constraints específicos
  constraints?: {
    maxLatency?: number;
    maxCostPerRequest?: number;
    requireFallback?: boolean;
  };
}

/**
 * Profile - Perfil de configuración predefinido
 */
interface Profile {
  id: string;
  name: string;
  description: string;
  icon?: string;
  
  // Configuraciones del perfil
  settings: {
    defaultMode: ExecutionModeType;
    defaultStrategy: StrategyType;
    
    // Roles preconfigurados
    roles: Record<string, Partial<RoleDefinition>>;
    
    // Filtros globales
    filters?: {
      maxLatency?: number;
      maxCostPer1K?: number;
      minSuccessRate?: number;
      allowedProviders?: string[];
      excludedProviders?: string[];
    };
    
    // Proveedores preferidos
    preferredProvider?: string;
    fallbackProvider?: string;
  };
}

/**
 * MultiLLMConfiguration - Configuración completa
 */
interface MultiLLMConfiguration {
  version: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Configuración global
  global: {
    mode: ExecutionModeType;
    defaultStrategy: StrategyType;
    
    // Límites globales
    limits: {
      maxActiveModels: number;
      maxConcurrentRequests: number;
      maxCostPerDay?: number;
    };
    
    // Proveedores
    providers: {
      preferred?: string;
      fallback?: string;
      disabled?: string[];
    };
    
    // Filtros globales
    filters: {
      minContext?: number;
      maxContext?: number;
      minParameters?: number;    // En billions
      maxParameters?: number;
      maxLatency?: number;
      maxCostPer1K?: number;
    };
  };
  
  // Modelos activos
  activeModels: Array<{
    modelId: string;
    enabled: boolean;
    priority: number;           // Prioridad global
    
    // Parámetros por defecto
    parameters: {
      temperature: number;
      topP?: number;
      topK?: number;
      maxTokens: number;
    };
    
    // Tags para categorización
    tags?: string[];
  }>;
  
  // Definiciones de roles
  roles: Record<string, RoleDefinition>;
  
  // Perfiles predefinidos
  profiles: Profile[];
  
  // Perfil activo
  activeProfile?: string;
  
  // Configuración de estrategias específicas
  strategyConfig: {
    [key in StrategyType]?: {
      enabled: boolean;
      weight?: number;
      config?: Record<string, unknown>;
    };
  };
  
  // Constraints del usuario
  userConstraints?: {
    dailyBudget?: number;
    maxRequestsPerDay?: number;
    preferredLanguages?: string[];
    excludedCapabilities?: CapabilityType[];
  };
}
```

### 5.2 Perfiles Predefinidos

```typescript
const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'development',
    name: 'Desarrollo',
    description: 'Optimizado para desarrollo de software',
    icon: '💻',
    settings: {
      defaultMode: 'specialized',
      defaultStrategy: 'priority',
      roles: {
        programming: {
          requiredCapabilities: ['code', 'reasoning', 'tool_calling'],
          strategy: 'priority',
          modelPriorities: [
            { modelId: 'anthropic/claude-3-5-sonnet', priority: 100 },
            { modelId: 'openai/gpt-4o', priority: 90 },
            { modelId: 'deepseek/deepseek-coder', priority: 80 }
          ]
        },
        chat: {
          requiredCapabilities: ['chat', 'reasoning'],
          strategy: 'round_robin',
          modelPriorities: [
            { modelId: 'openai/gpt-4o-mini', priority: 100 },
            { modelId: 'anthropic/claude-3-haiku', priority: 90 }
          ]
        }
      },
      filters: {
        maxLatency: 5000,
        maxCostPer1K: 0.01
      }
    }
  },
  
  {
    id: 'research',
    name: 'Investigación',
    description: 'Optimizado para investigación y análisis profundo',
    icon: '🔬',
    settings: {
      defaultMode: 'intelligent',
      defaultStrategy: 'reasoning',
      roles: {
        analysis: {
          requiredCapabilities: ['reasoning', 'analysis', 'long_context'],
          strategy: 'reasoning',
          modelPriorities: [
            { modelId: 'anthropic/claude-3-5-sonnet', priority: 100 },
            { modelId: 'google/gemini-1.5-pro', priority: 95 },
            { modelId: 'openai/gpt-4o', priority: 90 }
          ]
        }
      },
      filters: {
        minContext: 100000,
        maxLatency: 15000
      }
    }
  },
  
  {
    id: 'cost_effective',
    name: 'Bajo Costo',
    description: 'Minimizar costos manteniendo calidad aceptable',
    icon: '💰',
    settings: {
      defaultMode: 'specialized',
      defaultStrategy: 'cost',
      roles: {
        chat: {
          requiredCapabilities: ['chat'],
          strategy: 'cost',
          modelPriorities: [
            { modelId: 'groq/llama-3.3-70b-versatile', priority: 100 },
            { modelId: 'deepseek/deepseek-chat', priority: 95 },
            { modelId: 'openai/gpt-4o-mini', priority: 80 }
          ]
        }
      },
      filters: {
        maxCostPer1K: 0.001
      },
      preferredProvider: 'groq',
      fallbackProvider: 'deepseek'
    }
  },
  
  {
    id: 'high_quality',
    name: 'Máxima Calidad',
    description: 'Mejor calidad posible sin importar costo',
    icon: '⭐',
    settings: {
      defaultMode: 'intelligent',
      defaultStrategy: 'reasoning',
      roles: {
        default: {
          requiredCapabilities: ['chat', 'reasoning'],
          strategy: 'priority',
          modelPriorities: [
            { modelId: 'anthropic/claude-3-5-sonnet', priority: 100 },
            { modelId: 'openai/gpt-4o', priority: 95 },
            { modelId: 'google/gemini-1.5-pro', priority: 90 }
          ]
        }
      },
      filters: {
        minSuccessRate: 0.99
      }
    }
  },
  
  {
    id: 'local',
    name: 'Trabajo Local',
    description: 'Usa modelos locales (Ollama, LM Studio)',
    icon: '🏠',
    settings: {
      defaultMode: 'specialized',
      defaultStrategy: 'fixed',
      roles: {
        chat: {
          requiredCapabilities: ['chat', 'reasoning'],
          strategy: 'fixed',
          modelPriorities: [
            { modelId: 'ollama/llama3.1:70b', priority: 100 },
            { modelId: 'lmstudio/llama-3.1-70b', priority: 90 }
          ]
        }
      },
      filters: {
        allowedProviders: ['ollama', 'lmstudio']
      },
      preferredProvider: 'ollama'
    }
  },
  
  {
    id: 'hybrid',
    name: 'Híbrido',
    description: 'Combina proveedores locales y cloud',
    icon: '🌐',
    settings: {
      defaultMode: 'intelligent',
      defaultStrategy: 'load_balance',
      roles: {
        default: {
          requiredCapabilities: ['chat'],
          strategy: 'load_balance',
          modelPriorities: [
            { modelId: 'ollama/llama3.1:70b', priority: 80 },
            { modelId: 'groq/llama-3.3-70b-versatile', priority: 60 }
          ]
        }
      }
    }
  }
];
```

---

## 6. STRATEGY ENGINE

### 6.1 Motor de Estrategias

```typescript
/**
 * StrategyContext - Contexto para evaluación de estrategias
 */
interface StrategyContext {
  request: {
    capabilities: CapabilityType[];
    messageCount: number;
    estimatedTokens: number;
  };
  
  candidates: ModelCandidate[];
  userConfig: MultiLLMConfiguration;
  historicalMetrics: Map<string, number[]>;
}

/**
 * StrategyResult - Resultado de una estrategia
 */
interface StrategyResult {
  selectedModels: ModelCandidate[];
  strategy: StrategyType;
  reasoning: string;
  confidence: number;           // 0-1
  alternatives: ModelCandidate[];
}

/**
 * BaseStrategy - Clase base para estrategias
 */
abstract class BaseStrategy {
  abstract readonly name: StrategyType;
  abstract readonly description: string;
  
  constructor(protected config: StrategyConfig) {}
  
  /**
   * Seleccionar modelo(s) basado en la estrategia
   */
  abstract select(context: StrategyContext): StrategyResult;
  
  /**
   * Calcular score para un candidato
   */
  protected calculateScore(
    candidate: ModelCandidate,
    context: StrategyContext
  ): number {
    let score = candidate.matchScore;
    
    // Penalizar si faltan capacidades
    if (candidate.missingCapabilities.length > 0) {
      score *= (1 - candidate.missingCapabilities.length * 0.2);
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Verificar constraints del usuario
   */
  protected meetsConstraints(
    candidate: ModelCandidate,
    constraints: MultiLLMConfiguration['global']['filters']
  ): boolean {
    if (constraints.maxLatency && candidate.estimatedLatency > constraints.maxLatency) {
      return false;
    }
    if (constraints.maxCostPer1K && candidate.estimatedCost > constraints.maxCostPer1K) {
      return false;
    }
    return true;
  }
}

/**
 * PriorityStrategy - Selección por prioridad configurada
 */
class PriorityStrategy extends BaseStrategy {
  readonly name = 'priority';
  readonly description = 'Selecciona por prioridad configurada del usuario';
  
  select(context: StrategyContext): StrategyResult {
    const { userConfig } = context;
    
    // Obtener prioridades del usuario
    const priorities = new Map<string, number>();
    
    // De modelos activos
    for (const model of userConfig.activeModels) {
      priorities.set(model.modelId, model.priority);
    }
    
    // Ordenar candidatos por prioridad
    const ranked = context.candidates
      .map(c => ({
        ...c,
        priorityScore: priorities.get(c.model.id) || 50
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore);
    
    // Seleccionar el mejor
    const selected = ranked[0];
    
    return {
      selectedModels: selected ? [selected] : [],
      strategy: this.name,
      reasoning: `Modelo con prioridad más alta: ${selected?.model.name}`,
      confidence: selected ? 0.9 : 0,
      alternatives: ranked.slice(1, 4)
    };
  }
}

/**
 * LatencyStrategy - Selecciona menor latencia
 */
class LatencyStrategy extends BaseStrategy {
  readonly name = 'latency';
  readonly description = 'Selecciona el modelo con menor latencia histórica';
  
  select(context: StrategyContext): StrategyResult {
    // Filtrar por constraints
    const valid = context.candidates
      .filter(c => this.meetsConstraints(c, context.userConfig.global.filters));
    
    // Ordenar por latencia
    const ranked = [...valid].sort(
      (a, b) => a.estimatedLatency - b.estimatedLatency
    );
    
    const selected = ranked[0];
    
    return {
      selectedModels: selected ? [selected] : [],
      strategy: this.name,
      reasoning: `Menor latencia: ${selected?.estimatedLatency}ms`,
      confidence: selected ? 0.85 : 0,
      alternatives: ranked.slice(1, 4)
    };
  }
}

/**
 * CostStrategy - Selecciona menor costo
 */
class CostStrategy extends BaseStrategy {
  readonly name = 'cost';
  readonly description = 'Selecciona el modelo con menor costo por token';
  
  select(context: StrategyContext): StrategyResult {
    const valid = context.candidates
      .filter(c => c.estimatedCost > 0) // Filtrar modelos sin costo
      .filter(c => this.meetsConstraints(c, context.userConfig.global.filters));
    
    const ranked = [...valid].sort(
      (a, b) => a.estimatedCost - b.estimatedCost
    );
    
    const selected = ranked[0];
    
    return {
      selectedModels: selected ? [selected] : [],
      strategy: this.name,
      reasoning: `Menor costo: $${selected?.estimatedCost}/1K tokens`,
      confidence: selected ? 0.8 : 0,
      alternatives: ranked.slice(1, 4)
    };
  }
}

/**
 * ReasoningStrategy - Selecciona mejor para razonamiento
 */
class ReasoningStrategy extends BaseStrategy {
  readonly name = 'reasoning';
  readonly description = 'Selecciona modelo óptimo para tareas de razonamiento';
  
  select(context: StrategyContext): StrategyResult {
    // Verificar si hay capabilities de razonamiento
    const requiresReasoning = context.request.capabilities.some(
      c => ['reasoning', 'analysis', 'math'].includes(c)
    );
    
    if (!requiresReasoning) {
      // Si no requiere razonamiento, usar prioridad
      return new PriorityStrategy(this.config).select(context);
    }
    
    // Calcular score de razonamiento
    const ranked = context.candidates
      .map(c => {
        const reasoningLevel = c.model.capabilities.capabilities.includes('reasoning_chain') ? 1.0 :
                              c.model.capabilities.capabilities.includes('reasoning') ? 0.8 : 0.5;
        const mathLevel = c.model.capabilities.capabilities.includes('math') ? 1.0 : 0.5;
        
        return {
          ...c,
          reasoningScore: (reasoningLevel + mathLevel) / 2
        };
      })
      .sort((a, b) => b.reasoningScore - a.reasoningScore);
    
    const selected = ranked[0];
    
    return {
      selectedModels: selected ? [selected] : [],
      strategy: this.name,
      reasoning: `Mejor razonamiento: ${selected?.model.name} (score: ${selected?.reasoningScore?.toFixed(2)})`,
      confidence: 0.75,
      alternatives: ranked.slice(1, 4)
    };
  }
}

/**
 * ConsensusStrategy - Ejecuta múltiples y agrega resultados
 */
class ConsensusStrategy extends BaseStrategy {
  readonly name = 'consensus';
  readonly description = 'Ejecuta múltiples modelos y alcanza consenso';
  
  select(context: StrategyContext): StrategyResult {
    // Seleccionar top N para consenso (configurable, default 3)
    const n = this.config.consensus?.minModels || 3;
    
    const ranked = context.candidates.slice(0, n);
    
    return {
      selectedModels: ranked,
      strategy: this.name,
      reasoning: `Consenso de ${ranked.length} modelos`,
      confidence: 0.7,
      alternatives: []
    };
  }
}

/**
 * AutoStrategy - Selección automática según contexto
 */
class AutoStrategy extends BaseStrategy {
  readonly name = 'auto';
  readonly description = 'Selecciona estrategia óptima automáticamente';
  
  private strategies: Map<StrategyType, BaseStrategy>;
  
  constructor(config: StrategyConfig) {
    super(config);
    this.strategies = new Map([
      ['priority', new PriorityStrategy(config)],
      ['latency', new LatencyStrategy(config)],
      ['cost', new CostStrategy(config)],
      ['reasoning', new ReasoningStrategy(config)]
    ]);
  }
  
  select(context: StrategyContext): StrategyResult {
    // Análisis del request
    const { capabilities, estimatedTokens } = context.request;
    
    // Lógica de selección de estrategia
    if (capabilities.includes('reasoning_chain') || capabilities.includes('analysis')) {
      return this.strategies.get('reasoning')!.select(context);
    }
    
    if (estimatedTokens > 50000) {
      return this.strategies.get('latency')!.select(context);
    }
    
    if (context.userConfig.global.filters.maxCostPer1K && 
        context.userConfig.global.filters.maxCostPer1K < 0.001) {
      return this.strategies.get('cost')!.select(context);
    }
    
    // Default
    return this.strategies.get('priority')!.select(context);
  }
}

/**
 * StrategyEngine - Motor central de estrategias
 */
class StrategyEngine {
  private strategies: Map<StrategyType, BaseStrategy>;
  
  constructor(config: StrategyConfig) {
    this.strategies = new Map([
      ['fixed', new PriorityStrategy(config)],
      ['round_robin', new RoundRobinStrategy(config)],
      ['priority', new PriorityStrategy(config)],
      ['latency', new LatencyStrategy(config)],
      ['cost', new CostStrategy(config)],
      ['context', new ContextStrategy(config)],
      ['reasoning', new ReasoningStrategy(config)],
      ['consensus', new ConsensusStrategy(config)],
      ['parallel', new ParallelStrategy(config)],
      ['auto', new AutoStrategy(config)]
    ]);
  }
  
  /**
   * Seleccionar usando una estrategia específica
   */
  select(strategy: StrategyType, context: StrategyContext): StrategyResult {
    const strategyInstance = this.strategies.get(strategy);
    
    if (!strategyInstance) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    
    return strategyInstance.select(context);
  }
  
  /**
   * Registrar nueva estrategia
   */
  register(strategy: BaseStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }
  
  /**
   * Listar estrategias disponibles
   */
  listStrategies(): Array<{ name: StrategyType; description: string }> {
    return [...this.strategies.values()].map(s => ({
      name: s.name,
      description: s.description
    }));
  }
}
```

---

## 7. ORCHESTRATOR

### 7.1 CapabilityOrchestrator

```typescript
/**
 * RequestContext - Contexto de una solicitud
 */
interface RequestContext {
  // Mensajes
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | ContentPart[];
  }>;
  
  // Configuración opcional
  options?: {
    capabilities?: CapabilityType[];
    role?: string;
    strategy?: StrategyType;
    mode?: ExecutionModeType;
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  };
  
  // Usuario
  userId?: string;
}

/**
 * OrchestratorResponse - Respuesta del orquestador
 */
interface OrchestratorResponse {
  // Respuesta(s)
  content: string | Stream;
  modelId: string;
  provider: string;
  
  // Metadatos
  metadata: {
    strategy: StrategyType;
    mode: ExecutionModeType;
    latency: number;
    tokens?: {
      prompt: number;
      completion: number;
      total: number;
    };
    cost?: number;
    capabilities: CapabilityType[];
  };
  
  // Alternatives (para fallback)
  alternatives?: Array<{
    modelId: string;
    reason: string;
  }>;
}

/**
 * CapabilityOrchestrator - Orquestador principal
 */
class CapabilityOrchestrator {
  private modelRegistry: ModelRegistry;
  private capabilityRegistry: CapabilityRegistry;
  private strategyEngine: StrategyEngine;
  private configService: MultiLLMConfigService;
  private executionModes: Map<ExecutionModeType, ExecutionMode>;
  
  constructor(services: OrchestratorServices) {
    this.modelRegistry = services.modelRegistry;
    this.capabilityRegistry = services.capabilityRegistry;
    this.strategyEngine = services.strategyEngine;
    this.configService = services.configService;
    
    // Inicializar modos de ejecución
    this.executionModes = new Map([
      ['simple', new SimpleExecutionMode(this)],
      ['specialized', new SpecializedExecutionMode(this)],
      ['intelligent', new IntelligentExecutionMode(this)]
    ]);
  }
  
  /**
   * Procesar solicitud
   */
  async process(context: RequestContext): Promise<OrchestratorResponse> {
    const startTime = Date.now();
    
    // 1. Obtener configuración del usuario
    const userConfig = await this.configService.getConfig(context.userId);
    
    // 2. Determinar modo de ejecución
    const mode = context.options?.mode || userConfig.global.mode;
    
    // 3. Obtener executor para el modo
    const executor = this.executionModes.get(mode);
    
    // 4. Ejecutar
    const response = await executor.execute(context, userConfig);
    
    // 5. Registrar métricas
    const latency = Date.now() - startTime;
    this.registerMetrics(response, latency);
    
    return {
      ...response,
      metadata: {
        ...response.metadata,
        latency
      }
    };
  }
  
  /**
   * Extraer capabilities de una solicitud
   */
  private extractCapabilities(context: RequestContext): CapabilityType[] {
    const { options, messages } = context;
    
    // Si ya tiene capabilities explícitas, usarlas
    if (options?.capabilities?.length) {
      return options.capabilities;
    }
    
    // Si tiene rol, usar capabilities del rol
    if (options?.role) {
      const config = this.configService.getConfigSync(context.userId);
      const role = config.roles[options.role];
      if (role?.requiredCapabilities) {
        return role.requiredCapabilities;
      }
    }
    
    // Auto-detectar de mensajes
    return this.detectCapabilitiesFromMessages(messages);
  }
  
  /**
   * Detectar capabilities de mensajes
   */
  private detectCapabilitiesFromMessages(
    messages: RequestContext['messages']
  ): CapabilityType[] {
    const content = messages.map(m => {
      if (typeof m.content === 'string') return m.content;
      return m.content.map(c => 'text' in c ? c.text : '').join(' ');
    }).join(' ').toLowerCase();
    
    const capabilities: CapabilityType[] = [Capability.CHAT];
    
    // Código
    if (/\b(code|function|class|implement|debug|refactor)\b/.test(content)) {
      capabilities.push(Capability.CODE, Capability.REASONING);
    }
    
    // Matemáticas
    if (/\b(calculate|math|equation|formula|compute)\b/.test(content)) {
      capabilities.push(Capability.MATH);
    }
    
    // Análisis
    if (/\b(analyze|review|evaluate|assess|critique)\b/.test(content)) {
      capabilities.push(Capability.ANALYSIS, Capability.REASONING);
    }
    
    // Búsqueda
    if (/\b(search|find|lookup|research)\b/.test(content)) {
      capabilities.push(Capability.SEARCH);
    }
    
    // Seguridad
    if (/\b(security|vulnerability|audit|penetration)\b/.test(content)) {
      capabilities.push(Capability.SECURITY);
    }
    
    // DevOps
    if (/\b(deploy|ci\/cd|kubernetes|docker|infrastructure)\b/.test(content)) {
      capabilities.push(Capability.DEVOPS);
    }
    
    return [...new Set(capabilities)];
  }
  
  /**
   * Registrar métricas
   */
  private registerMetrics(
    response: OrchestratorResponse,
    latency: number
  ): void {
    this.modelRegistry.updateMetrics(response.modelId, {
      avgLatency: latency,
      totalRequests: 1, // Incrementar
      lastUsed: new Date()
    });
  }
}
```

### 7.2 Modos de Ejecución

```typescript
/**
 * ExecutionMode - Interfaz para modos de ejecución
 */
interface ExecutionMode {
  execute(
    context: RequestContext,
    config: MultiLLMConfiguration
  ): Promise<OrchestratorResponse>;
}

/**
 * SimpleExecutionMode - Un modelo para todo
 */
class SimpleExecutionMode implements ExecutionMode {
  constructor(private orchestrator: CapabilityOrchestrator) {}
  
  async execute(
    context: RequestContext,
    config: MultiLLMConfiguration
  ): Promise<OrchestratorResponse> {
    // Obtener modelo primario configurado
    const primaryModel = config.activeModels.find(m => m.enabled);
    
    if (!primaryModel) {
      throw new Error('No active models configured');
    }
    
    // Ejecutar directamente
    return this.orchestrator.executeOnModel(
      primaryModel.modelId,
      context
    );
  }
}

/**
 * SpecializedExecutionMode - Modelos por rol/tarea
 */
class SpecializedExecutionMode implements ExecutionMode {
  constructor(private orchestrator: CapabilityOrchestrator) {}
  
  async execute(
    context: RequestContext,
    config: MultiLLMConfiguration
  ): Promise<OrchestratorResponse> {
    const role = context.options?.role || 'default';
    const roleConfig = config.roles[role];
    
    if (!roleConfig) {
      // Fallback a modo simple
      return new SimpleExecutionMode(this.orchestrator).execute(context, config);
    }
    
    // Obtener candidatos para las capabilities del rol
    const capabilities = roleConfig.requiredCapabilities;
    const candidates = this.orchestrator.findCandidates(capabilities, config);
    
    // Aplicar estrategia del rol
    const strategy = roleConfig.strategy || config.global.defaultStrategy;
    const result = this.orchestrator.applyStrategy(strategy, candidates, config);
    
    // Ejecutar con fallback
    return this.executeWithFallback(
      result.selectedModels,
      context,
      roleConfig.modelPriorities
    );
  }
  
  private async executeWithFallback(
    candidates: ModelCandidate[],
    context: RequestContext,
    priorities: RoleDefinition['modelPriorities']
  ): Promise<OrchestratorResponse> {
    // Ordenar por prioridades del rol
    const ordered = candidates.sort((a, b) => {
      const pA = priorities.find(p => p.modelId === a.model.id)?.priority || 0;
      const pB = priorities.find(p => p.modelId === b.model.id)?.priority || 0;
      return pB - pA;
    });
    
    // Intentar con fallback
    let lastError: Error;
    
    for (const candidate of ordered) {
      try {
        return await this.orchestrator.executeOnModel(
          candidate.model.id,
          context
        );
      } catch (error) {
        lastError = error;
        // Continuar con siguiente
      }
    }
    
    throw lastError || new Error('All models failed');
  }
}

/**
 * IntelligentExecutionMode - Routing automático
 */
class IntelligentExecutionMode implements ExecutionMode {
  constructor(private orchestrator: CapabilityOrchestrator) {}
  
  async execute(
    context: RequestContext,
    config: MultiLLMConfiguration
  ): Promise<OrchestratorResponse> {
    // Extraer capabilities
    const capabilities = this.orchestrator.extractCapabilities(context);
    
    // Encontrar candidatos
    const candidates = this.orchestrator.findCandidates(capabilities, config);
    
    // Seleccionar estrategia automáticamente
    const strategy = this.selectOptimalStrategy(
      capabilities,
      candidates,
      config
    );
    
    // Aplicar estrategia
    const result = this.orchestrator.applyStrategy(strategy, candidates, config);
    
    // Determinar modo de ejecución (single, parallel, consensus)
    const executionType = this.selectExecutionType(strategy, capabilities);
    
    return this.executeByType(
      executionType,
      result.selectedModels,
      context
    );
  }
  
  private selectOptimalStrategy(
    capabilities: CapabilityType[],
    candidates: ModelCandidate[],
    config: MultiLLMConfiguration
  ): StrategyType {
    // Análisis de capabilities
    if (capabilities.includes('analysis') || capabilities.includes('reasoning_chain')) {
      return 'reasoning';
    }
    
    // Análisis de candidatos
    if (candidates.length > 2) {
      // Muchos candidatos disponibles
      if (config.global.filters.maxCostPer1K && config.global.filters.maxCostPer1K < 0.001) {
        return 'cost';
      }
      if (config.global.filters.maxLatency && config.global.filters.maxLatency < 2000) {
        return 'latency';
      }
    }
    
    // Default
    return 'priority';
  }
  
  private selectExecutionType(
    strategy: StrategyType,
    capabilities: CapabilityType[]
  ): 'single' | 'parallel' | 'consensus' {
    if (strategy === 'consensus') return 'consensus';
    if (strategy === 'parallel') return 'parallel';
    
    // Alta importancia = consenso
    if (capabilities.includes('security') || capabilities.includes('architecture')) {
      return 'consensus';
    }
    
    return 'single';
  }
  
  private async executeByType(
    type: 'single' | 'parallel' | 'consensus',
    candidates: ModelCandidate[],
    context: RequestContext
  ): Promise<OrchestratorResponse> {
    switch (type) {
      case 'single':
        return this.orchestrator.executeOnModel(candidates[0].model.id, context);
        
      case 'parallel':
        const results = await Promise.all(
          candidates.slice(0, 3).map(c => 
            this.orchestrator.executeOnModel(c.model.id, context)
          )
        );
        return this.aggregateResponses(results);
        
      case 'consensus':
        return this.buildConsensus(candidates, context);
        
      default:
        return this.orchestrator.executeOnModel(candidates[0].model.id, context);
    }
  }
  
  private aggregateResponses(responses: OrchestratorResponse[]): OrchestratorResponse {
    // Combinar respuestas (ejemplo simple)
    return {
      ...responses[0],
      content: responses.map(r => r.content).join('\n---\n')
    };
  }
  
  private async buildConsensus(
    candidates: ModelCandidate[],
    context: RequestContext
  ): Promise<OrchestratorResponse> {
    // Ejecutar múltiples y sintetizar
    const results = await Promise.all(
      candidates.slice(0, 3).map(c =>
        this.orchestrator.executeOnModel(c.model.id, context)
      )
    );
    
    // Usar el mejor (por ranking) como base
    const base = results[0];
    
    return {
      ...base,
      metadata: {
        ...base.metadata,
        consensus: {
          models: candidates.slice(0, 3).map(c => c.model.id),
          agreement: this.calculateAgreement(results)
        }
      }
    };
  }
  
  private calculateAgreement(responses: OrchestratorResponse[]): number {
    // Implementar lógica de consenso (TF-IDF, embedding similarity, etc.)
    return 0.7; // Placeholder
  }
}
```

---

## 8. PERSISTENCIA

### 8.1 Schema de MongoDB

```javascript
// MultiLLMConfig Schema
const multiLLMConfigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
    index: true
  },
  
  version: { type: String, default: '1.0' },
  
  // Configuración global
  global: {
    mode: {
      type: String,
      enum: ['simple', 'specialized', 'intelligent'],
      default: 'specialized'
    },
    defaultStrategy: {
      type: String,
      enum: ['fixed', 'round_robin', 'priority', 'latency', 'cost', 'reasoning', 'consensus', 'auto'],
      default: 'priority'
    },
    limits: {
      maxActiveModels: { type: Number, default: 5, min: 1, max: 20 },
      maxConcurrentRequests: { type: Number, default: 10 },
      maxCostPerDay: { type: Number }
    },
    providers: {
      preferred: { type: String },
      fallback: { type: String },
      disabled: [{ type: String }]
    },
    filters: {
      minContext: { type: Number },
      maxContext: { type: Number },
      minParameters: { type: Number },
      maxParameters: { type: Number },
      maxLatency: { type: Number },
      maxCostPer1K: { type: Number }
    }
  },
  
  // Modelos activos
  activeModels: [{
    modelId: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 50, min: 1, max: 100 },
    parameters: {
      temperature: { type: Number, default: 0.7, min: 0, max: 2 },
      topP: { type: Number },
      topK: { type: Number },
      maxTokens: { type: Number, default: 4096 }
    },
    tags: [{ type: String }]
  }],
  
  // Roles
  roles: {
    type: Map,
    of: {
      id: String,
      name: String,
      requiredCapabilities: [String],
      preferredCapabilities: [String],
      config: {
        temperature: Number,
        maxTokens: Number,
        topP: Number,
        topK: Number
      },
      modelPriorities: [{
        modelId: String,
        priority: { type: Number, min: 1, max: 100 },
        maxRetries: Number
      }],
      strategy: String,
      constraints: {
        maxLatency: Number,
        maxCostPerRequest: Number,
        requireFallback: Boolean
      }
    },
    default: {}
  },
  
  // Perfil activo
  activeProfile: { type: String },
  
  // Estrategia configs
  strategyConfig: {
    type: Map,
    of: {
      enabled: Boolean,
      weight: Number,
      config: mongoose.Schema.Types.Mixed
    }
  },
  
  // Constraints del usuario
  userConstraints: {
    dailyBudget: Number,
    maxRequestsPerDay: Number,
    preferredLanguages: [String],
    excludedCapabilities: [String]
  }
}, {
  timestamps: true
});

// Índice para búsqueda rápida
multiLLMConfigSchema.index({ 'activeModels.modelId': 1 });
multiLLMConfigSchema.index({ 'roles.requiredCapabilities': 1 });
multiLLMConfigSchema.index({ activeProfile: 1 });

// Versionado
multiLLMConfigSchema.methods.createSnapshot = function() {
  return {
    version: this.version,
    snapshot: this.toObject(),
    createdAt: new Date()
  };
};
```

### 8.2 Servicio de Configuración

```typescript
class MultiLLMConfigService {
  private cache: Map<string, CachedConfig>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  
  constructor(
    private model: mongoose.Model<MultiLLMConfigDocument>,
    private eventBus: EventBus
  ) {
    this.cache = new Map();
  }
  
  async getConfig(userId?: string): Promise<MultiLLMConfiguration> {
    const cacheKey = userId || 'global';
    
    // Verificar cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.config;
    }
    
    // Obtener de DB
    let config = await this.model.findOne({ userId: userId || null });
    
    if (!config) {
      // Crear config por defecto
      config = await this.createDefaultConfig(userId);
    }
    
    // Cachear
    this.cache.set(cacheKey, {
      config: config.toObject() as MultiLLMConfiguration,
      timestamp: Date.now()
    });
    
    return config.toObject() as MultiLLMConfiguration;
  }
  
  async updateConfig(
    userId: string | undefined,
    updates: Partial<MultiLLMConfiguration>
  ): Promise<MultiLLMConfiguration> {
    // Crear snapshot antes de actualizar
    const current = await this.getConfig(userId);
    const snapshot = {
      version: current.version,
      config: current,
      createdAt: new Date()
    };
    
    // Actualizar
    const config = await this.model.findOneAndUpdate(
      { userId: userId || null },
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        },
        $push: {
          snapshots: { $each: [snapshot], $slice: -10 } // Mantener últimos 10
        }
      },
      { new: true, upsert: true }
    );
    
    // Invalidar cache
    this.cache.delete(userId || 'global');
    
    // Emitir evento
    this.eventBus.emit('config:updated', { userId, updates });
    
    return config.toObject() as MultiLLMConfiguration;
  }
  
  async resetToProfile(
    userId: string | undefined,
    profileId: string
  ): Promise<MultiLLMConfiguration> {
    const profile = DEFAULT_PROFILES.find(p => p.id === profileId);
    
    if (!profile) {
      throw new Error(`Unknown profile: ${profileId}`);
    }
    
    return this.updateConfig(userId, {
      ...profile.settings,
      activeProfile: profileId
    });
  }
  
  async exportConfig(userId: string): Promise<string> {
    const config = await this.getConfig(userId);
    return JSON.stringify(config, null, 2);
  }
  
  async importConfig(
    userId: string,
    configJson: string
  ): Promise<MultiLLMConfiguration> {
    const config = JSON.parse(configJson) as MultiLLMConfiguration;
    
    // Validar
    this.validateConfig(config);
    
    // Guardar
    return this.updateConfig(userId, config);
  }
}
```

---

## 9. API ENDPOINTS

### 9.1 Rutas del Orchestrator

```typescript
// api/server/routes/capability-orchestrator.js
const router = express.Router();

/**
 * GET /api/multi-llm/config
 * Obtener configuración del usuario
 */
router.get('/config', authMiddleware, async (req, res) => {
  const config = await configService.getConfig(req.user?.id);
  res.json(config);
});

/**
 * PUT /api/multi-llm/config
 * Actualizar configuración
 */
router.put('/config', authMiddleware, async (req, res) => {
  const config = await configService.updateConfig(req.user?.id, req.body);
  res.json(config);
});

/**
 * GET /api/multi-llm/models
 * Listar modelos disponibles con capacidades
 */
router.get('/models', authMiddleware, async (req, res) => {
  const models = await modelRegistry.listModels({
    capabilities: req.query.capabilities?.split(','),
    provider: req.query.provider
  });
  res.json({ models });
});

/**
 * GET /api/multi-llm/capabilities
 * Listar todas las capacidades disponibles
 */
router.get('/capabilities', async (req, res) => {
  const capabilities = capabilityRegistry.listCapabilities();
  res.json({ capabilities });
});

/**
 * GET /api/multi-llm/strategies
 * Listar estrategias disponibles
 */
router.get('/strategies', async (req, res) => {
  const strategies = strategyEngine.listStrategies();
  res.json({ strategies });
});

/**
 * GET /api/multi-llm/profiles
 * Listar perfiles disponibles
 */
router.get('/profiles', async (req, res) => {
  res.json({ profiles: DEFAULT_PROFILES });
});

/**
 * POST /api/multi-llm/profiles/:profileId/activate
 * Activar un perfil
 */
router.post('/profiles/:profileId/activate', authMiddleware, async (req, res) => {
  const config = await configService.resetToProfile(req.user?.id, req.params.profileId);
  res.json(config);
});

/**
 * GET /api/multi-llm/stats
 * Estadísticas de uso
 */
router.get('/stats', authMiddleware, async (req, res) => {
  const stats = await modelRegistry.getStats(req.user?.id);
  res.json(stats);
});

/**
 * POST /api/multi-llm/process
 * Procesar solicitud con routing inteligente
 */
router.post('/process', authMiddleware, async (req, res) => {
  const result = await orchestrator.process({
    messages: req.body.messages,
    options: req.body.options,
    userId: req.user?.id
  });
  res.json(result);
});

/**
 * POST /api/multi-llm/export
 * Exportar configuración
 */
router.post('/export', authMiddleware, async (req, res) => {
  const config = await configService.exportConfig(req.user?.id);
  res.json({ config });
});

/**
 * POST /api/multi-llm/import
 * Importar configuración
 */
router.post('/import', authMiddleware, async (req, res) => {
  const config = await configService.importConfig(req.user?.id, req.body.config);
  res.json(config);
});

module.exports = router;
```

---

Este documento continúa en **PARTE 2** con:
- Frontend Dashboard
- Plan de Implementación Detallado
- Testing Strategy
- Impacto en Performance
