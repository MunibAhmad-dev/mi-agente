/**
 * optimizationService.spec.js — Fase 15: Optimización.
 */

const {
  OptimizationDimension,
  DEFAULT_BUDGETS,
  OptimizationService,
} = require('../optimizationService');
const { ObservabilityService, TraceStatus } = require('../../Observability/observabilityService');

describe('optimizationService (Fase 15 — Optimización)', () => {
  describe('collectMetrics', () => {
    it('sin observability devuelve hasData false', () => {
      const opt = new OptimizationService({});
      expect(opt.collectMetrics().hasData).toBe(false);
    });

    it('sin trazas devuelve hasData false', () => {
      const obs = new ObservabilityService();
      const opt = new OptimizationService({ observability: obs });
      expect(opt.collectMetrics().hasData).toBe(false);
    });

    it('agrega métricas de trazas recientes', () => {
      const obs = new ObservabilityService();
      const id = obs.startTrace({ task: 't', modelId: 'm' });
      obs.recordStep(id, { type: 'model_call', tokensIn: 1000, tokensOut: 500 });
      obs.recordStep(id, { type: 'resource', ramMb: 1024, vramMb: 2048 });
      obs.endTrace(id, TraceStatus.COMPLETED);
      const opt = new OptimizationService({ observability: obs });
      const m = opt.collectMetrics();
      expect(m.hasData).toBe(true);
      expect(m.count).toBe(1);
      expect(m.avgTokens).toBe(1500);
      expect(m.avgPeakRamMb).toBe(1024);
      expect(m.successRate).toBe(1);
    });
  });

  describe('recommend', () => {
    it('sin datos mantiene config actual', () => {
      const opt = new OptimizationService({});
      const r = opt.recommend();
      expect(r.hasData).toBe(false);
      expect(r.proposed).toEqual(opt.current);
    });

    it('recomienda reducir contexto si uso de tokens bajo', () => {
      const opt = new OptimizationService({});
      const metrics = {
        hasData: true,
        count: 10,
        avgTokens: 5000,
        avgLatencyMs: 5000,
        avgPeakRamMb: 500,
        avgPeakVramMb: 1000,
        avgRetries: 0,
        successRate: 1,
      };
      const r = opt.recommend(metrics);
      expect(r.recommendations[OptimizationDimension.CONTEXT]).toBeDefined();
      expect(r.recommendations[OptimizationDimension.CONTEXT].recommended).toBeLessThan(
        opt.current.maxContextTokens,
      );
    });

    it('recomienda ampliar contexto si uso de tokens alto', () => {
      const opt = new OptimizationService({});
      const metrics = {
        hasData: true,
        count: 10,
        avgTokens: 30000,
        avgLatencyMs: 5000,
        avgPeakRamMb: 500,
        avgPeakVramMb: 1000,
        avgRetries: 0,
        successRate: 1,
      };
      const r = opt.recommend(metrics);
      expect(r.recommendations[OptimizationDimension.CONTEXT].recommended).toBeGreaterThan(
        opt.current.maxContextTokens,
      );
    });

    it('recomienda reducir paralelismo si latencia cercana a timeout', () => {
      const opt = new OptimizationService({});
      const metrics = {
        hasData: true,
        count: 10,
        avgTokens: 1000,
        avgLatencyMs: 28000,
        avgPeakRamMb: 500,
        avgPeakVramMb: 1000,
        avgRetries: 0,
        successRate: 1,
      };
      const r = opt.recommend(metrics);
      expect(r.recommendations[OptimizationDimension.PARALLELISM]).toBeDefined();
      expect(r.recommendations[OptimizationDimension.PARALLELISM].recommended).toBeLessThan(
        opt.current.maxParallelAgents,
      );
    });

    it('recomienda aumentar paralelismo si latencia baja y success alto', () => {
      const opt = new OptimizationService({});
      const metrics = {
        hasData: true,
        count: 10,
        avgTokens: 1000,
        avgLatencyMs: 5000,
        avgPeakRamMb: 500,
        avgPeakVramMb: 1000,
        avgRetries: 0,
        successRate: 0.9,
      };
      const r = opt.recommend(metrics);
      expect(r.recommendations[OptimizationDimension.PARALLELISM].recommended).toBeGreaterThan(
        opt.current.maxParallelAgents,
      );
    });

    it('recomienda ampliar RAM si peak cercano a budget', () => {
      const opt = new OptimizationService({});
      const metrics = {
        hasData: true,
        count: 10,
        avgTokens: 1000,
        avgLatencyMs: 5000,
        avgPeakRamMb: 1800,
        avgPeakVramMb: 1000,
        avgRetries: 0,
        successRate: 1,
      };
      const r = opt.recommend(metrics);
      expect(r.recommendations[OptimizationDimension.RAM]).toBeDefined();
      expect(r.recommendations[OptimizationDimension.RAM].recommended).toBeGreaterThan(
        opt.current.ramBudgetMb,
      );
    });

    it('recomienda ampliar VRAM si peak cercano a budget', () => {
      const opt = new OptimizationService({});
      const metrics = {
        hasData: true,
        count: 10,
        avgTokens: 1000,
        avgLatencyMs: 5000,
        avgPeakRamMb: 500,
        avgPeakVramMb: 3700,
        avgRetries: 0,
        successRate: 1,
      };
      const r = opt.recommend(metrics);
      expect(r.recommendations[OptimizationDimension.VRAM].recommended).toBeGreaterThan(
        opt.current.vramBudgetMb,
      );
    });

    it('recomienda más tokens si retries altos (sin recomendación de contexto)', () => {
      const opt = new OptimizationService({});
      // avgTokens en zona neutra (0.3-0.8) para que NO recomiende contexto,
      // dejando que la rama de retries actúe.
      const metrics = {
        hasData: true,
        count: 10,
        avgTokens: 15000,
        avgLatencyMs: 5000,
        avgPeakRamMb: 500,
        avgPeakVramMb: 1000,
        avgRetries: 5,
        successRate: 1,
      };
      const r = opt.recommend(metrics);
      expect(r.recommendations[OptimizationDimension.TOKENS]).toBeDefined();
      expect(r.recommendations[OptimizationDimension.TOKENS].recommended).toBeGreaterThan(
        opt.current.maxContextTokens,
      );
    });
  });

  describe('apply', () => {
    it('aplica una config propuesta', () => {
      const opt = new OptimizationService({});
      opt.apply({ maxParallelAgents: 3 });
      expect(opt.current.maxParallelAgents).toBe(3);
    });
  });

  describe('validate', () => {
    it('rechaza config que excede budgets', () => {
      const opt = new OptimizationService({});
      const v = opt.validate({ maxContextTokens: 999999, ramBudgetMb: 999999 });
      expect(v.valid).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
    });

    it('acepta config dentro de budgets', () => {
      const opt = new OptimizationService({});
      const v = opt.validate({ maxContextTokens: 64000, ramBudgetMb: 2048 });
      expect(v.valid).toBe(true);
    });

    it('rechaza paralelismo fuera de rango', () => {
      const opt = new OptimizationService({});
      expect(opt.validate({ maxParallelAgents: 0 }).valid).toBe(false);
      expect(opt.validate({ maxParallelAgents: 100 }).valid).toBe(false);
      expect(opt.validate({ maxParallelAgents: 2 }).valid).toBe(true);
    });
  });

  describe('setBudgets', () => {
    it('actualiza budgets', () => {
      const opt = new OptimizationService({});
      opt.setBudgets({ maxRamMb: 8192 });
      expect(opt.budgets.maxRamMb).toBe(8192);
    });
  });

  describe('DEFAULT_BUDGETS', () => {
    it('tiene todos los campos', () => {
      expect(DEFAULT_BUDGETS.maxRamMb).toBeDefined();
      expect(DEFAULT_BUDGETS.maxVramMb).toBeDefined();
      expect(DEFAULT_BUDGETS.maxContextTokens).toBeDefined();
      expect(DEFAULT_BUDGETS.maxLatencyMs).toBeDefined();
      expect(DEFAULT_BUDGETS.maxParallelAgents).toBeDefined();
    });
  });
});
