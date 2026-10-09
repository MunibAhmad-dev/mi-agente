# PLAN_FASES_10_10.md — Integración por fases hacia 10/10

**Regla de oro (spec §73):** ninguna fase avanza si la anterior no compila, pasa tests,
pasa su gate de benchmark y está documentada y commiteada. Cada fase tiene criterio de
entrada, tareas, criterio de salida (gate) y plan de rollback.

**Estado de partida:** rama `reduccion-de-tokens` con motor funcional (55 tests, benchmark
90.7% medido, sin placeholders). AI-OS `main` con secrets críticos expuestos (ver
`AUDIT_FORENSE.md` §B.3).

---

## FASE 0 — Contención de seguridad (HOY, bloqueante)

**Objetivo:** eliminar exposición activa de credenciales.

1. Rotar en GitHub: ambos `ghp_*` (el del remote `origin` y el compartido en chat) →
   Settings → Developer settings → Tokens.
2. `git remote set-url origin https://github.com/proyectos-aoi/mi-agente.git` (sin token en URL).
3. En `main`: `git rm --cached .env`; añadir `.env` a `.gitignore`; commitear.
4. Rotar `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, `CREDS_IV`, `MONGO_URI` y cualquier
   credencial que haya vivido en el repo.
5. Purga de historial con `git filter-repo` (o declarar el histórico comprometido si se
   rehace el repo). Activar secret scanning + push protection en GitHub.
6. Añadir pre-commit `detect-secrets` y job en `ci.yml`.

**Gate:** `git log --all --full -- .env` vacío tras purga; CI con escaneo de secretos en verde.
**Rollback:** n/a (no hay aspecto técnico reversible; la rotación es obligatoria).

## FASE 1 — Base del motor (✅ COMPLETADA en esta rama)

Hecho y verificado: IR, clasificador, riesgo, valor de información, dedup, cascada,
5 compresores, shadow store+FTS5, recuperación dirigida, fidelidad, router, empaquetado,
niveles L0–L4, coste, benchmark lab, CLI, API, presupuesto dinámico, grafo/contradicciones,
métricas, learner shadow, redacción de secretos. 55 tests, benchmark reproducible.

**Gate superado:** pytest 55/55 · `context-engine benchmark` verde · sin TODOs en `src/`.

## FASE 2 — Integración con AI-OS (feature flag + benchmark A/B)

**Objetivo:** que el tráfico LLM de AI-OS pase por el optimizador sin tocar LiteLLM/LibreChat core.

1. Instalar el motor en el host de AI-OS: `pip install -e "path/a/reduccion de tokens"` o
   servicio HTTP (`uvicorn token_optimization.api:app --port 8100`).
2. Punto de enganche: `api/server/services/AgentRuntime/runtimeHooks.js` (ya existe
   `preLLMCall` y lazy-require de HarnessEngine). Añadir hook `contextOptimize(messages)`
   que llame al motor (in-process vía Python child o HTTP local).
3. Feature flag en config AI-OS: `CONTEXT_ENGINE_ENABLED=false` por defecto; activar por
   tenant/tipo de tarea (chat → off inicialmente; tool_agents/data → on).
4. Contrato: el motor devuelve mensajes optimizados + `shadow://` pointers; los tool-outputs
   grandes se externalizan; system/developer intactos (garantía del RiskEngine).
5. Recuperación: endpoint JS → `POST /context/retrieve` cuando el agente lo pida.

**Config:** `data/context_store.db` persistente; TTL 7 días; `tenant_id = user/agent id`.
**Gate:** A/B con ≥100 tareas reales: coste total ↓, tasa de éxito ≥ baseline, latencia p95
+<150 ms, 0 rollbacks silenciosos. Sin gate → flag sigue en false.
**Rollback:** flag off = comportamiento idéntico al actual (el motor es adiabático).

## FASE 3 — Recuperación semántica (sqlite-vec + FastEmbed)

1. Auditoría de licencias/dependencias (§4): sqlite-vec (MIT), FastEmbed (Apache-2.0) —
   verificar tamaño de modelos ONNX (~90 MB bge-small) y RAM.
2. `pip install sqlite-vec fastembed`; tabla `context_vec` + índice KNN.
3. Pipeline: FTS5 (keywords) ∪ sqlite-vec (semántico) → merge → rerank FastEmbed → top-k.
4. Métricas nuevas: `retrieval_hit_rate`, latencia p95 por consulta.

**Gate:** recuperación de paráfrasis (query ≠ wording) ≥80% hit@5 en dataset de pruebas;
sin regresión de las 55 pruebas.

## FASE 4 — Código: tree-sitter + compresión AST real

1. `pip install tree-sitter tree-sitter-python tree-sitter-javascript`.
2. Reemplazar la heurística de `code_compressor.py` por AST real: funciones/clases/imports,
   cuerpos → stub recuperable, firmas+docstrings+decorators intactos.
