# AUDIT_FORENSE.md — Auditoría forense estructurada

**Alcance:** (A) el motor `token_optimization` construido en esta rama `reduccion-de-tokens`,
y (B) el monorepo `proyectos-aoi/mi-agente` (AI-OS, fork de LibreChat v0.8.7), clonado
solo-lectura en `_audit_main/` (git-ignored, nunca commiteado) para inspección.
**Método:** verificación real — ejecución de tests, CLI, API, benchmark, greps dirigidos con
rutas de archivo y líneas. Nada se asume "funciona porque está en el repo".
**Fecha:** 2026-09-10 · **Tokenizador de referencia:** tiktoken `o200k_base` (exacto).

---

## PARTE A — Motor de Optimización de Tokens (esta rama)

### A.1 Qué está funcionando 10/10 (verificado ejecutándolo)

| # | Capacidad | Evidencia |
|---|---|---|
| 1 | Pipeline completo `optimize()` end-to-end: clasificar → riesgo → dedup → comprimir → fidelidad → rollback | 55/55 tests en pytest; `Engine.ingest_and_optimize` verificado en CLI y API |
| 2 | Conteo exacto de tokens por modelo (tiktoken o200k/cl100k) con fallback `char/4` **marcado** `exact=False` | `TokenCounter.exact` propagado hasta el reporte (`tokenizer_exact=True` en salidas reales) |
| 3 | Shadow Store SQLite+FTS5: originales guardados **antes** de comprimir, con provenance, tenant, TTL | `tests/test_store_recovery.py` (6 tests); purga TTL+VACUUM verificada |
| 4 | Recuperación dirigida (`full`/`lines`/`json_field`) — nunca el documento completo | `test_recover_lines`, `test_recover_json_field` (devuelve `results[1].url` exacto) |
| 5 | Fidelity evaluator: números (multiset), fechas, IDs/rutas/hashes, negaciones, claves JSON, inversión prohibida | Tests adversariales: `DO NOT delete production_database` imposible de perder/invertir |
| 6 | Cascada con router adaptativo por tipo de contenido + políticas por tarea (8 tareas) | Cada corrida produce audit por ítem con decisiones (`route:`, `compress:`, `rollback:`) |
| 7 | Compresores: JSON estructural (válido siempre), logs (errores verbatim), texto (dedup línea+oración), código (outline de símbolos), trayectoria | Tests por compresor + pipeline; salida JSON siempre parseable |
| 8 | Externalización con puntero `shadow://<id>` + stub recuperable | `items_externalized_total` en métricas; probe de recuperabilidad en benchmark |
| 9 | Benchmark lab reproducible con 6 datasets deterministas y 5 brazos de ablación | 201,972 tok → 18,792 tok (**90.7%**), proxy de suficiencia 30/30, $0.001566/tarea |
| 10 | Empaquetado con presupuesto donde system/developer **nunca** se descartan | `test_budget_respected_and_system_kept` |
| 11 | Modelo de memoria L0–L4 con asignación explicada | `test_levels_assignment` |
| 12 | Modelo de coste total + coste por tarea exitosa | `cost.py`; usado por el lab (columna cost del reporte) |
| 13 | CLI completa: audit/compress/retrieve/inspect/stats/policies/models/benchmark/budget/metrics/learn | Ejecuciones reales documentadas en la sesión (salida verificada) |
| 14 | API FastAPI fina (`/context/optimize|compress|retrieve|pack|stats|policies|models|benchmarks|metrics|policy-stats|budget`) | TestClient: optimize 200 con 3,894→194 tokens; benchmarks 90.7% |
| 15 | Seguridad: redacción de secretos **antes** de persistir (ghp_/AKIA/sk-/Bearer/kv) | `test_engine_redacts_before_store`: el store no contiene el token original |
| 16 | Presupuesto dinámico por modelo (§31), no ratios fijos | `budget`: gpt-4o → 112,640 tokens disponibles (window−10%−output−overhead) |
| 17 | Grafo de contexto + motor de contradicciones determinista (timeout 30s vs 15s detectado) | `test_timeout_conflict_detected`; arista `contradicts` creada |
| 18 | Observabilidad con contadores/timings thread-safe | `metrics_snapshot()` tras corrida: `compressions_total`, `cascade_ms`, etc. |
| 19 | PolicyLearner en modo shadow con promoción gated por evidencia | `test_promotion_blocked_without_evidence` |
| 20 | Cero TODO/FIXME/placeholders en `src/` | grep dirigido: solo stubs intencionales de Protocols (`interfaces.py`) |

