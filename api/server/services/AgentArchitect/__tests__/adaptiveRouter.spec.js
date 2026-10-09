/**
 * adaptiveRouter.spec.js — Fase 12: Adaptive Model Router.
 */

const { ModelMetrics, AdaptiveModelRouter, ADAPTIVE_WEIGHTS } = require('../adaptiveRouter');

/** Registry fake que implementa findByCapabilities (no es mock de módulo). */
function fakeRegistry(candidatesByCaps) {
  return {
    findByCapabilities: (caps) => candidatesByCaps[caps.join(',')] || [],
  };
}

describe('adaptiveRouter (Fase 12 — Adaptive Model Router)', () => {
  describe('ModelMetrics', () => {
    it('registra llamadas y calcula success rate', () => {
      const m = new ModelMetrics();
      m.record({ modelId: 'deepseek', success: true, latencyMs: 100 });
      m.record({ modelId: 'deepseek', success: false, latencyMs: 200 });
      const r = m.get('deepseek');
      expect(r.calls).toBe(2);
      expect(r.successRate).toBe(0.5);
      expect(r.avgLatencyMs).toBe(150);
      expect(r.hasData).toBe(true);
    });

    it('modelo sin datos devuelve successRate 1 (optimista)', () => {
      const m = new ModelMetrics();
      const r = m.get('unknown');
      expect(r.hasData).toBe(false);
      expect(r.successRate).toBe(1);
    });

    it('reset limpia métricas', () => {
      const m = new ModelMetrics();
      m.record({ modelId: 'a', success: true, latencyMs: 100 });
      m.reset('a');
      expect(m.get('a').hasData).toBe(false);
    });
  });

  describe('AdaptiveModelRouter.select', () => {
    it('override manual fuerza un modelo', () => {
      const router = new AdaptiveModelRouter({ registry: fakeRegistry({}) });
      const r = router.select({ capabilities: ['code'], overrideModelId: 'claude' });
      expect(r.modelId).toBe('claude');
      expect(r.reason).toContain('override manual');
    });

    it('override por capability set', () => {
      const router = new AdaptiveModelRouter({ registry: fakeRegistry({}) });
      router.setOverride(['code'], 'gpt');
      const r = router.select({ capabilities: ['code'] });
      expect(r.modelId).toBe('gpt');
    });

    it('selecciona por capability usando el registry', () => {
      const registry = fakeRegistry({
        code: [
          { modelId: 'deepseek', matchScore: 0.9 },
          { modelId: 'claude', matchScore: 0.8 },
        ],
      });
      const router = new AdaptiveModelRouter({ registry });
      const r = router.select({ capabilities: ['code'] });
      expect(r.modelId).toBe('deepseek'); // mayor matchScore
      expect(r.candidates.length).toBe(2);
    });

    it('métricas runtime reordenan candidatos', () => {
      const registry = fakeRegistry({
        code: [
          { modelId: 'deepseek', matchScore: 0.9 },
          { modelId: 'claude', matchScore: 0.85 },
        ],
      });
      const router = new AdaptiveModelRouter({ registry });
      // deepseek falla mucho → baja su score; claude tiene éxito
      for (let i = 0; i < 5; i++) {
        router.recordCall({ modelId: 'deepseek', success: false, latencyMs: 5000 });
      }
      for (let i = 0; i < 5; i++) {
        router.recordCall({ modelId: 'claude', success: true, latencyMs: 100 });
      }
      const r = router.select({ capabilities: ['code'] });
      // deepseek en cooldown (success <0.5, calls>=3) → claude gana
      expect(r.modelId).toBe('claude');
    });

    it('latencia menor sube el score', () => {
      const registry = fakeRegistry({
        code: [
          { modelId: 'a', matchScore: 0.8 },
          { modelId: 'b', matchScore: 0.8 },
        ],
      });
      const router = new AdaptiveModelRouter({ registry });
      router.recordCall({ modelId: 'a', success: true, latencyMs: 5000 });
      router.recordCall({ modelId: 'b', success: true, latencyMs: 100 });
      const r = router.select({ capabilities: ['code'] });
      expect(r.modelId).toBe('b'); // menor latencia
    });

    it('sin candidatos devuelve modelId null', () => {
      const router = new AdaptiveModelRouter({ registry: fakeRegistry({}) });
      const r = router.select({ capabilities: ['vision'] });
      expect(r.modelId).toBeNull();
      expect(r.reason).toContain('sin candidatos');
    });

    it('lanza si no hay registry', () => {
      const router = new AdaptiveModelRouter({});
      expect(() => router.select({ capabilities: ['code'] })).toThrow();
    });

    it('cooldown excluye modelos con alto fallo', () => {
      const registry = fakeRegistry({
        code: [
          { modelId: 'bad', matchScore: 0.95 },
          { modelId: 'good', matchScore: 0.7 },
        ],
      });
      const router = new AdaptiveModelRouter({ registry });
      // bad: 4 fallos de 5 → success 0.2 → cooldown
      router.recordCall({ modelId: 'bad', success: true, latencyMs: 100 });
      for (let i = 0; i < 4; i++) {
        router.recordCall({ modelId: 'bad', success: false, latencyMs: 100 });
      }
      const r = router.select({ capabilities: ['code'] });
      expect(r.modelId).toBe('good');
      // bad no aparece (filtrado por cooldown)
      expect(r.candidates.find((c) => c.modelId === 'bad')).toBeUndefined();
    });
  });

  describe('ADAPTIVE_WEIGHTS', () => {
    it('los pesos suman 1', () => {
      const sum = Object.values(ADAPTIVE_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(0.001);
    });
  });

  describe('clearOverride', () => {
    it('limpia un override', () => {
      const registry = fakeRegistry({
        code: [{ modelId: 'deepseek', matchScore: 0.9 }],
      });
      const router = new AdaptiveModelRouter({ registry });
      router.setOverride(['code'], 'claude');
      expect(router.select({ capabilities: ['code'] }).modelId).toBe('claude');
      router.clearOverride(['code']);
      expect(router.select({ capabilities: ['code'] }).modelId).toBe('deepseek');
    });
  });
});
