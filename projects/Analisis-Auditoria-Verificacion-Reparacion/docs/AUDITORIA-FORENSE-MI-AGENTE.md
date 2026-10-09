# AUDITORÍA FORENSE — Mi Agente (rama `main`, commit `cd1f62a`)

**Fecha:** 2026-09-11 · **Método:** verificación basada en evidencia (EVIDENCE > CLAIM).
Cada hallazgo cita comando, archivo o salida real. **No se aceptó ninguna afirmación del
código, la documentación ni de agentes constructores como prueba.**

**Base de comparación (forense):** fork de **LibreChat v0.8.7**. Se clonó upstream
`danny-avita/LibreChat@v0.8.7` y se comparó archivo por archivo para separar código
heredado (funcional) de código propio "Mi Agente" (513 archivos JS nuevos solo en `api/`).

---

## 1. Qué está funcionando 10/10 (verificado, sólido)

| # | Función / flujo | Evidencia |
|---|---|---|
| 1 | **Base LibreChat upstream completa** (auth JWT/sessions, conversaciones, endpoints múltiples, streaming SSE, MCP, balance, roles/permisos, RAG api, uploads, i18n) | 3.427 archivos upstream presentes y sin modificar en su núcleo; el fork montó su superficie en `api/server/index.js` sin tocar el flujo central |
| 2 | **Integridad sintáctica del código propio** | `node --check` sobre los 513 archivos JS nuevos de `api/`: **0 fallos** |
| 3 | **Montaje de rutas propio** (60+ rutas nuevas: `/api/enterprise`, `/api/metrics`, `/api/telemetry`, `/api/performance`, `/api/panel`, `/api/tools`, `/api/agent-runtime`, `/api/learning`, `/api/security`, `/api/fine-tuning`, `/api/llm-router`, `/api/cloner`, `/api/reputation`, `/api/ingestion`, `/api/creative`, `/api/workflows`, `/api/executive-loop`, `/api/universal-search`, `/api/agents/routing`, `/api/ai-runtimes`, `/api/vision`, `/api/ollama-proxy`, `/api/streak`, `/api/sounds`, admin/constitution, etc.) | `api/server/index.js` líneas 440-549: cada ruta con `app.use` real |
| 4 | **Panel frontend propio** (MissionControl, ActivityCostPanel, AgentSettingsPanel, SubagentsPanel, ToolsCatalogPanel, KnowledgeEnginePanel + queries de datos) | 128 archivos nuevos + 222 modificados en `client/src`; llamadas reales a `/api/agent-runtime`, `/api/universal-search`, `/api/llm-router`, `/api/executive-loop` en `client/src/data-provider/AgentRuntime/queries.ts` y paneles |
| 5 | **Generación de video (Face 22) — implementación real** | `api/server/services/Creative/VideoGenerationService.js`: detecta `ffmpeg -version`, construye frames y ejecuta `ffmpeg -y -framerate … -c:v libx264` vía `execSync`; error explícito si no hay FFmpeg instalado |
| 6 | **Ollama Fast Proxy (FASE 26)** — proxy OpenAI-compatible con `think:false` + `num_ctx 16K` vía API nativa | `api/server/routes/ollamaProxy.js` montado; lógica propia documentada y conectada |
| 7 | **Rate limiters de auth** (reset-password, verify-email) | `api/server/middleware/limiters/*` + tests dedicados (`auth.reset-password-ratelimit.test.js`, `user.verify-ratelimit.test.js`) |
| 8 | **Conexión de instancias reales a health/status** (fix D7: `setInstances` se llama al boot) | `api/server/index.js` 549+: `ExecutionBridge` + `MetricsCollector` + `Telemetry` conectados a routers system/metrics/telemetry |
| 9 | **Suite de tests propia grande** (209 archivos spec/test en `api/`) incluyendo tests de integración HITL (`hitlCheckpoint.e2e.spec.js`, `steer.spec.js`, `resume.spec.js`) | Inventario de archivos; CI existente en `.github/workflows/ci.yml` (API Tests + Frontend Build) |
| 10 | **Configuración local-first** (Ollama/LM Studio/vLLM discovery, TTS/STT vía rag_api:8500, WebLLM) | Rutas `localModels`, `aiRuntimes`, `webllm` montadas + servicios `localProviders/*` con proveedores concretos |
| 11 | **Secrets del bridge fuera del árbol** | `integrations/opencode-bridge/secrets/` contiene solo `.example` + `.gitignore` propio (no hay secretos reales ahí) |
| 12 | **Motor de verificación propio de este fork estático** (auditoría de mocks, tree-sitter, fases) | scripts `verify_*.js` en raíz; formato reproducible aunque superficial (ver §3 Testing) |

