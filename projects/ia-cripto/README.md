# AEOS — Real-World Autonomous Economic AI OS

![CI](https://github.com/proyectos-aoi/mi-agente/actions/workflows/ci.yml/badge.svg?branch=ia-cripto)

Sistema operativo económico autónomo: observa el mundo real, descubre
oportunidades, crea agentes con capital, experimenta en el mundo real, mide
resultados **reales**, mata lo que fracasa, evoluciona lo que funciona y
reasigna el capital — con contabilidad, permisos y auditoría como invariantes
no negociables. No es un chatbot: es un bucle económico que se conduce solo.

**Estado:** 156 tests (155 verdes + 1 sandbox real de ccxt que corre en CI) ·
5.671 LOC de núcleo · 8 migraciones · 0 placeholders en producción ·
CI verde en cada push.
Ver `IMPLEMENTATION_STATUS.md` (tracker honesto) y `docs/FORENSIC_AUDIT_V3.md`
(auditoría forense con evidencia ejecutada).

---

## ¿Qué es el proyecto?

AEOS resuelve un problema concreto: **operar un negocio digital e inversor con
agentes de IA sin perder el control del dinero ni de la verdad.**

Tres reglas lo definen:

1. **El LLM propone, nunca decide dinero.** Toda acción externa pasa por la
   cadena `propuesta → validación → política → riesgo → tesorería →
   autorización → ejecución → reconciliación → libro contable`. Los sistemas
   deterministas (contabilidad, límites, permisos) tienen la última palabra.
2. **Solo datos y resultados reales.** Los ingresos exigen una
   `external_reference` verificable (pago, exchange, proveedor); la
   simulación existe únicamente en tests. Si no hay datos reales, el sistema
   lo declara (`NO_REAL_DATA_AVAILABLE`) en vez de inventar.
3. **Darwinismo económico con memoria.** Los agentes compiten por capital con
   fitness medible; los muertos van al Cementerio con sus lecciones; los
   ganadores multiplican su ADN estratégico.

## Capacidades

**Economía y tesorería**
- Libro contable *append-only* con identidades globales verificadas
  (`Σ dinero total = inyectado + ingresos − pérdidas − retiros`).
- Tesorería con fondos segregados (RESERVA / OPERATIVO / EXPERIMENTO / NEGOCIO /
  INVERSIÓN / I+D / EMERGENCIA) y pisos que el sistema jamás puede cruzar.
- Asignación de capital por retorno esperado ajustado por riesgo, coste,
  incertidumbre y valor de información — **"NO HACER NADA" es una decisión válida**.
- Ingresos solo con referencia externa; depósitos del dueño nunca son ingresos;
  las pérdidas queman dinero real; agentes muertos no pueden gastar.

**Evolución y agentes**
- Genoma completo (misión, audiencia, producto, precio, canal, modelos,
  presupuesto, límites de riesgo, criterios de muerte) con versionado inmutable.
- Ciclo darwiniano: evaluar → clasificar → seleccionar → extraer ADN → mutar →
  recombinar → reproducir → probar en el mundo real.
- Cementerio permanente con razón de fallo, lecciones y capital devuelto;
  Salón de la Fama con explicación de *por qué ganó*.
- Predicciones con puntuación Brier (las promesas se miden).

**Mundo e inteligencia**
- Ingesta → dedup → memoria temporal (nunca sobrescribir hechos) → resolución
  de entidades (exacta + difusa) → confianza por fuente → señales.
- Oportunidades ancladas a evidencia real, puntuadas con umbral de rechazo.

**Ejecución de negocio**
- Fábrica de productos: build → test → licencia → sandbox → deploy →
  health-check → **rollback automático**.
- Growth con gobernanza anti-spam, embudo/CAC/LTV con minimización de PII.

**Gobernanza y seguridad**
- Identidades + roles + 13 permisos; API keys con hash (revocables).
- Motor de políticas determinista: `ALLOW / DENY / ESCALATE` persistido.
- Aprobaciones humanas obligatorias en nivel ≥ 3; doble humano en nivel 4.
- Parada de emergencia que congela toda fase financiera al instante.

**Operación**
- Cola de trabajo duradera (lease/idempotencia/reintentos/dead-letter).
- Orquestador con checkpoints por fase: **un crash a mitad de ciclo se reanuda
  sin repetir fases** (verificado por tests).
- Reconciliación universal (mi estado vs. el proveedor) con disputas y
  clasificación de errores; circuit breaker por proveedor.
- Backup/restore verificado que rechaza ficheros manipulados; Docker y perfiles.

**Trading real (testnet-first, §128)**
- Adapter CCXT real: la librería es opcional (`extra "trading"`), la instancia
  de exchange se inyecta y `set_sandbox_mode(True)` es obligatorio en la
  fábrica — producción solo se alcanza cableándola explícitamente.
- **Cadena de puerta §71 completa**: sin `EXECUTE_TRADE` + modo
  `limited_live`/`production` + ausencia de parada de emergencia + una
  aprobación humana APROBADA cuyo contexto coincide *exactamente* con la orden
  (símbolo, lado, cantidad, venue, solicitante), ninguna orden llega al venue.
- Idempotencia (§66): una aprobación financia exactamente una orden lógica
  (`client_order_id` derivado de la aprobación); los replays nunca re-envían.
- Resultados UNKNOWN se resuelven **consultando al venue** (escalera
  client-order-id), jamás re-enviando a ciegas (§68).
- Cada fill se reconcilia contra el venue antes de contabilizar (§67);
  cualquier desviación abre disputa y marca la orden `MISMATCH`.- Circuit breaker por venue; la orden se persiste `PENDING` antes de tocar
la red (crash-safe).

## Partes faltantes declaradas: memoria histórica profunda y previsión

Hoy AEOS observa el mundo **en tiempo real** (World Brain), pero todavía **no
tiene memoria histórica profunda**: ni ingesta retroactiva de noticias de años
pasados, ni historial multi-año de fluctuaciones, ni una base causal que
relacione eventos del pasado con movimientos reales del mercado para poder
prever. Se declara abiertamente (regla 2: nunca presentar como existente lo
que no existe). El módulo completo se construirá en tres capas sobre lo ya
probado:

### 1. Backfill de noticias históricas (varios años atrás)
- **Qué hará:** ingesta retroactiva (2015 → hoy) desde fuentes con archivo
  histórico real y accesible: GDELT 2.0 (gratuito, global, desde 2015),
  Common Crawl News Dataset, Wayback Machine, archivos de feeds.
- **Cómo encaja:** reutiliza el pipeline existente (normalizar → dedup →
  resolución de entidades → confianza de fuente) escribiendo con
  `event_time` histórico en la memoria temporal — que ya garantiza **nunca
  sobrescribir hechos** (probado por tests).
- **Estado: NO iniciado.**

### 2. Historial de fluctuaciones (criptos, divisas, activos digitales)
- **Qué hará:** series OHLCV diarias/horarias de años completos por símbolo:
  Binance klines (desde 2017), CoinGecko y CryptoCompare (cripto),
  proveedores con histórico para divisas e índices, y datos on-chain por
  red — cada lote con procedencia registrada.
- **Cómo encaja:** el adapter CCXT actual es de ejecución; el backfill lo
  extenderá con `fetch_ohlcv` (presente en toda exchange ccxt) y añadirá
  adapters de **solo-lectura** que no requieren credenciales; las series
  largas vivirán en almacenamiento columnar (DuckDB) junto a SQLite.
- **Estado: NO iniciado.**

### 3. Motor causal evento→impacto (la previsión)
- **Qué hará:** cruzar (1)+(2): para cada evento del pasado — noticia, tuit,
  anuncio regulatorio, halving, hack, listado en exchange — medir el
  movimiento real del mercado en ventanas `t−1h → t+30d` y aprender **qué
  pasó, con qué magnitud y con cuánta muestra**, construyendo una base de
  datos propia evento→impacto.
- **Tuits y eventos sociales:** solo vía fuentes con archivo legal y
  accesible (APIs oficiales con credenciales del operador; jamás scraping
  prohibido, §33).
- **Cómo preverá:** cuando en el futuro aparezca un evento similar, el
  sistema recupera los análogos históricos con sus impactos medidos y emite
  una **previsión con evidencia**, que se registra en el Prediction Ledger
  existente y se puntúa (Brier) cuando el futuro llega — el motor se calibra
  solo, ciclo a ciclo.
- **Estado: NO iniciado.**

> **Nada de esta sección está implementado hoy.** Lo que ya existe y es su
> base: World Brain (dedup, temporal, entidades, confianza de fuente),
> Prediction Ledger con puntuación Brier inmutable y el adapter CCXT.
> `IMPLEMENTATION_STATUS.md` los lleva como `NOT_STARTED` en su propia
> sección.

## Funciones

**CLI** (`python -m aeos.cli`):

| Comando | Qué hace |
|---|---|
| `doctor` | 9 comprobaciones de salud (contabilidad, cadena de auditoría, cola…) |
| `status` | Resumen vivo: agentes, tesorería, eventos, parada de emergencia |
| `treasury` | Estado de los fondos |
| `agent [id]` | Lista o detalle de agentes |
| `keys --role admin` | Emite una API key (se muestra una sola vez) |
| `backup` / `restore` | Copia verificada y restauración con hash |
| `start --once` / `start` / `stop` | Bucle autónomo: 1 ciclo, continuo, o parar |

**API HTTP autenticada** (`python -m aeos.api.server --port 8400`):

| Ruta | Permiso |
|---|---|
| `GET /api/v1/status` | `VIEW_STATUS` |
| `GET /api/v1/treasury` | `VIEW_TREASURY` |
| `GET /api/v1/agents` | `VIEW_AGENTS` |
| `GET /api/v1/audit` | `VIEW_AUDIT` |
| `GET /api/v1/approvals` | `VIEW_APPROVALS` |
| `GET /api/v1/queue` | `VIEW_QUEUE` |
| `GET /api/v1/predictions` | `VIEW_PREDICTIONS` |
| `GET /api/v1/opportunities` | `VIEW_OPPORTUNITIES` |
| `GET/POST/DELETE /api/v1/emergency-stop` | `EMERGENCY_STOP` |
| `GET /dashboard` | Panel HTML (respeta los mismos permisos) |

Sin clave → `401`; con clave sin permiso → `403`; toda llamada queda auditada.

**Panel:** `http://127.0.0.1:8400/dashboard` — estado de emergencia, cadena de
auditoría, tareas muertas, tesorería y agentes recientes.

## Cómo funciona

El bucle económico (§133) se ejecuta solo, ciclo a ciclo, sobre una cola
duradera. Cada fase tiene checkpoint; las financieras se congelan si hay
parada de emergencia:

```
observe → experiment → measure → account → evaluate
   → select → kill → mutate → spawn → allocate → (observe…)
```

1. **observe** — el World Brain ingiere fuentes reales y genera señales.
2. **experiment / measure** — los agentes gastan capital en experimentos
   reales y el sistema mide resultados reales (con reconciliación externa).
3. **account** — la liquidación asienta ganancias/pérdidas en el libro; las
   identidades monetarias se verifican siempre.
4. **evaluate / select / kill** — el fitness decide supervivientes; los
   fracasados se entierran con su conocimiento y devuelven el capital.
5. **mutate / spawn / allocate** — el ADN de los ganadores se muta y
   recombina; la nueva generación recibe capital según su retorno esperado.

Para arrancar el bucle completo:

```bash
aeos keys --role admin        # dueño + API key
aeos start --once             # un ciclo completo, verificado
aeos start                    # autónomo continuo (Ctrl-C o `aeos stop` para parar)
```

Desarrollo:

```bash
python -m venv .venv && .venv\Scripts\activate   # o source .venv/bin/activate
pip install -e ".[dev,trading]"
python -m pytest tests/       # 155 passed + 1 sandbox real de ccxt (corre en CI)
docker compose --profile paper up -d             # infrastructure/docker/
```

## Documentación

- `docs/MASTER_SPECIFICATION.md` — especificación completa v3.0
- `docs/INTEGRATION_ROADMAP.md` — plan por fases (Fases 0–9 completadas)
- `docs/FORENSIC_AUDIT.md` / `_V2.md` / `_V3.md` — auditorías con evidencia
- `IMPLEMENTATION_STATUS.md` — tracker de capacidades honesto
- `docs/OPEN_SOURCE_STACK.md` — política de licencias (§110)

## Integración con *Sistema-de-IA-para-Inversi-en-Criptomonedas*

Este proyecto **ya fusiona** ese repositorio (presente como referencia en
`_upstream/`). La fusión se ejecutó por fases, con decisión documentada por
componente — no fue un volcado:

| Componente upstream | Decisión | Resultado en AEOS |
|---|---|---|
| `services/risk_manager.py` (drawdown→stop, límite de pérdida diaria, intervalo mínimo entre órdenes, sizing con reserva) | **Portado** | Semántica del `RiskEngine` persistente, probada por 5 tests de paridad (`tests/test_upstream_parity.py`) |
| Estado de riesgo en memoria (se perdía al reiniciar) | **Bug corregido** | `risk_state` persiste en SQLite; test prueba la supervivencia al reinicio |
| `memory.py` (embeddings dummy) | **Rechazado** (§2: no simular) | Memoria honesta: sin datos reales declara `NO_REAL_DATA_AVAILABLE` |
| API/frontend propios (rotos) | **Solo referencia** | Cubiertos por la API/dashboard nativos; el shell antd queda como candidato para la SPA futura |
| patrón de datos de mercado | **Base del adapter** | Adapter CCXT + paper trading + **ejecución real implementada** (`aeos/investments/execution.py`, 17 tests) |

**Estado de la fusión: ~100%.** La ejecución real en exchange ya está
implementada (**testnet-first**): `aeos/investments/execution.py` +
`ccxt_adapter.py`. Lo único que separa el sistema de una sesión real en
mainnet es operativa, no código: instalar el extra `trading`, registrar el
venue con credenciales propias del operador y otorgar la aprobación humana
explícita por orden.
