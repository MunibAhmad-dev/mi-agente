/**
 * Executors - Ejecutores para diferentes modos de ejecución
 *
 * Implementa la lógica de ejecución real de modelos:
 * - SingleExecutor: Un solo modelo
 * - ParallelExecutor: Múltiples modelos en paralelo
 * - ConsensusExecutor: Múltiples modelos con síntesis
 */

const { StrategyResult } = require('./BaseStrategy');

/**
 * BaseExecutor - Clase base para ejecutores
 */
class BaseExecutor {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Ejecutar (debe ser implementado)
   */
  async execute(context) {
    throw new Error('execute() must be implemented');
  }

  /**
   * Manejar error
   */
  handleError(error, modelId) {
    return {
      error: error.message,
      modelId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * SingleExecutor - Ejecuta un solo modelo
 *
 * El modo más simple: ejecutar un modelo y devolver la respuesta.
 */
class SingleExecutor extends BaseExecutor {
  async execute(context) {
    const { modelId, messages, parameters = {} } = context;

    const startTime = Date.now();

    try {
      const result = await this.orchestrator.executeOnModel(modelId, {
        messages,
        parameters,
      });

      return {
        content: result.content,
        modelId,
        metadata: {
          ...result.metadata,
          latency: Date.now() - startTime,
          executor: 'single',
        },
      };
    } catch (error) {
      return {
        error: this.handleError(error, modelId),
        fallbackRequired: true,
      };
    }
  }
}

/**
 * ParallelExecutor - Ejecuta múltiples modelos en paralelo
 *
 * Ejecuta varios modelos simultáneamente y devuelve todas las respuestas.
 */
class ParallelExecutor extends BaseExecutor {
  constructor(orchestrator, options = {}) {
    super(orchestrator);
    this.config = {
      maxParallel: options.maxParallel || 3,
      timeout: options.timeout || 30000,
      stopOnFirstSuccess: options.stopOnFirstSuccess || false,
    };
  }

  async execute(context) {
    const { modelIds, messages, parameters = {} } = context;

    const startTime = Date.now();
    const results = [];
    const errors = [];

    // Limitar paralelismo
    const modelsToExecute = modelIds.slice(0, this.config.maxParallel);

    // Crear promesas
    const promises = modelsToExecute.map(async (modelId) => {
      try {
        const result = await this._executeWithTimeout(modelId, messages, parameters);

        results.push({
          modelId,
          content: result.content,
          metadata: result.metadata,
          success: true,
        });

        // Si stopOnFirstSuccess, cancelar resto
        if (this.config.stopOnFirstSuccess) {
          // No podemos cancelar promises, pero marcaremos
        }

        return result;
      } catch (error) {
        errors.push(this.handleError(error, modelId));
        return null;
      }
    });

    // Esperar todos
    await Promise.allSettled(promises);

    // Devolver resultados
    return {
      responses: results.filter((r) => r !== null),
      errors,
      metadata: {
        latency: Date.now() - startTime,
        executor: 'parallel',
        totalModels: modelsToExecute.length,
        successfulModels: results.length,
        failedModels: errors.length,
      },
    };
  }

  async _executeWithTimeout(modelId, messages, parameters) {
    return Promise.race([
      this.orchestrator.executeOnModel(modelId, { messages, parameters }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), this.config.timeout),
      ),
    ]);
  }
}

/**
 * ConsensusExecutor - Ejecuta múltiples modelos y sintetiza
 *
 * Ejecuta varios modelos y usa un sintetizador para crear
 * una respuesta consenso.
 */
class ConsensusExecutor extends BaseExecutor {
  constructor(orchestrator, options = {}) {
    super(orchestrator);
    this.config = {
      minResponses: options.minResponses || 2,
      maxResponses: options.maxResponses || 4,
      agreementThreshold: options.agreementThreshold || 0.6,
      synthesizer: options.synthesizer || this._defaultSynthesizer,
    };
  }

  async execute(context) {
    const { modelIds, messages, parameters = {} } = context;

    const startTime = Date.now();

    // Ejecutar en paralelo
    const parallelExecutor = new ParallelExecutor(this.orchestrator, {
      maxParallel: this.config.maxResponses,
    });

    const parallelResult = await parallelExecutor.execute({
      modelIds,
      messages,
      parameters,
    });

    if (parallelResult.responses.length < this.config.minResponses) {
      // No suficientes respuestas, devolver mejor esfuerzo
      return {
        content: parallelResult.responses[0]?.content || 'No responses available',
        responses: parallelResult.responses,
        errors: parallelResult.errors,
        metadata: {
          ...parallelResult.metadata,
          consensus: false,
          reason: `Insufficient responses: ${parallelResult.responses.length} < ${this.config.minResponses}`,
        },
      };
    }

    // Calcular acuerdo entre respuestas
    const agreement = this._calculateAgreement(parallelResult.responses);

    // Sintetizar respuesta
    const synthesizedContent = this.config.synthesizer(
      parallelResult.responses.map((r) => ({
        modelId: r.modelId,
        content: r.content,
      })),
    );

    return {
      content: synthesizedContent,
      responses: parallelResult.responses,
      agreement,
      metadata: {
        ...parallelResult.metadata,
        executor: 'consensus',
        consensus: true,
        agreementScore: agreement,
      },
    };
  }

