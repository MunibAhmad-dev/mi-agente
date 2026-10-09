# PLAN DE INTEGRACIÓN, INSTALACIÓN Y CONFIGURACIÓN POR FASES — Mi Agente 10/10

Complemento directo de `AUDITORIA-FORENSE-MI-AGENTE.md`. Cada fase tiene
**objetivo, tareas, comandos y criterio de aceptación verificable** (EVIDENCE > CLAIM:
una fase no se cierra por "estar hecha", se cierra cuando su verificación pasa).
Ejecutar las fases en orden; no saltar P0.

Regla transversal: todo cambio se integra vía la rama
`Analisis-Auditoria-Verificacion-Reparacion` o ramas hijas con PR; `main` solo
recibe merges verdes.

---

## FASE P0 — Estabilización crítica (semana 1) — "que arranque"

**Objetivo:** backend arranca, instalación reproducible, secretos fuera del repo.

1. **Secretos (CRÍTICO, día 1)**
   - Rotar `JWT_SECRET` y `JWT_REFRESH_SECRET` (los actuales están en la historia de git).
   - `git rm --cached .env` + añadir `.env` a `.gitignore` + `cp .env.example .env` en `setup.sh`.
   - Purgar historia: `git filter-repo --path .env --invert-paths` (o BFG) y force-push coordinado.
   - Completar `CREDS_KEY`/`CREDS_IV` reales (32 bytes hex) en el `.env` local, nunca en git.
   - **Aceptación:** `git log --all --full-history -- .env` vacío tras purga; `git grep "JWT_SECRET="` sin valores en árbol.
2. **Fix de arranque (CRÍTICO)**
   - Crear `api/models/` con los 11 modelos mongoose (ver lista en auditoría §3) usando `mongoose.Schema` + export estándar de LibreChat, o detrás de flag `ENABLE_FACES=false` desactivar las rutas que los requieren mientras tanto.
   - Fix mínimo inmediato: crear `api/models/AgentRoutingPreference.js` para desbloquear el boot.
   - **Aceptación:** `node api/server/index.js` mantiene proceso vivo >60s y `curl localhost:3080/api/health` responde 200.
3. **Instalación reproducible (CRÍTICO)**
   - `npm install --legacy-peer-deps` para regenerar `package-lock.json` y commit del lock.
   - En `package.json` raíz: fijar `tree-sitter` + `tree-sitter-javascript/typescript` a versions compatibles (o `overrides: { "tree-sitter": "^0.25.0" }`) y eliminar la necesidad de `--legacy-peer-deps`.
   - Añadir `npmconfig` `.npmrc` con `legacy-peer-deps=true` como cinturón temporal.
   - **Aceptación:** `npm ci` termina exitoso en máquina limpia (contenedor) y `npm install` sin flags extra.
4. **Restaurar CapabilityOrchestrator (CRÍTICO)**
   - Recrear `api/server/services/CapabilityOrchestrator/models/{CapabilityRegistry,ModelRegistry,Schema,ConfigService}.js` según sus usos en `index.js`/`modelRouter.js` (las interfaces están implícitas en los consumidores).
   - **Aceptación:** `npx jest api/server/services/CapabilityOrchestrator` verde (4 suites hoy en rojo).

## FASE P1 — Capa de datos completa (semana 2)

**Objetivo:** persistencia real para todas las Faces.

- Implementar los 10 modelos restantes con esquemas: `ScheduledJob` (cron, payload, lastRun, status), `Workflow` (nodos, edges, state), `MultiAgentSession` (agentes, turnos, estado compartido), `ExperienceReplay` (transiciones, reward), `AgentConstitution` (systemPrompt versionado), `BenchmarkResult`, `ReputationMonitor`, `SoundPreferences`, `UserStreak`, `WebhookDelivery` (con TTL index).
- Índices: `{ userId: 1, createdAt: -1 }` en todos los de usuario; TTL en `WebhookDelivery`.
- **Aceptación:** test de integración Mongo (mongodb-memory-server) que crea/lee cada modelo; 0 require`~/models/X` roto: `grep -rEo "require\('~/models/[A-Za-z]+'\)" api --include="*.js" | sort -u` cubierto por archivos existentes.

## FASE P2 — Orquestación coherente (semanas 2-3)

**Objetivo:** flujos de agentes reales de punta a punta.

