/**
 * evaluationService.js — Fase 14 (Evaluation + Benchmark): framework de
 * evaluación con niveles de dificultad 1-10, métricas estandarizadas y
 * comparación reproducible entre configuraciones.
 *
 * Configuraciones comparables (doc §14):
 *   - CLAUDE_CODE: Claude Code como referencia.
 *   - DEEPSEEK_HARNESS: DeepSeek + harness mínimo (sin runtime completo).
 *   - RUNTIME_FULL: DeepSeek + runtime completo (este harness).
 *
 * Métricas (doc §14): success, tokens, RAM, VRAM, latency, retries.
 * Consume ObservabilityService (Fase 13) para extraer métricas de trazas.
 */

const BenchmarkLevel = Object.freeze({
  // Niveles 1-10 de dificultad creciente.
  L1_TRIVIAL: 1, // un archivo, un cambio sintáctico
  L2_SIMPLE: 2, // un archivo, lógica simple
  L3_MULTIFILE_BASIC: 3, // 2-3 archivos, cambio localizado
  L4_MULTIFILE_DEPS: 4, // archivos con dependencias
  L5_REFACTOR: 5, // refactor preservando comportamiento
  L6_NEW_FEATURE: 6, // feature nueva en módulo existente
  L7_CROSS_MODULE: 7, // cambios cross-module
  L8_ARCHITECTURE: 8, // cambio arquitectural
  L9_DEBUG_COMPLEX: 9, // bug complejo, reproducir + fix
  L10_NOVEL: 10, // problema novedoso, sin precedentes
});

const LEVEL_DESCRIPTIONS = Object.freeze({
  [BenchmarkLevel.L1_TRIVIAL]: 'Cambio sintáctico trivial en un archivo',
  [BenchmarkLevel.L2_SIMPLE]: 'Lógica simple en un archivo',
  [BenchmarkLevel.L3_MULTIFILE_BASIC]: 'Cambio localizado en 2-3 archivos',
  [BenchmarkLevel.L4_MULTIFILE_DEPS]: 'Cambios en archivos con dependencias',
  [BenchmarkLevel.L5_REFACTOR]: 'Refactor preservando comportamiento',
  [BenchmarkLevel.L6_NEW_FEATURE]: 'Feature nueva en módulo existente',
  [BenchmarkLevel.L7_CROSS_MODULE]: 'Cambios cross-module',
  [BenchmarkLevel.L8_ARCHITECTURE]: 'Cambio arquitectural',
  [BenchmarkLevel.L9_DEBUG_COMPLEX]: 'Bug complejo: reproducir + fix',
  [BenchmarkLevel.L10_NOVEL]: 'Problema novedoso sin precedentes',
});

const Configuration = Object.freeze({
  CLAUDE_CODE: 'claude_code',
  DEEPSEEK_HARNESS: 'deepseek_harness',
  RUNTIME_FULL: 'runtime_full',
});

const Metric = Object.freeze({
  SUCCESS: 'success',
  TOKENS: 'tokens',
  RAM_MB: 'ram_mb',
  VRAM_MB: 'vram_mb',
  LATENCY_MS: 'latency_ms',
  RETRIES: 'retries',
});

const ALL_METRICS = Object.values(Metric);

/**
 * Un caso de benchmark: una tarea con dificultad y criterio de éxito.
 * @typedef {object} BenchmarkCase
 * @property {string} id
 * @property {string} name
 * @property {number} level - 1..10
 * @property {string} task - descripción
 * @property {string} successCriteria - cómo verificar éxito
 * @property {string} [setup]
 */

/**
 * Resultado de una ejecución de benchmark.
 * @typedef {object} BenchmarkResult
 * @property {string} caseId
 * @property {string} configuration
 * @property {object} metrics - { success, tokens, ram_mb, vram_mb, latency_ms, retries }
 * @property {string} [traceId]
 * @property {number} timestamp
 */

let _caseCounter = 0;
function nextCaseId() {
  _caseCounter += 1;
  return `bench_${_caseCounter}`;
}

let BenchmarkResultModel;
try {
  BenchmarkResultModel = require('~/models/BenchmarkResult');
} catch { /* model optional */ }

/**
 * EvaluationService: define casos, ejecuta benchmarks y compara configuraciones.
 */
class EvaluationService {
  /**
   * @param {object} deps - { observability }
   */
  constructor(deps = {}) {
    this.observability = deps.observability || null;
    this.cases = new Map(); // caseId -> BenchmarkCase
    this.results = []; // BenchmarkResult[] (in-memory cache)
    // Hydrate from MongoDB on startup (fire-and-forget)
    if (BenchmarkResultModel) {
      BenchmarkResultModel.find({}).lean().then((rows) => {
        for (const r of rows) {
          this.results.push({
            caseId: r.caseId,
            configuration: r.configuration,
            metrics: r.metrics,
            traceId: r.traceId,
            timestamp: r.timestamp,
          });
        }
      }).catch(() => { /* db not ready yet */ });
    }
  }

  /** Registra un caso de benchmark. */
  addBenchmarkCase({ name, level, task, successCriteria, setup }) {
    if (level < 1 || level > 10) {
      throw new Error('level debe estar entre 1 y 10');
    }
    const c = {
      id: nextCaseId(),
      name,
      level,
      task,
      successCriteria,
      setup: setup || null,
    };
    this.cases.set(c.id, c);
    return c;
  }

