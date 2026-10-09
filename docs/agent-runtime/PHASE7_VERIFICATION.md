# PHASE7_VERIFICATION.md — Fase 7: Verification (agente de verificación)

> **Estado:** FASE 7 — COMPLETADA.
> **Reutilización:** orquesta compile_check (Fase 3), BlastRadius (Fase 6)
> y las herramientas del proyecto (tsc/eslint/jest) vía subprocesos.

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/Verification/verificationService.js` | Orquestador de verificaciones |
| `services/Verification/__tests__/verificationService.spec.js` | 15 tests |

### Estrategia según riesgo (doc §9 + §23)
`STRATEGY_BY_RISK` selecciona las verificaciones según el nivel de la Fase 6:
| Riesgo | Verificaciones |
|---|---|
| LOW | lint + compile_check |
| MEDIUM | lint + typecheck + tests |
| HIGH | lint + typecheck + tests + build |
| CRITICAL | lint + typecheck + tests + build + blast_radius |

### Verificaciones
- **TYPECHECK** — `npx tsc --noEmit`
- **LINT** — `npx eslint <archivos afectados>`
- **TESTS** — `npx jest` (con `testPathPattern` opcional para tests dirigidos)
- **BUILD** — `npm run build`
- **COMPILE_CHECK** — `node --check` por archivo (validación de sintaxis
  rápida, sin ejecutar; complementa el `compile_check` del SDK de Fase 3)
- **BLAST_RADIUS** — reutiliza `analyzeChangeImpact` (Fase 6); FAIL si CRITICAL

### `runVerification({ riskLevel, files, testPathPattern, blastRadiusResult, cwd })`
Devuelve `{ results, passed, summary }` con el estado de cada verificación
y un resumen accionable.

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §9 | El agente verifica sus propios cambios | ✓ runVerification |
| §9 | Estrategia por riesgo | ✓ STRATEGY_BY_RISK |
| §9 | Type/Lint/Test/Build | ✓ |
| §23 | Risk engine alimenta verificación | ✓ BlastRadius → strategy |

## 3. Gate de Fase 7

| Criterio | Estado |
|---|---|
| Implementación | ✓ 6 verificaciones + estrategia por riesgo |
| Tests | ✓ 15/15 pasan |
| Reutiliza Fases 3/6 | ✓ compile_check + BlastRadius |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 8 (Repair).
