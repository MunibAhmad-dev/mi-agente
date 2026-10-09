# AEOS — Plan de Integración, Instalación y Configuración por Fases (hacia 10/10)

**Objetivo:** cerrar cada hallazgo de `docs/FORENSIC_AUDIT.md` y llegar a un sistema
completo, instalable con un comando, configurado por entorno, con el proyecto
adjunto (`_upstream/`) integrado donde aporta y descartado donde simula.
**Regla:** cada fase termina con tests en verde + tracker §157 actualizado + nada
declarado completo sin verificación (§159). Las fases ordenan el trabajo; ninguna
es un MVP (§156).

Estado de partida: 44/44 tests, 2.947 LOC, 0 placeholders en producción,
3 defectos económicos detectados por sondas forenses (P-4, P-5, P-6).

---

## Fase 0 — Higiene inmediata (días 1–2) · cierra P-4, P-5, P-6, P-13, P-15

**Meta: contabilidad exacta. Sin esto, todo lo demás hereda errores de dinero.**

1. `aeos/economics/treasury.py`:
   - `settle_profit`: debitar `cash_minor` del agente en la misma transacción
     (cash -= monto). Cerrar la doble contabilidad (sonda F1).
   - `settle_loss`: ya debita; añadir test de la suma global
     (`treasury.total() + Σ agent_cash == capital inyectado`, invariant checker).
   - `Cemetery.bury` → `aeos/agents/cemetery.py`: computar `unused = cash_minor`
     y devolverlo al bucket origen (registrar origen en `agent_economics` o
     pasar bucket como argumento). Liberar `allocated_minor`.
2. Migración `0002_immutability.sql`:
   - Trigger `predictions_no_unresolve`: abortar `UPDATE predictions SET
     resolved_at=NULL WHERE OLD.resolved_at IS NOT NULL` y cualquier UPDATE de
     `actual/brier` sobre filas resueltas (cierra sonda F3).
   - Trigger equivalente para `cemetery` (no des-enterrar).
3. `aeos/core/events.py`: evento `SubscriberFailed` propio (fin de la
   miscategorización como `PolicyBlocked`).
4. `aeos/economics/money.py`: `Decimal` con `ROUND_HALF_UP`; caps de tesorería
   con `// ` entero sobre bps (fin de sonda F5).
5. Tests nuevos: `test_no_double_count`, `test_bury_releases_capital`,
   `test_predictions_cannot_unresolve`, `test_half_up_rounding`.

**Salida:** suite ≥ 50 tests verde; sondas F1/F2/F3/F5 corregidas y convertidas en tests permanentes.

## Fase 1 — Identidad, permisos y autorización (días 3–7) · cierra P-1

**Meta: que `authorization` deje de ser un string libre.**

1. Migración `0003_identity.sql`: tablas `principals` (human/service/agent),
   `api_keys` (hash + prefix + rotación), `roles`, `role_permissions`,
   `audit_access` (quién leyó qué).
2. `aeos/governance/permissions.py`: las 13 permisiones de §70 como enum;
   `AuthorizationContext` que se exige en:
   - `Treasury.allocate/settle_profit/withdraw` → `ALLOCATE_CAPITAL`
   - `Lifecycle.transition` → `MODIFY_AGENT`
   - `AgentFactory.spawn` → `SPAWN_AGENT`
   - `LiveExecutionGate.authorize` → `EXECUTE_TRADE` + principal humano (§71)
3. Policy engine determinista (§69) versión mínima: `aeos/governance/policy.py`
   con reglas declarativas por familia (capital/agent/tool/market) y resultado
   `ALLOW|DENY|ESCALATE` persistido en decision records.
4. Human approval levels 0–4 (§71): tabla `approvals` — acciones level≥3 quedan
   `PENDING` hasta approval humano explícito.
5. `tests/test_security.py` con los 9 ataques de §146 parametrizados:
   escalación de presupuesto, bypass de permisos, gasto de agente muerto,
   doble gasto con misma clave de idempotencia, acceso no autorizado a audit,
   spawn sin permiso, modificación de genome histórico (ya bloqueada por PK),
   execución live sin humano, profit sin referencia externa.