  /** Lista casos (opcionalmente por nivel). */
  listCases({ level } = {}) {
    let result = Array.from(this.cases.values());
    if (level !== undefined) {
      result = result.filter((c) => c.level === level);
    }
    return result.sort((a, b) => a.level - b.level);
  }

  /**
   * Registra el resultado de una ejecución. Normaliza métricas desde una
   * traza de Observability si se pasa traceId, o acepta métricas directas.
   * @param {object} params
   * @param {string} params.caseId
   * @param {string} params.configuration - Configuration
   * @param {object} [params.metrics] - métricas directas
   * @param {string} [params.traceId] - traza de Observability (Fase 13)
   */
  recordResult({ caseId, configuration, metrics, traceId }) {
    if (!this.cases.has(caseId)) {
      throw new Error(`caso no encontrado: ${caseId}`);
    }
    if (!Object.values(Configuration).includes(configuration)) {
      throw new Error(`configuración desconocida: ${configuration}`);
    }

    let finalMetrics = { ...metrics };
    // Si hay traza, extraer métricas de Observability.
    if (traceId && this.observability) {
      const t = this.observability.getTrace(traceId);
      if (t) {
        const totals = t.trace.totals;
        finalMetrics = {
          [Metric.SUCCESS]: finalMetrics[Metric.SUCCESS] ?? t.trace.status === 'completed',
          [Metric.TOKENS]: finalMetrics[Metric.TOKENS] ?? totals.tokensIn + totals.tokensOut,
          [Metric.RAM_MB]: finalMetrics[Metric.RAM_MB] ?? totals.peakRamMb,
          [Metric.VRAM_MB]: finalMetrics[Metric.VRAM_MB] ?? totals.peakVramMb,
          [Metric.LATENCY_MS]: finalMetrics[Metric.LATENCY_MS] ?? t.trace.durationMs,
          [Metric.RETRIES]: finalMetrics[Metric.RETRIES] ?? totals.retries,
        };
      }
    }

    const result = {
      caseId,
      configuration,
      metrics: finalMetrics,
      traceId: traceId || null,
      timestamp: Date.now(),
    };
    this.results.push(result);
    if (BenchmarkResultModel) {
      BenchmarkResultModel.create(result).catch(() => { /* non-fatal */ });
    }
    return result;
  }

  /**
   * Compara configuraciones para un caso o conjunto de casos.
   * @param {object} params
   * @param {string} [params.caseId] - si se omite, agrega todos los casos
   * @returns {object} comparación por configuración (promedios)
   */
  compare({ caseId } = {}) {
    let results = this.results;
    if (caseId) {
      results = results.filter((r) => r.caseId === caseId);
    }
    const byConfig = {};
    for (const cfg of Object.values(Configuration)) {
      const cfgResults = results.filter((r) => r.configuration === cfg);
      if (!cfgResults.length) {
        continue;
      }
      byConfig[cfg] = this._aggregate(cfgResults);
    }
    return { caseId: caseId || 'all', configurations: byConfig };
  }

  /** Agrega métricas promedio de un conjunto de resultados. */
  _aggregate(results) {
    const count = results.length;
    const sum = { success: 0, tokens: 0, ram_mb: 0, vram_mb: 0, latency_ms: 0, retries: 0 };
    for (const r of results) {
      sum.success += r.metrics[Metric.SUCCESS] ? 1 : 0;
      sum.tokens += r.metrics[Metric.TOKENS] || 0;
      sum.ram_mb += r.metrics[Metric.RAM_MB] || 0;
      sum.vram_mb += r.metrics[Metric.VRAM_MB] || 0;
      sum.latency_ms += r.metrics[Metric.LATENCY_MS] || 0;
      sum.retries += r.metrics[Metric.RETRIES] || 0;
    }
    return {
      count,
      successRate: sum.success / count,
      avgTokens: sum.tokens / count,
      avgRamMb: sum.ram_mb / count,
      avgVramMb: sum.vram_mb / count,
      avgLatencyMs: sum.latency_ms / count,
      avgRetries: sum.retries / count,
    };
  }

  /**
   * Score compuesto para una configuración (mayor = mejor).
   * Combina success rate (peso alto) + eficiencia (menos tokens/latency/retries = mejor).
   */
  score(configuration, { caseId } = {}) {
    const cmp = this.compare({ caseId });
    const agg = cmp.configurations[configuration];
    if (!agg) {
      return null;
    }
    // Normalizar eficiencia: 1 - (tokens relativo). Asumimos 100k tokens como techo.
    const tokenEff = Math.max(0, 1 - agg.avgTokens / 100000);
    const latencyEff = Math.max(0, 1 - agg.avgLatencyMs / 60000);
    const retryPenalty = Math.max(0, 1 - agg.avgRetries / 10);
    return 0.5 * agg.successRate + 0.2 * tokenEff + 0.2 * latencyEff + 0.1 * retryPenalty;
  }

  /** Resetea resultados. */
  clearResults() {
    this.results = [];
  }

  stats() {
    return { cases: this.cases.size, results: this.results.length };
  }
}

module.exports = {
  BenchmarkLevel,
  LEVEL_DESCRIPTIONS,
  Configuration,
  Metric,
  ALL_METRICS,
  EvaluationService,
};
