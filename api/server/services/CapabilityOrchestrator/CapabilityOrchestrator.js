/**
 * CapabilityOrchestrator - Orquestador principal
 *
 * Coordina todos los componentes para proporcionar
 * un sistema de orquestación Multi-LLM basado en capacidades.
 */

const { ExecutionModes, Strategies } = require('./constants/Types');
const {
  ExecutionModeFactory,
  SimpleExecutionMode,
  SpecializedExecutionMode,
  IntelligentExecutionMode,
} = require('./ExecutionModes');
const { StrategyEngine } = require('./strategies/StrategyEngine');
const { StrategyContext, StrategyResult } = require('./strategies/BaseStrategy');

// Importar LLMGateway para integración real
let LLMGateway = null;
try {
  LLMGateway = require('../LLMGateway');
} catch (e) {
  // LLMGateway no está disponible
}

class CapabilityOrchestrator {
  constructor(options = {}) {
    // Servicios inyectados
    this._services = {
      modelRegistry: options.modelRegistry,
      capabilityRegistry: options.capabilityRegistry,
      configService: options.configService,
      logger: options.logger || console,
      eventBus: options.eventBus,
    };

    // Strategy Engine
    this._strategyEngine = new StrategyEngine({
      logger: this._services.logger,
      defaultStrategy: Strategies.PRIORITY,
    });

    // Cache de resultados recientes
    this._resultCache = new Map();
    this._cacheMaxSize = options.cacheMaxSize || 1000;
    this._cacheTTL = options.cacheTTL || 60000; // 1 minuto

    // Contador de requests
    this._requestCount = 0;

    // Logger
    this._logger = this._services.logger;
  }

  /**
   * Obtener servicios
   */
  get services() {
    return this._services;
  }

  /**
   * Inicializar con container
   */
  static async fromContainer(container) {
    const orchestrator = new CapabilityOrchestrator({
      modelRegistry: container.resolve('ModelRegistry'),
      capabilityRegistry: container.resolve('CapabilityRegistry'),
      configService: container.resolve('ConfigService'),
      logger: container.resolve('Logger'),
      eventBus: container.resolve('EventBus'),
    });

    return orchestrator;
  }

  /**
   * Procesar request
   */
  async process(context) {
    const startTime = Date.now();
    const requestId = `req_${++this._requestCount}_${Date.now()}`;

    this._logger.info(`[CapabilityOrchestrator] Processing request ${requestId}`);

    try {
      // Validar contexto
      this._validateContext(context);

      // Determinar modo de ejecución
      const mode =
        context.options?.mode ||
        (await this._getUserMode(context.userId)) ||
        ExecutionModes.SPECIALIZED;

      // Crear modo de ejecución
      const executionMode = ExecutionModeFactory.create(mode, this);

      // Ejecutar
      const result = await executionMode.execute(context);

      // Agregar metadata
      result.metadata = {
        ...result.metadata,
        requestId,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };

      // Registrar métricas
      this._recordMetrics(result);

      // Emitir evento
      this._emit('request:completed', { requestId, result });

      return result;
    } catch (error) {
      this._logger.error(`[CapabilityOrchestrator] Request ${requestId} failed:`, error);

      // Emitir evento de error
      this._emit('request:failed', { requestId, error: error.message });

      throw error;
    }
  }

  /**
   * Validar contexto de request
   */
  _validateContext(context) {
    if (!context.messages || !Array.isArray(context.messages)) {
      throw new Error('messages is required and must be an array');
    }

    if (context.messages.length === 0) {
      throw new Error('messages cannot be empty');
    }

    // Validar estructura de mensajes
    for (const msg of context.messages) {
      if (!msg.role || !msg.content) {
        throw new Error('Each message must have role and content');
      }
    }
  }

  /**
   * Obtener modo del usuario
   */
  async _getUserMode(userId) {
    if (!userId) return null;

    try {
      const config = await this._services.configService.getConfig(userId);
      return config?.mode || null;
    } catch (error) {
      this._logger.warn('Could not get user mode:', error.message);
      return null;
    }
  }

  /**
   * Ejecutar en un modelo específico
   */
  async executeOnModel(modelId, context) {
    const { modelRegistry } = this._services;

    // Obtener modelo
    const model = modelRegistry.getModel(modelId);

    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // Actualizar métricas
    const startTime = Date.now();

    try {
      // Aquí se delegaría al LLMGateway o provider adapter
      // Por ahora, simulamos la respuesta
      const result = await this._callModel(model, context);

      // Registrar latencia
      const latency = Date.now() - startTime;
      modelRegistry.updateMetrics(modelId, {
        avgLatency: latency,
        totalRequests: (model.metrics?.totalRequests || 0) + 1,
        lastUsed: new Date(),
      });

      return {
        content: result.content,
        modelId,
        modelName: model.name,
        metadata: {
          modelId,
          modelName: model.name,
          provider: model.provider,
          latency,
          tokens: result.usage || {},
          capabilities: model.capabilities?.capabilities || [],
        },
      };
    } catch (error) {
      // Registrar error
      modelRegistry.updateMetrics(modelId, {
        totalErrors: (model.metrics?.totalErrors || 0) + 1,
      });

      throw error;
    }
  }

