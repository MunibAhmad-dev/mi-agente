# PHASE4_CONTEXT_ENGINE.md — Fase 4: Context Engine (capas L0–L7 + artifacts)

> **Estado:** FASE 4 — COMPLETADA.
> **Reutilización:** se amplía `AgentArchitect/contextManager.js` (que ya
> aporta relevancia + dedup + compresión a budget) con las dos piezas que
> faltaban: capas de contexto L0–L7 y sistema de artifacts.

## 1. Qué ya existía (reutilizado)
`AgentArchitect/contextManager.js` ya implementaba:
- `estimateTokens`, `relevanceScore` (léxico determinista),
  `deduplicateItems` (hash + Jaccard ≥0.85), `compressToBudget` (budget).
- `buildAgentContext` / `fetchContextForAgent` con fuentes inyectables
  (memoria / RAG / historial) y stats.

## 2. Qué faltaba (implementado ahora)
| Pieza | Doc § | Implementación |
|---|---|---|
| Capas de contexto L0–L7 | §6, §42 | `contextLayers.js` → `Layer`, `LAYER_PRIORITY`, `LAYER_META`, `makeBlock`, `assembleLayeredContext` |
| Sistema de artifacts `artifact://` | §6 | `ArtifactStore` (put/get/summary/list/clear) + `toArtifactBlock` |

### Capas L0–L7
```
L0 SYSTEM    — prompt del sistema / instrucciones del agente (no truncable)
L1 PROJECT   — AGENT.md, convenciones, arquitectura del repo
L2 TASK      — descripción de la tarea + plan (no truncable)
L3 CODE      — código relevante (símbolos/archivos recuperados)
L4 MEMORY    — memoria del proyecto/usuario
L5 RAG       — recuperación semántica/vectorial
L6 HISTORY   — historial de ejecución (turnos previos)
L7 ARTIFACT  — referencias a artifacts (resumen + URI, no contenido)
```
`assembleLayeredContext` ordena por **prioridad de capa primero** y
**relevancia dentro de cada capa**. Las capas no truncables (system/task)
entran siempre aunque excedan el budget; el resto cae con `dropReason`.

### Artifacts (`artifact://`)
Resultados grandes (logs, diffs, dumps) se guardan en `ArtifactStore` y
se referencian por URI. El modelo recibe **resumen + puntero**, no el
contenido completo. `toArtifactBlock` guarda el contenido y devuelve un
bloque L7 compacto. Cumple Regla 4 ("contexto dinámico, sin info
innecesaria") y Regla 5 ("memoria externa").

## 3. Integración con lo existente
`contextLayers.js` **importa** `estimateTokens` de `contextManager.js`
(reutiliza, no duplica). El Context Engine completo combina ambos:
- `fetchContextForAgent` (existente) → recupera fuentes y comprime a budget.
- `assembleLayeredContext` (nuevo) → organiza en capas con prioridad.
- `ArtifactStore` (nuevo) → externaliza resultados grandes.

## 4. Punto de unificación RAG (deuda de Fase 1)
La Fase 1 dejó pendiente un **interfaz de retrieval híbrido** para los 2
RAG (pgvector chat + Redis/Ollama Architect). El `assembleLayeredContext`
ya separa la capa L5_RAG, así que cuando se implemente el retrieval
híbrido (keyword + structural + semantic), ambos backends alimentan la
misma capa L5 de forma uniforme. No destructivo.

## 5. Gate de Fase 4

| Criterio | Estado |
|---|---|
| Implementación | ✓ capas L0–L7 + ArtifactStore + toArtifactBlock |
| Tests unitarios | ✓ 16/16 pasan |
| Sin romper existentes | ✓ módulo nuevo; reutiliza contextManager (no lo modifica) |
| Sin placeholders/TODO | ✓ |
| Regla 4 (contexto dinámico) | ✓ budget + capas + artifacts |
| Regla 5 (memoria externa) | ✓ artifacts externalizan contenido grande |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 5 (Code Intelligence).