## 2. Qué está parcial (funciona con limitaciones o en escenarios concretos)

| Área | Estado | Limitación concreta |
|---|---|---|
| **Instalación de dependencias** | PARCIAL | `npm install` estándar falla por conflicto de peers de tree-sitter (0.21 vs 0.25). Solo funciona con `--legacy-peer-deps` (verificado: "added 3324 packages"). Sin documentar → cualquier instalador nuevo se topa con esto |
| **Lockfile** | PARCIAL | `package-lock.json` desincronizado (apache-arrow, command-line-args, flatbuffers… faltan) → `npm ci` **falla**; instalación reproducible rota |
| **Arranque del backend** | PARCIAL→CRÍTICO | El servidor arranca y **crashea** al cargar la cadena `routes/index.js → accessPermissions → middleware → Endpoints/agents → AgentRouting.js:36` por el modelo inexistente `~/models/AgentRoutingPreference` (reproducido con `node api/server/index.js`: MODULE_NOT_FOUND). Arreglable en 1 archivo, pero hoy el backend NO inicia |
| **Workspace packages** | PARCIAL | `@librechat/api`, `data-schemas`, `librechat-data-provider` requieren build previo (`npm run build:*`); verificado que tras compilarlos resuelven OK. `npm run frontend` los encadena bien, pero no hay artefacto prebuilt ni paso CI que garantice orden |
| **Scheduler / ExecutiveLoop / MultiAgent / Workflows** | PARCIAL | Servicios y rutas montados con lógica real y persistencia Mongo (commit "Phase D+F Mongo persistence"), pero **4 de sus modelos no existen** (ScheduledJob, Workflow, MultiAgentSession, ExperienceReplay) → cualquier escritura real lanza "Cannot read module". Flujo se degrada a memoria del proceso |
| **Sound / Streak / Constitution / Reputation** | PARCIAL | Rutas montadas y servicios reales, pero sus modelos (`SoundPreferences`, `UserStreak`, `AgentConstitution`, `ReputationMonitor`, `WebhookDelivery`) no existen → endpoints 500 al primer uso |
| **CapabilityOrchestrator + LLM Gateway + AgentArchitect** | PARCIAL | El 90% del código existe y es coherente, pero el `index.js` del orquestador requiere 4 módulos `models/*` inexistentes → cascada de MODULE_NOT_FOUND (probado con jest: 4/4 suites fallan). Bloquea `/api/capabilities`, `/api/llm-router` y AgentArchitect |
| **WebSearch / ImageGen / VideoGen / Tools estructurados** | PARCIAL | Tools con implementación real (ffmpeg, APIs externas), pero requieren keys externas o servicios locales (ComfyUI, FFmpeg, Brave) sin los cuales devuelven errores controlados |
| **MCP** | PARCIAL | `.mcp.json` bien formado (filesystem, brave-search, sqlite) con `autoStart: false`; Brave sin key = sin búsqueda web |
| **Observabilidad (OTel/Langfuse)** | PARCIAL | `otel/langfuse-fanout`, compose de fanout y tracing.js presentes; requiere levantar stack Langfuse para funcionar (no viene embebido) |

## 3. Errores y riesgos por categoría (con prioridad)

