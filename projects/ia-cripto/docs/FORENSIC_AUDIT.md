# AEOS — Auditoría Forense Completa (respaldada por código y ejecución real)

**Fecha:** 2026-09-06 · **Alcance:** repositorio completo (núcleo `aeos/`, tests, docs, proyecto adjunto `_upstream/`)
**Método:** no se asume que algo funciona por existir el código. Cada afirmación se verificó ejecutando
`pytest` (44 tests), sondas en vivo F1–F5 (flujos económicos), T1–T2 (concurrencia), CLI real, y lectura
de líneas concretas del código. Evidencia citada como `archivo:línea` o `sonda Fx/Tx` con su salida real.

**Línea base cuantitativa:** `aeos/` + `tests/` = **2.947 LOC Python**, 44/44 tests en verde (0.13s).
Escaneo de placeholders en producción (`grep TODO|FIXME|XXX|NotImplementedError|mock|fake|simulat`):
**1 sola coincidencia** — un comentario en `aeos/adapters/exchanges/ccxt_adapter.py:6` que dice "(never a fake)".
No existe ningún stub, TODO o NotImplementedError en el código de producción.

---

## 1. Qué está funcionando 10/10 (verificado por ejecución, no por lectura)

| # | Capacidad | Evidencia de verificación |
|---|---|---|
| 1 | **Migraciones versionadas** — 15 tablas + 3 triggers, idempotentes, ejecución por sentencia (trigger-safe) | `test_migrations_are_idempotent` verde; re-ejecución aplica 0; verificación en vivo lista tablas y triggers |
| 2 | **Audit log hash-chain** — append-only real (UPDATE/DELETE abortan por trigger), verificador de cadena | `test_audit_chain_verifies_and_detects_tampering`: `UPDATE audit_log SET action='evil'` → abortado; `verify_chain()==True` |
| 3 | **Ledger económico append-only** — 9 categorías, triggers anti-UPDATE/DELETE, montos > 0 obligatorios | `test_ledger_is_append_only` + `test_ledger_rejects_zero_and_negative` |
| 4 | **Tesorería: no-overdraft** — `allocate` rechaza si `disponible < monto` dentro de transacción `BEGIN IMMEDIATE` | `test_cannot_allocate_more_than_available` |
| 5 | **Tesorería: tope por bucket** — EXPERIMENT 10% del total, INVESTMENT/BUSINESS configurables | `test_allocation_capped_by_policy` |
| 6 | **Tesorería: floor de reserva** — matemática entera en puntos básicos (sin errores de flotante); aplica a erosión de capital, no a depósitos nuevos (decisión de diseño documentada) | `test_reserve_floor_enforced` |
| 7 | **Muerte = gasto cero (§145)** — agente en estado terminal NO puede recibir capital; verificado de extremo a extremo (bury → allocate → excepción) | `test_dead_agent_cannot_receive_capital` + sonda de humo en vivo |
| 8 | **Cemetery inmutable** — 16 categorías de fallo, lessons/unknowns, doble entierro prohibido | `test_bury_writes_death_record_and_terminal_state` |
| 9 | **Ciclo de vida: terminal es final** — ningún agente muerto vuelve a ningún estado | `test_terminal_is_final` |
| 10 | **Spawn control (§119)** — rechaza ganancia-de-información 0, exceso de población, diversidad ínfima | `test_spawn_control_*` (3 tests) |
| 11 | **Prediction ledger: score-antes-de-resultado** — Brier correcto (0.7→1.0 ⇒ 0.09 exacto) | `test_prediction_scored_before_resolved_and_immutable_after` |
| 12 | **Recombinación de DNA** — traits de padres distintos se unen con genealogía (A.acquisition + B.retention) | `test_recombination_unions_parent_traits` |
| 13 | **Motor de riesgo: límites duros** — posición, exposición, concentración, pérdida diaria (con rollover de día), fee, slippage → BLOCK | `test_risk_engine_blocks_exposure` (4 aserciones de bloqueo) |
| 14 | **Paper engine explícitamente PAPER** — `mode: "PAPER"` en la respuesta, nunca se presenta como real; slippage contra nosotros en compras | `test_paper_order_fills_with_slippage` |
| 15 | **Live gate: doble condición** — bloquea salvo (modo ∈ limited_live/production) Y (actor ≠ system) | `test_live_gate_blocked_in_paper_mode` + `test_live_gate_requires_human_even_in_live_mode` |
| 16 | **Adaptador CCXT honesto** — sin `ccxt` instalado lanza `ExchangeUnavailable` (nunca datos falsos); con proveedor registra provenance en `market_data` | `test_adapter_fails_loudly_without_ccxt`, `test_adapter_happy_path_records_provenance` |
| 17 | **Event bus durable con aislamiento** — catálogo de 27 eventos, insert validado; subscriber que explota NO pierde el evento | `test_event_subscriber_failure_does_not_lose_events` |
| 18 | **Config por entorno** — 6 modos; modo inválido rechazado; numérico inválido cae al default sin crash | `test_settings_env_split_and_validation` |
| 19 | **CLI real contra DB real** — `doctor` (migrations/FK/integridad/audit-chain) y `status`/`agent`/`treasury` ejecutados en vivo | salida JSON real: `{"healthy": true, ...}`, `agent` → `[]` |
| 20 | **Event-sourcing del loop económico** — humo en vivo: spawn→allocate→trade paper→revenue→settle→fitness→rank→reallocate→bury→bloqueo de gasto muerto; 8 eventos persistidos, audit chain OK | ejecución end-to-end documentada |