**Salida:** ningún movimiento de capital posible sin principal autenticado + permiso + policy ALLOW.

## Fase 2 — Runtime y orquestación del loop autónomo (semana 2) · cierra P-2

**Meta: que el ciclo §4 se ejecute solo, de forma durable, no en un script de humo.**

1. `aeos/runtime/queue.py`: tabla `work_queue` durable (claim con
   `BEGIN IMMEDIATE`, lease, reintentos, dead-letter) — ejecución durable LOCAL
   MODE sin dependencias (§63); adapter opcional a DBOS/Temporal después.
2. `aeos/runtime/orchestrator.py`: el loop §133/§134 como workflow con fases
   OBSERVE→EXPERIMENT→MEASURE→ACCOUNT→EVALUATE→SELECT→KILL→MUTATE→SPAWN→ALLOCATE,
   cada fase idempotente (idempotency key §66), checkpoint en `work_queue`,
   y consulta de EMERGENCY STOP (§72: tabla `system_flags`) antes de cada fase.
3. `aeos/runtime/agent_runtime.py`: ejecutor de agente con límites §120
   (max_tokens/runtime/external_actions contados y cortados en exceso).
4. Scheduler §118: prioridades 1–6 (protección de capital primero), values/cost/
   risk/urgency en la cola.
5. CLI: `start/stop/status` que gestionan el orquestador.
6. Tests: reanudación tras crash simulado (matar el proceso a mitad de fase y
   relanzar: ninguna acción externa duplicada), EMERGENCY STOP congela
   ejecución financiera preservando audit.

**Salida:** `aeos start` corre el loop económico indefinidamente en LOCAL MODE, sobrevive reinicios, y se detiene limpio con `aeos stop`.

## Fase 3 — Revenue real, reconciliación y anti-simulación (semana 3) · cierra P-9, P-10

**Meta: que nada sintético pueda pasar por revenue real.**

1. `aeos/economics/ledger.py`: `external_reference` obligatorio para
   `revenue`/`profit_distribution`; validación de formato por fuente
   (`stripe:pi_...`, `order:...`, `campaign:...`).
2. `aeos/reconciliation/engine.py` (§67, §167j): comparadores
   interno-vs-externo pluggables (payment provider, exchange, hosting);
   discrepancia → `RECONCILIATION_REQUIRED` + evento + bloqueo de nuevas
   asignaciones a esa cuenta hasta resolver.
3. `aeos/core/resilience.py` (§121–122): clasificación
   TRANSIENT/PERMANENT/EXTERNAL/INTERNAL/POLICY/SECURITY/UNKNOWN con política de
   reintento por tipo, timeout, backoff con jitter, circuit breaker por
   proveedor, y **UNKNOWN → nunca re-ejecutar: primero query-provider** (§68).
4. Adaptador de pagos mínimo `IPaymentProvider` (Stripe en modo test primero;
   credenciales del usuario, nunca hardcodeadas) + webhook verificado +
   idempotency key + conciliación contra el ledger.
5. Tests: profit sin referencia → rechazado; webhook duplicado → una sola
   entrada; provider caído → circuit breaker abre; UNKNOWN → resuelve antes de retry.

**Salida:** primera cadena completa real: checkout → webhook verificado → invoice → ledger → revenue REAL etiquetado.

## Fase 4 — Persistencia operativa: backup, despliegue, observabilidad (semana 4) · cierra P-7, P-8, P-11, P-12

1. `aeos/core/db.py`: `check_same_thread=False` + `busy_timeout=5000` +
   docstring "una instancia por thread"; tests T1/T2 permanentes.
2. `aeos/ops/backup.py` (§115–116): dump consistente (VACUUM INTO), hash,
   `restore` con integrity check + re-verificación de audit chain; test
   backup→destroy→restore→resume.
