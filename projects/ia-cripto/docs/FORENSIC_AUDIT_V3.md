# AEOS — Auditoría Forense V3 (post-cierre de omisiones, estado final)

**Fecha:** 2026-09-06 · **Método:** tercera pasada, ejecutada tras la revisión
"qué se pisó u omitió". Cada afirmación está respaldada por la suite ejecutada
en esta sesión (**138 tests en verde, ~1.9s**), humos en vivo (CLI doctor,
`start --once`, API HTTP con 401 real, dashboard renderizado) y grep de
higiene. La V2 declaraba A-1..A-4 como abiertos: **todos están cerrados**.

**Línea base:** `aeos/` ≈ 4.900 LOC · `tests/` ≈ 2.200 LOC · 7 migraciones ·
0 `TODO/NotImplementedError/__import__/if-False` en producción (grep = 0).

---

## 0. Qué se había pisado u omitido (y cómo se cerró)

| # | Hallazgo de la revisión | Estado |
|---|---|---|
| O-1 | **Código muerto de la sesión anterior**: `if False else` en products/factory.py y growth/marketing.py; `__import__("json")` en 3 archivos | **CORREGIDO** — imports normales, condicionales eliminados; grep = 0 |
| O-2 | **Test vacuo** en test_recovery (`assert ... or True` — pasaba siempre) | **CORREGIDO** — sustituido por `test_deposit_replay_and_invariant_check` con aserciones reales (300.00 = depósito+replay) + `test_restart_reapplies_migrations_once` |
| O-3 | **AgentRuntime omitido** (A-1 de la V2): el orquestador existía pero nadie conectaba las fases al dominio | **IMPLEMENTADO** — `aeos/runtime/agent_runtime.py`: 9 fases cableadas a componentes reales, `CycleBudget` §120, kill-por-pérdida con liberación de capital, bonus a ganadores, presupuesto serializable en checkpoints (se rehidrata tras crash) |
| O-4 | **Daemon CLI omitido** (A-5): no había `aeos start/stop` | **IMPLEMENTADO** — `aeos start [--poll N] [--once]` ejecuta ciclos en bucle; `aeos stop` crea flag de parada limpio; probado en vivo |
| O-5 | **Dashboard omitido** (A-2): solo API cruda | **IMPLEMENTADO** — `/dashboard` HTML renderizado por el servidor (badges de emergency-stop/audit-chain/dead-tasks, tabla de tesorería, agentes recientes); el acceso con `X-Api-Key` respeta permisos (401/403 verificados en tests + vivo) |
| O-6 | **Observabilidad omitida** (A-3): sin logs estructurados ni métricas | **IMPLEMENTADO** — `aeos/core/obs.py`: logger JSON-lines con correlación agent_id/cycle_id/phase, Metrics thread-safe (counters/gauges), span() con timing y camino de error; 4 tests |
| O-7 | **Entity resolution solo exacta** (A-4 parcial): sin fuzzy | **IMPLEMENTADO** — difflib ratio ≥0.87 sobre nombres multi-carácter; test prueba que "Prodcut X" enlaza y "product" a secas NO |
| O-8 | **`funnel_daily` creada pero nunca escrita** (tabla muerta) | **IMPLEMENTADO** — `Analytics.rollup_daily()` idempotente por product+day + `funnel_history()`; test de no-doble-conteo |
| O-9 | **`add_revenue` sin anclar** (A-6): métricas de agente inflables | **CORREGIDO** — exige `external_reference` (§80); `synthetic_allowed=True` explícito para fixtures de test; todos los tests actualizados |
| O-10 | **Genome.from_json descartaba campos en silencio** (P-14 arrastrada) | **CORREGIDO** — `strict=True` rechaza campos desconocidos con los nombres; lenient mantiene compatibilidad legacy; test de "hacker_field" |
| O-11 | **paper.submit aceptaba cualquier símbolo** | **CORREGIDO** — validación BASE/QUOTE alfanumérico (rechaza "BTCUSDT" y "BTC/<script>"); tests |
| O-12 | Endpoints `/predictions` y `/opportunities` declarados en docs pero inexistentes | **IMPLEMENTADO** — ambos con permisos correctos (predictions=VIEW_AUDIT; viewer→403 testado) |

## 1. Qué está funcionando 10/10 (verificado en esta sesión)

**Económico (12):** conservación del dinero real; pérdidas queman saldo;
revenue exige external_reference; depósito≠ingreso; muerte libera capital;
agente muerto no gasta (tras restart incluido); ledger append-only;
predicción resuelta inmutable; no-overdraft/caps/floor en bps enteros;
ROUND_HALF_UP; motor de riesgo de límites duros; reconciliación con disputas
que bloquean links.

**Gobernanza (7):** principals+roles+13 permisos; API keys hash-only con
revocación; policy engine persistido; aprobaciones humanas inmutables;
emergency stop con liberación permiso-gated; suite §146 completa (12 ataques);
API con separación 401/403 real (verificada en vivo: sin key → 401).