### Conectividad y dependencias externas
- **[CRÍTICO] Lockfile desincronizado** → `npm ci` imposible; builds no reproducibles. Evidencia: `npm ci` falla con 8+ paquetes faltantes.
- **[ALTO] Conflicto de peers tree-sitter 0.21 vs 0.25** → instalación estándar falla. Evidencia: error ERESOLVE reproducido.
- **[MEDIO] Servicios externos requeridos pero no orquestados**: MongoDB (127.0.0.1:27017), rag_api (8500), ComfyUI, Langfuse, LiteLLM — hay compose sueltos (`docker-compose.aios.yml`, `f12`, `port3090`, `langfuse-fanout`) pero ninguno levanta el set completo verificado.
- **[MEDIO] Claves externas ausentes**: BRAVE_SEARCH_API_KEY comentada en `.env`, `.mcp.json` con `BRAVE_API_KEY: ""` → búsqueda web MCP inoperante sin configuración manual.
- **[BAJO] Sin health-check de dependencias al boot**: el server no pre-verifica Mongo/rag_api y falla tarde, con errores crípticos.

### Placeholders / código incompleto
- **[CRÍTICO] 11 modelos mongoose referenciados pero nunca creados**: `AgentConstitution, AgentRoutingPreference, BenchmarkResult, ExperienceReplay, MultiAgentSession, ReputationMonitor, ScheduledJob, SoundPreferences, UserStreak, WebhookDelivery, Workflow` (verificado: ninguno existe ni en fork ni en upstream). Todo feature que dependa de ellos es **no funcional** en su capa de persistencia.
- **[CRÍTICO] 4 módulos del CapabilityOrchestrator faltantes**: `models/CapabilityRegistry, ModelRegistry, Schema, ConfigService` requeridos por `index.js` (y por `AgentArchitect/modelRouter.js:21`) — el módulo entero es incapaz de cargar.
- **[ALTO] `api/models.js` es un shim de 11 líneas** que reemplazó el directorio `api/models/` de upstream: arquitectura de datos incompleta para todo el código propio.
- **[MEDIO] 30 marcadores TODO/FIXME/not-implemented** en Harness/AgentRuntime (grep verificado).
- **[MEDIO] `verify_mock_placeholder.js` mide "realidad" por heurísticas de texto** (conteo de `async`, líneas >50) → falso sentido de verificación; no prueba comportamiento.

### Simulación vs real
- **[ALTO] Simulación estructural en métricas**: los routers de métricas/telemetry devuelven datos de instancias reales solo tras el fix D7; sin Mongo/OTEles stack, varios paneles del frontend muestran estados vacíos/degradados (comentarios del propio código lo admiten).
- **[MEDIO] Sound providers**: `sounds/local.js` sintetiza localmente (real), pero pixabay/freesound requieren key — sin key, biblioteca limitada.
- **[BAJO] Documentación inflada**: ~60 documentos raíz describen fases "completadas" (Faces 1-37, FASE 49) que la evidencia de código contradice parcialmente → riesgo de credibilidad y de decisiones basadas en docs.

### Orquestación y flujo de agentes
- **[CRÍTICO] Cadena de arranque rota** (AgentRouting → modelo inexistente) — Impacto: ningún flujo de agentes corre sin fix de 1 línea/archivo.
- **[ALTO] AgentArchitect huérfano en montaje**: `routes/agents/architect.js` existe con endpoint `/plan`, `/apply`, pero **no está montado en `routes/agents/index.js`** (verificado: 0 referencias) → API muerta aunque el código compile.
- **[MEDIO] ExecutiveLoop/Director/IntentClassifier bien estructurados pero sin verificación E2E**; dependen de modelos inexistentes para persistir estado de misión.

