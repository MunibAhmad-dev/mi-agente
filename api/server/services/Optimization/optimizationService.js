/**
 * optimizationService.js — Fase 15 (Optimización): tuner de parámetros de
 * rendimiento del agente. Analiza trazas (Fase 13) y resultados (Fase 14)
 * y recomienda parámetros óptimos.
 *
 * Dimensiones optimizables (doc §15):
 *   - RAM: presupuesto de memoria del runtime.
 *   - VRAM: presupuesto de GPU (modelos locales).
 *   - tokens: límite de contexto y budget por turno.
 *   - latencia: timeout y objetivos SLO.
 *   - contexto: tamaño del context window inyectado.
 *   - paralelismo: número de subagentes concurrentes.
 *
 * El tuner es NO destructivo: produce recomendaciones que el operador
 * aplica. No modifica configuración en caliente salvo que se apruebe.
 */

const OptimizationDimension = Object.freeze({
  RAM: 'ram',
  VRAM: 'vram',
  TOKENS: 'tokens',
  LATENCY: 'latency',
  CONTEXT: 'context',
  PARALLELISM: 'parallelism',
});

/** Presupuestos/constraints por defecto (configurables). */
const DEFAULT_BUDGETS = Object.freeze({
  maxRamMb: 4096,
  maxVramMb: 8192,
  maxContextTokens: 128000,
  maxLatencyMs: 60000,
  maxParallelAgents: 4,
  minParallelAgents: 1,
});

/**
 * OptimizationService: analiza datos de Observability/Evaluation y recomienda
 * parámetros óptimos para cada dimensión.
 */
class OptimizationService {
  /**
   * @param {object} deps - { observability, evaluation }
   */
  constructor(deps = {}) {
    this.observability = deps.observability || null;
    this.evaluation = deps.evaluation || null;
    this.budgets = { ...DEFAULT_BUDGETS };
    this.current = {
      maxContextTokens: 32000,
      maxParallelAgents: 2,
      ramBudgetMb: 2048,
      vramBudgetMb: 4096,
      latencyTimeoutMs: 30000,
    };
  }

  /**
   * Recolecta métricas agregadas de trazas recientes.
   * @param {number} [limit=50] - últimas N trazas
   * @returns {object} agregados
   */
  collectMetrics(limit = 50) {
    if (!this.observability) {
      return { hasData: false };
    }
    const traces = this.observability.listTraces().slice(0, limit);
    if (!traces.length) {
      return { hasData: false };
    }
    let totalTokens = 0,
      totalLatency = 0,
      totalRam = 0,
      totalVram = 0;
    let totalRetries = 0,
      successes = 0;
    for (const t of traces) {
      totalTokens += t.totals.tokensIn + t.totals.tokensOut;
      totalLatency += t.durationMs || 0;
      totalRam += t.totals.peakRamMb;
      totalVram += t.totals.peakVramMb;
      totalRetries += t.totals.retries;
      if (t.status === 'completed') successes += 1;
    }
    const n = traces.length;
    return {
      hasData: true,
      count: n,
      avgTokens: totalTokens / n,
      avgLatencyMs: totalLatency / n,
      avgPeakRamMb: totalRam / n,
      avgPeakVramMb: totalVram / n,
      avgRetries: totalRetries / n,
      successRate: successes / n,
    };
  }

