/**
 * Integration Manager - Punto de Entrada Central (JavaScript Puro)
 *
 * Este es el componente CENTRAL que orquesta toda la arquitectura.
 * Usa ExecutionEngine como núcleo para ejecutar solicitudes.
 *
 * FLUJO PRINCIPAL:
 * Controlador → IntegrationManager → ExecutionEngine → Tasks → Runtimes
 */

const { getEventBus, EventType, EventPriority } = require('../EventBus');
const { getRuntimeRegistry, Capability } = require('../RuntimeRegistry');
const { getCapabilityRouter, SelectionStrategy } = require('../CapabilityRouter');
const { getExecutionEngine, ExecutionStatus } = require('../ExecutionEngine');
const { getAPIKeyManager } = require('../APIKeyManager');
const { getWorkflowEngine, Workflow, WorkflowStatus } = require('../WorkflowEngine');
const { getRateLimiter } = require('../RateLimiter');
const { getCacheManager } = require('../CacheManager');
const { getMetricsCollector } = require('../MetricsCollector');
const { getTelemetry } = require('../Telemetry');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const logger = {
  debug: (...args) => console.log('[IntegrationManager]', ...args),
  info: (...args) => console.log('[IntegrationManager]', ...args),
  warn: (...args) => console.warn('[IntegrationManager]', ...args),
  error: (...args) => console.error('[IntegrationManager]', ...args),
};

// Tipos de solicitud
const RequestType = {
  CHAT: 'chat',
  CODE: 'chat',
  IMAGE: 'image',
  SEARCH: 'search',
  BROWSER: 'browser',
  WORKFLOW: 'workflow',
};

// Singleton
let managerInstance = null;
let initialized = false;

/**
 * Integration Manager - Clase principal
 *
 * Coordina todos los servicios de la arquitectura Enterprise:
 * - ExecutionEngine: Núcleo de ejecución
 * - RuntimeRegistry: Registro de runtimes
 * - CapabilityRouter: Selección de runtime/provider
 * - EventBus: Sistema de eventos
 */
class IntegrationManager {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.runtimeRegistry = getRuntimeRegistry();
    this.capabilityRouter = getCapabilityRouter();
    this.executionEngine = getExecutionEngine({
      maxConcurrentExecutions: config.maxConcurrentExecutions || 50,
      defaultTimeout: config.defaultTimeout || 120000,
    });

