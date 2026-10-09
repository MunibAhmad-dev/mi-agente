/**
 * observabilityService.spec.js — Fase 13: Observability (Trace + Replay).
 */

const { TraceEventType, TraceStatus, ObservabilityService } = require('../observabilityService');

describe('observabilityService (Fase 13 — Observability)', () => {
  let obs;
  beforeEach(() => {
    obs = new ObservabilityService();
  });

  describe('startTrace / recordStep / endTrace', () => {
    it('inicia una traza con modelo e input', () => {
      const id = obs.startTrace({ task: 'fix bug', modelId: 'deepseek', input: { file: 'a.js' } });
      const t = obs.getTrace(id);
      expect(t.trace.task).toBe('fix bug');
      expect(t.trace.modelId).toBe('deepseek');
      expect(t.trace.status).toBe(TraceStatus.RUNNING);
    });

    it('recordStep registra un evento y acumula totales', () => {
      const id = obs.startTrace({ task: 't', modelId: 'm' });
      obs.recordStep(id, { type: TraceEventType.MODEL_CALL, tokensIn: 100, tokensOut: 50 });
      obs.recordStep(id, { type: TraceEventType.TOOL_CALL, tool: 'read_file' });
      obs.recordStep(id, { type: TraceEventType.ERROR, error: 'oops' });
      const t = obs.getTrace(id);
      expect(t.steps).toHaveLength(3);
      expect(t.trace.totals.tokensIn).toBe(100);
      expect(t.trace.totals.tokensOut).toBe(50);
      expect(t.trace.totals.toolCalls).toBe(1);
      expect(t.trace.totals.errors).toBe(1);
    });

    it('recordStep registra retries y resource (RAM/VRAM)', () => {
      const id = obs.startTrace({ task: 't', modelId: 'm' });
      obs.recordStep(id, { type: TraceEventType.RETRY });
      obs.recordStep(id, { type: TraceEventType.RESOURCE, ramMb: 512, vramMb: 1024 });
      const t = obs.getTrace(id);
      expect(t.trace.totals.retries).toBe(1);
      expect(t.trace.totals.peakRamMb).toBe(512);
      expect(t.trace.totals.peakVramMb).toBe(1024);
    });

    it('endTrace finaliza con status y duration', () => {
      const id = obs.startTrace({ task: 't', modelId: 'm' });
      const t = obs.endTrace(id, TraceStatus.COMPLETED);
      expect(t.status).toBe(TraceStatus.COMPLETED);
      expect(t.endedAt).toBeDefined();
      expect(t.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('recordStep lanza si la traza no existe', () => {
      expect(() => obs.recordStep('nope', {})).toThrow();
    });
  });

  describe('getTrace / listTraces', () => {
    it('getTrace devuelve null si no existe', () => {
      expect(obs.getTrace('nope')).toBeNull();
    });

    it('listTraces filtra por status', () => {
      const id1 = obs.startTrace({ task: 't1', modelId: 'm' });
      obs.startTrace({ task: 't2', modelId: 'm' });
      obs.endTrace(id1, TraceStatus.COMPLETED);
      const completed = obs.listTraces({ status: TraceStatus.COMPLETED });
      expect(completed).toHaveLength(1);
      expect(completed[0].task).toBe('t1');
    });

    it('listTraces filtra por modelId', () => {
      obs.startTrace({ task: 't1', modelId: 'deepseek' });
      obs.startTrace({ task: 't2', modelId: 'claude' });
      const ds = obs.listTraces({ modelId: 'deepseek' });
      expect(ds).toHaveLength(1);
      expect(ds[0].modelId).toBe('deepseek');
    });

    it('listTraces ordena por startedAt descendente', () => {
      obs.startTrace({ task: 'old', modelId: 'm' });
      obs.startTrace({ task: 'new', modelId: 'm' });
      const list = obs.listTraces();
      expect(list[0].task).toBe('new');
    });
  });

  describe('replay', () => {
    it('crea una traza de replay con otro modelo', () => {
      const id = obs.startTrace({ task: 'fix', modelId: 'deepseek', input: { x: 1 } });
      obs.endTrace(id);
      const replay = obs.replay(id, 'claude');
      expect(replay.replayTraceId).toBeDefined();
      expect(replay.modelId).toBe('claude');
      expect(replay.task).toBe('fix');
      expect(replay.input).toEqual({ x: 1 });
    });

    it('marca la traza original como replayed', () => {
      const id = obs.startTrace({ task: 'fix', modelId: 'm' });
      obs.endTrace(id);
      obs.replay(id, 'claude');
      expect(obs.getTrace(id).trace.status).toBe(TraceStatus.REPLAYED);
    });

    it('replay lanza si la traza original no existe', () => {
      expect(() => obs.replay('nope', 'claude')).toThrow();
    });
  });

  describe('compareTraces', () => {
    it('compara métricas de dos trazas', () => {
      const a = obs.startTrace({ task: 't', modelId: 'deepseek' });
      obs.recordStep(a, { type: TraceEventType.MODEL_CALL, tokensIn: 100, tokensOut: 50 });
      obs.recordStep(a, { type: TraceEventType.ERROR });
      obs.endTrace(a);

      const b = obs.startTrace({ task: 't', modelId: 'claude' });
      obs.recordStep(b, { type: TraceEventType.MODEL_CALL, tokensIn: 200, tokensOut: 100 });
      obs.endTrace(b);

      const cmp = obs.compareTraces(a, b);
      expect(cmp.modelA).toBe('deepseek');
      expect(cmp.modelB).toBe('claude');
      expect(cmp.tokensA).toBe(150);
      expect(cmp.tokensB).toBe(300);
      expect(cmp.errorsA).toBe(1);
      expect(cmp.errorsB).toBe(0);
    });

    it('compareTraces lanza si una traza no existe', () => {
      const a = obs.startTrace({ task: 't', modelId: 'm' });
      expect(() => obs.compareTraces(a, 'nope')).toThrow();
    });
  });

  describe('clear / stats', () => {
    it('clear vacía todo', () => {
      obs.startTrace({ task: 't', modelId: 'm' });
      obs.clear();
      expect(obs.stats().total).toBe(0);
    });
  });
});