- Montar `routes/agents/architect.js` en `routes/agents/index.js` (código ya existe; auditoría §3).
- Definir contrato entre ExecutiveLoop ↔ MultiAgentController ↔ AgentArchitect: quien persiste qué, eventos en EventBus, y estados de misión.
- Smoke E2E: misión simple "investiga X y resume" ejecutada por ExecutiveLoop con streaming al panel MissionControl.
- **Aceptación:** playwright e2e `mission-control.spec` verde contra backend real; mensaje persistido en Mongo visible tras restart.

## FASE P3 — Testing y CI que no mienta (semana 3)

**Objetivo:** CI verde = sistema realmente funcionando.

- Ampliar `.github/workflows/ci.yml`: (a) `npm ci` limpio, (b) build workspaces, (c) jest api completo con `--runInBand`, (d) `npm run build:client`, (e) smoke boot + `/api/health`, (f) e2e playwright smoke.
- Umbral de cobertura en jest config (start 20%, subir por fase).
- **Aceptación:** PR de prueba con modelo faltante simulado → CI rojo (detecta regresiones del tipo que rompió el boot).

## FASE P4 — Seguridad (semana 4)

**Objetivo:** endurecer sin frenar desarrollo local.

- `requireAdmin` en todas las rutas `/api/admin/*` propias (constitution, panel admin endpoints).
- Sandbox para ejecución: Docker para ShellTool/CodeExecutor en prod; en Windows dev, job objects + timeout duro (BackgroundExec ya tiene base).
- Validación zod en rutas ingestion/workflows/creative/agentRuntime (esquemas compartidos via `@librechat/data-schemas`).
- Revisión CORS: `ALLOWED_ORIGINS` por entorno; cookies secure en prod.
- Escaneo continuo: osv-scanner + detect-secrets en CI.
- **Aceptación:** suite de seguridad CI verde + auditoría con el motor de verificación (R0400/R0500/R0820) sin hallazgos CRITICAL.

## FASE P5 — Observabilidad y rendimiento (semana 5)

- OTel con exportador por defecto a Langfuse fanout (compose integrado) + variables documentadas en `.env.example`.
- Dashboards Grafana provisioning en repo (metrics ya expuestas por MetricsCollector).
- Presupuestos: p95 de `/api/health` < 50ms, boot < 30s, cache hit rate LLM visible en `/api/performance`.
- **Aceptación:** traza de una conversación completa visible en Langfuse; dashboard con datos reales.

## FASE P6 — Despliegue unificado (semana 6)

- Un solo `docker-compose.yml` maestro con profiles (`core`, `rag`, `observability`, `local-llm`) que incluya: mongo, meilisearch, rag_api, api, client, langfuse-fanout, litellm opcional.
- Migrar `deploy-compose.yml` y los 6 compose dispersos a profiles; deprecar el resto con nota.
- Healthchecks + depends_on condition en todos los servicios.
- **Aceptación:** `docker compose --profile core up -d` en máquina limpia → sistema operando en <10 min sin pasos manuales.

## FASE P7 — Documentación honesta y certificación (semana 6)

- Mover los ~60 docs raíz a `docs/archive/YYYY-MM/`; README nuevo con: qué funciona (de la auditoría §1), qué falta, cómo instalar (Fase P6).
- Ejecutar el Motor de Verificación (`verify -root .`) → gate PASS como certificación final.
- **Aceptación:** `verdict.json` = PASS; README sin afirmaciones no respaldadas por evidencia.

---

## Cómo se instala/configura todo (resumen operativo final)

```bash
# 1. Clonar y configurar
git clone https://github.com/proyectos-aoi/mi-agente && cd mi-agente
cp .env.example .env   # completar JWT_SECRET, CREDS_KEY/IV, MONGO_URI, keys LLM

# 2. Instalar (Fase P0 deja npm ci funcional)
npm ci

# 3. Construir workspaces + frontend
npm run build

# 4. Levantar stack (Fase P6)
docker compose --profile core up -d

# 5. Verificar
curl http://localhost:3080/api/health   # 200
npx playwright test --config=e2e/playwright.config.local.ts
```

Métrica de éxito final: **10/10 = boot limpio + CI verde completo + e2e de misión
multi-agente + certificación del motor de verificación PASS + cero secretos en git.**
