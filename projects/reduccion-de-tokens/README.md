# Token Optimization Engine

Parte 25 del proyecto AI-OS (`proyectos-aoi/mi-agente`): **Universal Context Intelligence & Token Optimization Engine**.

**Principio rector:** optimizar el *contexto mínimo suficiente* — no el contexto más pequeño.
Nunca se descarta información de forma permanente: el original vive en el **Shadow Context Store**
y puede recuperarse de forma dirigida (líneas, campos JSON, símbolos).

## Qué es (y qué no es)

- Es: un motor medible de clasificación, valor de información, riesgo, deduplicación, compresión
  consciente de contenido, externalización reversible, recuperación dirigida, verificación de
  fidelidad, presupuesto por modelo y medición de coste total.
- No es: un compresor de prompts universal. Cada decisión es condicional (contenido, tarea,
  modelo, riesgo, latencia) y reversible.

## Arquitectura

```
OBSERVE → CLASSIFY → RISK → INFO-VALUE → DEDUP → ROUTE
   → COMPRESS/KEEP/EXTERNALIZE → VERIFY FIDELITY
   → (rollback on failure) → PACK → MEASURE → (RECOVER if needed)
```

Módulos (`src/token_optimization/`):

| Módulo | Responsabilidad |
|---|---|
| `core/ir.py` | `ContextItem`, procedencia, tipos de contenido/riesgo |
| `core/classifier.py` | Clasificación de contenido/tarea, políticas por tarea |
| `core/risk.py` | Motor de riesgo (LOW→CRITICAL) con reglas de negación |
| `core/information_value.py` | Valor de información por factor |
| `core/dedup.py` | Duplicados exactos y casi-duplicados (shingling Jaccard) |
| `compression/*` | Cascada por etapas + compresores JSON/logs/texto/código/trayectoria + router adaptativo |
| `tokenization/providers.py` | Conteo real de tokens (tiktoken) + perfiles de modelo |
| `storage/store.py` | SQLite + FTS5: shadow store, índice de recuperación, grafo de contexto |
| `recovery/recoverer.py` | Recuperación dirigida (documento/líneas/campos JSON) |
| `fidelity/evaluator.py` | Invariantes: números, negaciones, IDs, claves JSON |
| `packing/packer.py` | Empaquetado por presupuesto con orden por rol |
| `packing/levels.py` | Modelo de memoria de 5 niveles (L0..L4) |
| `orchestrator.py` | Orquestador central (KEEP/DEDUP/COMPRESS/EXTERNALIZE/RECOVER) |
| `cost.py` | Modelo de coste total y coste por tarea exitosa |
| `benchmarks/*` | Laboratorio de benchmarks deterministas y reproducibles |
| `cli.py` | `context-engine audit/compress/retrieve/inspect/stats/policies/models/benchmark` |
| `api.py` | Capa fina FastAPI (`/context/*`) |

## Uso rápido

```bash
pip install -e ".[api,dev]"
pytest                                   # 55 pruebas unitarias, adversariales y de fase
context-engine benchmark --suite standard
context-engine compress --model gpt-4o --task rag < big.json
uvicorn token_optimization.api:app       # API /context/*
```

También incluye: presupuesto dinámico por modelo (`budget`), grafo de contexto con detección
de contradicciones, métricas de observabilidad (`metrics`), PolicyLearner en modo shadow
(`learn`) y redacción automática de secretos antes de persistir.

## Honestidad de las métricas

Todos los números de `BENCHMARK_REPORT.md` se generan ejecutando el motor sobre datasets
deterministas con el tokenizador real del perfil de modelo seleccionado. No hay valores
hardcodeados. El "éxito de tarea" en el laboratorio mide **suficiencia de información**
(invariantes preservadas o recuperables) — es un proxy determinista, no una evaluación con LLM;
eso está documentado explícitamente en el informe.

## Seguridad

- `DATA ≠ INSTRUCTION`: la procedencia y el rol viajan con cada `ContextItem`.
- El motor de riesgo marca negaciones críticas (`DO NOT delete ...`) y nunca permite que un
  compresor elimine la negación (verificado por el evaluador de fidelidad y por tests adversariales).
- El store aplica TTL + purga con VACUUM; no guarda secretos (detección básica y marcado `sensitivity`).
