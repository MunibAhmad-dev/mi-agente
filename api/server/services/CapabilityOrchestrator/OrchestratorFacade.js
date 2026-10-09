/**
 * OrchestratorFacade - Fachada para integración con sistema existente
 *
 * Permite que CapabilityOrchestrator coexista con LLMGateway
 * mediante feature flags y routing condicional.
 */

const { ExecutionModes } = require('./constants/Types');
const { CapabilityOrchestrator } = require('./CapabilityOrchestrator');
const { LLMGatewayAdapter } = require('./adapters/LLMGatewayAdapter');

class OrchestratorFacade {
  constructor(options = {}) {
    // Feature flags
    this._featureFlags = {
      capabilityEngineEnabled: options.capabilityEngineEnabled ?? false,
      defaultToNew: options.defaultToNew ?? false,
      ...options.featureFlags,
    };

    // Servicios
    this._capabilityOrchestrator = options.capabilityOrchestrator;
    this._legacyGateway = options.legacyGateway;

    // Logger
    this._logger = options.logger || console;

    // Métricas
    this._metrics = {
      newSystem: { requests: 0, errors: 0, latencySum: 0 },
      legacy: { requests: 0, errors: 0, latencySum: 0 },
    };
  }

  /**
   * Procesar request - delega al motor apropiado
   */
  async process(context) {
    const startTime = Date.now();
    const shouldUseNew = await this._shouldUseCapabilityEngine(context);

    try {
      let result;

      if (shouldUseNew) {
        result = await this._processWithNewEngine(context);
        this._recordMetric('newSystem', startTime);
      } else {
        result = await this._processWithLegacy(context);
        this._recordMetric('legacy', startTime);
      }

      result.metadata = {
        ...result.metadata,
        engine: shouldUseNew ? 'capability' : 'legacy',
        originalLatency: Date.now() - startTime,
      };

      return result;
    } catch (error) {
      // En caso de error, intentar con el otro motor
      this._logger.error('[OrchestratorFacade] Primary engine failed:', error.message);

      try {
        if (shouldUseNew) {
          return await this._processWithLegacy(context);
        } else {
          return await this._processWithNewEngine(context);
        }
      } catch (fallbackError) {
        this._logger.error(
          '[OrchestratorFacade] Fallback engine also failed:',
          fallbackError.message,
        );
        throw fallbackError;
      }
    }
  }

  /**
   * Procesar con nuevo motor (CapabilityOrchestrator)
   */
  async _processWithNewEngine(context) {
    if (!this._capabilityOrchestrator) {
      throw new Error('CapabilityOrchestrator not initialized');
    }

    this._logger.info('[OrchestratorFacade] Using CapabilityOrchestrator');

    return this._capabilityOrchestrator.process(context);
  }

  /**
   * Procesar con motor legacy (LLMGateway)
   */
  async _processWithLegacy(context) {
    if (!this._legacyGateway) {
      throw new Error('Legacy LLMGateway not initialized');
    }

    this._logger.info('[OrchestratorFacade] Using LegacyLLMGateway');

    // Convertir contexto al formato legacy
    const legacyContext = this._convertToLegacy(context);

    return this._legacyGateway.complete(legacyContext);
  }

  /**
   * Determinar qué motor usar
   */
  async _shouldUseCapabilityEngine(context) {
    // 1. Feature flag global
    if (this._featureFlags.capabilityEngineEnabled) {
      return true;
    }

    // 2. Flag del usuario
    if (context.userId) {
      const userFlags = await this._getUserFlags(context.userId);
      if (userFlags?.useCapabilityEngine) {
        return true;
      }
      if (userFlags?.useLegacy === true) {
        return false;
      }
    }

    // 3. Por tipo de request
    if (this._requestRequiresNewEngine(context)) {
      return true;
    }

    // 4. Default
    return this._featureFlags.defaultToNew;
  }

  /**
   * Verificar si el request requiere el nuevo motor
   */
  _requestRequiresNewEngine(context) {
    // Requests con capacidades explícitas requieren el nuevo motor
    if (context.options?.capabilities?.length > 0) {
      return true;
    }

    // Requests con rol específico
    if (context.options?.role) {
      return true;
    }

    // Requests con estrategia específica
    if (context.options?.strategy) {
      return true;
    }

    return false;
  }

  /**
   * Obtener flags del usuario
   */
  async _getUserFlags(userId) {
    // En una implementación real, esto consultaría la DB
    // Por ahora, devolvemos null
    return null;
  }

  /**
   * Convertir contexto nuevo al formato legacy
   */
  _convertToLegacy(context) {
    return {
      messages: context.messages,
      model: context.options?.model || context.options?.preferredModel,
      provider: context.options?.provider,
      temperature: context.options?.temperature,
      maxTokens: context.options?.maxTokens,
      stream: context.options?.stream,
      userId: context.userId,
    };
  }

  /**
   * Registrar métrica
   */
  _recordMetric(target, startTime) {
    const latency = Date.now() - startTime;
    this._metrics[target].requests++;
    this._metrics[target].latencySum += latency;
  }

  /**
   * Obtener métricas
   */
  getMetrics() {
    const calculateAvg = (target) => {
      const { requests, latencySum } = this._metrics[target];
      return {
        requests,
        avgLatency: requests > 0 ? latencySum / requests : 0,
      };
    };

    return {
      newSystem: calculateAvg('newSystem'),
      legacy: calculateAvg('legacy'),
      adoptionRate:
        this._metrics.newSystem.requests /
        (this._metrics.newSystem.requests + this._metrics.legacy.requests || 1),
    };
  }

  /**
   * Configurar feature flag
   */
  setFeatureFlag(flag, value) {
    this._featureFlags[flag] = value;
    this._logger.info(`[OrchestratorFacade] Feature flag ${flag} = ${value}`);
  }

  /**
   * Verificar si el nuevo motor está disponible
   */
  async isCapabilityEngineAvailable() {
    if (!this._capabilityOrchestrator) {
      return false;
    }

    return this._capabilityOrchestrator.isAvailable();
  }

  /**
   * Verificar si el motor legacy está disponible
   */
  isLegacyGatewayAvailable() {
    if (!this._legacyGateway) {
      return false;
    }

    // Verificar que al menos un provider esté saludable
    const providers = Object.values(this._legacyGateway.providers || {});
    return providers.some((p) => p.health === 'healthy');
  }

  /**
   * Obtener información de estado
   */
  getStatus() {
    return {
      capabilityEngine: {
        available: this._capabilityOrchestrator?.isAvailable() || false,
        configured: !!this._capabilityOrchestrator,
      },
      legacyGateway: {
        available: this.isLegacyGatewayAvailable(),
        configured: !!this._legacyGateway,
      },
      featureFlags: { ...this._featureFlags },
      metrics: this.getMetrics(),
    };
  }

  /**
   * Inicializar desde container
   */
  static async fromContainer(container, legacyGateway) {
    const capabilityOrchestrator = await CapabilityOrchestrator.fromContainer(container);

    return new OrchestratorFacade({
      capabilityOrchestrator,
      legacyGateway,
      featureFlags: {
        capabilityEngineEnabled: process.env.USE_CAPABILITY_ENGINE === 'true',
        defaultToNew: false,
      },
    });
  }
}

module.exports = { OrchestratorFacade };