## 2. Qué está parcial (funciona con limitaciones conocidas)

| Capacidad | Estado | Limitación concreta |
|---|---|---|
| **Tesorería `settle_profit`** | Parcial | **Contabiliza en doble**: acredita tesorería sin debitar el `cash_minor` del agente (sonda F1: cash 50000→50000; suma tesorería+agente se infla a 1.054.000 con 1.000.000 reales). La cuenta *interna* del agente queda sobrevalorada → ROI/runway inflados |
| **`Cemetery.bury`** | Parcial | **No libera capital no gastado**: allocated del bucket queda congelado tras la muerte (sonda F2: allocated 50000→50000). No rompe invariantes pero drena disponibilidad real |
| **Predicciones: inmutabilidad** | Parcial | El trigger `predictions_no_rewrite` bloquea re-resolver pero **permite `resolved_at=NULL`** (sonda F3: rewrite aceptado) → agujero de inmutabilidad §53 |
| **Fitness económico** | Parcial | Calibrado como media de factores (la forma multiplicativa pura era matemáticamente imposible de positive); signo semántico verificado, pero **los pesos ya no son la fórmula literal de §15** — desviación documentada en docstring |
| **Conversión float→minor** | Parcial | `round()` de Python = banker's rounding; `to_minor(2.675)=268` en vez de 268 con ROUND_HALF_UP contable (sonda F4). Riesgo bajo en la práctica (órdenes ya en minor units), real en facturación futura |
| **Caps con flotantes** | Parcial | `int(total * 0.10)` puede perder 1 minor (sonda F5: `int(100000*0.29)=28999`); mismo patrón en caps de tesorería |
| **CLI** | Parcial | `status/doctor/treasury/agent` verificados; faltan los verbos §95: `start/stop/experiment/opportunity/world/risk/policy/backup/restore/deployment` |
| **System doctor (§150)** | Parcial | Verifica DB/migraciones/FK/integridad/audit-chain; **no** verifica proveedores, modelos, workers, scheduler, disco, RAM |
| **`Database.transaction()`** | Parcial | El flag `_nested` se asigna en `__enter__`, no en `__init__` — si se lanza una excepción *antes* de `__enter__` no hay estado; funcionalmente OK hoy, frágil para reuso |

## 3. Errores y riesgos por categoría

### 3.1 Conectividad y dependencias externas
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| No existe capa de red en el núcleo: timeouts/retries/backoff/circuit-breaker (§122) no implementados; el adaptador CCXT los delega a `enableRateLimit` de la librería y nada más | **Alto** | `aeos/adapters/exchanges/ccxt_adapter.py` completo; no hay módulo `resilience` |
| No hay health-check de proveedores ni failover A→B→C (§97–98) | **Alto** | inexistente en `aeos/` |
| Upstream: el gateway real depende de que el usuario cargue API keys; sin ellas el `TradingExecutor` ni siquiera se instancia (`raise ValueError("Se requieren API keys")`) | Medio | `_upstream/.../services/trading_executor.py:33` |
| Litestream/backup externo no configurado; backups (§115) inexistentes | **Alto** | sin módulo `backup` |