### A.2 Qué está parcial (funciona, con límites conocidos)

1. **Compresión de código** — outline por heurística de líneas; tree-sitter no está instalado
   (adapter preparado pero sin AST real). Limitación: lenguajes no-Python/JS caen a KEEP.
2. **Recuperación semántica** — FTS5 es keyword/BM25; sin embeddings no encuentra paráfrasis.
   sqlite-vec/FastEmbed definidos como fase posterior (auditoría de licencias pendiente).
3. **Motor de contradicciones** — heurístico (métrica+valor+idioma de cambio); no cubre
   contradicciones semánticas sin números ni dependencias entre documentos.
4. **PolicyLearner** — recolecta y recomienda, pero el router aún no consume recomendaciones
   (por diseño, §34: requiere canary antes de producción).
5. **RAG pipeline** — dedup+compress+verify completos; rank/group/rerank ausentes.
6. **Fidelity** — lexical/estructural, no semántica profunda (no detecta paráfrasis engañosas).
7. **Adapters externos** (Headroom/Winnow/ACON/LLMLingua/Paritok/Mem0) — interfaz lista,
   integración no iniciada (decisión §4: auditar licencias/dependencias antes).
8. **Benchmark "success"** — proxy mecánico de suficiencia, no evaluación LLM-juzgada
   (documentado en el reporte); datasets sintéticos, no tráfico real de AI-OS.

### A.3 Errores y riesgos del motor (por categoría)

- **Conectividad/dependencias externas:** ninguna obligatoria más allá de pydantic+tiktoken
  (MIT). Riesgo BAJO: tiktoken sin binario en algunas plataformas → fallback flaggeado.
- **Simulación vs real:** simulación **cero** en el motor. El único componente "proxy" es la
  métrica de éxito del benchmark, declarada como tal.
- **Estado/memoria/contexto:** store en memoria por defecto (`:memory:`) — para producción hay
  que montar `data/context_store.db` (la API ya lo hace). Riesgo MEDIO si se usa en memoria
  multi-proceso.
- **Manejo de errores:** compresores con try/except que degradan a KEEP (§42) — verificado;
  el orquestador nunca bloquea al agente. Faltan reintentos con backoff en futuras llamadas
  LLM remotas (no aplica todavía: todo es local).
- **Validación I/O:** Pydantic valida items de entrada; el CLI valida stdin vacío. Falta
  límite duro de tamaño de payload en la API (DoS por body gigante) — MEDIO.
- **Observabilidad:** contadores locales completos; falta exportador OTel/Prometheus (fase 5).
- **Seguridad:** redacción de secretos integrada; falta cifrado en reposo del store y RBAC en
  la API (fase 8). MEDIO.
- **Rendimiento:** cascada medida en ~177 ms para ~200k tokens (benchmark) — sobrado para el
  presupuesto de 50 ms por ítem. Riesgo BAJO. `CharQuartetProvider` solo si no hay tiktoken.
- **Testing:** 55 tests unit/integración/adversariales; faltan tests de carga y concurrencia
  del store (SQLite serializa escrituras) — MEDIO.

---

## PARTE B — AI-OS (`main`, clon inspeccionado solo-lectura)

### B.1 Qué está funcionando 10/10 (respaldado por código/ejecución verificable)

1. **Backend Express operativo** — `api/server/index.js` monta 115+ rutas (~630 endpoints en
   80 archivos de rutas); base LibreChat v0.8.7 upstream madura.
2. **Harness montado de verdad** — `api/server/index.js:496`: `app.use('/api/harness', routes.harness)`;
   con JWT añadido en commits recientes (`4ca9d8dbc`, "JWT auth on harness routes").
3. **Cadena AgentRuntime real** — `HeadlessSDK.js:72,82` llama `HarnessEngine.scaffold()` y
   `preLLMCall()`; `runtimeHooks.js:150` hace lazy-require de HarnessEngine (punto de
   integración perfecto para el motor de contexto).
