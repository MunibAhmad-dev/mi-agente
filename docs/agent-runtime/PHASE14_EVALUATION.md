# PHASE14_EVALUATION.md — Fase 14: Evaluation + Benchmark

> **Estado:** FASE 14 — COMPLETADA.
> **Consume:** ObservabilityService (Fase 13) para extraer métricas de trazas.

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/Evaluation/evaluationService.js` | Framework de evaluación + benchmark |
| `services/Evaluation/__tests__/evaluationService.spec.js` | 14 tests |

### Niveles de dificultad 1-10 (doc §14)
| Nivel | Descripción |
|---|---|
| 1 | Trivial: cambio sintáctico en un archivo |
| 2 | Simple: lógica en un archivo |
| 3 | Multi-archivo básico (2-3) |
| 4 | Multi-archivo con dependencias |
| 5 | Refactor preservando comportamiento |
| 6 | Feature nueva en módulo existente |
| 7 | Cross-module |
| 8 | Cambio arquitectural |
| 9 | Bug complejo: reproducir + fix |
| 10 | Problema novedoso sin precedentes |

### Configuraciones comparables (doc §14)
- `CLAUDE_CODE` — Claude Code como referencia.
- `DEEPSEEK_HARNESS` — DeepSeek + harness mínimo (sin runtime completo).
- `RUNTIME_FULL` — DeepSeek + runtime completo (este harness).

### Métricas (doc §14)
SUCCESS, TOKENS, RAM_MB, VRAM_MB, LATENCY_MS, RETRIES.

### API
- `addBenchmarkCase({ name, level, task, successCriteria, setup })` → caso.
- `recordResult({ caseId, configuration, metrics, traceId })` — acepta
  métricas directas O extrae de una traza de Observability (Fase 13).
- `compare({ caseId })` — agregados promedio por configuración.
- `score(configuration, { caseId })` — score compuesto:
  `0.5*successRate + 0.2*tokenEff + 0.2*latencyEff + 0.1*retryPenalty`.

### Comparación reproducible (regla del doc)
Cada caso + configuración + métricas se registra con timestamp y traceId,
permitiendo reproducir y comparar Claude Code vs DeepSeek+harness vs
Runtime completo de forma determinista.

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §14 | Niveles 1-10 | ✓ BenchmarkLevel |
| §14 | Métricas (success/tokens/RAM/VRAM/latency/retries) | ✓ Metric |
| §14 | Comparación reproducible (3 configs) | ✓ Configuration + compare + score |
| §14 | Consume telemetría | ✓ extrae de trace de Fase 13 |

## 3. Gate de Fase 14

| Criterio | Estado |
|---|---|
| Implementación | ✓ niveles + métricas + comparación + score |
| Tests | ✓ 14/14 pasan |
| Consume Fase 13 | ✓ Observability |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 15 (Optimización).