  /**
   * Llamar al modelo - Integración con LLMGateway
   */
  async _callModel(model, context) {
    const content = context.messages[context.messages.length - 1]?.content || '';

    // Usar LLMGateway si está disponible
    if (LLMGateway) {
      try {
        const gateway = LLMGateway.getGateway();

        // Seleccionar provider basado en el modelo
        const provider = this._getProviderForModel(model.modelId);

        const result = await gateway.complete({
          messages: context.messages,
          model: model.modelId,
          provider: provider,
          temperature: context.options?.temperature,
          maxTokens: context.options?.maxTokens,
          stream: false,
        });

        return {
          content: result.content || result.choices?.[0]?.message?.content || '',
          usage: result.usage || {
            promptTokens: Math.ceil(content.length / 4),
            completionTokens: 50,
            totalTokens: Math.ceil(content.length / 4) + 50,
          },
        };
      } catch (error) {
        this._logger.error('[CapabilityOrchestrator] LLMGateway call failed:', error.message);
        // Fallback a respuesta de error estructurada
        throw new Error(`LLM call failed: ${error.message}`);
      }
    }

    // Si LLMGateway no está disponible, lanzar error en lugar de simular
    throw new Error(
      'LLMGateway is not available. Please ensure LLMGateway is properly initialized.',
    );
  }

  /**
   * Obtener provider para un modelo específico
   */
  _getProviderForModel(modelId) {
    // Intentar extraer provider del modelId (formato: provider/model)
    if (modelId && modelId.includes('/')) {
      return modelId.split('/')[0];
    }

    // Mapear modelos a providers conocidos
    const modelProviderMap = {
      // GPT-5.6 Family
      'gpt-4o': 'openai',
      'gpt-5': 'openai',
      'gpt-4.1': 'openai',
      'gpt-4o': 'openai',
      'gpt-4': 'openai',
      'gpt-3.5': 'openai',
      'o3': 'openai',
      'o4': 'openai',
      // Grok Family
      'grok-4': 'xai',
      'grok-3': 'xai',
      // Other providers
      'claude-3': 'anthropic',
      'claude-4': 'anthropic',
      'claude-5': 'anthropic',
      llama: 'groq',
      mistral: 'mistral',
      gemini: 'gemini',
      deepseek: 'deepseek',
    };

    const modelLower = modelId?.toLowerCase() || '';
    for (const [key, provider] of Object.entries(modelProviderMap)) {
      if (modelLower.includes(key)) {
        return provider;
      }
    }

    return 'openai'; // Provider por defecto (GPT-5.6 Luna)
  }

  /**
   * Encontrar candidatos para capacidades
   */
  findCandidates(capabilities, options = {}) {
    const { modelRegistry } = this._services;

    return modelRegistry.findByCapabilities(capabilities, {
      healthyOnly: true,
      ...options,
    });
  }

  /**
   * Seleccionar modelo(s) con estrategia
   */
  selectWithStrategy(strategy, capabilities, options = {}) {
    const { modelRegistry, configService } = this._services;

    // Obtener candidatos
    const candidates = modelRegistry.findByCapabilities(capabilities, {
      healthyOnly: true,
      ...options,
    });

    // Crear contexto
    const context = new StrategyContext({
      candidates,
      config: options.config || {},
      capabilities,
      estimatedTokens: options.estimatedTokens,
    });

    // Seleccionar
    return this._strategyEngine.select(strategy, context);
  }

  /**
   * Verificar disponibilidad
   */
  async isAvailable() {
    const { modelRegistry } = this._services;

    try {
      const stats = modelRegistry.getStats();
      return stats.byStatus.active > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener capacidades disponibles
   */
  listCapabilities() {
    const { capabilityRegistry } = this._services;
    return capabilityRegistry.listCapabilities();
  }

  /**
   * Listar modelos disponibles
   */
  listModels(options = {}) {
    const { modelRegistry } = this._services;
    return modelRegistry.listModels(options);
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    const { modelRegistry } = this._services;
    return {
      models: modelRegistry.getStats(),
      strategies: this._strategyEngine.listStrategies(),
      cacheSize: this._resultCache.size,
      requestCount: this._requestCount,
    };
  }

  /**
   * Registrar métricas
   */
  _recordMetrics(result) {
    // En una implementación real, esto enviaría a un sistema de métricas
    this._logger.debug('[CapabilityOrchestrator] Metrics:', result.metadata);
  }

  /**
   * Emitir evento
   */
  _emit(event, data) {
    const { eventBus } = this._services;
    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit(event, data);
    }
  }

  /**
   * Limpiar cache
   */
  clearCache() {
    this._resultCache.clear();
    this._logger.info('[CapabilityOrchestrator] Cache cleared');
  }

  /**
   * Serializar estado
   */
  toJSON() {
    return {
      stats: this.getStats(),
      strategyEngine: this._strategyEngine.toJSON(),
    };
  }
}

// Singleton
let instance = null;

function getCapabilityOrchestrator(options) {
  if (!instance) {
    instance = new CapabilityOrchestrator(options);
  }
  return instance;
}

module.exports = { CapabilityOrchestrator, getCapabilityOrchestrator };
