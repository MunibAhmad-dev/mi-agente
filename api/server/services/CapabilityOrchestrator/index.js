/**
 * Capability Orchestrator - Índice Principal
 *
 * Sistema de orquestación Multi-LLM basado en capacidades
 */

// Types y Constantes
const Types = require('./constants/Types');
const {
  Capabilities,
  ExecutionModes,
  Strategies,
  ModelStatus,
  ServiceLifecycle,
  ServiceNames,
  Providers,
  Limits,
  CORE_CAPABILITIES,
  CAPABILITY_CATEGORIES,
  ALL_CAPABILITIES,
} = Types;

// Profiles
const {
  PROFILES,
  getProfile,
  listProfiles,
  getProfileForUseCase,
} = require('./constants/Profiles');

// Container
const { ServiceContainer, globalContainer } = require('./container/ServiceContainer');

// Registries
const { CapabilityRegistry, getCapabilityRegistry } = require('./models/CapabilityRegistry');
const { ModelRegistry, getModelRegistry } = require('./models/ModelRegistry');

// Config & Schema
const { MultiLLMConfig, ModelMetadata, ConfigSnapshot } = require('./models/Schema');
const { ConfigService, getConfigService } = require('./models/ConfigService');

// Strategies
const { StrategyEngine, getStrategyEngine } = require('./strategies/StrategyEngine');
const {
  BaseStrategy,
  FixedStrategy,
  PriorityStrategy,
  RoundRobinStrategy,
  LatencyStrategy,
  CostStrategy,
  ContextStrategy,
  ReasoningStrategy,
} = require('./strategies/BaseStrategy');
const {
  ConsensusStrategy,
  ParallelStrategy,
  AutoStrategy,
  HybridStrategy,
} = require('./strategies/AdvancedStrategies');
const {
  ExecutorFactory,
  SingleExecutor,
  ParallelExecutor,
  ConsensusExecutor,
  SequentialExecutor,
  FallbackExecutor,
} = require('./strategies/Executors');

// Execution Modes
const {
  BaseExecutionMode,
  SimpleExecutionMode,
  SpecializedExecutionMode,
  IntelligentExecutionMode,
  ExecutionModeFactory,
} = require('./ExecutionModes');

// Orchestrator
const { CapabilityOrchestrator, getCapabilityOrchestrator } = require('./CapabilityOrchestrator');

// Adapters
const { LLMGatewayAdapter, createLLMGatewayAdapter } = require('./adapters/LLMGatewayAdapter');

// Facade
const { OrchestratorFacade } = require('./OrchestratorFacade');

/**
 * Configurar el container global con servicios básicos
 */
function configureGlobalContainer() {
  // Logger
  globalContainer.singleton('Logger', () => ({
    info: (...args) => console.log('[Capability]', ...args),
    warn: (...args) => console.warn('[Capability]', ...args),
    error: (...args) => console.error('[Capability]', ...args),
  }));

  // Event Bus (simple)
  globalContainer.singleton('EventBus', () => ({
    events: {},
    emit(event, data) {
      const handlers = this.events[event] || [];
      handlers.forEach((h) => h(data));
    },
    on(event, handler) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(handler);
    },
    off(event, handler) {
      if (this.events[event]) {
        this.events[event] = this.events[event].filter((h) => h !== handler);
      }
    },
  }));

  // Capability Registry
  globalContainer.singleton('CapabilityRegistry', () => {
    return new CapabilityRegistry();
  });

  // Model Registry (depende de Capability Registry)
  // OJO: el ServiceContainer inyecta SOLO por el array `dependencies` (no por
  // nombre de parámetro). Sin el array, las factories reciben undefined y el
  // orchestrator queda con registries vacíos (bug corregido 12-ago-2026).
  globalContainer.singleton(
    'ModelRegistry',
    (capabilityRegistry, logger) => {
      return new ModelRegistry({ capabilityRegistry, logger });
    },
    ['CapabilityRegistry', 'Logger'],
  );

  // Config Service
  globalContainer.singleton(
    'ConfigService',
    (logger) => {
      return new ConfigService({ logger });
    },
    ['Logger'],
  );

  // Strategy Engine
  globalContainer.singleton(
    'StrategyEngine',
    (logger) => {
      return new StrategyEngine({ logger });
    },
    ['Logger'],
  );

  // Capability Orchestrator
  globalContainer.singleton(
    'CapabilityOrchestrator',
    (modelRegistry, capabilityRegistry, configService, logger, eventBus) => {
      return new CapabilityOrchestrator({
        modelRegistry,
        capabilityRegistry,
        configService,
        logger,
        eventBus,
      });
    },
    ['ModelRegistry', 'CapabilityRegistry', 'ConfigService', 'Logger', 'EventBus'],
  );

  return globalContainer;
}