4. **Módulos cognitivos sustanciales** — `ContextCompactor.js` (238 líneas),
   `ToolResultCompressor.js` (156), PromptCache, AdaptiveRAG importados desde
   `loadCustomConfig.js` (wiring real, no huérfanos).
5. **Suite de tests numerosa** — 595 archivos spec/test en api/packages/client; client con
   180 archivos de test de frontend.
6. **Despliegue docker-compose completo** — api, ai-model-browser, admin-panel, mongodb,
   meilisearch, vectordb, rag_api, computeruse (+helm librechat y rag-api en `helm/`).
7. **CI presente** — `.github/workflows/ci.yml` existe (cobertura interna por verificar).
8. **Infra MCP** — `.mcp.json` en raíz + `mcp-server` package + rutas MCP con OAuth tests.

### B.2 Qué está parcial

1. **Optimización de tokens no aplicada al flujo principal** — los compresores cognitivos solo
   son alcanzables vía `/api/harness` y HeadlessSDK; el chat normal de LibreChat no pasa por
   ellos (grep: ninguna importación desde `controllers/agents/request.js`).
2. **Duplicación de lógica de tokens** — `ContextIntelligence/TokenCounter.js`,
   `Harness/cognitive/NLPTokenizer.js` y (en esta rama) el motor Python: tres implementaciones
   a consolidar.
3. **`docker-compose.yml`** — 8–10 servicios con estado (Mongo, pgvector, Meili); sin dudas
   funcional en dev, pero pesado y sin evidencia de imágenes pinned por digest.
4. **Frontend** — build Vite configurado (`client/package.json` con NODE_OPTIONS=8GB), 180
   tests, pero el script `test` es `jest --watch` (no apto para CI tal cual).
5. **Docs sprawl** — ~70 MD raíz con auditorías solapadas y estados contradictorios; ninguna
   trazable a un estado único del sistema.

### B.3 Errores y riesgos encontrados (por categoría, priorizados)