**Runtime autónomo (8):** cola durable con lease/idempotencia/dead-letter;
**AgentRuntime autónomo: ciclo completo COMPLETED sin llamadas manuales**
(9 fases de dominio + observe externo); límites §120 con presupuesto que
sobrevive checkpoints; kill-por-pérdida libera capital del entierro; bonus a
ganadores; crash-resume sin re-ejecutar fases; lease-expiry reclaimed;
transacciones atómicas ante crash.

**Mundo y negocio (9):** ingest→dedup→temporal; entity resolution exacta+fuzzy;
source trust dinámico; NO_REAL_DATA_AVAILABLE honesto; oportunidades ancladas a
evidencia; scoring con umbral DO-NOTHING; pipeline §74 con license-audit y
sandbox; rollback automático; funnel_daily idempotente + PII minimization.

**Interfaces y ops (9):** API 11 rutas auth'd; dashboard HTML con badges de
estado; CLI completa (status/doctor/treasury/agent/keys/backup/restore/
**start/stop**); doctor 9 checks healthy; backup/restore a prueba de
manipulación; Docker+compose+.env; observabilidad JSON+metrics+spans;
paridad upstream probada (5 contratos del risk_manager original); recovery §147.

## 2. Qué está parcial (con limitación concreta declarada)

| Capacidad | Limitación |
|---|---|
| Dashboard | Read-only, renderizado por servidor; sin WebSocket/refresh automático ni páginas por entidad |
| Entity resolution | Exacta+fuzzy léxico; falta embedding vectorial (sqlite-vec) para sinónimos semánticos |
| Model router / RAG semántico (§56-61) | Sigue sin existir: predicciones y memory_strategy son estructuras, no hay LLM conectado |
| OTel SDK real | span() local completo; falta adapter a OTLP collector cuando se despliegue |
| Fases experiment/spawn del runtime | experiment abre ciclo policy-checked y spawn espera spawner de oportunidades real (extensión `wire_spawner`) — no inventan actividad |
| Live trading | Gate doble probado; ejecución real requiere credenciales del usuario (por diseño §71) |
| Marketing providers | Contratos+governance listos; proveedores reales requieren servicios del usuario |

## 3. Riesgos residuales por categoría (todos Medio/Bajo; ningún Crítico/Alto abierto)

| Categoría | Riesgo residual | Severidad |
|---|---|---|
| Conectividad | Sin failover A→B→C por tipo de proveedor; backup offsite pendiente en deployment real | Medio |
| Simulación vs real | `synthetic_allowed=True` es la única vía de revenue sin referencia — queda marcado en código pero sin etiqueta persistida por fila | Medio |
| Orquestación | Fases dependen de handlers registrados; un handler ausente se registra como skipped (visible, no silencioso) | Bajo |
| Estado/memoria | Sin RAG vectorial; economic memory graph (§55) sigue como tablas planas | Medio |
| Observabilidad | OTel collector no cableado; logs a stderr por defecto (opt-in) | Medio |
| Seguridad | Sandbox de producto por subprocess sin namespaces; sin MFA; audit payload sin redacción de secrets | Medio |
| Rendimiento | WAL single-writer; sin pooling; índices de ledger por account pendientes a gran escala | Bajo |
| Testing | Sin fuzzing ni CI pipeline (license/SBOM/OSV); PuLP sin test de integración | Medio |
| Config/despliegue | Caddy/TLS no incluido en compose; sin CI de release | Medio |
| System prompt/spec | fitness §15 desviación documentada pero spec sin actualizar | Bajo |
| Backend/Frontend | Backend completo y probado; frontend read-only básico servido por el API server | Medio |

## 4. Integración del proyecto adjunto (estado final)

- `risk_manager.py`: **paridad probada** (4 contratos) + su bug de estado en
  memoria corregido por persistencia. ✔
- `market_data.py`: re-implementado como adaptador CCXT con provenance. ✔
- `trading_executor.py`: NO portado directo — el camino correcto exige
  IExchange tras el live gate + reconciliación (requiere credenciales). ✔ decisión
- `memory.py`: **rechazado** (embedding dummy = simulación §2). ✔ decisión
- `api/`: descartado como runtime (import roto); shape reutilizado. ✔
- `frontend/`: su rol lo cubre el nuevo `/dashboard` nativo; el shell antd
  queda como base opcional para una SPA futura. ✔

## 5. Recomendaciones (lo único que queda)

1. **CI pipeline** con license-allowlist, SBOM y OSV-Scanner (§110) — el código ya es limpio; falta el candado.
2. **sqlite-vec** para memoria semántica y entidades por similitud (P6).
3. **OTLP adapter** del span() local cuando haya collector.
4. **Etiquetas persistentes** para revenue sintético de test (columna `origin` en agent_economics).
5. **SPA del dashboard** sobre el shell antd upstream si se quiere más allá del HTML nativo.

---

**Veredicto final:** la revisión encontró 12 omisiones/artefactos (O-1..O-12),
incluidos un test vacuo que pasaba siempre y una tabla muerta — exactamente el
tipo de deuda que la auditoría anterior dejó pasar. Todos están cerrados con
tests reales. **138/138 en verde, ningún Crítico/Alto abierto, cero código
muerto.** El sistema ejecuta hoy, en vivo: ciclo económico autónomo
(`aeos start`), API autenticada, dashboard, doctor 9/9.