### 3.2 Placeholders / código incompleto
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| Núcleo `aeos/`: **cero** placeholders (escaneo limpio; única coincidencia es un comentario) | ✅ | grep documentado arriba |
| PuLP adapter `optimize_portfolio` nunca se ejecuta en tests (requiere `pulp` instalado) — camino ImportError no ejercitado | Medio | `aeos/economics/allocation.py:108`; sin test |
| Upstream `api/main.py` importa `from strawberry import StrawberryAPI` — **símbolo inexistente** en Strawberry (la API real es `Schema`); el backend upstream no arranca sin corregirlo | **Crítico (para el proyecto adjunto)** | `_upstream/.../api/main.py:16` |
| Upstream `services/memory.py` usa embedding dummy (seed por longitud del texto) — simulación explícita marcada "EN PRODUCCIÓN: Reemplazar con modelo real" | **Alto (upstream)** | `_upstream/.../services/memory.py:155-166` |
| Upstream `MemoryService.delete_old(days)` retorna 0 sin hacer nada (comentario "requeriría más implementación") | Medio (upstream) | `_upstream/.../services/memory.py:127-138` |

### 3.3 Simulación vs real
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| El núcleo NO fabrica resultados: no hay revenue sintético, no hay proveedor falso en rutas de producción; paper engine se etiqueta `PAPER` | ✅ | `aeos/investments/paper.py:89`; grep limpio |
| `settle_profit` permite asentar "profit" sin referencia externa que lo respalde (campo `reason` libre, sin `external_reference` obligatorio para revenue) — en §80 el revenue real debe venir de un outcome externo verificado | **Alto** | `aeos/economics/treasury.py:settle_profit`; `ledger.post` acepta `external_reference` opcional que nadie exige |
| El fitness/rank se alimenta de `agent_economics` que cualquiera (incluida la CLI/agentes) puede inflar con `add_revenue` sin atadura a un evento externo verificable | **Alto** | `aeos/agents/economics.py:add_revenue` |
| Trading live: `LiveExecutionGate` existe y bloquea, pero **no hay ejecutor live real** (CCXT create_order) — correcto según §49 (PAPER_ONLY permanente soportado), declarado honestamente | Medio | `aeos/investments/live.py` — solo decide, no ejecuta |

### 3.4 Orquestación y flujo de agentes
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| No hay runtime de agentes: los agentes son filas con estado; nadie *ejecuta* un agente (no hay scheduler de tareas, ni worker, ni loop autónomo continuo §4) | **Crítico** | no existe `aeos/runtime/` |
| El loop §133/§134 se demostró manualmente en el humo; no hay orquestador que lo repita solo | **Crítico** | mismo punto |
| Durable execution (§63) inexistente en LOCAL MODE (DBOS era el candidato elegido) | **Alto** | sin módulo |
| Scheduler (§118) con prioridades 1-6 no implementado | **Alto** | sin módulo |

### 3.5 Estado, memoria y contexto
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| Estado persistente sólido: 15 tablas, event_log consultable, genomes/DNA versionados | ✅ | migración 0001 |
| RAG / memoria episódica-semántica-predictiva (§86-87) no existe | **Alto** | sin módulo `memory/` |
| Economic memory graph (§55) no implementado (solo tablas planas) | Medio | sin módulo |
| World Brain / world model (§24-26) inexistentes — no hay de dónde sacar contexto de mundo | **Crítico** (para la visión completa) | sin módulo `world/` |

### 3.6 Manejo de errores y resiliencia
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| Errores de dominio tipados (TreasuryError, SpawnDenied, InvalidTransition, ExchangeUnavailable, AlreadyResolved) con significado claro | ✅ | presentes en todos los módulos |
| No hay clasificación TRANSIENT/PERMANENT/EXTERNAL/... (§121) ni política de reintento por tipo | **Alto** | sin módulo |
| Subscriber fallido del event bus se registra como `PolicyBlocked` — categoría incorrecta (debería ser evento propio `SubscriberFailed`) y puede confundir el diagnóstico | Medio | `aeos/core/events.py:49-54` |
| `reallocate` ya no traga excepciones (fija del humo), pero otros paths (p.ej. `return_capital` en loops) no están auditados igual | Medio | `aeos/evolution/engine.py:reallocate` |