| Prioridad | Categoría | Hallazgo | Evidencia | Arreglo concreto |
|---|---|---|---|---|
| **CRÍTICO** | Seguridad | `.env` real commiteado con secretos vivos | `.env` en raíz; longitudes: `JWT_SECRET=64`, `JWT_REFRESH_SECRET=64`, `CREDS_KEY=31`, `CREDS_IV=38`, `MONGO_URI=35` | Rotar TODAS las credenciales ya; `git rm --cached .env`; reescribir historial (`git filter-repo`) o retirar el repo si el histórico no se puede purgar; añadir `.env` a `.gitignore` + pre-commit `detect-secrets` |
| **CRÍTICO** | Seguridad | Tokens GitHub embebidos en URLs de remotos y en el chat | `git remote -v` mostró `ghp_9xw8…@github.com`; otro token compartido en prompt | Rotar ambos tokens en GitHub; `git remote set-url origin https://github.com/proyectos-aoi/mi-agente.git`; usar credential manager |
| **CRÍTICO** | Seguridad | Patrones de secretos en 3 archivos del árbol | grep: `.env.example` (plantilla, OK), `Harness/__tests__/harness.test.js`, `packages/api/src/mcp/__tests__/mcp.spec.ts` | Verificar si son fixtures; si hay tokens reales, sanitizar y rotar |
| **CRÍTICO** | Simulación vs real | Riesgo de "fake success" heredado: claims tipo "10/10", "Complete all remaining capabilities" en commits sin evidencia ejecutable | commit `872ce9853` "feat: Complete all remaining capabilities to 10/10" | Exigir benchmark/test reproducible por claim (esta rama ya lo hace con BENCHMARK_REPORT.md) |
| **ALTO** | Placeholders | 41 archivos no-test en `api/server` con marcadores `not implemented/placeholder/dummy/fake/simulat` | grep dirigido (lista completa en la sesión) | Triage archivo-por-archivo: convertir a issues, borrar o implementar; prohibir merges con markers |
| **ALTO** | Orquestación | Compresores cognitivos desconectados del flujo de chat principal | solo `/api/harness` + lazy require en runtimeHooks | Fase 2 del plan: conectar `preLLMCall`/`runtimeHooks` al motor con feature flag |
| **ALTO** | Conectividad | Dependencia de 8–10 contenedores + servicios externos sin health-checks documentados en compose | `docker-compose.yml` | Añadir healthchecks + depends_on condition + profile "lite" para máquinas pequeñas |
| **ALTO** | Testing | Script de test de frontend no-CI (`jest --watch`) y CI único sin evidencia de gates e2e | `client/package.json` "test" | Añadir `test:ci` con `--watchAll=false --ci`; ejecutar e2e en workflow |
| **MEDIO** | Estado/memoria | Mongo + pgvector + Meili + memoria cognitiva propia: 4 almacenes solapados | compose + servicios Harness | Definir fuente de verdad por tipo de dato; documentar qué vive dónde |
| **MEDIO** | Validación I/O | 630 endpoints: validación heterogénea; rutas nuevas (harness) recién JWT | commits `4ca9d8dbc`/`0f830bdce` | Auditoría de schemas (zod/joi) en rutas custom; rate-limit público |
| **MEDIO** | Observabilidad | OTel añadido en último commit pero sin KPIs de tokens/coste por tarea | commit `cd1f62ab2` | Exportar contadores del motor (`context_metrics`) a Prometheus + panel |
| **MEDIO** | Rendimiento | Servicios Node + 10 contenedores en máquina de dev; cliente build con 8GB heap | `client/package.json` | Profile compose "lite"; medir arranque; separar build de runtime |
| **MEDIO** | Config/despliegue | `.env.example` de 56KB (superficie de config enorme, riesgo de drift) | tamaño real medido | Generar docs de config desde esquema; validar en CI |
| **MEDIO** | System prompt | Handlers de prompts concentrados pero sin gobierno central ni protección de negaciones en runtime JS | `api/app/clients/prompts/createContextHandlers.js` (159 líneas), `summaryPrompts.js` (53) | Centralizar prompts versionados; aplicar reglas del RiskEngine (negaciones CRITICAL intactas) en el lado JS al integrar el motor |
| **BAJO** | Testing | 55 tests del motor vs complejidad creciente; sin tests de carga del store | esta rama | Añadir tests concurrencia + load (fase 7) |
| **BAJO** | Licencias | Repo "NOASSERTION" heredado de fork LibreChat (upstream MIT-ish con enterprise dirs) | GitHub API license field | Clarificar LICENSE propio; evitar copiar `enterprise/` |

### B.4 Estado backend / frontend

- **Backend:** funcional como plataforma LibreChat + capa Harness real pero parcialmente
  conectada. Los puntos de integración identificados (`runtimeHooks.preLLMCall`,
  `HarnessEngine`) son el camino limpio para que TODO tráfico LLM pase por el optimizador.
- **Frontend:** React/Vite con 180 tests y build productivo; dashboard de 22 secciones
  declarado en README; riesgo bajo pero CI de frontend incompleto (watch-mode).
- **System prompt:** manipulación existente en `prompts/` + `InjectionPoints.js`; el motor de
  esta rama garantiza que system/developer nunca se comprimen ni descartan — al integrar,
  esa garantía se extiende al flujo AI-OS.

---

## C. Priorización global (qué tocar primero)

1. **HOY (Crítico):** rotación de secretos + purga de historial + `.env` fuera del repo +
   credenciales fuera de URLs remotas. Sin esto, nada más importa.
2. **Esta semana (Alto):** triage de 41 archivos con placeholders; CI gates reales
   (test:ci frontend + e2e + detect-secrets en pre-commit/CI).
3. **Próximas 2 semanas (Alto):** Fase 2 del PLAN_FASES_10_10.md — conectar el motor de esta
   rama a `runtimeHooks.preLLMCall` con feature flag y benchmark antes/después.
4. **Mes 1 (Medio):** consolidar las 3 implementaciones de tokenización; healthchecks compose;
   observabilidad de KPIs de contexto; gobierno de prompts.
5. **Continuo (Medio/Bajo):** documentación única viva (deprecar los ~70 MD), tests de carga,
   cifrado del store, RBAC.