3. `infrastructure/docker/`: Dockerfile multi-stage (core sin dependencias
   pesadas), `docker-compose.yml` (app + Caddy con TLS local), perfiles
   dev/paper/production (§151–152), `.env.example` completo.
4. OpenTelemetry (§112): spans en allocate/settle/transition/submit/order con
   agent_id/generation; exporter OTLP a archivo en LOCAL MODE; `/metrics`
   Prometheus cuando exista la API.
5. Cableado completo Settings→bootstrap (caps, max_population, limits del risk
   engine desde env) — fin de P-12.
6. System doctor ampliado (§150): proveedores configurados, disco, workers,
   scheduler, flags de emergency stop.

**Salida:** `docker compose up` levanta el sistema en el modo elegido; backup/restore probado; trazas y métricas visibles.

## Fase 5 — World Brain y oportunidades (semana 5–6) · abre P3 del plan

1. `aeos/adapters/` según OPEN_SOURCE_STACK: feedparser (RSS), trafilatura
   (extracción), Crawl4AI opcional, Playwright para browser real, ISearchProvider.
2. Pipeline §24: INGEST→NORMALIZE→DEDUP(hash+simhash)→EXTRACT→ENTITY RESOLUTION
   (RapidFuzz exacto+fuzzy)→SOURCE TRUST→TEMPORALIZE(valid_from/valid_until,
   nunca sobrescribir §26)→STORE(provenance §75: source/timestamp/hash/método)→SIGNAL.
3. `aeos/world/signals.py`: trend/velocity/acceleration/novelty/sentiment/confidence.
4. `aeos/opportunities/engine.py` (§30–31): scoring
   EV·p·info_value + opcionalidad − costes, threshold, portfolio (§103).
5. Manipulación (§76): PyOD/River para anomalías, NetworkX para clusters.
6. Fuente de datos inicial honesta: RSS + APIs públicas gratuitas;
   sin datos → `NO_REAL_DATA_AVAILABLE` (§139), nunca relleno.

**Salida:** oportunidades detectadas desde fuentes reales con provenance y confidence; el orquestador las consume para crear agentes.

## Fase 6 — Producto, marketing y facturación (semanas 7–8)

1. `aeos/products/factory.py`: landing/micro-SaaS generados por plantillas;
   pipeline §74 completo (build→test→dependency audit→license→sandbox→deploy)
   con sandbox de proceso (subprocess con límites) antes de deploy.
2. `IHostingProvider` adapter (deploy estático a proveedor configurable,
   healthcheck + rollback §35, §167e).
3. Marketing §36–39: `IMarketingProvider`/`IEmailProvider` (Dittofeed/Postal
   self-host MIT cuando el usuario levante servicios); bandit engine (MABWiser
   adapter) para canal/mensaje/precio; gobernanza anti-spam (§39) como policies.
4. Analytics §41–42: backend interno de eventos (visit/signup/purchase ya
   conocidos) + funnel/cohort/CAC/LTV; attribution graph.
5. Soporte §167c: tabla tickets + clasificación + SLA; alimenta mutation del genoma.

**Salida:** loop §130 completo con credenciales reales del usuario; sin credenciales, el sistema declara qué falta y no simula.

## Fase 7 — Integración del proyecto adjunto (_upstream) — qué se hace con cada pieza

| Pieza upstream | Decisión | Acción concreta en esta fase |
|---|---|---|
| `services/market_data.py` | ✅ ya portado | mantener como referencia; el adaptador aeos es superior (provenance + honest failure) |
| `services/risk_manager.py` | ✅ diseño portado | conservar tests de paridad: casos del upstream (drawdown stop, intervalo mínimo) deben pasar contra el RiskEngine nuevo |
| `services/trading_executor.py` | 🔶 portar en P5 | reescribir como `IExchange` ejecutor tras el live gate, con idempotency key, unknown-result resolution y reconciliación; **nunca** directo LLM→exchange (§46) |
| `services/memory.py` | ❌ descartado | embedding dummy = simulación (§2 prohibido); reemplazar por sqlite-vec + sentence-transformers |
| `api/main.py` + routers | 🔶 referencia de shape | el import `StrawberryAPI` está roto y depende de Postgres/Redis/Qdrant para arrancar; la API del núcleo (Fase 8) sigue el mismo shape de endpoints pero sobre FastAPI+SQLite |
| `frontend/` (React+antd) | 🔶 reutilizar shell | reutilizar App.tsx/layout/páginas como shell del dashboard P8, apuntando a la nueva API; login real contra Fase 1 |
| `docker-compose.production.yml` | ❌ descartado | servicios pesados contrarios a low-resource-first (§8); el nuevo compose es Fase 4 |
| `ml/` (Airflow/Feast/MLflow) | ❌ diferido | opcional DISTRIBUTED MODE; no bloquea el producto |