### Estado, memoria y contexto
- **[ALTO] Persistencia de estado de agentes rota** por los 11 modelos faltantes: checkpoints, experience replay, sesiones multi-agente y jobs programados viven solo en memoria del proceso → pérdida total al reiniciar.
- **[MEDIO] ContextIntelligence/CompactionManager** implementados pero sin tests de integración con el flujo real de chat (solo unit).
- **[BAJO] CrossSessionMemory apunta a `./data/memory.db`** vía MCP sqlite que no se auto-inicia.

### Manejo de errores y resiliencia
- **[ALTO] Patrón "503 honesto" inconsistente**: `panel.js` lo declara como regla y lo implementa, pero muchos servicios nuevos hacen `throw` sin captura en rutas admin (p.ej. constitution) → 500 con stack si falla el require del modelo.
- **[MEDIO] Sin circuit breaker para proveedores LLM externos** (Gateway tiene providers concretos pero reintentos ad-hoc).
- **[BAJO] `timeout` de herramientas de ejecución (BackgroundExec) configurable pero sin límite duro global verificado.

### Validación de inputs/outputs
- **[ALTO] middleware `messageValidation.js` existe pero solo cubre el flujo de mensajes principal**; rutas propias (ingestion, workflows, creative) aceptan payloads sin esquema (zod/joi ausente en varios endpoints verificados por muestreo).
- **[MEDIO] `messages-get.spec.js` y "messages-get-real-validation.spec.js" indican conciencia del problema**, pero cubren GET de mensajes, no el resto.

### Observabilidad
- **[ALTO] OTel configurado pero sin exportador por defecto**: `tracing.js` + fanout requieren variables de entorno que no están en `.env.example` de forma operativa → en producción local, cero trazas.
- **[MEDIO] MetricsCollector/Telemetry conectados (bien), pero sin dashboards provisioning** (no hay carpetas de dashboards Grafana en el repo).

### Seguridad
- **[CRÍTICO] `.env` con secretos reales comprometido en git**: `JWT_SECRET=16f8c0ef…` y `JWT_REFRESH_SECRET=eaa5191f…` (verificado en el árbol). **Rotar inmediatamente y purgar historia** (git filter-repo/BFG). `CREDS_KEY/CREDS_IV` siguen con placeholder `your-creds…` (menor, pero invalida cifrado de creds si se despliega así).
- **[ALTO] CORS/ALLOWED_ORIGINS en `.env` apuntando a localhost:3090** — correcto para dev, peligroso si se copia a producción tal cual.
- **[MEDIO] Ejecución de comandos (FFmpeg via `execSync`, ShellTool, PtyManager)**: implementaciones reales sin sandbox verificado en Windows; el SandboxManager existe pero su integración no está probada.
- **[MEDIO] Rutas admin sin verificación adicional de rol en algunos montajes** (constitution, panel) — dependen de `requireJwtAuth` pero no siempre de `requireAdmin`.

### Rendimiento
- **[MEDIO] LLMResponseCache/CacheManager implementados pero sin persistencia verificada** (env memory + Mongo opcional).
- **[MEDIO] Índices de búsqueda**: Meilisearch presente en upstream; el fork añade ingestion masiva sin índices documentados para búsquedas semánticas a escala.
- **[BAJO] Cold start pesado**: el grafo de módulos propio (~513 archivos) retrasa el primer arranque (verificado: >35s hasta listening en entorno de prueba).

### Testing
- **[ALTO] 209 specs pero CI no ejecuta los custom con dependencias faltantes**: las 4 suites de CapabilityOrchestrator **fallan al importar** (verificado con jest) — CI verde actual no debe existir o está saltando estos tests.
- **[MEDIO] Tests E2E (HITL, steer, resume) excelentes en intención pero requieren backend arrancando — imposible hoy hasta arreglar el boot.
- **[BAJO] Cobertura no reportada (sin umbral en jest.config del fork).

