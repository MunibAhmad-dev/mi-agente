/**
 * Capability Orchestrator - Tipos y Constantes
 *
 * Sistema basado en capacidades para orquestación de múltiples LLMs
 */

/**
 * Capacidades disponibles (string-based para extensibilidad)
 * Usar strings en lugar de enum para permitir capacidades dinámicas
 */
const Capabilities = {
  // Core
  CHAT: 'chat',
  REASONING: 'reasoning',
  CODE: 'code',
  ANALYSIS: 'analysis',

  // Domain-specific
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  ARCHITECTURE: 'architecture',
  SECURITY: 'security',
  DEVOPS: 'devops',
  DATABASE: 'database',

  // Multimodal
  VISION: 'vision',
  AUDIO: 'audio',
  MULTIMODAL: 'multimodal',

  // Advanced
  TOOL_CALLING: 'tool_calling',
  FUNCTION_CALLING: 'function_calling',
  LONG_CONTEXT: 'long_context',
  MATH: 'math',
  REASONING_CHAIN: 'reasoning_chain',
  JSON_MODE: 'json_mode',

  // Utility
  SEARCH: 'search',
  TRANSLATION: 'translation',
  SUMMARIZATION: 'summarization',
  CLASSIFICATION: 'classification',
  EMBEDDINGS: 'embeddings',
  RAG: 'rag',

  // Creative
  CREATIVE: 'creative',
  WRITING: 'writing',
  IMAGE_GEN: 'image_generation',
  VIDEO_GEN: 'video_generation',
};

// Alias para compatibilidad
Capabilities.TOOLS = Capabilities.TOOL_CALLING;

/**
 * Array de capacidades core
 */
const CORE_CAPABILITIES = [
  Capabilities.CHAT,
  Capabilities.REASONING,
  Capabilities.CODE,
  Capabilities.ANALYSIS,
];

/**
 * Capacidades por categoría
 */
const CAPABILITY_CATEGORIES = {
  core: CORE_CAPABILITIES,
  domain: [
    Capabilities.FRONTEND,
    Capabilities.BACKEND,
    Capabilities.ARCHITECTURE,
    Capabilities.SECURITY,
    Capabilities.DEVOPS,
    Capabilities.DATABASE,
  ],
  multimodal: [Capabilities.VISION, Capabilities.AUDIO, Capabilities.MULTIMODAL],
  advanced: [
    Capabilities.TOOL_CALLING,
    Capabilities.LONG_CONTEXT,
    Capabilities.MATH,
    Capabilities.REASONING_CHAIN,
  ],
  utility: [
    Capabilities.SEARCH,
    Capabilities.TRANSLATION,
    Capabilities.SUMMARIZATION,
    Capabilities.CLASSIFICATION,
    Capabilities.EMBEDDINGS,
    Capabilities.RAG,
  ],
  creative: [
    Capabilities.CREATIVE,
    Capabilities.WRITING,
    Capabilities.IMAGE_GEN,
    Capabilities.VIDEO_GEN,
  ],
};

/**
 * Todas las capacidades en un array
 */
const ALL_CAPABILITIES = Object.values(Capabilities);

/**
 * Modos de ejecución
 */
const ExecutionModes = {
  SIMPLE: 'simple', // Un modelo para todo
  SPECIALIZED: 'specialized', // Modelos por rol/tarea
  INTELLIGENT: 'intelligent', // Routing automático
};

/**
 * Estrategias de selección
 */
const Strategies = {
  // Básicas
  FIXED: 'fixed', // Modelo fijo
  ROUND_ROBIN: 'round_robin', // Rotación
  PRIORITY: 'priority', // Por prioridad

  // Optimización
  LATENCY: 'latency', // Menor latencia
  COST: 'cost', // Menor costo
  CONTEXT: 'context', // Mayor contexto

  // Avanzadas
  REASONING: 'reasoning', // Mejor razonamiento
  CONSENSUS: 'consensus', // Consenso entre modelos
  PARALLEL: 'parallel', // Ejecución paralela

  // Especiales
  AUTO: 'auto', // Selección automática
};

/**
 * Estados de salud del modelo
 */
const ModelStatus = {
  ACTIVE: 'active',
  DEGRADED: 'degraded',
  UNAVAILABLE: 'unavailable',
  DEPRECATED: 'deprecated',
};

/**
 * Lifecycle de servicios en el container
 */
const ServiceLifecycle = {
  SINGLETON: 'singleton',
  TRANSIENT: 'transient',
  SCOPED: 'scoped',
};

/**
 * Tipos de métricas
 */
const MetricTypes = {
  LATENCY: 'latency',
  COST: 'cost',
  TOKENS: 'tokens',
  REQUESTS: 'requests',
  ERRORS: 'errors',
};

/**
 * Roles predefinidos del sistema
 */
const SystemRoles = {
  DEFAULT: 'default',
  PROGRAMMING: 'programming',
  RESEARCH: 'research',
  CHAT: 'chat',
  ANALYSIS: 'analysis',
};

/**
 * Nombres de servicios del container
 */
const ServiceNames = {
  // Registries
  CAPABILITY_REGISTRY: 'CapabilityRegistry',
  MODEL_REGISTRY: 'ModelRegistry',
  CONFIG_SERVICE: 'ConfigService',

  // Engines
  STRATEGY_ENGINE: 'StrategyEngine',
  ORCHESTRATOR: 'CapabilityOrchestrator',

  // Adapters
  LLM_GATEWAY_ADAPTER: 'LLMGatewayAdapter',

  // Infrastructure
  LOGGER: 'Logger',
  MONGO_CONNECTION: 'MongoConnection',
  METRICS: 'Metrics',
  EVENT_BUS: 'EventBus',
  FEATURE_FLAGS: 'FeatureFlags',
};

/**
 * Proveedores soportados
 */
const Providers = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  GROQ: 'groq',
  DEEPSEEK: 'deepseek',
  CLOUDFLARE: 'cloudflare',
  MISTRAL: 'mistral',
  COHERE: 'cohere',
  HUGGINGFACE: 'huggingface',
  OPENROUTER: 'openrouter',
  PERPLEXITY: 'perplexity',
  LEPTON: 'lepton',
  TOGETHER: 'together',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
  LITELLM: 'litellm',
};

/**
 * Límites del sistema
 */
const Limits = {
  MAX_ACTIVE_MODELS: 20,
  MAX_ROLES: 10,
  MAX_SNAPSHOTS: 10,
  MAX_CAPABILITIES_PER_MODEL: 50,
  DEFAULT_TIMEOUT: 60000,
  DEFAULT_MAX_RETRIES: 3,
  CACHE_TTL: 300000, // 5 minutos
};

/**
 * Versión del schema
 */
const SCHEMA_VERSION = '2.0';

module.exports = {
  // Capabilities
  Capabilities,
  CORE_CAPABILITIES,
  CAPABILITY_CATEGORIES,
  ALL_CAPABILITIES,

  // Modes & Strategies
  ExecutionModes,
  Strategies,

  // Status
  ModelStatus,
  ServiceLifecycle,
  MetricTypes,

  // Predefined
  SystemRoles,
  ServiceNames,
  Providers,

  // Limits
  Limits,
  SCHEMA_VERSION,
};
