# PHASE13_OBSERVABILITY.md — Fase 13: Observability (Trace + Replay)

> **Estado:** FASE 13 — COMPLETADA.
> **Extiende:** telemetría existente + OpenTelemetry (este módulo añade el
> modelo estructurado de traza reproducible).

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/Observability/observabilityService.js` | Agent Trace + Agent Replay |
| `services/Observability/__tests__/observabilityService.spec.js` | 15 tests |

### Agent Trace (doc §13)
Cada traza registra modelo/tokens/tools/RAM/VRAM/errors/retries:
- `startTrace({ task, modelId, input })` → traceId.
- `recordStep(traceId, event)` → eventos: MODEL_CALL, TOOL_CALL,
  TOOL_RESULT, ERROR, RETRY, CHECKPOINT, DECISION, RESOURCE (RAM/VRAM).
- Acumula totales: tokensIn, tokensOut, toolCalls, errors, retries,
  peakRamMb, peakVramMb.
- `endTrace(traceId, status)` → duration, status (RUNNING/COMPLETED/FAILED/
  REPLAYED).

### Agent Replay (doc §13)
Reproducir la misma tarea con otro modelo:
- `replay(originalTraceId, newModelId)` → crea una traza nueva con el mismo
  input/task pero modelo distinto. Marca la original como REPLAYED.
- `compareTraces(a, b)` → compara métricas (tokens, duration, errors,
  toolCalls, peakRam) entre original y replay.

### API
- `getTrace(id)` → `{ trace, steps }`.
- `listTraces({ status, modelId })` → filtradas y ordenadas.
- `clear()` / `stats()`.

### Tipos
- `TraceEventType`: MODEL_CALL, TOOL_CALL, TOOL_RESULT, ERROR, RETRY,
  CHECKPOINT, DECISION, RESOURCE.
- `TraceStatus`: RUNNING, COMPLETED, FAILED, REPLAYED.

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §13 | Agent Trace (modelo/tokens/tools/RAM/VRAM/errors/retries) | ✓ |
| §13 | Agent Replay (reproducir con otro modelo) | ✓ replay() |
| §13 | Extiende telemetría + OTel | ✓ modelo estructurado |

## 3. Gate de Fase 13

| Criterio | Estado |
|---|---|
| Implementación | ✓ trace + replay + compare |
| Tests | ✓ 15/15 pasan |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 14 (Evaluation + Benchmark).