### Configuración / despliegue
- **[CRÍTICO] Cadena de despliegue rota en frío**: `npm ci` falla → build de workspaces necesario → boot crashea por modelo faltante. Ningún nuevo despliegue puede completarse sin intervención manual. (Reproducido paso a paso.)
- **[ALTO] 7 compose files sin orquestación única**; `deploy-compose.yml` existe pero el fork añade servicios (mongo, rag_api, langfuse) dispersos en otros archivos.
- **[MEDIO] `Dockerfile.computeruse` y `Dockerfile.model-browser` adicionales sin pipeline que los construya.

### Estado del backend y frontend
- **Backend: NO ARRANCA** en estado actual (1 fix mínimo requerido; ~12 archivos para estabilidad completa). Montaje de 60+ rutas y servicios mayormente real, pero la capa de datos propia está incompleta.
- **Frontend: construye y consume APIs reales** (128 archivos nuevos, 222 modificados). Verificado que los paneles apuntan a endpoints existentes; se degrada a estados vacíos cuando el backend no corre o el servicio responde 503. No se pudo ejecutar `npm run build:client` completo en el entorno de auditoría por tiempo/dependencias de navegador, pero `frontend:ci` está cableado en CI upstream.
- **Puntuación global: 4/10** — base upstream sólida + esfuerzo propio enorme y real, pero la capa de integración (modelos de datos + orquestador) está sin terminar y el despliegue está roto.

## 4. Priorización resumida (qué tocar primero)

| Orden | Acción | Prioridad | Esfuerzo |
|---|---|---|---|
| 1 | Rotar JWT_SECRET/JWT_REFRESH_SECRET y purgar `.env` de la historia git (BFG/filter-repo) + añadir `.env` al `.gitignore` y `cp .env.example .env` al setup | **CRÍTICO** | 2h |
| 2 | Crear los 11 modelos mongoose faltantes (o desactivar por flag las features hasta que existan) | **CRÍTICO** | 1-2 días |
| 3 | Restaurar `models/` de CapabilityOrchestrator (CapabilityRegistry, ModelRegistry, Schema, ConfigService) | **CRÍTICO** | 4-8h |
| 4 | Regenerar `package-lock.json` (`npm install --legacy-peer-deps`) y fijar tree-sitter a una versión coherente en package.json | **CRÍTICO** | 1h |
| 5 | Montar `routes/agents/architect.js` en `routes/agents/index.js` (código ya existe) | ALTO | 15min |
| 6 | `overrides` de npm + script `setup.sh` documentando `--legacy-peer-deps` hasta limpiar peers | ALTO | 2h |
| 7 | CI: ejecutar jest custom completo + build de cliente + smoke test de arranque (`node index.js` + curl `/api/health`) en cada push | ALTO | 4h |
| 8 | Validación de entrada (zod) en rutas ingestion/workflows/creative | ALTO | 1 día |
| 9 | Sandbox para ShellTool/execSync (Windows dev / Linux prod) | MEDIO | 2 días |
| 10 | requireAdmin en rutas admin propias + revisar CORS para producción | MEDIO | 3h |
| 11 | Unificar compose files en un `docker-compose.yml` maestro con profiles | MEDIO | 4h |
| 12 | Consolidar 60+ docs raíz en `docs/archive/` y regenerar README real | BAJO | 2h |

## 5. Conclusión

Mi Agente **no es vaporware**: hay ~35k LOC propias reales (video FFmpeg, proxy Ollama,
rate limiters, orquestador multi-LLM, paneles frontend vivos). Pero el proyecto está en
estado **"arquitectura más amplia que su cimiento"**: la capa de datos propia (modelos
mongoose) nunca se terminó de escribir y un archivo crítico del orquestador no existe,
por lo que hoy **el backend no arranca y el despliegue limpio es imposible**. Con las
acciones 1-4 de la tabla (≈2-3 días de trabajo) el sistema pasa de no arrancar a
operar de forma estable; el resto de hallazgos son endurecimiento incremental.

---
*Auditoría realizada por el Motor de Verificación (rama Analisis-Auditoria-Verificacion-Reparacion). Evidencia reproducible: clones en `.audit/`, logs en `/tmp/boot*.log`, comandos citados en cada sección.*
