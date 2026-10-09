/**
 * adaptiveRouter.js — Fase 12 (Adaptive Model Router): capa adaptativa sobre
 * el ModelRegistry existente que reordena candidatos por MÉTRICAS RUNTIME
 * (latency, success rate, cost) además del matchScore estático.
 *
 * El router existente (modelRouter.js, Fase 4) ya selecciona POR CAPACIDAD
 * (no por nombre): findByCapabilities + rankCandidates (matchScore → local →
 * latency → tag). Esta capa añade:
 *   - métricas runtime acumuladas por modelo (tras cada llamada),
 *   - reordenamiento por score adaptativo (matchScore + runtime),
 *   - override manual (el usuario fuerza un modelo concreto),
 *   - cooldown de modelos con alto fallo.
 *
 * Regla del doc (§12): "selección por capacidad, no por nombre, con override
 * manual". Regla 2: independiente del modelo concreto.
 */

/** Métricas runtime por modelo. */
class ModelMetrics {
  constructor() {
    this.metrics = new Map(); // modelId -> { calls, successes, failures, totalLatencyMs, totalCost }
  }

  /** Registra el resultado de una llamada. */
  record({ modelId, success, latencyMs, cost = 0 }) {
    if (!this.metrics.has(modelId)) {
      this.metrics.set(modelId, {
        calls: 0,
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
        totalCost: 0,
      });
    }
    const m = this.metrics.get(modelId);
    m.calls += 1;
    if (success) {
      m.successes += 1;
    } else {
      m.failures += 1;
    }
    m.totalLatencyMs += latencyMs || 0;
    m.totalCost += cost;
  }

  /** Devuelve métricas agregadas de un modelo. */
  get(modelId) {
    const m = this.metrics.get(modelId);
    if (!m) {
      return {
        calls: 0,
        successRate: 1,
        avgLatencyMs: 0,
        avgCost: 0,
        hasData: false,
      };
    }
    return {
      calls: m.calls,
      successRate: m.calls ? m.successes / m.calls : 1,
      avgLatencyMs: m.calls ? m.totalLatencyMs / m.calls : 0,
      avgCost: m.calls ? m.totalCost / m.calls : 0,
      hasData: true,
    };
  }

  /** Resetea métricas de un modelo o todas. */
  reset(modelId) {
    if (modelId) {
      this.metrics.delete(modelId);
    } else {
      this.metrics.clear();
    }
  }
}

/** Pesos del score adaptativo. */
const ADAPTIVE_WEIGHTS = Object.freeze({
  MATCH: 0.5, // matchScore estático (capacidades)
  SUCCESS: 0.3, // success rate runtime
  LATENCY: 0.15, // menor latency = mejor
  COST: 0.05, // menor cost = mejor
});

/** Fallo que desencadena cooldown (success rate bajo). */
const COOLDOWN_SUCCESS_THRESHOLD = 0.5;
const COOLDOWN_CALLS_MIN = 3;

/**
 * AdaptiveModelRouter: reordena candidatos del ModelRegistry por score
 * adaptativo, soporta override manual y cooldown de modelos fallidos.
 */
class AdaptiveModelRouter {
  /**
   * @param {object} deps - { metrics, registry }
   *   registry: objeto con findByCapabilities(caps) → [{ modelId, matchScore, ... }]
   */
  constructor(deps = {}) {
    this.metrics = deps.metrics || new ModelMetrics();
    this.registry = deps.registry || null;
    this.overrides = new Map(); // capabilitySetKey -> modelId forzado
  }

  /**
   * Selecciona el mejor modelo para un conjunto de capacidades.
   * @param {object} params
   * @param {string[]} params.capabilities
   * @param {string} [params.overrideModelId] - override manual del usuario
   * @returns {{ modelId: string, candidates: object[], reason: string }}
   */
  select({ capabilities, overrideModelId }) {
    // Override manual: el usuario fuerza un modelo (regla del doc §12).
    if (overrideModelId) {
      return {
        modelId: overrideModelId,
        candidates: [],
        reason: `override manual: ${overrideModelId}`,
      };
    }

    // Override por capability set registrado.
    const key = (capabilities || []).slice().sort().join(',');
    if (this.overrides.has(key)) {
      const modelId = this.overrides.get(key);
      return { modelId, candidates: [], reason: `override por caps: ${modelId}` };
    }

    if (!this.registry || typeof this.registry.findByCapabilities !== 'function') {
      throw new Error('AdaptiveModelRouter requiere un registry con findByCapabilities');
    }

    let candidates = this.registry.findByCapabilities(capabilities) || [];
    // Descartar modelos en cooldown (alto fallo con datos suficientes).
    candidates = candidates.filter((c) => !this._inCooldown(c.modelId));

    if (!candidates.length) {
      return { modelId: null, candidates: [], reason: 'sin candidatos disponibles' };
    }

    // Reordenar por score adaptativo.
    const scored = candidates.map((c) => ({
      ...c,
      adaptiveScore: this._adaptiveScore(c),
    }));
    scored.sort((a, b) => b.adaptiveScore - a.adaptiveScore);

    return {
      modelId: scored[0].modelId,
      candidates: scored,
      reason: `seleccionado por score adaptativo (${scored[0].adaptiveScore.toFixed(2)})`,
    };
  }

  /** Score adaptativo: match + success + latency (inverso) + cost (inverso). */
  _adaptiveScore(candidate) {
    const m = this.metrics.get(candidate.modelId);
    const match = candidate.matchScore || 0;
    const success = m.hasData ? m.successRate : 1;
    // Latencia inversa normalizada (asume ~2000ms típico).
    const latencyScore =
      m.hasData && m.avgLatencyMs > 0 ? Math.max(0, 1 - m.avgLatencyMs / 10000) : 1;
    const costScore = m.hasData && m.avgCost > 0 ? Math.max(0, 1 - m.avgCost / 0.1) : 1;
    return (
      ADAPTIVE_WEIGHTS.MATCH * match +
      ADAPTIVE_WEIGHTS.SUCCESS * success +
      ADAPTIVE_WEIGHTS.LATENCY * latencyScore +
      ADAPTIVE_WEIGHTS.COST * costScore
    );
  }

  /** ¿Modelo en cooldown por alto fallo? */
  _inCooldown(modelId) {
    const m = this.metrics.get(modelId);
    return m.hasData && m.calls >= COOLDOWN_CALLS_MIN && m.successRate < COOLDOWN_SUCCESS_THRESHOLD;
  }

  /** Registra una llamada para alimentar métricas. */
  recordCall({ modelId, success, latencyMs, cost }) {
    this.metrics.record({ modelId, success, latencyMs, cost });
  }

  /** Override por capability set. */
  setOverride(capabilities, modelId) {
    const key = (capabilities || []).slice().sort().join(',');
    this.overrides.set(key, modelId);
  }

  clearOverride(capabilities) {
    const key = (capabilities || []).slice().sort().join(',');
    return this.overrides.delete(key);
  }
}

module.exports = {
  ModelMetrics,
  AdaptiveModelRouter,
  ADAPTIVE_WEIGHTS,
  COOLDOWN_SUCCESS_THRESHOLD,
  COOLDOWN_CALLS_MIN,
};