**Regla de integración:** nada de upstream entra al núcleo sin pasar los mismos
tests, licencia permitida (§109) y prohibición de simulación (§2). El upstream
NO se borrará: queda en `_upstream/` como material de referencia.

## Fase 8 — API, dashboard y cierre §94/§88 (semana 9)

1. FastAPI (§94) sobre el núcleo con auth de Fase 1: `/agents`, `/treasury`,
   `/risk`, `/predictions`, `/audit`, `/health`, `/metrics` primero; el resto
   del surface después. Rate limiting, CORS restringido (no `*` como upstream).
2. Dashboard (§88–93) sobre el shell antd reutilizado: Overview, Agents,
   Cemetery, Treasury, Risk, Predictions, Audit, System primero.
3. GraphQL (Strawberry `Schema`, correctamente) opcional detrás de la misma capa.

**Salida:** dashboard y API operando contra el núcleo real con permisos reales.

## Fase 9 — Endurecimiento final y aceptación (semana 10) · cierra P-3

1. `tests/test_recovery.py` completo (§147): crash del worker, restart, DB
   restart, provider timeout, ejecución duplicada, resultado UNKNOWN.
2. `tests/test_security.py` completo (§146) + fuzzing básico de inputs.
3. `tests/test_resource.py` (§148): límites de tokens/red/spawn/retries.
4. Suite de licencias (§110): `pip-licenses` + OSV-Scanner en CI; build falla
   con licencia fuera de allowlist; SBOM por release.
5. Aceptación final §160 (los 24 pasos) como test e2e + `PRODUCTION_READINESS.md`
   (§158) + informe §165 con el quí WHAT REQUIRES USER CREDENTIALS honesto.

---

## Instalación y configuración objetivo (estado final)

```bash
# LOCAL MODE (producto principal, low-resource §8)
git clone <repo> && cd aeos
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[api]"                              # core stdlib-only; extras opcionales
cp .env.example .env                                 # AEOS_MODE=paper por defecto (seguro)
aeos doctor                                          # salud: db, migraciones, audit-chain, flags
aeos keys create --principal human:owner --role admin
aeos start                                           # loop económico autónomo en modo paper

# Modos (§152): development|test|paper|shadow|limited_live|production
#   paper (default): trading simulado etiquetado PAPER, revenue real solo vía proveedor
#   limited_live/production: exigen EXECUTE_TRADE + approval humano level>=3 por acción

# Docker (Fase 4)
docker compose --profile paper up -d                 # app + Caddy TLS local
docker compose --profile production up -d            # con .env de producción

# DISTRIBUTED MODE (opcional, §8): DBOS/Temporal adapter + Postgres, nunca requisito
```

**Credenciales que el usuario deberá proveer por fase** (nunca hardcodeadas, §152):
Fase 3: Stripe test keys. Fase 5: nada (RSS público) o Search API si se desea.
Fase 6: proveedor de email/hosting. Fase 7/P5: exchange API keys (trade-only,
sin withdrawal) para limited_live. Fase 8: nada.

**Criterio de "10/10" por fase:** tests en verde que ejercitan el comportamiento
(existencia de código no cuenta), tracker §157 actualizado a TESTED/PRODUCTION_READY,
y ninguna capacidad declarada que no se haya ejecutado al menos una vez en esta
sesión o por CI.
