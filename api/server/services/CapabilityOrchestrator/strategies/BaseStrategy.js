/**
 * StrategyEngine - Motor de estrategias de selección
 *
 * Proporciona múltiples estrategias para seleccionar
 * el modelo óptimo según diferentes criterios.
 */

const { Strategies } = require('../constants/Types');

/**
 * Contexto de estrategia
 */
class StrategyContext {
  constructor(data = {}) {
    this.candidates = data.candidates || [];
    this.config = data.config || {};
    this.request = data.request || {};
    this.capabilities = data.capabilities || [];
    this.estimatedTokens = data.estimatedTokens || 0;
  }
}

/**
 * Resultado de estrategia
 */
class StrategyResult {
  constructor(data = {}) {
    this.selectedModels = data.selectedModels || [];
    this.strategy = data.strategy || 'unknown';
    this.reasoning = data.reasoning || '';
    this.confidence = data.confidence ?? 0.5;
    this.alternatives = data.alternatives || [];

    // Copy additional properties (like autoDecision, etc.)
    for (const [key, value] of Object.entries(data)) {
      if (!Object.prototype.hasOwnProperty.call(this, key)) {
        this[key] = value;
      }
    }
  }

  get primaryModel() {
    return this.selectedModels[0] || null;
  }

  get hasFallback() {
    return this.alternatives.length > 0;
  }
}

/**
 * BaseStrategy - Clase base para estrategias
 */
class BaseStrategy {
  constructor(options = {}) {
    this.name = options.name || 'base';
    this.logger = options.logger || console;
  }

  /**
   * Seleccionar modelos según la estrategia
   * @param {StrategyContext} context - Contexto de la estrategia
   * @returns {StrategyResult} - Resultado de la selección
   */
  select(context) {
    throw new Error('select() must be implemented by subclass');
  }

  /**
   * Calcular score para un candidato
   */
  calculateScore(candidate, context) {
    return candidate.matchScore || 0;
  }

  /**
   * Verificar si la estrategia está disponible
   */
  isAvailable() {
    return true;
  }

  /**
   * Obtener descripción de la estrategia
   */
  getDescription() {
    return this.description || this.name;
  }
}

/**
 * FixedStrategy - Selecciona un modelo fijo
 */
class FixedStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.FIXED });
    this.description = 'Selecciona el modelo con mayor prioridad fija';
  }

  select(context) {
    const { candidates, config } = context;

    if (!candidates || candidates.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No candidates available',
        confidence: 0,
      });
    }

    // Ordenar por prioridad global del modelo
    const sorted = [...candidates].sort((a, b) => {
      const priorityA = config.activeModels?.find((m) => m.modelId === a.modelId)?.priority || 50;
      const priorityB = config.activeModels?.find((m) => m.modelId === b.modelId)?.priority || 50;
      return priorityB - priorityA;
    });

    return new StrategyResult({
      selectedModels: sorted.slice(0, 1),
      strategy: this.name,
      reasoning: `Modelo fijo: ${sorted[0]?.modelId}`,
      confidence: 0.9,
      alternatives: sorted.slice(1, 4),
    });
  }
}

/**
 * PriorityStrategy - Selecciona por prioridad configurada
 */
class PriorityStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.PRIORITY });
    this.description = 'Selecciona por prioridad configurada del usuario';
  }

  select(context) {
    const { candidates, config } = context;

    if (!candidates || candidates.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No candidates',
        confidence: 0,
      });
    }

    // Obtener prioridades del usuario
    const priorities = new Map();

    if (config.activeModels) {
      for (const model of config.activeModels) {
        priorities.set(model.modelId, model.priority);
      }
    }

    // Ordenar por prioridad
    const sorted = [...candidates].sort((a, b) => {
      const pA = priorities.get(a.modelId) || 50;
      const pB = priorities.get(b.modelId) || 50;
      return pB - pA;
    });

    return new StrategyResult({
      selectedModels: sorted.slice(0, 1),
      strategy: this.name,
      reasoning: `Mejor prioridad: ${sorted[0]?.modelId} (score: ${priorities.get(sorted[0]?.modelId) || 50})`,
      confidence: 0.85,
      alternatives: sorted.slice(1, 4),
    });
  }
}

/**
 * RoundRobinStrategy - Rotación entre modelos
 */
class RoundRobinStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.ROUND_ROBIN });
    this.description = 'Rota entre modelos activos';
    this.currentIndex = 0;
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

    // Filtrar modelos habilitados
    const enabled = candidates.filter((c) => c.model?.status !== 'unavailable');

    if (enabled.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No enabled models',
        confidence: 0,
      });
    }

    // Seleccionar siguiente en rotación
    const selected = enabled[this.currentIndex % enabled.length];
    this.currentIndex++;

    return new StrategyResult({
      selectedModels: [selected],
      strategy: this.name,
      reasoning: `Round robin: ${selected?.modelId} (index: ${(this.currentIndex - 1) % enabled.length})`,
      confidence: 0.7,
      alternatives: enabled.filter((m) => m.modelId !== selected?.modelId),
    });
  }

  reset() {
    this.currentIndex = 0;
  }
}

/**
 * LatencyStrategy - Selecciona menor latencia
 */
class LatencyStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.LATENCY });
    this.description = 'Selecciona el modelo con menor latencia';
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

    // Filtrar los que tienen métricas de latencia
    const withLatency = candidates.filter(
      (c) => c.estimatedLatency > 0 || c.model?.metrics?.avgLatency > 0,
    );

    if (withLatency.length === 0) {
      // Si no hay métricas, usar el primero
      return new StrategyResult({
        selectedModels: candidates.slice(0, 1),
        strategy: this.name,
        reasoning: `Sin métricas de latencia, usando: ${candidates[0]?.modelId}`,
        confidence: 0.5,
        alternatives: candidates.slice(1, 4),
      });
    }

    // Ordenar por latencia ascendente
    const sorted = [...withLatency].sort((a, b) => {
      const latA = a.estimatedLatency || a.model?.metrics?.avgLatency || Infinity;
      const latB = b.estimatedLatency || b.model?.metrics?.avgLatency || Infinity;
      return latA - latB;
    });

    return new StrategyResult({
      selectedModels: sorted.slice(0, 1),
      strategy: this.name,
      reasoning: `Menor latencia: ${sorted[0]?.modelId} (${sorted[0]?.estimatedLatency || sorted[0]?.model?.metrics?.avgLatency}ms)`,
      confidence: 0.8,
      alternatives: sorted.slice(1, 4),
    });
  }
}

/**
 * CostStrategy - Selecciona menor costo
 */
class CostStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.COST });
    this.description = 'Selecciona el modelo con menor costo';
  }

  select(context) {
    const { candidates, estimatedTokens } = context;

    if (!candidates || candidates.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No candidates',
        confidence: 0,
      });
    }

    // Primero, filtrar modelos gratis (costo 0)
    const freeModels = candidates.filter(
      (c) => c.estimatedCost === 0 || c.model?.costPer1K?.input === 0,
    );

    if (freeModels.length > 0) {
      // Ordenar gratis por match score
      const sorted = [...freeModels].sort((a, b) => {
        const scoreA = a.matchScore || 0;
        const scoreB = b.matchScore || 0;
        return scoreB - scoreA;
      });

      return new StrategyResult({
        selectedModels: sorted.slice(0, 1),
        strategy: this.name,
        reasoning: `Modelo gratis: ${sorted[0]?.modelId}`,
        confidence: 0.9,
        alternatives: sorted.slice(1, 4),
      });
    }

    // Ordenar por costo ascendente
    const sorted = [...candidates].sort((a, b) => {
      const costA = a.estimatedCost || a.model?.costPer1K?.input || Infinity;
      const costB = b.estimatedCost || b.model?.costPer1K?.input || Infinity;
      return costA - costB;
    });

    return new StrategyResult({
      selectedModels: sorted.slice(0, 1),
      strategy: this.name,
      reasoning: `Menor costo: ${sorted[0]?.modelId} ($${sorted[0]?.estimatedCost}/1K)`,
      confidence: 0.75,
      alternatives: sorted.slice(1, 4),
    });
  }
}

/**
 * ContextStrategy - Selecciona mayor contexto
 */
class ContextStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.CONTEXT });
    this.description = 'Selecciona el modelo con mayor contexto disponible';
  }

  select(context) {
    const { candidates, estimatedTokens } = context;

    if (!candidates || candidates.length === 0) {
      return new StrategyResult({
        strategy: this.name,
        reasoning: 'No candidates',
        confidence: 0,
      });
    }

    // Ordenar por contexto descendente
    const sorted = [...candidates].sort((a, b) => {
      const ctxA = a.maxContext || a.model?.limits?.maxContext || 0;
      const ctxB = b.maxContext || b.model?.limits?.maxContext || 0;
      return ctxB - ctxA;
    });

    const selected = sorted[0];
    const hasEnoughContext =
      (selected?.maxContext || selected?.model?.limits?.maxContext || 0) >= estimatedTokens;

    return new StrategyResult({
      selectedModels: [selected],
      strategy: this.name,
      reasoning: `Mayor contexto: ${selected?.modelId} (${selected?.maxContext || selected?.model?.limits?.maxContext}) - ${hasEnoughContext ? '✓' : '⚠️ bajo'} para ${estimatedTokens} tokens`,
      confidence: hasEnoughContext ? 0.85 : 0.5,
      alternatives: sorted.slice(1, 4),
    });
  }
}

/**
 * ReasoningStrategy - Selecciona mejor para razonamiento
 */
class ReasoningStrategy extends BaseStrategy {
  constructor(options = {}) {
    super({ ...options, name: Strategies.REASONING });
    this.description = 'Selecciona modelo óptimo para razonamiento';
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

    // Puntuar por capacidades de razonamiento
    const scored = candidates.map((c) => {
      let score = 0;

      // Tiene capability de razonamiento
      if (c.matchedCapabilities?.includes('reasoning')) score += 30;
      if (c.matchedCapabilities?.includes('analysis')) score += 20;
      if (c.matchedCapabilities?.includes('math')) score += 20;
      if (c.matchedCapabilities?.includes('reasoning_chain')) score += 40;

      // Competency levels
      const competencyLevels = c.model?.capabilities?.competencyLevels || {};
      score += (competencyLevels['reasoning'] || 0.5) * 20;
      score += (competencyLevels['analysis'] || 0.5) * 15;

      return { ...c, reasoningScore: score };
    });

    // Ordenar por score de razonamiento
    const sorted = scored.sort((a, b) => b.reasoningScore - a.reasoningScore);

    return new StrategyResult({
      selectedModels: sorted.slice(0, 1),
      strategy: this.name,
      reasoning: `Mejor razonamiento: ${sorted[0]?.modelId} (score: ${sorted[0]?.reasoningScore?.toFixed(1)})`,
      confidence: 0.7,
      alternatives: sorted.slice(1, 4),
    });
  }
}

module.exports = {
  // Core
  StrategyContext,
  StrategyResult,
  BaseStrategy,

  // Estrategias base
  FixedStrategy,
  PriorityStrategy,
  RoundRobinStrategy,
  LatencyStrategy,
  CostStrategy,
  ContextStrategy,
  ReasoningStrategy,
};