3. Gate: tests de snapshot sobre 20 archivos reales del propio repo; recovery exacto de
   cualquier símbolo; reducción ≥50% en archivos >500 líneas sin perder firmas.

## FASE 5 — Observabilidad de producción (OTel + Prometheus)

1. `pip install opentelemetry-sdk opentelemetry-exporter-otlp prometheus-client`.
2. Exportar `MetricsRegistry` (contadores ya canónicos) a Prometheus `/metrics` y trazas
   OTel (TASK → COMPRESSION → RECOVERY spans).
3. Dashboard: tokens ahorrados, coste/tarea, rollbacks, cache hits, latencias.

**Gate:** dashboard con datos reales tras 24 h de tráfico flag-on.

## FASE 6 — Adapters externos bajo contrato (Headroom, Winnow)

1. Auditar licencias + mantenimiento + peso (§4): Headroom (Apache-2.0), Winnow (local-first).
2. Implementar `ContextCompressor` adapters; registrarlos en el router como métodos
   adicionales; el benchmark lab los compara contra los deterministas (§35).
3. Regla §63: un adapter solo entra a producción si su reward medido supera al método
   actual en ≥10% con p<0.05 en ≥200 tareas.

**Gate:** BENCHMARK_REPORT.md con columnas headroom/winnow y decisión documentada.

## FASE 7 — Memoria persistente (Mem0) + niveles L2/L4

1. Auditar Mem0 (Apache-2.0) y su store por defecto; aislar tras `MemoryProvider`.
2. Solo datos de larga vida: preferencias, decisiones, hechos de proyecto (nunca contexto
   inmediato). TTL y right-to-erasure desde el día 1 (§46).

**Gate:** tasks con memoria activada ≥ baseline en éxito; reducción adicional medible en
contexto re-enviado.

## FASE 8 — Endurecimiento de seguridad y multi-tenancy

1. Cifrado en reposo del shadow store (`cryptography`, Fernet + clave por tenant en env/KMS).
2. RBAC en la API (admin/agent/readonly), rate-limit por tenant, límite de payload (p.ej. 2 MB).
3. Auditoría de logs: PII-safe (redacción ya existente reutilizada en logging).
4. Delete task/tenant + VACUUM verificado con test de borrado total.

**Gate:** suite de seguridad propia + `detect-secrets` + tests de aislamiento por tenant.

## FASE 9 — Carga, concurrencia y estabilidad

1. Tests de carga del store (10 writers concurrentes, 1M items), latencias p95/p99.
2. WAL mode + retry-on-busy en SQLite; presupuestos de memoria; bounded caches con TTL.
3. Soak test 24 h con tráfico simulado determinista.

**Gate:** 0 corruption, p95 API <200 ms, memoria estable; entonces sí, "production ready".

## FASE 10 — Policy Learner canary → producción (§34)

1. Con recomendaciones del learner al router SOLO en modo canary (10% tráfico, flag).
2. Promoción manual por evidencia: ≥20 muestras, reward medio ≥0.3, éxito ≥ baseline.
3. Rollback instantáneo por flag; estados experiment/candidate/canary/production auditados.

## FASE 11 — Consolidación AI-OS

1. Unificar tokenización: deprecar `TokenCounter.js`/`NLPTokenizer.js` duplicados en favor
   del motor (o mantener como caché de conteo), fuente única de verdad documentada.
2. Triage de los 41 archivos con placeholders (convertir a issues/implementar/borrar).
3. Documentación viva única: este plan + AUDIT_FORENSE.md reemplazan los ~70 MD raíz
   (archivar el resto en `docs/archive/`).
4. CI: gates e2e + test:ci frontend + benchmark del motor en cada PR que toque contexto.

---

## Cronograma resumido

| Fase | Cuándo | Depende de |
|---|---|---|
| 0 Seguridad | HOY | nada (bloqueante) |
| 1 Motor | ✅ hecho | — |
| 2 Integración AI-OS | semana 1–2 | Fase 0 |
| 3 Recuperación semántica | semana 2–3 | 1 |
| 4 Tree-sitter | semana 3 | 1 |
| 5 Observabilidad | semana 3–4 | 2 |
| 6 Adapters externos | semana 4–5 | 3, 5 |
| 7 Mem0 | semana 5–6 | 2 |
| 8 Seguridad dura | semana 6 | 2 |
| 9 Carga/estabilidad | semana 7 | 3, 8 |
| 10 Learner canary | semana 8 | 5, 9 |
| 11 Consolidación | continua | todas |

**Definición de 10/10:** todas las fases con gate en verde + BENCHMARK_REPORT.md regenerado
sobre tráfico real + coste por tarea exitosa por debajo del baseline medido + 0 secretos en
repo + suites de tests (unit/int/e2e/seguridad/carga) en CI obligatorio.
