/**
 * StrategyEngine - Motor de coordinación de estrategias
 *
 * Coordina múltiples estrategias y proporciona una interfaz
 * unificada para la selección de modelos.
 */

const { Strategies } = require('../constants/Types');
const {
  StrategyContext,
  StrategyResult,
  BaseStrategy,
  FixedStrategy,
  PriorityStrategy,
  RoundRobinStrategy,
  LatencyStrategy,
  CostStrategy,
  ContextStrategy,
  ReasoningStrategy,
} = require('./BaseStrategy');

class StrategyEngine {
  constructor(options = {}) {
    // Registro de estrategias
    this._strategies = new Map();

    // Estrategia round robin para mantener estado
    this._roundRobinStates = new Map();

    // Logger
    this._logger = options.logger || console;

    // Opciones
    this._options = {
      defaultStrategy: options.defaultStrategy || Strategies.PRIORITY,
      ...options,
    };

    // Registrar estrategias por defecto
    this._registerDefaultStrategies();
  }

  /**
   * Registrar estrategias por defecto
   */
  _registerDefaultStrategies() {
    this.register(new FixedStrategy());
    this.register(new PriorityStrategy());
    this.register(new RoundRobinStrategy());
    this.register(new LatencyStrategy());
    this.register(new CostStrategy());
    this.register(new ContextStrategy());
    this.register(new ReasoningStrategy());
  }

  /**
   * Registrar una nueva estrategia
   */
  register(strategy) {
    if (!(strategy instanceof BaseStrategy)) {
      throw new Error('Strategy must extend BaseStrategy');
    }

    this._strategies.set(strategy.name, strategy);
    this._logger.info(`[StrategyEngine] Registered strategy: ${strategy.name}`);

    return this;
  }

  /**
   * Obtener una estrategia
   */
  getStrategy(name) {
    return this._strategies.get(name);
  }

  /**
   * Listar estrategias disponibles
   */
  listStrategies() {
    return [...this._strategies.entries()].map(([name, strategy]) => ({
      name,
      description: strategy.getDescription(),
      available: strategy.isAvailable(),
    }));
  }

  /**
   * Seleccionar usando una estrategia específica
   */
  select(strategyName, contextData) {
    const strategy = this._strategies.get(strategyName);

    if (!strategy) {
      this._logger.warn(`[StrategyEngine] Unknown strategy: ${strategyName}, using default`);
      return this.select(this._options.defaultStrategy, contextData);
    }

    // Crear contexto
    const context =
      contextData instanceof StrategyContext ? contextData : new StrategyContext(contextData);

    // Ejecutar estrategia
    try {
      const result = strategy.select(context);

      this._logger.info(`[StrategyEngine] ${strategyName}: ${result.reasoning}`);

      return result;
    } catch (error) {
      this._logger.error(`[StrategyEngine] Strategy ${strategyName} failed:`, error);

      // Fallback a estrategia por defecto
      return this.select(this._options.defaultStrategy, contextData);
    }
  }

  /**
   * Seleccionar con fallback automático
   */
  selectWithFallback(contextData, maxFallbacks = 3) {
    const primaryStrategy = contextData.strategy || this._options.defaultStrategy;
    const result = this.select(primaryStrategy, contextData);

    if (result.selectedModels.length > 0 || result.hasFallback) {
      return result;
    }

    // Intentar con estrategias alternativas
    const fallbackStrategies = [
      Strategies.PRIORITY,
      Strategies.LATENCY,
      Strategies.COST,
      Strategies.FIXED,
    ].filter((s) => s !== primaryStrategy);

    for (const strategy of fallbackStrategies.slice(0, maxFallbacks)) {
      const fallback = this.select(strategy, contextData);

      if (fallback.selectedModels.length > 0) {
        return fallback;
      }
    }

    return result;
  }

  /**
   * Ejecutar con fallback automático entre modelos
   */
  async executeWithFallback(contextData, executor) {
    const result = this.selectWithFallback(contextData);
    const candidates = result.selectedModels.concat(result.alternatives || []);

    let lastError;

    for (const candidate of candidates.slice(0, 5)) {
      try {
        const response = await executor(candidate);

        return {
          ...response,
          modelId: candidate.modelId,
          strategy: result.strategy,
          fallbackAttempted: candidates.indexOf(candidate) > 0,
        };
      } catch (error) {
        lastError = error;
        this._logger.warn(`[StrategyEngine] Model ${candidate.modelId} failed:`, error.message);

        // Si es error no-retryable, no continuar
        if (!this._isRetryableError(error)) {
          break;
        }
      }
    }

    throw lastError || new Error('All models failed');
  }

  /**
   * Verificar si el error es reintentable
   */
  _isRetryableError(error) {
    const retryableCodes = [
      'RATE_LIMITED',
      'TIMEOUT',
      'SERVICE_UNAVAILABLE',
      'BAD_GATEWAY',
      'GATEWAY_TIMEOUT',
    ];

    return (
      retryableCodes.includes(error.code) ||
      error.status === 429 ||
      error.status >= 500 ||
      error.message?.includes('timeout') ||
      error.message?.includes('rate limit')
    );
  }

  /**
   * Seleccionar múltiples modelos para ejecución paralela
   */
  selectMultiple(strategyName, contextData, count = 3) {
    const strategy = this._strategies.get(strategyName);

    if (!strategy) {
      return this.selectMultiple(this._options.defaultStrategy, contextData, count);
    }

    const context =
      contextData instanceof StrategyContext ? contextData : new StrategyContext(contextData);

    const result = strategy.select(context);

    // Devolver múltiples modelos
    const models = [...result.selectedModels, ...(result.alternatives || [])].slice(0, count);

    return new StrategyResult({
      selectedModels: models,
      strategy: result.strategy,
      reasoning: `Múltiples modelos: ${models.map((m) => m.modelId).join(', ')}`,
      confidence: result.confidence,
      alternatives: [],
    });
  }

  /**
   * Obtener estado de round robin
   */
  getRoundRobinState(userId) {
    return this._roundRobinStates.get(userId);
  }

  /**
   * Resetear estado de round robin
   */
  resetRoundRobin(userId) {
    const strategy = this._strategies.get(Strategies.ROUND_ROBIN);
    if (strategy && strategy.reset) {
      strategy.reset();
    }
    this._roundRobinStates.delete(userId);
  }

  /**
   * Verificar si una estrategia existe
   */
  hasStrategy(name) {
    return this._strategies.has(name);
  }

  /**
   * Remover una estrategia
   */
  removeStrategy(name) {
    const removed = this._strategies.delete(name);
    if (removed) {
      this._logger.info(`[StrategyEngine] Removed strategy: ${name}`);
    }
    return removed;
  }

  /**
   * Serializar estado para persistencia
   */
  toJSON() {
    return {
      strategies: this.listStrategies(),
      defaultStrategy: this._options.defaultStrategy,
      roundRobinStates: [...this._roundRobinStates.entries()],
    };
  }
}

// Singleton
let instance = null;

function getStrategyEngine(options) {
  if (!instance) {
    instance = new StrategyEngine(options);
  }
  return instance;
}

module.exports = { StrategyEngine, getStrategyEngine };