  /**
   * Calcular nivel de acuerdo entre respuestas
   */
  _calculateAgreement(responses) {
    if (responses.length < 2) return 1;
    if (responses.length === 2) {
      return this._similarity(responses[0].content, responses[1].content);
    }

    // Calcular similitud promedio entre todos los pares
    let totalSimilarity = 0;
    let pairs = 0;

    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        totalSimilarity += this._similarity(responses[i].content, responses[j].content);
        pairs++;
      }
    }

    return pairs > 0 ? totalSimilarity / pairs : 1;
  }

  /**
   * Calcular similitud entre dos textos (simple)
   */
  _similarity(text1, text2) {
    if (!text1 || !text2) return 0;
    if (text1 === text2) return 1;

    // Simple word overlap
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = [...words1].filter((w) => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Síntetizador por defecto
   */
  _defaultSynthesizer(responses) {
    const parts = responses.map((r, i) => `[Modelo ${i + 1} (${r.modelId})]:\n${r.content}`);

    return (
      `## Respuesta Consensuada\n\n` +
      `Basada en ${responses.length} modelos.\n\n` +
      `---\n\n` +
      parts.join('\n\n---\n\n')
    );
  }
}

/**
 * SequentialExecutor - Ejecuta modelos en secuencia (chain)
 *
 * Ejecuta modelos uno tras otro, usando la salida del anterior
 * como entrada del siguiente (para refinement).
 */
class SequentialExecutor extends BaseExecutor {
  constructor(orchestrator, options = {}) {
    super(orchestrator);
    this.config = {
      maxSteps: options.maxSteps || 3,
      stopOnQualityThreshold: options.stopOnQualityThreshold || 0.9,
    };
  }

  async execute(context) {
    const { modelIds, messages, parameters = {}, chainConfig = {} } = context;

    const startTime = Date.now();
    const steps = [];
    let currentMessages = [...messages];

    for (let i = 0; i < Math.min(modelIds.length, this.config.maxSteps); i++) {
      const modelId = modelIds[i];

      try {
        const result = await this.orchestrator.executeOnModel(modelId, {
          messages: currentMessages,
          parameters,
        });

        steps.push({
          step: i + 1,
          modelId,
          content: result.content,
          metadata: result.metadata,
        });

        // Preparar siguiente mensaje
        currentMessages = [...currentMessages, { role: 'assistant', content: result.content }];

        // Si hay feedback o refinamiento configurado, agregar
        if (chainConfig.refinement) {
          currentMessages.push({
            role: 'user',
            content: chainConfig.refinement,
          });
        }
      } catch (error) {
        steps.push({
          step: i + 1,
          modelId,
          error: this.handleError(error, modelId),
        });

        // Continuar con siguiente modelo
      }
    }

    // Devolver última respuesta o error
    const lastSuccessful = [...steps].reverse().find((s) => !s.error);

    return {
      content: lastSuccessful?.content || 'No successful response',
      steps,
      metadata: {
        latency: Date.now() - startTime,
        executor: 'sequential',
        totalSteps: steps.length,
        successfulSteps: steps.filter((s) => !s.error).length,
      },
    };
  }
}

/**
 * FallbackExecutor - Ejecuta con fallback automático
 *
 * Intenta ejecutar en modelos secuencialmente hasta que uno funcione.
 */
class FallbackExecutor extends BaseExecutor {
  constructor(orchestrator, options = {}) {
    super(orchestrator);
    this.config = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
    };
  }

  async execute(context) {
    const { modelIds, messages, parameters = {} } = context;

    const startTime = Date.now();
    let lastError;

    for (
      let attempt = 0;
      attempt < modelIds.length && attempt < this.config.maxRetries;
      attempt++
    ) {
      const modelId = modelIds[attempt];

      try {
        const result = await this.orchestrator.executeOnModel(modelId, {
          messages,
          parameters,
        });

        return {
          content: result.content,
          modelId,
          metadata: {
            ...result.metadata,
            latency: Date.now() - startTime,
            executor: 'fallback',
            fallbackAttempts: attempt + 1,
            fallbackModelId: modelId,
          },
        };
      } catch (error) {
        lastError = error;

        // Si es error no-retryable, no continuar
        if (!this._isRetryableError(error)) {
          break;
        }

        // Esperar antes de retry
        if (this.config.retryDelay > 0) {
          await new Promise((r) => setTimeout(r, this.config.retryDelay));
        }
      }
    }

    // Todos fallaron
    return {
      error: lastError?.message || 'All models failed',
      fallbackAttempts: modelIds.length,
      fallbackRequired: true,
    };
  }

  _isRetryableError(error) {
    const retryable = ['timeout', 'rate limit', '429', '503', 'unavailable'];

    const msg = error.message?.toLowerCase() || '';
    return retryable.some((r) => msg.includes(r));
  }
}

/**
 * Factory para crear executors
 */
class ExecutorFactory {
  static create(type, orchestrator, options = {}) {
    switch (type) {
      case 'single':
        return new SingleExecutor(orchestrator);
      case 'parallel':
        return new ParallelExecutor(orchestrator, options);
      case 'consensus':
        return new ConsensusExecutor(orchestrator, options);
      case 'sequential':
        return new SequentialExecutor(orchestrator, options);
      case 'fallback':
        return new FallbackExecutor(orchestrator, options);
      default:
        return new SingleExecutor(orchestrator);
    }
  }
}

module.exports = {
  BaseExecutor,
  SingleExecutor,
  ParallelExecutor,
  ConsensusExecutor,
  SequentialExecutor,
  FallbackExecutor,
  ExecutorFactory,
};
