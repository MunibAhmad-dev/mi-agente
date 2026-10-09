# PHASE12_ADAPTIVE_ROUTER.md — Fase 12: Adaptive Model Router

> **Estado:** FASE 12 — COMPLETADA.
> **Reutilización:** capa sobre `ModelRegistry.findByCapabilities` (Fase 4);
> NO duplica el registry ni el capability index.

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/AgentArchitect/adaptiveRouter.js` | Router adaptativo + métricas runtime |
| `services/AgentArchitect/__tests__/adaptiveRouter.spec.js` | 13 tests |

### Contexto
El router existente (`modelRouter.js`, Fase 4) ya selecciona **POR
CAPACIDAD** (no por nombre): `findByCapabilities` + `rankCandidates`
(matchScore → local → latency → tag). La Fase 12 añade la capa adaptativa
que reordena candidatos por **métricas runtime** acumuladas.

### ModelMetrics
Registra por modelo: calls, successes, failures, totalLatencyMs, totalCost.
- `get(modelId)` → `{ calls, successRate, avgLatencyMs, avgCost, hasData }`.
- `record({ modelId, success, latencyMs, cost })` tras cada llamada.

### AdaptiveModelRouter
- `select({ capabilities, overrideModelId })` → reordena candidatos por
  **score adaptativo**:
  `score = 0.5*match + 0.3*success + 0.15*latencyScore + 0.05*costScore`
  (pesos suman 1).
- **Override manual** (regla del doc §12): el usuario fuerza un modelo concreto.
- **Override por capability set**: fija un modelo para un conjunto de caps.
- **Cooldown**: modelos con `successRate < 0.5` y `>= 3` llamadas se excluyen.
- `recordCall(...)` alimenta métricas tras cada ejecución.

### Pesos (`ADAPTIVE_WEIGHTS`)
| Factor | Peso |
|---|---|
| MATCH (matchScore estático) | 0.5 |
| SUCCESS (success rate runtime) | 0.3 |
| LATENCY (inverso) | 0.15 |
| COST (inverso) | 0.05 |

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §12 | Capability registry | ✓ usa Capabilities (Fase 2/4) |
| §12 | Selección por capacidad, no por nombre | ✓ findByCapabilities |
| §12 | Override manual | ✓ overrideModelId + setOverride |
| §12 | Adaptativo (runtime) | ✓ métricas + cooldown |

## 3. Gate de Fase 12

| Criterio | Estado |
|---|---|
| Implementación | ✓ métricas + score adaptativo + override + cooldown |
| Tests | ✓ 13/13 pasan |
| No duplica Fase 4 | ✓ capa sobre findByCapabilities |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 13 (Observability).
