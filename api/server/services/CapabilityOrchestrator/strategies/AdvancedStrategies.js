/**
 * Advanced Strategies - Estrategias avanzadas de orquestación
 *
 * Implementa estrategias sofisticadas:
 * - ConsensusStrategy: Ejecuta múltiples modelos y alcanza consenso
 * - ParallelStrategy: Ejecuta modelos en paralelo
 * - AutoStrategy: Selección automática con scoring ponderado
 */

const { Strategies } = require('../constants/Types');
const { BaseStrategy, StrategyResult } = require('./BaseStrategy');

/**
 * ConsensusStrategy - Alcanza consenso entre múltiples modelos
 *
 * Ejecuta múltiples modelos y sintetiza sus respuestas para obtener
 * una respuesta de mayor calidad mediante agregación.
 */
class ConsensusStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.CONSENSUS });
    this.description = 'Ejecuta múltiples modelos y alcanza consenso';

    // Configuración
    this.config = {
      minModels: options.minModels || 2,
      maxModels: options.maxModels || 4,
      agreementThreshold: options.agreementThreshold || 0.6,
      synthesizer: options.synthesizer || this._defaultSynthesizer,
    };
  }

  /**
   * Seleccionar múltiples modelos para consenso
   */
  select(context) {
    const { candidates } = context;

    if (!candidates || candidates.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No candidates',
        confidence: 0,
      });
    }

    // Seleccionar top N modelos según match score
    const selectedModels = candidates.slice(0, Math.min(this.config.maxModels, candidates.length));

    // Verificar que tenemos suficientes modelos
    if (selectedModels.length < this.config.minModels) {
      return new StrategyResult({
        selectedModels: selectedModels.slice(0, 1),
        strategy: this.name,
        reasoning: `Insufficient models for consensus (${selectedModels.length} < ${this.config.minModels}), falling back to single model`,
        confidence: 0.3,
        alternatives: [],
      });
    }

    return new StrategyResult({
      selectedModels,
      strategy: this.name,
      reasoning: `Consensus de ${selectedModels.length} modelos: ${selectedModels.map((m) => m.modelId).join(', ')}`,
      confidence: 0.75,
      alternatives: [],
      // Metadata especial para consenso
      consensusConfig: {
        minModels: this.config.minModels,
        agreementThreshold: this.config.agreementThreshold,
      },
    });
  }

  /**
   * Síntesis por defecto (concatena respuestas)
   */
  _defaultSynthesizer(responses) {
    // Por defecto, concatenar con separador
    const parts = responses.map((r, i) => `[Respuesta ${i + 1}]: ${r.content}`);

    return parts.join('\n\n---\n\n');
  }
}

/**
 * ParallelStrategy - Ejecuta modelos en paralelo
 *
 * Ejecuta múltiples modelos simultáneamente y devuelve
 * todas las respuestas para que el cliente decida.
 */
class ParallelStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.PARALLEL });
    this.description = 'Ejecuta múltiples modelos en paralelo';

    this.config = {
      maxParallel: options.maxParallel || 3,
      timeout: options.timeout || 30000, // 30 segundos
      stopOnFirst: options.stopOnFirst || false, // Detener en primer resultado
    };
  }

  /**
   * Seleccionar modelos para ejecución paralela
   */
  select(context) {
    const { candidates } = context;

    if (!candidates || candidates.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No candidates',
        confidence: 0,
      });
    }

    // Seleccionar modelos para paralelismo
    const selectedModels = candidates.slice(
      0,
      Math.min(this.config.maxParallel, candidates.length),
    );

    return new StrategyResult({
      selectedModels,
      strategy: this.name,
      reasoning: `Ejecución paralela de ${selectedModels.length} modelos`,
      confidence: 0.7,
      alternatives: [],
      // Metadata para ejecución paralela
      parallelConfig: {
        maxParallel: this.config.maxParallel,
        timeout: this.config.timeout,
      },
    });
  }
}

/**
 * AutoStrategy - Selección automática con scoring ponderado
 *
 * Analiza el contexto y selecciona automáticamente la mejor
 * estrategia basándose en múltiples factores.
 */
class AutoStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.AUTO });
    this.description = 'Selección automática basada en contexto';

    // Pesos para scoring (configurables)
    this.weights = options.weights || {
      capability: 0.3, // Compatibilidad de capabilities
      latency: 0.2, // Latencia del modelo
      cost: 0.15, // Costo por token
      context: 0.15, // Tamaño de contexto
      reasoning: 0.1, // Capacidades de razonamiento
      reliability: 0.1, // Historial de éxito
    };

    // Factores del contexto
    this.contextFactors = options.contextFactors || {
      hasHighTokens: (ctx) => ctx.estimatedTokens > 50000,
      hasCode: (ctx) => ctx.capabilities?.includes('code'),
      hasAnalysis: (ctx) => ctx.capabilities?.includes('analysis'),
      hasSecurity: (ctx) => ctx.capabilities?.includes('security'),
      hasLongContext: (ctx) => ctx.capabilities?.includes('long_context'),
    };
  }

  /**
   * Seleccionar automáticamente el mejor modelo
   */
  select(context) {
    const { candidates, capabilities, estimatedTokens } = context;

    if (!candidates || candidates.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No candidates',
        confidence: 0,
      });
    }

    // Analizar contexto
    const contextAnalysis = this._analyzeContext(context);

    // Calcular pesos dinámicos según contexto
    const dynamicWeights = this._calculateDynamicWeights(contextAnalysis);

    // Puntuar cada candidato
    const scored = candidates.map((candidate) => {
      const scores = this._calculateCandidateScores(candidate, context);
      const weightedScore = this._calculateWeightedScore(scores, dynamicWeights);

      return {
        ...candidate,
        totalScore: weightedScore,
        scores,
      };
    });

    // Ordenar por score
    const ranked = scored.sort((a, b) => b.totalScore - a.totalScore);

    // Seleccionar el mejor
    const selected = ranked[0];

    // Determinar estrategia realmente usada
    const actualStrategy = this._inferStrategy(contextAnalysis);

    return new StrategyResult({
      selectedModels: [selected],
      strategy: this.name,
      reasoning: `Auto-seleccionado: ${selected.modelId} (score: ${selected.totalScore.toFixed(3)}) - Estrategia: ${actualStrategy}`,
      confidence: selected.totalScore,
      alternatives: ranked.slice(1, 4),
      // Metadata de decisión
      autoDecision: {
        contextAnalysis,
        dynamicWeights,
        actualStrategy,
        scores: {
          [selected.modelId]: selected.scores,
        },
      },
    });
  }

  /**
   * Analizar contexto para determinar factores relevantes
   */
  _analyzeContext(context) {
    const factors = {
      highTokens: false,
      hasCode: false,
      hasAnalysis: false,
      hasSecurity: false,
      hasLongContext: false,
      hasMultimodal: false,
      isUrgent: false,
    };

    const { capabilities = [], estimatedTokens = 0 } = context;

    // Detectar factores
    factors.highTokens = estimatedTokens > 50000;
    factors.hasCode = capabilities.includes('code');
    factors.hasAnalysis = capabilities.includes('analysis');
    factors.hasSecurity = capabilities.includes('security');
    factors.hasLongContext = capabilities.includes('long_context') || estimatedTokens > 100000;
    factors.hasMultimodal = capabilities.includes('vision') || capabilities.includes('multimodal');

    // Analizar urgencia (mensajes cortos = potencialmente urgente)
    factors.isUrgent = estimatedTokens < 100;

    return factors;
  }

  /**
   * Calcular pesos dinámicos según contexto
   */
  _calculateDynamicWeights(factors) {
    // Empezar con pesos base
    const weights = { ...this.weights };

    // Ajustes por contexto

    // Si necesita contexto largo, priorizar capacidad de contexto
    if (factors.highTokens || factors.hasLongContext) {
      weights.context = 0.35;
      weights.capability = 0.2;
      weights.latency = 0.1;
    }

    // Si es código, priorizar capabilities de razonamiento
    if (factors.hasCode) {
      weights.reasoning = 0.25;
      weights.capability = 0.25;
    }

    // Si es análisis, balancear todo
    if (factors.hasAnalysis) {
      weights.reasoning = 0.2;
      weights.capability = 0.25;
    }

    // Si es seguridad, priorizar confiabilidad
    if (factors.hasSecurity) {
      weights.reliability = 0.3;
      weights.capability = 0.2;
    }

    // Normalizar pesos
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(weights)) {
      weights[key] = weights[key] / total;
    }

    return weights;
  }

  /**
   * Calcular scores parciales para un candidato
   */
  _calculateCandidateScores(candidate, context) {
    const scores = {
      capability: 0,
      latency: 0,
      cost: 0,
      context: 0,
      reasoning: 0,
      reliability: 0,
    };

    const { estimatedTokens = 0 } = context;

    // Score de capability (0-1)
    scores.capability = candidate.matchScore || 0;

    // Score de latencia (menor es mejor)
    const latency = candidate.estimatedLatency || candidate.model?.metrics?.avgLatency || 5000; // Default 5s
    scores.latency = Math.max(0, 1 - latency / 10000); // Normalizado a 10s

    // Score de costo (menor es mejor)
    const cost = candidate.estimatedCost || candidate.model?.costPer1K?.input || 0.01;
    scores.cost = Math.max(0, 1 - cost / 0.05); // Normalizado a $0.05

    // Score de contexto
    const maxContext = candidate.maxContext || candidate.model?.limits?.maxContext || 8192;
    scores.context = Math.min(1, maxContext / Math.max(estimatedTokens * 2, 8192));

    // Score de razonamiento
    const caps = candidate.model?.capabilities?.capabilities || [];
    let reasoningScore = 0;
    if (caps.includes('reasoning')) reasoningScore += 0.3;
    if (caps.includes('reasoning_chain')) reasoningScore += 0.3;
    if (caps.includes('analysis')) reasoningScore += 0.2;
    if (caps.includes('math')) reasoningScore += 0.2;
    scores.reasoning = reasoningScore;

    // Score de confiabilidad
    const successRate = candidate.model?.metrics?.successRate || 0.9;
    scores.reliability = successRate;

    return scores;
  }

  /**
   * Calcular score ponderado total
   */
  _calculateWeightedScore(scores, weights) {
    let total = 0;
    for (const [key, weight] of Object.entries(weights)) {
      total += (scores[key] || 0) * weight;
    }
    return Math.min(1, Math.max(0, total));
  }

  /**
   * Inferir qué estrategia simple se habría usado
   */
  _inferStrategy(factors) {
    if (factors.hasSecurity) return 'priority';
    if (factors.hasAnalysis) return 'reasoning';
    if (factors.highTokens) return 'context';
    if (factors.isUrgent) return 'latency';
    if (factors.hasCode) return 'priority';
    return 'priority';
  }
}