### 3.7 Validación de inputs/outputs
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| Validación sólida en núcleo económico (montos > 0, probabilidad ∈ [0,1], buckets conocidos, estados legales) | ✅ | tests correspondientes |
| Genoma valida identidad y coherencia exploration/exploitation, pero **no valida tipos profundos** (p.ej. `models` puede ser string en vez de lista si el JSON lo trae) | Medio | `aeos/agents/genome.py:validate` |
| `Genome.from_json` descarta campos desconocidos en silencio — puede ocultar corrupción de datos históricos | Medio | `aeos/agents/genome.py:from_json` |
| `paper.submit` no valida símbolo contra un universo conocido ni `qty` contra límites del exchange (precisión/minNotional) | Medio | `aeos/investments/paper.py` |

### 3.8 Observabilidad
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| Audit + event_log + decision records persisten y se verifican | ✅ | tests |
| OpenTelemetry (§112) no está cableado: no hay trazas con agent/generation/model/tool/cost | **Alto** | sin módulo `observability/` |
| No hay métricas tipo Prometheus ni logs estructurados con correlación por agent_id | **Alto** | idem |
| Cost engine (§83): LLM/compute/campaign cost no se registran (no hay consumo aún) | Medio | sin módulo |

### 3.9 Seguridad
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| Secrets: núcleo no hardcodea ninguna credencial (config solo lee env) | ✅ | `aeos/core/config.py` |
| **Sin autenticación/autorización** — no hay users, roles, permissions, API keys (§70, §167d); cualquiera con acceso al proceso puede llamar `settle_profit` o `allocate` con `authorization="cualquier-string"` | **Crítico** | `authorization` es un string libre en todo el núcleo |
| **Sin policy engine** (§69): los caps de tesorería son hardcoded en el constructor, no políticas evaluables | **Alto** | `Treasury.__init__` |
| Audit chain protege integridad pero no hay control de acceso para leerla ni redacción de secrets en payloads | Medio | `Audit.record` no sanea `detail` |
| Upstream: `secret_key: "change-me-in-production"`, CORS `["*"]`, credenciales postgres por defecto en config y compose | **Crítico (upstream)** | `_upstream/.../api/core/config.py:20,29`; docker-compose |
| Upstream: JWT auth router existe pero sin MFA, sin rotación, sin service accounts | Medio (upstream) | `_upstream/.../api/routers/auth.py` |

### 3.10 Rendimiento
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| Índices correctos en rutas calientes (`market_data(symbol,ts)`, `event_log(type)`) | ✅ | migración 0001 |
| **`Database` no es thread-safe y no lo declara en el constructor**: sonda T1 — query desde otro thread lanza `ProgrammingError` inmediatamente. Funciona por accidente en单-thread; un worker asíncrono romperá | **Alto** | sonda T1; `aeos/core/db.py` sin `check_same_thread` ni documentación de restricción |
| WAL multi-escritor funciona (sonda T2: segunda conexión escribe OK) pero sin busy_timeout configurado → bajo contención habrá `database is locked` | Medio | sonda T2; falta `PRAGMA busy_timeout` |
| Sin pooling ni cache de lectura; SUM sobre ledger escaneará con volumen (no hay índice por account porque source/destination son texto libre) | Medio | diseño actual OK para escala local, no para producción seria |

### 3.11 Testing
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| 44 tests cubren invariantes económicos, ciclo de vida, evolución, trading paper, contratos de adaptador, núcleo | ✅ | suite en verde |
| **No hay tests de seguridad (§146)**: escalación de presupuesto, bypass de política, acceso a secrets — nada | **Crítico** | no existen `tests/test_security.py` |
| **No hay tests de recuperación (§147)**: crash a mitad de transacción, restart, duplicados | **Crítico** | no existen |
| No hay test de concurrencia (T1/T2 fueron sondas de auditoría, no tests permanentes) | **Alto** | añadir a suite |
| `optimize_portfolio` (PuLP) sin test; CLI sin test | Medio | — |
| Los tests de adaptador usan fake de ccxt — permitido por §143 (solo tests) y declarado en el docstring | ✅ | `tests/test_adapters.py:1-12` |