    this.startTime = 0;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
    };
  }

  async initialize() {
    if (initialized) return;

    this.startTime = Date.now();

    this.eventBus.publish(
      EventType.SYSTEM_STARTED,
      {
        service: 'IntegrationManager',
        version: '1.0.0',
        components: [
          'ExecutionEngine',
          'RuntimeRegistry',
          'CapabilityRouter',
          'EventBus',
          'APIKeyManager',
          'WorkflowEngine',
          'RateLimiter',
          'CacheManager',
          'MetricsCollector',
          'Telemetry',
        ],
      },
      'IntegrationManager',
      { priority: EventPriority.CRITICAL },
    );

    // Inicializar APIKeyManager
    this.apiKeyManager = getAPIKeyManager();
    this.apiKeyManager.loadFromEnvironment();
    logger.info(
      '[IntegrationManager] APIKeyManager loaded providers:',
      this.apiKeyManager
        .listProviders()
        .map((p) => p.provider)
        .join(', ') || 'none',
    );

    // Inicializar WorkflowEngine
    this.workflowEngine = getWorkflowEngine();
    await this.workflowEngine.initialize();
    logger.info('[IntegrationManager] WorkflowEngine initialized');

    // Inicializar RateLimiter
    this.rateLimiter = getRateLimiter({
      defaultLimit: 100,
      defaultWindowMs: 60000,
    });
    logger.info('[IntegrationManager] RateLimiter initialized');

    // Inicializar CacheManager
    this.cacheManager = getCacheManager({
      maxSize: 1000,
      maxMemoryMB: 100,
      defaultTTL: 3600000,
      cleanupIntervalMs: 60000,
    });
    logger.info('[IntegrationManager] CacheManager initialized');

    // Inicializar MetricsCollector
    this.metricsCollector = getMetricsCollector({
      enableSystemMetrics: true,
      collectionInterval: 60000,
    });
    logger.info('[IntegrationManager] MetricsCollector initialized');

    // Inicializar Telemetry
    this.telemetry = getTelemetry({
      serviceName: 'mi-librechat',
      enableTracing: true,
      enableLogging: true,
      enableAlerts: true,
    });
    logger.info('[IntegrationManager] Telemetry initialized');

    // Registrar runtimes
    this.registerRuntimes();
    await this.runtimeRegistry.initializeAll();

    // Agregar middlewares al ExecutionEngine
    this.setupMiddlewares();

    initialized = true;

    this.eventBus.publish(
      EventType.SYSTEM_READY,
      {
        service: 'IntegrationManager',
        engine: 'ExecutionEngine',
        runtimes: this.runtimeRegistry.list().map((r) => r.name),
      },
      'IntegrationManager',
      { priority: EventPriority.CRITICAL },
    );

    logger.info('[IntegrationManager] Initialized with ExecutionEngine as core');
  }

  /**
   * Configurar middlewares del ExecutionEngine
   */
  setupMiddlewares() {
    this.executionEngine.use({
      beforeExecution: async (context) => {
        logger.debug('[Middleware] Before execution:', context.executionId);
      },
      afterExecution: async (context) => {
        logger.debug('[Middleware] After execution:', context.executionId);
      },
      onError: async (context) => {
        logger.error('[Middleware] Execution error:', context.executionId, context.error);
      },
    });
  }

  registerRuntimes() {
    // LLM Runtime - USA LLMGateway real con soporte multi-provider
    // (GPT, Grok, mi-opencode, etc.)
    const { getLLMRuntime } = require('../LLMRuntime');
    const llmRuntime = getLLMRuntime({
      defaultProvider: process.env.LLM_DEFAULT_PROVIDER || 'openai',
      defaultModel: process.env.LLM_DEFAULT_MODEL || 'gpt-4o-mini',
    });

    this.runtimeRegistry.register({
      name: 'LLMRuntime',
      capabilities: [
        Capability.LLM_CHAT,
        Capability.LLM_VISION,
        Capability.LLM_REASONING,
        Capability.CODE_EXECUTION,
      ],
      execute: async (task) => {
        const result = await llmRuntime.execute(task);
        return {
          text: result.text,
          raw: result.raw,
          usage: result.usage,
          latency: result.latency,
        };
      },
      healthCheck: async () => llmRuntime.healthCheck(),
      initialize: async () => llmRuntime.initialize(),
      shutdown: async () => llmRuntime.shutdown(),
    });

    // Search Runtime - USA proveedores reales
    const { getSearchRuntime } = require('../SearchRuntime');
    const searchRuntime = getSearchRuntime({
      defaultProvider: 'duckduckgo',
      maxResults: 10,
    });

    this.runtimeRegistry.register({
      name: 'SearchRuntime',
      capabilities: [Capability.WEB_SEARCH, Capability.DOCUMENT_SEARCH, Capability.RAG_SEARCH],
      execute: async (task) => {
        const result = await searchRuntime.execute(task);
        return {
          text: result.text,
          results: result.results,
          provider: result.provider,
          total: result.total,
          latency: result.latency,
        };
      },
      healthCheck: async () => searchRuntime.healthCheck(),
      initialize: async () => searchRuntime.initialize(),
      shutdown: async () => searchRuntime.shutdown(),
    });

    // Browser Runtime - USA Playwright
    const { getBrowserRuntime } = require('../BrowserRuntime');
    const browserRuntime = getBrowserRuntime({
      headless: true,
      viewport: { width: 1280, height: 720 },
    });

    this.runtimeRegistry.register({
      name: 'BrowserRuntime',
      capabilities: [Capability.BROWSER_AUTOMATION, Capability.WEB_SCRAPING, Capability.SCREENSHOT],
      execute: async (task) => {
        const result = await browserRuntime.execute(task);
        return {
          text: result.text || `Browser action completed: ${result.action}`,
          ...result,
        };
      },
      healthCheck: async () => browserRuntime.healthCheck(),
      initialize: async () => browserRuntime.initialize(),
      shutdown: async () => browserRuntime.shutdown(),
    });

    // Image Runtime - USA HuggingFace (gratuito)
    const { getImageRuntime } = require('../ImageRuntime');
    const imageRuntime = getImageRuntime({
      defaultModel: 'stabilityai/stable-diffusion-xl-base-1.0',
      defaultSteps: 30,
    });

    this.runtimeRegistry.register({
      name: 'ImageRuntime',
      capabilities: [Capability.IMAGE_GENERATION, Capability.IMAGE_EDITING],
      execute: async (task) => {
        const result = await imageRuntime.execute(task);
        return {
          text: result.text,
          imageUrl: result.imageUrl,
          model: result.model,
          provider: result.provider,
          latency: result.latency,
        };
      },
      healthCheck: async () => imageRuntime.healthCheck(),
      initialize: async () => imageRuntime.initialize(),
      shutdown: async () => imageRuntime.shutdown(),
    });

    // Harness Runtime — DeepSeek Harness integration (agent loop + tools + context)
    const { getHarnessManager } = require('../Harness');
    const harnessManager = getHarnessManager({
      defaultProvider: process.env.LLM_DEFAULT_PROVIDER || 'openai',
      defaultModel: process.env.LLM_DEFAULT_MODEL || 'gpt-4o-mini',
    });

    this.runtimeRegistry.register({
      name: 'HarnessRuntime',
      capabilities: [
        Capability.LLM_CHAT,
        Capability.LLM_VISION,
        Capability.LLM_REASONING,
        Capability.CODE_EXECUTION,
        Capability.WEB_SEARCH,
        Capability.BROWSER_AUTOMATION,
      ],
      execute: async (task) => {
        const result = await harnessManager.run({
          task: task.intent || task.input?.query || task.input?.prompt || '',
          messages: task.input?.messages,
          provider: task.provider,
          model: task.model,
        });
        return {
          text: result.content,
          iterations: result.iterations,
          toolCalls: result.toolCalls,
          latency: result.latency,
        };
      },
      healthCheck: async () => true,
      initialize: async () => harnessManager.initialize(),
      shutdown: async () => {},
    });

    logger.info(
      '[IntegrationManager] Registered runtimes:',
      this.runtimeRegistry.list().map((r) => r.name),
    );
  }

  /**
   * Procesar solicitud - USA ExecutionEngine como núcleo
   *
   * @param {object} request
   * @param {string} request.type - 'chat', 'code', 'image', 'search', 'browser', 'workflow'
   * @param {string} request.intent - User intent / query text
   * @param {Array} request.messages - Chat messages
   * @param {string} [request.provider] - Explicit provider: 'openai', 'xai', 'mi-opencode', etc.
   * @param {string} [request.model] - Explicit model: 'o3', 'grok-4-0709', etc.
   * @param {object} [request.constraints] - Provider/model constraints
   * @param {object} [request.options] - Extra options (temperature, maxTokens, etc.)
   */
  async processRequest(request) {
    if (!initialized) {
      await this.initialize();
    }

    const requestId = request.id || uuidv4();
    const startTime = Date.now();

    this.metrics.totalRequests++;

    this.eventBus.publish(
      EventType.EXECUTION_REQUESTED,
      {
        requestId,
        type: request.type,
        intent: request.intent,
        provider: request.provider,
        model: request.model,
      },
      'IntegrationManager',
      { priority: EventPriority.HIGH },
    );

    // Build constraints from explicit provider/model
    const constraints = { ...request.constraints };
    if (request.provider) {
      constraints.preferredProviders = [request.provider];
    }
    if (request.model) {
      constraints.preferredModels = [request.model];
    }

    // Merge extra options
    const options = {
      ...request.options,
      ...(request.provider ? { provider: request.provider } : {}),
      ...(request.model ? { model: request.model } : {}),
    };

    try {
      // Detectar capacidades + si hay provider explícito, agregarlo
      const capabilities = this.capabilityRouter.detectCapabilities(request.intent);

      // Usar ExecutionEngine como núcleo de ejecución
      const executionResult = await this.executionEngine.execute({
        id: requestId,
        type: request.type || 'chat',
        intent: request.intent,
        messages: request.messages,
        provider: request.provider,
        model: request.model,
        capabilities,
        constraints,
        options,
      });

      this.metrics.successfulRequests++;

      this.eventBus.publish(
        EventType.EXECUTION_COMPLETED,
        {
          requestId,
          executionId: executionResult.executionId,
          runtime: executionResult.result?.runtime || 'unknown',
          taskCount: executionResult.tasks?.length || 0,
        },
        'IntegrationManager',
      );

      return {
        requestId,
        executionId: executionResult.executionId,
        success: true,
        response: executionResult.result,
        status: executionResult.status,
        tasks: executionResult.tasks,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      this.metrics.failedRequests++;

      this.eventBus.publish(
        EventType.EXECUTION_FAILED,
        {
          requestId,
          error: error.message,
        },
        'IntegrationManager',
      );

      return {
        requestId,
        success: false,
        response: null,
        errors: [{ message: error.message }],
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Obtener estado del sistema completo (incluye provider health)
   */
  getStatus() {
    return {
      initialized,
      uptime: initialized ? Date.now() - this.startTime : 0,
      metrics: this.metrics,
      components: {
        executionEngine: this.executionEngine.getStatus(),
        runtimeRegistry: this.runtimeRegistry.getStatus(),
        eventBus: this.eventBus.getStats(),
      },
    };
  }

  /**
   * Health check completo (incluye providers)
   */
  async healthCheck() {
    if (!initialized) return { initialized: false };

    const componentHealth = {
      executionEngine: true,
      runtimeRegistry: true,
    };

    // Check provider health via LLMGateway
    let providerHealth = {};
    try {
      const LLMGatewayClass = require('../LLMGateway');
      const gateway = LLMGatewayClass.getGateway ? LLMGatewayClass.getGateway() : null;
      if (gateway && typeof gateway.healthCheck === 'function') {
        providerHealth = await gateway.healthCheck();
      }
    } catch {
      providerHealth = { error: 'LLMGateway not available' };
    }

    return {
      initialized: true,
      components: componentHealth,
      providers: providerHealth,
      metrics: this.metrics,
    };
  }

  /**
   * Process with explicit provider selection (convenience method)
   */
  async processWithProvider(params) {
    return this.processRequest({
      type: params.type || RequestType.CHAT,
      intent: params.intent || params.text,
      messages: params.messages,
      provider: params.provider,
      model: params.model,
      options: params.options,
    });
  }

  /**
   * Health check
   */
  async healthCheck() {
    return initialized;
  }

  /**
   * Apagar graceful
   */
  async shutdown() {
    await this.runtimeRegistry.shutdownAll();
    initialized = false;
    logger.info('[IntegrationManager] Shutdown complete');
  }
}

/**
 * Obtener instancia singleton
 */
function getIntegrationManager() {
  if (!managerInstance) {
    managerInstance = new IntegrationManager();
  }
  return managerInstance;
}

/**
 * Función de conveniencia para procesar chat
 * @param {object} params
 * @param {string} params.text - User message
 * @param {Array} params.messages - Chat history
 * @param {string} [params.provider] - 'openai', 'xai', 'mi-opencode'
 * @param {string} [params.model] - 'o3', 'grok-4-0709', etc.
 */
async function processChatRequest(params) {
  const manager = getIntegrationManager();
  return manager.processRequest({
    type: RequestType.CHAT,
    intent: params.intent || params.text,
    messages: params.messages,
    provider: params.provider,
    model: params.model,
    options: params.options,
  });
}

/**
 * Formatear respuesta
 */
function formatResponse(result) {
  if (!result.success) {
    return { error: result.errors?.[0]?.message };
  }
  return {
    text: result.response?.text,
    executionId: result.executionId,
    status: result.status,
  };
}

module.exports = {
  IntegrationManager,
  getIntegrationManager,
  processChatRequest,
  formatResponse,
  RequestType,
};
