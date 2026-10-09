# PHASE15_OPTIMIZATION.md — Fase 15: Optimización

> **Estado:** FASE 15 — COMPLETADA.
> **Consume:** ObservabilityService (Fase 13) para recolectar métricas.

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/Optimization/optimizationService.js` | Tuner de parámetros de rendimiento |
| `services/Optimization/__tests__/optimizationService.spec.js` | 17 tests |

### Dimensiones optimizables (doc §15)
| Dimensión | Parámetro | Ajuste |
|---|---|---|
| RAM | `ramBudgetMb` | peak > 80% budget → ampliar; < 30% → reducir |
| VRAM | `vramBudgetMb` | peak > 80% budget → ampliar |
| tokens | `maxContextTokens` | uso < 30% → reducir; > 80% → ampliar |
| latency | `latencyTimeoutMs` | latencia > timeout → ampliar |
| contexto | `maxContextTokens` | (alias de tokens) |
| paralelismo | `maxParallelAgents` | latencia alta → reducir; baja+success → aumentar |

### Algoritmo de recomendación (`recommend`)
Recolecta métricas agregadas de las últimas N trazas (Fase 13):
avgTokens, avgLatencyMs, avgPeakRamMb, avgPeakVramMb, avgRetries, successRate.

Produce recomendaciones por dimensión con `current`, `recommended`, `reason`.
Si hay muchos retries (>2) y no hay recomendación de contexto, sugiere más
tokens (más contexto reduce reintentos).

### API
- `collectMetrics(limit)` → agregados de trazas recientes.
- `recommend(metrics?)` → `{ recommendations, proposed, metrics }`.
- `apply(config)` → aplica config propuesta (tras aprobación, no destructivo).
- `validate(config)` → verifica respeta budgets (max/min).
- `setBudgets(budgets)` → actualiza constraints.

### Budgets (`DEFAULT_BUDGETS`)
maxRamMb=4096, maxVramMb=8192, maxContextTokens=128000, maxLatencyMs=60000,
maxParallelAgents=4, minParallelAgents=1.

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §15 | RAM/VRAM/tokens/latencia/contexto/paralelismo | ✓ 6 dimensiones |
| §15 | Basado en datos (no a ciegas) | ✓ consume Fase 13 |
| §15 | No destructivo | ✓ recommend + validate + apply |

## 3. Gate de Fase 15

| Criterio | Estado |
|---|---|
| Implementación | ✓ tuner de 6 dimensiones + budgets + validate |
| Tests | ✓ 17/17 pasan |
| Consume Fase 13 | ✓ Observability |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Fin del plan de 15 fases (5-15 en esta sesión).