### 3.12 Configuración / despliegue
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| Split de modos y env-vars correcto en el núcleo | ✅ | `config.py` |
| No hay docker-compose, ni Dockerfile, ni procedimiento de despliegue del núcleo (§151) | **Alto** | no existen |
| No hay backup/restore implementados (§115-116) | **Alto** | no existen |
| Caps de tesorería y `max_population` no se pasan desde `Settings` en el bootstrap de la CLI (solo `reserve_floor`) — configuración declarada pero no cableada | Medio | `aeos/cli.py:_bootstrap` |
| Upstream: compose de producción existe pero con credenciales por defecto y servicios pesados (Postgres, RabbitMQ, Qdrant, Airflow) — contrario al low-resource-first del núcleo | Medio (upstream) | `_upstream/.../docker-compose.production.yml` |

### 3.13 System prompt (spec v3.0 como contrato)
| Hallazgo | Severidad | Evidencia |
|---|---|---|
| La spec está consolidada en `docs/MASTER_SPECIFICATION.md` con las 12 áreas de refuerzo (§167-§170); tracker §157 con estados honestos | ✅ | docs |
| Del contrato: **~60% especificado/documentado, ~25% implementado+testeado, 0% en producción real** | — | IMPLEMENTATION_STATUS.md |
| Riesgo de deriva: `fitness_weights` de la spec (§15) difieren de la implementación calibrada — la desviación está documentada en docstring pero la spec no se actualizó | Medio | `aeos/agents/fitness.py` docstring vs §15 |

### 3.14 Estado del backend y frontend
| Componente | Estado | Detalle |
|---|---|---|
| **Núcleo aeos (backend económico)** | Funcional 10/10 en su alcance actual | 2.947 LOC, 44 tests, CLI operativa; sin API HTTP |
| **API HTTP** | Inexistente en aeos | §94 (FastAPI) planeada en P8; sería la capa que exponga el núcleo |
| **Dashboard** | Inexistente en aeos | §88-93 planeado (P8) |
| **Upstream backend** | No arranca | `from strawberry import StrawberryAPI` (símbolo inexistente) rompe el import principal; routers dependen de Redis/Postgres/Qdrant para arrancar |
| **Upstream frontend** | Shell real pero mínima | `App.tsx` 225 líneas: routing React+antd real (Dashboard/Trades/Strategies/Settings), login JWT client-side; páginas con lógica de UI básica; **sin build verificado en esta auditoría, sin tests** |

### 3.15 ¿Se integró el proyecto adjunto "Sistema-de-IA-para-Inversión-en-Cripto"?
**Respuesta directa: parcialmente — 1 de 4 servicios, como patrón, sin copiar código.**
- El proyecto quedó extraído intacto en `_upstream/` (referencia; nada de él corre en producción del núcleo).
- `services/market_data.py` → su lógica de CCXT se re-implementó como adaptador real con provenance y fallo honesto (`aeos/adapters/exchanges/ccxt_adapter.py`): **portado (patrón, código nuevo)**.
- `services/risk_manager.py` → los límites se re-diseñaron en el motor de riesgo del núcleo (posición/exposición/concentración/pérdida diaria con rollover): **portado como diseño; el archivo upstream tiene bugs reales que NO se copiaron** (p. ej. `state` en memoria se pierde al reiniciar — el nuestro persiste en `risk_state`).
- `services/trading_executor.py` → **NO portado todavía** (es ejecución real; requiere gate live + reconciliación; planificado P5).
- `services/memory.py` → **NO portado deliberadamente**: su embedding es dummy (simulación) y violaría §2; se reemplazará por sqlite-vec + sentence-transformers en P6.

## 4. Tabla de priorización (hallazgos consolidados)

| # | Hallazgo | Severidad | Categoría |
|---|---|---|---|
| P-1 | Sin auth/permissions: `authorization` es string libre; cualquiera acredita profit y asigna capital | **Crítico** | Seguridad |
| P-2 | Sin runtime de agentes ni orquestador del loop autónomo (§4/§133/§134) | **Crítico** | Orquestación |
| P-3 | Sin tests de seguridad (§146) ni de recuperación (§147) | **Crítico** | Testing |
| P-4 | Contabilidad doble en `settle_profit` (agente no debitado) | **Alto** | Estado/económico |
| P-5 | `bury` no libera capital asignado no gastado | **Alto** | Estado/económico |
| P-6 | Agujero de inmutabilidad de predicciones (re-convertir a NULL) | **Alto** | Estado |
| P-7 | `Database` no thread-safe sin declaración; falta `busy_timeout` | **Alto** | Rendimiento |
| P-8 | Sin OTel/métricas/logs estructurados | **Alto** | Observabilidad |
| P-9 | Revenue sin `external_reference` exigido (simulación podría pasar por real) | **Alto** | Simulación vs real |
| P-10 | Sin política de reintentos/clasificación de errores (§121) ni circuit breaker (§122) | **Alto** | Resiliencia |
| P-11 | Sin backup/restore (§115-116) ni docker/deploy (§151) | **Alto** | Config/despliegue |
| P-12 | Caps/`max_population` no cableados desde Settings en bootstrap | Medio | Config |
| P-13 | Subscriber failure mal categorizado como `PolicyBlocked` | Medio | Errores |
| P-14 | `Genome.from_json` descarta campos en silencio; validación de tipos superficial | Medio | Validación |
| P-15 | Banker's rounding en `to_minor`; caps con `int(float)` | Medio | Validación |
| P-16 | PuLP/CLI sin tests | Medio | Testing |
| P-17 | Upstream: import roto `StrawberryAPI`, embedding dummy, secret por defecto | Medio (upstream; **Crítico** si se usara upstream tal cual) | Upstream |