/**
 * Inicializar el sistema completo
 */
async function initialize(options = {}) {
  // Configurar container si no está configurado
  if (globalContainer.listServices().length === 0) {
    configureGlobalContainer();
  }

  // Obtener registries
  const capabilityRegistry = globalContainer.resolve('CapabilityRegistry');
  const modelRegistry = globalContainer.resolve('ModelRegistry');

  // Registrar modelos del sistema
  if (options.registerSystemModels !== false) {
    await registerSystemModels(modelRegistry, capabilityRegistry);
  }

  console.log('[CapabilityOrchestrator] Initialized');
  console.log(`  - Capabilities: ${capabilityRegistry.listCapabilities().length}`);
  console.log(`  - Models: ${modelRegistry.listModels().length}`);

  return {
    capabilityRegistry,
    modelRegistry,
    configService: globalContainer.resolve('ConfigService'),
    strategyEngine: globalContainer.resolve('StrategyEngine'),
    orchestrator: globalContainer.resolve('CapabilityOrchestrator'),
    container: globalContainer,
  };
}

/**
 * Registrar modelos del sistema en los registries
 */
async function registerSystemModels(modelRegistry, capabilityRegistry) {
  const systemModels = [
    // Groq
    {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      name: 'Llama 3.3 70B',
      capabilities: [Capabilities.CHAT, Capabilities.CODE, Capabilities.REASONING],
      limits: { maxTokens: 8192, maxContext: 128000, rpm: 30 },
      costPer1K: { input: 0, output: 0 },
    },
    {
      provider: 'groq',
      model: 'mixtral-8x7b-32768',
      name: 'Mixtral 8x7B',
      capabilities: [Capabilities.CHAT, Capabilities.CODE],
      limits: { maxTokens: 32768, rpm: 30 },
      costPer1K: { input: 0, output: 0 },
    },

    // DeepSeek
    {
      provider: 'deepseek',
      model: 'deepseek-chat',
      name: 'DeepSeek Chat',
      capabilities: [
        Capabilities.CHAT,
        Capabilities.CODE,
        Capabilities.MATH,
        Capabilities.REASONING,
        Capabilities.TOOL_CALLING,
        Capabilities.JSON_MODE,
      ],
      limits: { maxTokens: 8192, maxContext: 64000 },
      costPer1K: { input: 0.0001, output: 0.0003 },
    },
    {
      provider: 'deepseek',
      model: 'deepseek-coder',
      name: 'DeepSeek Coder',
      capabilities: [
        Capabilities.CODE,
        Capabilities.REASONING,
        Capabilities.TOOL_CALLING,
        Capabilities.JSON_MODE,
      ],
      limits: { maxTokens: 8192, maxContext: 64000 },
      costPer1K: { input: 0.0001, output: 0.0003 },
    },
    {
      provider: 'deepseek',
      model: 'deepseek-v3',
      name: 'DeepSeek V3',
      capabilities: [
        Capabilities.CHAT,
        Capabilities.CODE,
        Capabilities.MATH,
        Capabilities.REASONING,
        Capabilities.REASONING_CHAIN,
        Capabilities.TOOL_CALLING,
        Capabilities.JSON_MODE,
        Capabilities.LONG_CONTEXT,
      ],
      limits: { maxTokens: 8192, maxContext: 64000 },
      costPer1K: { input: 0, output: 0 },
    },

    // Anthropic
    {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      capabilities: [
        Capabilities.CHAT,
        Capabilities.CODE,
        Capabilities.REASONING,
        Capabilities.ANALYSIS,
        Capabilities.VISION,
        Capabilities.TOOL_CALLING,
        Capabilities.LONG_CONTEXT,
      ],
      limits: { maxTokens: 8192, maxContext: 200000 },
      costPer1K: { input: 0.003, output: 0.015 },
    },

    // Google
    {
      provider: 'google',
      model: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      capabilities: [
        Capabilities.CHAT,
        Capabilities.CODE,
        Capabilities.VISION,
        Capabilities.LONG_CONTEXT,
        Capabilities.MULTIMODAL,
      ],
      limits: { maxTokens: 8192, maxContext: 1000000 },
      costPer1K: { input: 0.000075, output: 0.0003 },
    },

    // OpenAI
    {
      provider: 'openai',
      model: 'gpt-4o',
      name: 'GPT-4o',
      capabilities: [
        Capabilities.CHAT,
        Capabilities.CODE,
        Capabilities.VISION,
        Capabilities.REASONING,
        Capabilities.TOOL_CALLING,
      ],
      limits: { maxTokens: 4096, maxContext: 128000 },
      costPer1K: { input: 0.005, output: 0.015 },
    },
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      capabilities: [Capabilities.CHAT, Capabilities.CODE],
      limits: { maxTokens: 4096, maxContext: 128000 },
      costPer1K: { input: 0.00015, output: 0.0006 },
    },

    // Ollama (local)
    {
      provider: 'ollama',
      model: 'llama3.1:70b',
      name: 'Llama 3.1 70B (Local)',
      capabilities: [Capabilities.CHAT, Capabilities.CODE, Capabilities.REASONING],
      limits: { maxTokens: 4096, maxContext: 131072 },
      costPer1K: { input: 0, output: 0 },
    },
  ];

  for (const model of systemModels) {
    await modelRegistry.registerModel(model);
  }
}

