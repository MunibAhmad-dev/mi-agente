/**
 * evaluationService.spec.js — Fase 14: Evaluation + Benchmark.
 */

const {
  BenchmarkLevel,
  Configuration,
  Metric,
  EvaluationService,
} = require('../evaluationService');
const { ObservabilityService, TraceStatus } = require('../../Observability/observabilityService');

describe('evaluationService (Fase 14 — Evaluation + Benchmark)', () => {
  let eval_;
  beforeEach(() => {
    eval_ = new EvaluationService();
  });

  describe('BenchmarkLevel', () => {
    it('tiene niveles 1-10', () => {
      const levels = Object.values(BenchmarkLevel);
      expect(levels.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe('addBenchmarkCase', () => {
    it('registra un caso con nivel', () => {
      const c = eval_.addBenchmarkCase({
        name: 'fix typo',
        level: BenchmarkLevel.L1_TRIVIAL,
        task: 'arregla un typo',
        successCriteria: 'lint pasa',
      });
      expect(c.id).toBeDefined();
      expect(c.level).toBe(1);
      expect(c.task).toContain('typo');
    });

    it('rechaza nivel fuera de rango', () => {
      expect(() =>
        eval_.addBenchmarkCase({ name: 'x', level: 0, task: 't', successCriteria: 's' }),
      ).toThrow();
      expect(() =>
        eval_.addBenchmarkCase({ name: 'x', level: 11, task: 't', successCriteria: 's' }),
      ).toThrow();
    });
  });

  describe('listCases', () => {
    it('lista casos ordenados por nivel', () => {
      eval_.addBenchmarkCase({ name: 'a', level: 5, task: 't', successCriteria: 's' });
      eval_.addBenchmarkCase({ name: 'b', level: 1, task: 't', successCriteria: 's' });
      const list = eval_.listCases();
      expect(list[0].level).toBe(1);
      expect(list[1].level).toBe(5);
    });

    it('filtra por nivel', () => {
      eval_.addBenchmarkCase({ name: 'a', level: 3, task: 't', successCriteria: 's' });
      eval_.addBenchmarkCase({ name: 'b', level: 5, task: 't', successCriteria: 's' });
      expect(eval_.listCases({ level: 3 })).toHaveLength(1);
    });
  });

  describe('recordResult', () => {
    it('registra resultado con métricas directas', () => {
      const c = eval_.addBenchmarkCase({ name: 'x', level: 1, task: 't', successCriteria: 's' });
      const r = eval_.recordResult({
        caseId: c.id,
        configuration: Configuration.RUNTIME_FULL,
        metrics: {
          [Metric.SUCCESS]: true,
          [Metric.TOKENS]: 1000,
          [Metric.RAM_MB]: 512,
          [Metric.VRAM_MB]: 0,
          [Metric.LATENCY_MS]: 5000,
          [Metric.RETRIES]: 1,
        },
      });
      expect(r.metrics[Metric.TOKENS]).toBe(1000);
      expect(r.metrics[Metric.SUCCESS]).toBe(true);
    });

    it('rechaza configuración desconocida', () => {
      const c = eval_.addBenchmarkCase({ name: 'x', level: 1, task: 't', successCriteria: 's' });
      expect(() =>
        eval_.recordResult({ caseId: c.id, configuration: 'unknown', metrics: {} }),
      ).toThrow();
    });

    it('rechaza caso inexistente', () => {
      expect(() =>
        eval_.recordResult({
          caseId: 'nope',
          configuration: Configuration.CLAUDE_CODE,
          metrics: {},
        }),
      ).toThrow();
    });

    it('extrae métricas de una traza de Observability', () => {
      const obs = new ObservabilityService();
      const evalObs = new EvaluationService({ observability: obs });
      const c = evalObs.addBenchmarkCase({ name: 'x', level: 5, task: 't', successCriteria: 's' });
      const traceId = obs.startTrace({ task: 't', modelId: 'deepseek' });
      obs.recordStep(traceId, { type: 'model_call', tokensIn: 500, tokensOut: 300 });
      obs.recordStep(traceId, { type: 'retry' });
      obs.endTrace(traceId, TraceStatus.COMPLETED);
      const r = evalObs.recordResult({
        caseId: c.id,
        configuration: Configuration.RUNTIME_FULL,
        traceId,
      });
      expect(r.metrics[Metric.TOKENS]).toBe(800);
      expect(r.metrics[Metric.RETRIES]).toBe(1);
      expect(r.metrics[Metric.SUCCESS]).toBe(true);
    });
  });

  describe('compare', () => {
    it('compara configuraciones por caso', () => {
      const c = eval_.addBenchmarkCase({ name: 'x', level: 5, task: 't', successCriteria: 's' });
      eval_.recordResult({
        caseId: c.id,
        configuration: Configuration.CLAUDE_CODE,
        metrics: {
          [Metric.SUCCESS]: true,
          [Metric.TOKENS]: 2000,
          [Metric.LATENCY_MS]: 3000,
          [Metric.RETRIES]: 0,
          [Metric.RAM_MB]: 0,
          [Metric.VRAM_MB]: 0,
        },
      });
      eval_.recordResult({
        caseId: c.id,
        configuration: Configuration.DEEPSEEK_HARNESS,
        metrics: {
          [Metric.SUCCESS]: false,
          [Metric.TOKENS]: 3000,
          [Metric.LATENCY_MS]: 5000,
          [Metric.RETRIES]: 2,
          [Metric.RAM_MB]: 0,
          [Metric.VRAM_MB]: 0,
        },
      });
      const cmp = eval_.compare({ caseId: c.id });
      expect(cmp.configurations[Configuration.CLAUDE_CODE].successRate).toBe(1);
      expect(cmp.configurations[Configuration.DEEPSEEK_HARNESS].successRate).toBe(0);
      expect(cmp.configurations[Configuration.CLAUDE_CODE].avgTokens).toBe(2000);
    });

    it('compare sin caseId agrega todo', () => {
      const c1 = eval_.addBenchmarkCase({ name: 'x', level: 1, task: 't', successCriteria: 's' });
      const c2 = eval_.addBenchmarkCase({ name: 'y', level: 2, task: 't', successCriteria: 's' });
      eval_.recordResult({
        caseId: c1.id,
        configuration: Configuration.RUNTIME_FULL,
        metrics: {
          [Metric.SUCCESS]: true,
          [Metric.TOKENS]: 100,
          [Metric.LATENCY_MS]: 1000,
          [Metric.RETRIES]: 0,
          [Metric.RAM_MB]: 0,
          [Metric.VRAM_MB]: 0,
        },
      });
      eval_.recordResult({
        caseId: c2.id,
        configuration: Configuration.RUNTIME_FULL,
        metrics: {
          [Metric.SUCCESS]: false,
          [Metric.TOKENS]: 200,
          [Metric.LATENCY_MS]: 2000,
          [Metric.RETRIES]: 1,
          [Metric.RAM_MB]: 0,
          [Metric.VRAM_MB]: 0,
        },
      });
      const cmp = eval_.compare();
      expect(cmp.configurations[Configuration.RUNTIME_FULL].count).toBe(2);
      expect(cmp.configurations[Configuration.RUNTIME_FULL].successRate).toBe(0.5);
      expect(cmp.configurations[Configuration.RUNTIME_FULL].avgTokens).toBe(150);
    });
  });

  describe('score', () => {
    it('devuelve un score compuesto', () => {
      const c = eval_.addBenchmarkCase({ name: 'x', level: 1, task: 't', successCriteria: 's' });
      eval_.recordResult({
        caseId: c.id,
        configuration: Configuration.CLAUDE_CODE,
        metrics: {
          [Metric.SUCCESS]: true,
          [Metric.TOKENS]: 1000,
          [Metric.LATENCY_MS]: 1000,
          [Metric.RETRIES]: 0,
          [Metric.RAM_MB]: 0,
          [Metric.VRAM_MB]: 0,
        },
      });
      const s = eval_.score(Configuration.CLAUDE_CODE, { caseId: c.id });
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
    });

    it('devuelve null si no hay datos', () => {
      expect(eval_.score(Configuration.CLAUDE_CODE)).toBeNull();
    });
  });

  describe('clearResults / stats', () => {
    it('clearResults vacía resultados', () => {
      const c = eval_.addBenchmarkCase({ name: 'x', level: 1, task: 't', successCriteria: 's' });
      eval_.recordResult({ caseId: c.id, configuration: Configuration.CLAUDE_CODE, metrics: {} });
      eval_.clearResults();
      expect(eval_.stats().results).toBe(0);
    });
  });
});
