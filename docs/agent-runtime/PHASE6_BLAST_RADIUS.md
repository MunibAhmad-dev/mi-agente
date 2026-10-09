# PHASE6_BLAST_RADIUS.md — Fase 6: Blast Radius (change impact + risk engine)

> **Estado:** FASE 6 — COMPLETADA.
> **Reutilización:** se construye sobre `computeBlastRadius` de la Fase 5.

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/CodeIntelligence/blastRadius.js` | Risk engine + change impact analysis |
| `services/CodeIntelligence/__tests__/blastRadius.spec.js` | 8 tests |

### Risk engine (doc §23)
- `classifyRisk(score)` → LOW / MEDIUM / HIGH / CRITICAL (umbrales 0/3/7/12).
- `assessRisk({ affectedFiles, changedSymbols, codeIntelligence })`:
  - peso por archivos afectados,
  - peso por tipo de símbolo (`SYMBOL_RISK_WEIGHT`: EXPORT=3, CLASS/INTERFACE/TYPE=2, FUNCTION/METHOD/ARROW=1),
  - detección de exports públicos afectados (API surface),
  - peso extra si un entry point (`index.*`) está en el radio.

### Change impact analysis
- `analyzeChangeImpact({ changedFiles, codeIntelligence, changedSymbols })`:
  - computa el blast radius transitivo (Fase 5),
  - puntúa el riesgo y lo clasifica,
  - detecta exports públicos consumidos por dependientes,
  - genera un **summary accionable** que sugiere la profundidad de
    verificación según el nivel de riesgo.

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §23 | Change Risk Engine | ✓ classifyRisk + assessRisk |
| §23 | Risk levels | ✓ LOW/MEDIUM/HIGH/CRITICAL |
| §6 | Blast radius (cierre transitivo) | ✓ vía Fase 5 |
| §23 | Acción sugerida según riesgo | ✓ summary |

## 3. Gate de Fase 6

| Criterio | Estado |
|---|---|
| Implementación | ✓ risk engine + change impact + summary |
| Tests | ✓ 8/8 pasan |
| Reutiliza Fase 5 | ✓ computeBlastRadius |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 7 (Verification).
