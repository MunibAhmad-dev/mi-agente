# PHASE8_REPAIR.md — Fase 8: Repair (agente de reparación)

> **Estado:** FASE 8 — COMPLETADA.
> **Reutilización:** consume Verification (Fase 7) + checkpointer rewind (Fase 3).

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/Repair/repairService.js` | Clasificación de fallos + acciones de reparación + loop |
| `services/Repair/__tests__/repairService.spec.js` | 16 tests |

### Clasificación de fallos (`classifyFailure`)
Mapea el `VerificationKind` fallido a una categoría:
| Kind | Categoría |
|---|---|
| COMPILE_CHECK | SYNTAX |
| TYPECHECK | TYPE |
| LINT | LINT |
| TESTS | TEST |
| BUILD | BUILD |
| BLAST_RADIUS | BLAST_RADIUS |

### Decisiones de reparación (`decideRepairAction`)
Deterministas, no generan código:
| Categoría | Acción |
|---|---|
| SYNTAX | REWIND (revertir al checkpoint) |
| LINT | RETRY_LINT_FIX (`eslint --fix`) |
| TYPE | REWIND (intento 0) → ESCALATE |
| BUILD | REVERT_FILE (`git checkout --`) |
| BLAST_RADIUS | REWIND (riesgo crítico, no reintentar) |
| TEST | RETRY_TYPECHECK (intento 0) → ESCALATE |
| agotado | ESCALATE |

### `repairLoop({ verifyFn, ctx })`
Loop verify → (falla) repair → verify → ... hasta pasar o agotar
`MAX_REPAIR_ATTEMPTS` (3). Reutiliza el `checkpointer.rewind()` de la Fase 3
para revertir cambios que no pasan verificación. Si no se puede reparar,
escala a humano/LLM.

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §10 | Revertir y reintentar | ✓ REWIND + loop |
| §10 | Clasificar fallos | ✓ classifyFailure |
| §10 | Escalar cuando no se repara | ✓ ESCALATE |
| §6 | Operaciones peligrosas con políticas | ✓ rewind solo con checkpointer |

## 3. Gate de Fase 8

| Criterio | Estado |
|---|---|
| Implementación | ✓ classify + decide + apply + loop |
| Tests | ✓ 16/16 pasan (rápidos, sin subprocess) |
| Reutiliza Fases 3/7 | ✓ checkpointer + Verification |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 9.
