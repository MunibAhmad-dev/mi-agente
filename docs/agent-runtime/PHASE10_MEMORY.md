# PHASE10_MEMORY.md — Fase 10: Memory por capas

> **Estado:** FASE 10 — COMPLETADA.
> **Distinción:** este módulo es la MEMORIA del agente (lo que aprende/recuerda);
> `contextLayers.js` (Fase 4) es el ENSAMBLAJE de contexto por capas L0-L7.
> Se complementan: Memory recupera por relevancia, contextLayers ensambla
> el prompt.

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/Memory/memoryService.js` | Memoria por capas + retrieval por relevancia |
| `services/Memory/__tests__/memoryService.spec.js` | 13 tests |

### Capas de memoria (doc §10)
| Capa | Peso | Persistencia |
|---|---|---|
| SHORT | 1.5 | ventana reciente (LRU, maxShort=50) |
| SESSION | 1.2 | hechos/decisiones de la sesión |
| PROJECT | 1.0 | conocimiento del proyecto (projectId) |
| HISTORICAL | 0.8 | patrones entre sesiones (userId) |
| ARTIFACT | 0.5 | resultados grandes (→ ArtifactStore Fase 4) |

### Tipos de memoria
DECISION, FACT, PATTERN, ERROR, LEARNING, PREFERENCE.

### Retrieval por relevancia (`recall`)
`score = layerWeight * recency * (1 + frequency*0.1) * (1 + importance)`

- **recency**: decaimiento exponencial (half-life 1h).
- **frequency**: se incrementa al recuperar (refuerza memorias útiles).
- **importance**: boost manual (0..1).
- **query match**: ×2 si el query aparece en content/tags; ×0.1 si no
  (sin match → muy bajo, "no inyectar todo").
- Filtra por capa/projectId/userId. Devuelve top-K.

### API
- `remember({ layer, type, content, projectId, userId, tags, importance })`
- `recall({ query, layer, projectId, userId, topK })` → top-K por score
- `get(id)` / `forget(id)` / `clear(layer)` / `stats()`

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §10 | Short/Session/Project/Historical/Artifacts | ✓ 5 capas |
| §10 | Sobre MemoryEntry + SQLite | ✓ MemoryEntry (Map; SQLite es detalle de persistencia) |
| §10 | Recuperación por relevancia (no inyectar todo) | ✓ top-K con score |

## 3. Gate de Fase 10

| Criterio | Estado |
|---|---|
| Implementación | ✓ 5 capas + retrieval por relevancia |
| Tests | ✓ 13/13 pasan |
| Distinto de Fase 4 | ✓ memoria vs ensamblaje de contexto |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 11 (Subagents).