module.exports = {
  // Exports principales
  initialize,
  configureGlobalContainer,
  registerSystemModels,

  // Tipos y Constantes
  Types,
  Capabilities,
  ExecutionModes,
  Strategies,
  ModelStatus,
  ServiceLifecycle,
  ServiceNames,
  Providers,
  Limits,
  CORE_CAPABILITIES,
  CAPABILITY_CATEGORIES,
  ALL_CAPABILITIES,

  // Profiles
  PROFILES,
  getProfile,
  listProfiles,
  getProfileForUseCase,

  // Container
  ServiceContainer,
  globalContainer,

  // Registries
  CapabilityRegistry,
  getCapabilityRegistry,
  ModelRegistry,
  getModelRegistry,

  // Config & Schema
  MultiLLMConfig,
  ModelMetadata,
  ConfigSnapshot,
  ConfigService,
  getConfigService,

  // Strategies
  StrategyEngine,
  getStrategyEngine,
  BaseStrategy,
  FixedStrategy,
  PriorityStrategy,
  RoundRobinStrategy,
  LatencyStrategy,
  CostStrategy,
  ContextStrategy,
  ReasoningStrategy,
  ConsensusStrategy,
  ParallelStrategy,
  AutoStrategy,
  HybridStrategy,
  ExecutorFactory,
  SingleExecutor,
  ParallelExecutor,
  ConsensusExecutor,
  SequentialExecutor,
  FallbackExecutor,

  // Execution Modes
  BaseExecutionMode,
  SimpleExecutionMode,
  SpecializedExecutionMode,
  IntelligentExecutionMode,
  ExecutionModeFactory,

  // Orchestrator
  CapabilityOrchestrator,
  getCapabilityOrchestrator,

  // Adapters
  LLMGatewayAdapter,
  createLLMGatewayAdapter,

  // Facade
  OrchestratorFacade,
};