  /**
   * Recomienda parámetros óptimos basándose en métricas.
   * @param {object} [metrics] - si se omite, recolecta de observability
   * @returns {object} recomendaciones por dimensión + config propuesta
   */
  recommend(metrics) {
    const m = metrics || this.collectMetrics();
    if (!m.hasData) {
      return {
        hasData: false,
        recommendations: {},
        proposed: { ...this.current },
        reason: 'sin datos suficientes; mantener configuración actual',
      };
    }

    const recommendations = {};

    // --- CONTEXT (tokens): ajustar según uso real ---
    const tokenUtil = m.avgTokens / this.current.maxContextTokens;
    if (tokenUtil < 0.3) {
      recommendations[OptimizationDimension.CONTEXT] = {
        current: this.current.maxContextTokens,
        recommended: Math.max(8000, Math.round(this.current.maxContextTokens * 0.6)),
        reason: `uso de tokens bajo (${(tokenUtil * 100).toFixed(0)}%); reducir context window ahorra RAM/VRAM`,
      };
    } else if (tokenUtil > 0.8) {
      recommendations[OptimizationDimension.CONTEXT] = {
        current: this.current.maxContextTokens,
        recommended: Math.min(
          this.budgets.maxContextTokens,
          Math.round(this.current.maxContextTokens * 1.3),
        ),
        reason: `uso de tokens alto (${(tokenUtil * 100).toFixed(0)}%); ampliar context evita truncado`,
      };
    }

    // --- PARALLELISM: ajustar según latencia y success ---
    if (m.avgLatencyMs > this.current.latencyTimeoutMs * 0.8) {
      recommendations[OptimizationDimension.PARALLELISM] = {
        current: this.current.maxParallelAgents,
        recommended: Math.max(this.budgets.minParallelAgents, this.current.maxParallelAgents - 1),
        reason: 'latencia cercana al timeout; reducir paralelismo evita OOM/timeouts',
      };
    } else if (m.avgLatencyMs < this.current.latencyTimeoutMs * 0.3 && m.successRate > 0.8) {
      recommendations[OptimizationDimension.PARALLELISM] = {
        current: this.current.maxParallelAgents,
        recommended: Math.min(this.budgets.maxParallelAgents, this.current.maxParallelAgents + 1),
        reason: 'latencia baja y success alto; aumentar paralelismo mejora throughput',
      };
    }

    // --- RAM/VRAM: ajustar según peaks ---
    if (m.avgPeakRamMb > this.current.ramBudgetMb * 0.8) {
      recommendations[OptimizationDimension.RAM] = {
        current: this.current.ramBudgetMb,
        recommended: Math.min(this.budgets.maxRamMb, Math.round(this.current.ramBudgetMb * 1.5)),
        reason: 'peak RAM cercano al budget; ampliar evita presión de memoria',
      };
    } else if (m.avgPeakRamMb < this.current.ramBudgetMb * 0.3) {
      recommendations[OptimizationDimension.RAM] = {
        current: this.current.ramBudgetMb,
        recommended: Math.max(512, Math.round(this.current.ramBudgetMb * 0.6)),
        reason: 'uso de RAM bajo; reducir budget libera recursos',
      };
    }
    if (m.avgPeakVramMb > this.current.vramBudgetMb * 0.8) {
      recommendations[OptimizationDimension.VRAM] = {
        current: this.current.vramBudgetMb,
        recommended: Math.min(this.budgets.maxVramMb, Math.round(this.current.vramBudgetMb * 1.5)),
        reason: 'peak VRAM cercano al budget; ampliar evita OOM de GPU',
      };
    }

    // --- LATENCY: ajustar timeout según latencia observada ---
    if (m.avgLatencyMs > this.current.latencyTimeoutMs) {
      recommendations[OptimizationDimension.LATENCY] = {
        current: this.current.latencyTimeoutMs,
        recommended: Math.min(this.budgets.maxLatencyMs, Math.round(m.avgLatencyMs * 1.5)),
        reason: 'latencia observada excede el timeout; ampliar evita abortos',
      };
    }

    // --- TOKENS (retries): si hay muchos retries, quizás contexto insuficiente ---
    if (m.avgRetries > 2 && !recommendations[OptimizationDimension.CONTEXT]) {
      recommendations[OptimizationDimension.TOKENS] = {
        current: this.current.maxContextTokens,
        recommended: Math.min(
          this.budgets.maxContextTokens,
          Math.round(this.current.maxContextTokens * 1.2),
        ),
        reason: `retries altos (${m.avgRetries.toFixed(1)} avg); más contexto puede reducir reintentos`,
      };
    }

    return {
      hasData: true,
      recommendations,
      proposed: this._buildProposed(recommendations),
      metrics: m,
    };
  }

  /** Construye la config propuesta aplicando las recomendaciones. */
  _buildProposed(recommendations) {
    const proposed = { ...this.current };
    if (recommendations[OptimizationDimension.CONTEXT]) {
      proposed.maxContextTokens = recommendations[OptimizationDimension.CONTEXT].recommended;
    }
    if (recommendations[OptimizationDimension.PARALLELISM]) {
      proposed.maxParallelAgents = recommendations[OptimizationDimension.PARALLELISM].recommended;
    }
    if (recommendations[OptimizationDimension.RAM]) {
      proposed.ramBudgetMb = recommendations[OptimizationDimension.RAM].recommended;
    }
    if (recommendations[OptimizationDimension.VRAM]) {
      proposed.vramBudgetMb = recommendations[OptimizationDimension.VRAM].recommended;
    }
    if (recommendations[OptimizationDimension.LATENCY]) {
      proposed.latencyTimeoutMs = recommendations[OptimizationDimension.LATENCY].recommended;
    }
    return proposed;
  }

  /** Aplica una config propuesta (tras aprobación). */
  apply(config) {
    this.current = { ...this.current, ...config };
    return this.current;
  }

  /** Valida que una config respete los budgets. */
  validate(config) {
    const errors = [];
    if (config.maxContextTokens && config.maxContextTokens > this.budgets.maxContextTokens) {
      errors.push(`maxContextTokens excede budget (${this.budgets.maxContextTokens})`);
    }
    if (config.ramBudgetMb && config.ramBudgetMb > this.budgets.maxRamMb) {
      errors.push(`ramBudgetMb excede budget (${this.budgets.maxRamMb})`);
    }
    if (config.vramBudgetMb && config.vramBudgetMb > this.budgets.maxVramMb) {
      errors.push(`vramBudgetMb excede budget (${this.budgets.maxVramMb})`);
    }
    if (config.maxParallelAgents !== undefined) {
      if (config.maxParallelAgents < this.budgets.minParallelAgents) {
        errors.push(`maxParallelAgents < mínimo (${this.budgets.minParallelAgents})`);
      }
      if (config.maxParallelAgents > this.budgets.maxParallelAgents) {
        errors.push(`maxParallelAgents > máximo (${this.budgets.maxParallelAgents})`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  setBudgets(budgets) {
    this.budgets = { ...this.budgets, ...budgets };
  }
}

module.exports = {
  OptimizationDimension,
  DEFAULT_BUDGETS,
  OptimizationService,
};