/**
 * HybridStrategy - Combina múltiples estrategias
 *
 * Usa una estrategia para selección inicial y otra para fallback.
 */
class HybridStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: 'hybrid' });
    this.description = 'Combina múltiples estrategias';

    this.config = {
      primary: options.primary || 'priority',
      fallback: options.fallback || 'cost',
      fallbackThreshold: options.fallbackThreshold || 0.5,
    };
  }

  select(context) {
    const { candidates } = context;

    if (!candidates || candidates.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No candidates',
        confidence: 0,
      });
    }

    // Intentar con estrategia primaria
    // (Aquí se delegaría al StrategyEngine principal)
    // Por ahora, usar lógica inline

    const sorted = [...candidates].sort((a, b) => {
      const scoreA = a.matchScore * (a.model?.metrics?.successRate || 0.9);
      const scoreB = b.matchScore * (b.model?.metrics?.successRate || 0.9);
      return scoreB - scoreA;
    });

    const primary = sorted[0];

    // Si el score es bajo, usar fallback
    const primaryScore = primary.matchScore * (primary.model?.metrics?.successRate || 0.9);

    if (primaryScore < this.config.fallbackThreshold) {
      // Usar fallback: menor costo
      const byCost = [...sorted].sort((a, b) => {
        const costA = a.estimatedCost || a.model?.costPer1K?.input || Infinity;
        const costB = b.estimatedCost || b.model?.costPer1K?.input || Infinity;
        return costA - costB;
      });

      return new StrategyResult({
        selectedModels: [byCost[0]],
        strategy: this.name,
        reasoning: `Fallback a costo: ${byCost[0].modelId}`,
        confidence: byCost[0].matchScore,
        alternatives: byCost.slice(1, 4),
      });
    }

    return new StrategyResult({
      selectedModels: [primary],
      strategy: this.name,
      reasoning: `Primary (${this.config.primary}): ${primary.modelId}`,
      confidence: primaryScore,
      alternatives: sorted.slice(1, 4),
    });
  }
}

module.exports = {
  ConsensusStrategy,
  ParallelStrategy,
  AutoStrategy,
  HybridStrategy,
};