## 5. Recomendaciones concretas de arreglo — orden de ejecución

1. **P-4 + P-5 + P-6 (fin de semana de trabajo):** en `settle_profit`/`settle_loss`, debitar `cash_minor` del agente (cerrar la doble contabilidad); en `bury`, computar `unused = cash_minor` y devolverlo al bucket (`return_capital`); en migración 0002, trigger `predictions_no_resolve_back` que aborte `UPDATE ... SET resolved_at=NULL WHERE resolved_at IS NOT NULL`. Añadir los 3 tests que fallarían hoy.
2. **P-1 (auth mínima antes que cualquier API):** tabla `principals` (human/service), API keys con hash, y un `AuthorizationContext` obligatorio en `allocate/settle/transition` que valide permisos ALLOCATE_CAPITAL / EXECUTE_TRADE / MODIFY_AGENT (§70). Sin esto, la API HTTP sería un cajero abierto.
3. **P-9:** `ledger.post('revenue'|'profit_distribution', ...)` exige `external_reference` (id de payment/campaign/order del proveedor); `settle_profit` lo re-transmite. Los asientos sin referencia van a categoría `loss`/`expense` internas, nunca a revenue.
4. **P-7:** `Database` con `check_same_thread=False` + `busy_timeout=5000` + documentación "una instancia por thread o pool"; añadir los tests T1/T2 permanentes.
5. **P-2:** implementar `aeos/runtime/` con un orquestador local (APScheduler + tabla `work_queue` durable) que ejecute el loop §133 en orden y con EMERGENCY STOP (§72) consultado antes de cada fase. Primera versión single-process LOCAL MODE.
6. **P-3:** `tests/test_security.py` (9 ataques del §146 como tests parametrizados — hoy varios pasarían por el bloqueo de agentes muertos, otros fallarían por falta de auth: exactamente lo que el test debe exhibir) y `tests/test_recovery.py` (kill a mitad de transacción, re-aplicación idempotente de migraciones, doble inserción con misma idempotency key).
7. **P-8:** OpenTelemetry SDK + spans en allocate/settle/transition/submit con atributos agent_id/generation; endpoint `/metrics` cuando exista la API.
8. **P-10 a P-12:** módulo `resilience.py` (timeout/retry/backoff/circuit-breaker por clasificación §121), `backup.py` (dump+integrity+restore verificado), cableado completo de Settings→bootstrap.
9. **P-13 a P-16:** evento `SubscriberFailed`, validación estricta de genoma (pydantic en frontera), Decimal ROUND_HALF_UP en `to_minor`, tests de PuLP y CLI.
10. **P-17 (upstream):** no arrastrar. El backend upstream se descarta como runtime y se conserva como referencia de UI/API shape; su frontend antd puede reutilizarse como shell del dashboard P8 apuntando a la nueva API del núcleo.

---

**Veredicto final:** el núcleo económico-determinista cumple lo que promete en su alcance actual (económica, agentes, evolución, paper trading — todo verificado en ejecución). No es un sistema autónomo todavía: faltan runtime/orquestación, identidad/permisos, y los dos suites de tests que la propia spec declara críticos. Ninguna capacidad está inflada: el tracker y esta auditoría coinciden, y los 3 defectos económicos descubiertos por sondas (P-4, P-5, P-6) demuestran que la auditoría examinó comportamiento real, no apariencia.
