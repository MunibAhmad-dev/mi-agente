/**
 * observabilityService.js — Fase 13 (Observability): Agent Trace + Agent Replay.
 *
 * Agent Trace (doc §13): registra cada step del agente con modelo, tokens,
 * tools, RAM, VRAM, errors, retries. Extiende la telemetría existente con
 * un modelo estructurado de traza reproducible.
 *
 * Agent Replay (doc §13): reproducir la misma tarea con otro modelo para
 * comparar resultados. Guarda el input + steps originales y permite
 * re-ejecutar con un modelo distinto.
 *
 * Almacenamiento: en memoria (Map). El doc menciona SQLite; este módulo
 * expone la misma API — el backend de persistencia es intercambiable.
 */

const TraceEventType = Object.freeze({
  MODEL_CALL: 'model_call',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  ERROR: 'error',
  RETRY: 'retry',
  CHECKPOINT: 'checkpoint',
  DECISION: 'decision',
  RESOURCE: 'resource', // RAM/VRAM snapshot
});

const TraceStatus = Object.freeze({
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REPLAYED: 'replayed',
});

let _traceCounter = 0;
function nextTraceId() {
  _traceCounter += 1;
  return `trace_${Date.now()}_${_traceCounter}`;
}

/**
 * ObservabilityService: trazas de ejecución del agente + replay.
 */
class ObservabilityService {
  constructor() {
    this.traces = new Map(); // traceId -> Trace
    this.steps = new Map(); // traceId -> Step[]
    this.maxTraces = 1000;
  }

  /**
   * Inicia una traza para una tarea.
   * @param {object} params
   * @returns {string} traceId
   */
  startTrace({ task, modelId, input, metadata = {} }) {
    const traceId = nextTraceId();
    const trace = {
      traceId,
      task,
      modelId,
      input,
      status: TraceStatus.RUNNING,
      startedAt: Date.now(),
      endedAt: null,
      metadata,
      totals: {
        tokensIn: 0,
        tokensOut: 0,
        toolCalls: 0,
        errors: 0,
        retries: 0,
        peakRamMb: 0,
        peakVramMb: 0,
      },
    };
    this.traces.set(traceId, trace);
    this.steps.set(traceId, []);
    this._evict();
    return traceId;
  }

  /**
   * Registra un step/event en la traza.
   * @param {string} traceId
   * @param {object} event - { type, modelId?, tokensIn?, tokensOut?, tool?,
   *   result?, error?, retryOf?, ramMb?, vramMb? }
   */
  recordStep(traceId, event) {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`traza no encontrada: ${traceId}`);
    }
    const step = {
      stepIndex: (this.steps.get(traceId) || []).length,
      timestamp: Date.now(),
      ...event,
    };
    this.steps.get(traceId).push(step);

    // Acumular totales
    const t = trace.totals;
    if (event.tokensIn) t.tokensIn += event.tokensIn;
    if (event.tokensOut) t.tokensOut += event.tokensOut;
    if (event.type === TraceEventType.TOOL_CALL) t.toolCalls += 1;
    if (event.type === TraceEventType.ERROR) t.errors += 1;
    if (event.type === TraceEventType.RETRY) t.retries += 1;
    if (event.ramMb && event.ramMb > t.peakRamMb) t.peakRamMb = event.ramMb;
    if (event.vramMb && event.vramMb > t.peakVramMb) t.peakVramMb = event.vramMb;
  }

  /** Finaliza una traza. */
  endTrace(traceId, status = TraceStatus.COMPLETED) {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return null;
    }
    trace.status = status;
    trace.endedAt = Date.now();
    trace.durationMs = trace.endedAt - trace.startedAt;
    return trace;
  }

  /** Devuelve la traza completa con sus steps. */
  getTrace(traceId) {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return null;
    }
    return { trace, steps: this.steps.get(traceId) || [] };
  }

  /** Lista trazas (opcionalmente filtradas por status/model). */
  listTraces({ status, modelId } = {}) {
    let result = Array.from(this.traces.values());
    if (status) {
      result = result.filter((t) => t.status === status);
    }
    if (modelId) {
      result = result.filter((t) => t.modelId === modelId);
    }
    return result.sort((a, b) => {
      if (b.startedAt !== a.startedAt) {
        return b.startedAt - a.startedAt;
      }
      // desempate: traceId con contador incremental (más reciente = mayor)
      return b.traceId < a.traceId ? 1 : -1;
    });
  }

  /**
   * Agent Replay: reproduce una tarea con otro modelo.
   * Devuelve un descriptor de replay (input original + modelo nuevo) listo
   * para re-ejecutar. El servicio no ejecuta el LLM; registra la traza de
   * replay cuando se complete.
   * @param {string} originalTraceId
   * @param {string} newModelId
   * @returns {object} { replayTraceId, task, input, modelId }
   */
  replay(originalTraceId, newModelId) {
    const original = this.traces.get(originalTraceId);
    if (!original) {
      throw new Error(`traza original no encontrada: ${originalTraceId}`);
    }
    const replayTraceId = this.startTrace({
      task: original.task,
      modelId: newModelId,
      input: original.input,
      metadata: { ...original.metadata, replayOf: originalTraceId },
    });
    // Marcar la traza original como replayed
    original.status = TraceStatus.REPLAYED;
    return {
      replayTraceId,
      task: original.task,
      input: original.input,
      modelId: newModelId,
    };
  }

  /** Compara dos trazas (original vs replay) por métricas. */
  compareTraces(traceIdA, traceIdB) {
    const a = this.traces.get(traceIdA);
    const b = this.traces.get(traceIdB);
    if (!a || !b) {
      throw new Error('traza no encontrada para comparar');
    }
    return {
      taskA: a.task,
      taskB: b.task,
      modelA: a.modelId,
      modelB: b.modelId,
      tokensA: a.totals.tokensIn + a.totals.tokensOut,
      tokensB: b.totals.tokensIn + b.totals.tokensOut,
      durationA: a.durationMs,
      durationB: b.durationMs,
      errorsA: a.totals.errors,
      errorsB: b.totals.errors,
      toolCallsA: a.totals.toolCalls,
      toolCallsB: b.totals.toolCalls,
      peakRamA: a.totals.peakRamMb,
      peakRamB: b.totals.peakRamMb,
    };
  }

  /** Limpia trazas. */
  clear() {
    this.traces.clear();
    this.steps.clear();
  }

  /** Estadísticas. */
  stats() {
    return { total: this.traces.size };
  }

  _evict() {
    if (this.traces.size > this.maxTraces) {
      const oldest = Array.from(this.traces.values()).sort((a, b) => a.startedAt - b.startedAt)[0];
      this.traces.delete(oldest.traceId);
      this.steps.delete(oldest.traceId);
    }
  }
}

module.exports = {
  TraceEventType,
  TraceStatus,
  ObservabilityService,
};
