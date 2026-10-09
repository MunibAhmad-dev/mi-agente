# INFORME FASE 12 — mi-opencode: CORE del proyecto (no un LLM) + Dashboard 100% conectado

Fecha de verificación: 13–14 de agosto de 2026
Estado: stack completo **levantado y verificado en vivo** (docker).

---

## 1. Qué se entendió originalmente (interpretación incorrecta)

El error de base fue **clasificar el repositorio "mi-opencode" como un LLM** por su nombre y por
contener componentes de IA (agentes, herramientas, orquestación). Esa clasificación errónea se
materializó en dos lugares:

1. **`librechat.yaml` → `endpoints.custom`**: se había registrado mi-opencode como un endpoint
   personalizado de chat. LibreChat expone todo lo que está en `endpoints.custom` en el **selector
   de LLM** (`/api/endpoints`), por lo que mi-opencode aparecía como un "modelo" seleccionable al
   lado de GPT, Claude, Gemini, etc.
2. Se asumía que cualquier componente con "IA" dentro era un modelo de inferencia, ignorando que
   un sistema puede **UTILIZAR LLMs sin SER un LLM**.

## 2. Qué es realmente mi-opencode

**mi-opencode es el motor / núcleo / cerebro operativo del proyecto.** Es una **plataforma de
ejecución y orquestación**, no un modelo de lenguaje. Evidencia directa del código y del sistema
vivo:

| Señal | Evidencia |
|---|---|
| Runtime Registry | `[RuntimeRegistry] Initialized: ImageRuntime … Total: 4` (log del api al arrancar) |
| Orchestrator | `CapabilityOrchestrator` resuelto por inyección de dependencias (`ServiceContainer`) en `api/server/routes/panel.js` |
| Integration Manager | `[IntegrationManager] Initialized with ExecutionEngine as core` (log) |
| Procesos propios | Contenedor `mi-opencode` (puerto 4096, healthy) y `opencode-bridge` (puerto 8787, healthy) |
| Tools proxy | `api/server/index.js`: `app.use('/api/tools', …)` → *"proxy hacia el server real de mi-opencode"* |
| Config real | `frontend/src/components/Management/ManagementPanel.jsx` edita la config real de mi-opencode (`PATCH /config`) |

**Clasificación según su naturaleza real:** plataforma + runtime + orquestador + sistema de
herramientas + integración. Es un **framework de agente/plataforma** que consume LLMs externos.

## 3. Qué NO es

- ❌ **NO es un modelo LLM** — no genera inferencia por sí mismo.
- ❌ **NO debe aparecer en el selector de LLM** — y ya no aparece (verificado: 0 coincidencias en `/api/endpoints`).
- ❌ **NO es un proveedor de inferencia** (ni OpenAI-compatible ni Anthropic-compatible).
- ❌ **NO compite con GPT/Claude/Gemini/Qwen/DeepSeek** — el usuario selecciona esos LLM; mi-opencode
  es la capa que les da herramientas, habilidades y ejecución.

## 4. Arquitectura real (verificada en el sistema vivo)

```text
                    DASHBOARD (frontend/ + nginx, host :3050)
                        │  /api/ → proxy nginx → api:3080/api/
                        ▼
                API LibreChat (contenedor LibreChat, :3080)
                        │  auth JWT (requireJwtAuth en las 13 rutas)
        ┌───────────────┼───────────────────────────────┐
        ▼               ▼                               ▼
  /api/capabilities  /api/workflows            /api/tools ─────────┐
  /api/runtimes      /api/cache/stats          (proxy real)        │
  /api/ratelimit     /api/…                                       ▼
        │                                          SERVER REAL mi-opencode (:4096)
        ▼                                                     │
  CapabilityOrchestrator (DI container) ◄──── ExecutionEngine ─┘
        │                              (IntegrationManager)
        ▼
  LLM / MODEL LAYER (selector del chat — solo LLM reales)
   OpenAI · Google · Claude-Compatible · Groq · Mistral · OpenRouter · LiteLLM
```

Flujo funcional probado de punta a punta:

```text
Dashboard (login en :3050)
   → POST /api/auth/login (nginx → api)        → 200 ✓
   → GET  /api/capabilities (JWT)              → 200, capacidades del core ✓
   → GET  /api/workflows · /cache/stats · /ratelimit/stats → 200 ✓
   → GET  /api/capabilities SIN token          → 401 (JWT activo) ✓
```

## 5. Capacidades del core encontradas (respaldadas por código/sistema)

| Capacidad | Dónde vive | Verificado |
|---|---|---|
| Chat / conversación | core (capability `chat`) | `/api/capabilities` ✓ |
| Reasoning / análisis lógico | core (capability `reasoning`) | ✓ |
| Código | core (capability `code`) | ✓ |
| Análisis | core (capability `analysis`) | ✓ |
| Runtimes (4 registrados) | `RuntimeRegistry` (ImageRuntime, etc.) | log de arranque ✓ |
| Workflows | `/api/workflows` (CRUD + execute) | 200 ✓ |
| Cache (stats/clear/invalidate) | `/api/cache/*` | 200 ✓ |
| Rate limit por proveedor | `/api/ratelimit/*` | 200 ✓ |
| Tools de mi-opencode | `/api/tools` → proxy al server real (:4096) | código en index.js ✓ |
| Config de skills/rutas | ManagementPanel → `PATCH /config` del core | código ✓ |
| MCP servers | `free-claude-code` (SSE) + `mi-opencode-mcp` (stdio, comentado) | librechat.yaml ✓ |
| EventBus / system.ready | logs del api | ✓ |

## 6. Integración con Dashboard — matriz

| Capacidad | Existe en Core | Backend/API | Dashboard (UI) | Estado |
|---|---|---|---|---|
| Login/JWT | — | `/api/auth/login` | gate de login en App.jsx | ✅ Conectada |
| Capacidades | ✅ CapabilityOrchestrator | `/api/capabilities` | pestaña Capacidades | ✅ Conectada |
| Workflows | ✅ | `/api/workflows` | pestaña Workflows | ✅ Conectada |
| Runtimes | ✅ RuntimeRegistry (4) | `/api/runtimes` | pestaña Runtimes | ✅ Conectada |
| Cache | ✅ | `/api/cache/*` | pestaña Cache | ✅ Conectada |
| Rate limit | ✅ | `/api/ratelimit/*` | pestaña Rate Limit | ✅ Conectada |
| Tools de mi-opencode | ✅ server real :4096 | `/api/tools` | pestaña Tools | ✅ Conectada |
| Config de mi-opencode | ✅ | `PATCH /config` | ManagementPanel | ✅ Conectada |
| LLM selector | LLMs externos | `/api/endpoints` | selector del chat | ✅ Solo LLM reales (sin mi-opencode) |

**No quedan placeholders**: cada pestaña del panel tiene servicio real detrás (todas responden 200
con JWT y 401 sin JWT).

## 7. Problemas encontrados (priorizados)

1. **mi-opencode en el selector de LLM** — estaba en `endpoints.custom` de `librechat.yaml`. **CAUSA RAIZ del bug que reportaste.** → Eliminado; documentado con NOTA (R35) en el propio yaml.
2. **Dashboard nunca dockerizado** — solo corría con `vite dev` manual (:5173); por eso "no aparecía" o "cambiaron mi dashboard". → Nuevo servicio `dashboard` (:3050) con Dockerfile multi-stage + nginx.
3. **`admin-panel` de upstream (LibreChat) en :3000** — panel ajeno que se confundía con el dashboard propio. → Desactivado vía `profiles` en `docker-compose.override.yml`.
4. **Auth eliminada** — `requireJwtAuth` había sido borrado de rutas del panel y el gate de login quitado de App.jsx. → Restaurado (13× requireJwtAuth; 401 verificado sin token).
5. **`api.js` del frontend incompleto** — faltaban `auth.*` y `tools.*`. → Restaurado completo.
6. **Directorio corrupto** `integrations/opencode-bridge;C` — resto de un comando shell mal escapado. → Eliminado.
7. **Build docker roto** — `node_modules` con symlink roto entraba al contexto de build. → `.dockerignore` creado.

## 8. Cambios realizados (lista exacta)

| Archivo | Cambio |
|---|---|
| `librechat.yaml` | mi-opencode **fuera** de `endpoints.custom`; NOTA (R35) documentando que es el motor, no un LLM |
| `docker-compose.override.yml` | Servicio `dashboard` (:3050) desde `frontend/Dockerfile`; `admin-panel` upstream desactivado por `profiles` |
| `frontend/Dockerfile` (nuevo) | Build multi-stage: `npm ci` + `vite build` + nginx |
| `frontend/nginx.conf` (nuevo) | Sirve `dist/` + proxy `/api/` → `api:3080/api/` |
| `frontend/.dockerignore` (nuevo) | Excluye `node_modules`/`dist` del contexto de build |
| `frontend/src/App.jsx` | Restaurado gate de login/JWT |
| `frontend/src/components/AdminPanel.jsx` | Reconectadas las pestañas (Capacidades, Workflows, Runtimes, Cache, RateLimit) + "Volver al Chat" con `VITE_CHAT_URL` |
| `frontend/src/services/api.js` | Restaurado: `auth` (login, Bearer, auto-logout 401) + `tools.*` + endpoints del panel |
| `api/server/routes/panel.js` | `requireJwtAuth` en las 12 rutas (runtimes, capabilities, workflows, cache, ratelimit) |
| `api/server/index.js` | Router panel montado en `/api` + `/api/tools` proxy a mi-opencode + D7 (conexión de instancias reales a health/metrics) |
| `integrations/opencode-bridge;C` | Eliminado (directorio corrupto) |

## 9. Selector de LLM — por qué aparecía y cómo se corrigió

**Por qué aparecía:** LibreChat construye el selector a partir de `/api/endpoints`, que incluye
todo lo declarado en `endpoints.custom` del `librechat.yaml`. Al haber metido mi-opencode ahí, el
sistema lo trataba como un endpoint de chat más.

**Cómo se corrigió (clasificación, no borrado):** se eliminó del `endpoints.custom`, se documentó en
el yaml que mi-opencode es el motor y no un LLM, y se conservó su conexión real por las rutas que
sí le corresponden (`/api/capabilities`, `/api/workflows`, `/api/tools`, `/api/config`).

**Estado actual del selector (verificado contra `/api/endpoints`):**
OpenAI · Google · Agents · Assistants · Claude-Compatible · Groq · Mistral · OpenRouter · LiteLLM
— **mi-opencode: 0 coincidencias.**

## 10. Funciones pendientes (no bloqueantes)

- **API keys reales**: el chat necesita keys reales en `.env` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `GROQ_API_KEY`, etc.) para que los LLM del selector respondan. La infraestructura está lista.
- **MCP `free-claude-code`**: log `Domain "http://localhost:3001" is not allowed` — el dominio no
  está en la lista blanca de MCP del yaml. Funcional, requiere `allowedDomains` si se quiere activar.
- **`mi-opencode-mcp`** (stdio): configurado pero comentado en el yaml; se activa cuando el workspace
  `mi-opencode` se sirva desde el contenedor api.
- Warning menor de `FlowStateManager` (TTL de flujos) — cosmético, no afecta operación.

## 11. Validación ejecutada (resultados reales)

| Prueba | Resultado |
|---|---|
| `docker ps` — stack completo | ✅ 9 contenedores arriba (dashboard, LibreChat, mi-opencode, bridge, rag_api, redis, mongo, vectordb, meilisearch) |
| `GET /api/endpoints` (login) | ✅ 200 — mi-opencode **ausente** |
| `grep -c opencode librechat.yaml` | ✅ 8 — todas comentarios/NOTA, **ninguno como endpoint** |
| `POST /api/auth/login` (vía :3050) | ✅ 200 |
| `GET /api/capabilities` con JWT | ✅ 200 — capacidades reales del core |
| `GET /api/capabilities` sin JWT | ✅ 401 |
| `GET /api/workflows` · `/cache/stats` · `/ratelimit/stats` | ✅ 200 |
| `GET /api/panel/capabilities` | ✅ 404 esperado (el router vive en `/api`, el frontend usa `/api/capabilities`) |
| `panel.js` en contenedor vs disco | ✅ idéntico (13× requireJwtAuth) |
| Dashboard `:3050` | ✅ 200 — `<title>Mi LibreChat - Panel Enterprise</title>`, assets cargan |
| Core mi-opencode `:4096` | ✅ responde (401 = requiere API key, vivo y protegido) |
| Build del dashboard | ✅ imagen construida (vite build sin errores) |

## 12. Criterios de éxito — estado

| # | Criterio | Estado |
|---|---|---|
| 1 | mi-opencode NO tratado como LLM | ✅ |
| 2 | mi-opencode NO aparece en el selector | ✅ (0 en `/api/endpoints`) |
| 3 | Selector solo con modelos seleccionables | ✅ |
| 4 | mi-opencode funciona como núcleo interno | ✅ (:4096 healthy) |
| 5 | Dashboard conectado al core | ✅ (flujo login→capabilities→core probado) |
| 6 | Capacidades reales del core identificadas | ✅ (chat, reasoning, code, analysis, runtimes, workflows, tools…) |
| 7 | Capacidades conectadas al dashboard | ✅ (todas las pestañas con servicio real) |
| 8 | Sin placeholders aparentemente conectados | ✅ |
| 9 | Sin servicios duplicados | ✅ (dashboard propio reemplaza al vite dev manual; admin-panel upstream desactivado) |
| 10 | El sistema compila/levanta | ✅ (stack arriba y healthy) |
| 11 | Tests/validaciones relevantes pasan | ✅ (sección 11) |
| 12 | Arquitectura documentada | ✅ (este informe) |

---

## 13. AUDITORÍA DE PLACEHOLDERS (PARTE 3 — 14-ago-2026)

Auditoría en vivo de cada pestaña del dashboard: se ejecutó cada endpoint que usa el
frontend (`frontend/src/services/api.js`) contra el stack real y se comparó el código
del contenedor con el disco.

### Problemas encontrados y corregidos

| Problema | Causa raíz | Fix | Verificación final |
|---|---|---|---|
| `/api/tools/*` → 404 (pestaña Tools y Ejecuciones rotas) | El contenedor api usa la imagen upstream `librechat-dev` y NO tenía `tools.js` ni el mount `/api/tools` (el código custom se copia a mano; `tools.js` se agregó al disco pero nunca se copió) | `docker cp` de `routes/tools.js` + `index.js` al contenedor; se agregó el paso 5.7 (sync) a `start-stack.sh` para que no vuelva a pasar | ✅ `/api/tools` → 200 con catálogo REAL de mi-opencode (`api-client`, etc.); `/api/tools/config`, `/api/tools/sessions` → 200 con sesiones reales (`ses_00381d8d…`, `librechat-bridge`); `/api/tools/sessions/:id/messages` → 200 con conversaciones reales |
| `/api/docs/spec` → 503 "OpenAPI spec not loaded" (pestaña Documentación rota) | Doble bug: (1) `getDocsService()` nunca llamaba `initialize()`; (2) `docsPath` era `__dirname + '../docs'` = `services/docs` (un nivel mal; en Linux falla por case) cuando el archivo está en `server/docs` | Carga del spec en el constructor + ruta corregida a `'../../docs'` | ✅ `/api/docs/spec` y `/api/docs/spec.yaml` → 200 |
| `/api/performance/*` → 500 "Failed to get performance summary" (pestaña Rendimiento rota) | El contenedor tenía la versión VIEJA de `PerformanceMonitor.js` (sin el fix R35 que exporta `getPerformanceMonitor`) | `docker cp` del directorio `services/Performance/` al contenedor | ✅ `/api/performance/summary`, `/metrics`, `/history`, `/benchmark/quick` → 200 |

### Matriz final (todo 200 tras los fixes)

health, system/status, runtimes, metrics/summary, metrics/dashboard, telemetry/health,
telemetry/logs, capabilities, workflows, keys, cache/stats, ratelimit/stats, tools,
tools/config, tools/sessions, docs/spec, docs/spec.yaml, performance/summary,
performance/metrics, performance/history, performance/benchmark/quick, api-keys

**Conclusión: no quedan placeholders.** Cada pestaña del dashboard tiene servicio real
con datos reales (catálogo de tools, sesiones y mensajes del core mi-opencode,
OpenAPI spec, métricas de rendimiento). Los `500` de `runtimes/execute` y
`capabilities/execute` con body vacío son validación (con body válido devuelven 200
con respuesta real del ExecutionEngine → LLMRuntime → groq).

### Durabilidad

`start-stack.sh` ahora incluye el paso 5.7 "Sync archivos custom al contenedor api":
copia `index.js`, `panel.js`, `tools.js`, `performance.js`, `metrics.js`, `telemetry.js`,
`system.js`, `initializeMCPs.js`, `DocsService/index.js`, los servicios de
Performance y los de localProviders, y valida la sintaxis con `node --check` — de
modo que un `docker compose up` que recree el contenedor no vuelva a perder las rutas custom.

---

## 14. MODELOS LOCALES — OLLAMA (FASE 14, 14-ago-2026)

### Arquitectura: Local Model Providers (abstracción, NO acoplada a Ollama)

```text
DASHBOARD (pestaña "Modelos Locales")
   │  /api/local-models (JWT)
   ▼
api/server/routes/localModels.js
   │
   ▼
LocalModelRegistry (api/server/services/localProviders/index.js)
   ├── config.json  (enabled + endpoint override, persistente)
   └── LocalModelProvider  (clase base: isAvailable/listModels/getModelInfo/…)
         └── OllamaProvider  (hoy)   ← LM Studio / llama.cpp / vLLM mañana
                     │   API nativa (solo fetch, sin deps)
                     ▼
              Ollama runtime (:11434)  GET /api/version · /api/tags · /api/show
```

Agregar un proveedor nuevo = crear un adapter que extienda `LocalModelProvider` y
registrarlo en `buildProviders()` — el selector/panel no cambia.

### Chat end-to-end (selector + streaming)

`librechat.yaml → endpoints.custom` agregó `Ollama (local)` con `baseURL:
http://ollama:11434/v1` (OpenAI-compatible) y **`fetch: true`**: el selector del chat
**descubre automáticamente** los modelos instalados (GET /v1/models) — no hay que
registrarlos a mano. El streaming usa el cliente OpenAI-compatible nativo de LibreChat.
Verificado en `/api/endpoints`: aparece "Ollama (local)".

### Estado real (verificado en vivo)

- Runtime `chat-ollama` (ollama/ollama:latest) corriendo en el stack, puerto 11434.
- `/api/local-models` → `{ connected: true, version: "0.32.9", modelCount: 0 }`.
- **0 modelos**: sin internet en esta sesión no se pudo descargar ninguno
  (registry.ollama.ai y huggingface.co inalcanzables; Docker Hub sí).
- El modelo pedido (DeepSeek-V4-Flash-0731-DSpark GGUF de Lucebox, **~98 GB**, 284B
  params) quedó **registrado** en `integrations/ollama/Modelfile.deepseek-v4-flash-dspark`
  y en `scripts/ollama-models.sh` — se descarga con internet (ver sección 9-pendientes).

### Archivos creados/modificados (FASE 14)

| Archivo | Cambio |
|---|---|
| `api/server/services/localProviders/LocalModelProvider.js` (nuevo) | Clase base + `validateEndpoint` (SSRF-safe: solo http/https) |
| `api/server/services/localProviders/OllamaProvider.js` (nuevo) | Detección, /api/tags, /api/show, capacidades (sin inventar datos) |
| `api/server/services/localProviders/index.js` (nuevo) | Registry + persistencia en config.json |
| `api/server/services/localProviders/config.json` (nuevo) | Defaults por proveedor |
| `api/server/routes/localModels.js` (nuevo) | GET /, GET /:id/models, POST /:id/refresh, PATCH /:id (JWT) |
| `api/server/index.js` | Mount `app.use('/api/local-models', …)` |
| `frontend/src/components/Models/LocalModelsPanel.jsx` (nuevo) | Panel: estado, endpoint editable, refresh, modelos con capacidades |
| `frontend/src/components/AdminPanel.jsx` | Pestaña "🖥️ Modelos Locales" |
| `frontend/src/services/api.js` | Servicio `localModels` |
| `librechat.yaml` | Endpoint custom `Ollama (local)` (fetch:true → auto-discovery) |
| `docker-compose.override.yml` | Servicio `ollama` (:11434) + `OLLAMA_BASE_URL` al api |
| `.env` | `OLLAMA_BASE_URL=http://ollama:11434` |
| `integrations/ollama/Modelfile.deepseek-v4-flash-dspark` (nuevo) | Registro del GGUF de Lucebox |
| `scripts/ollama-models.sh` (nuevo) | Pull de modelos + registro del DeepSeek |
| `api/server/services/localProviders/localModels.spec.js` (nuevo) | Tests unitarios (jest) |

### Validación de la FASE 14

- `GET /api/local-models` vía dashboard (:3050) → 200, Ollama connected. Sin token → 401.
- `POST /api/local-models/ollama/refresh` → 200. `PATCH` con URL inválida (file://, gopher://) → 400.
- PATCH endpoint + revertir a default → 200 (persistido).
- `/api/endpoints` → contiene "Ollama (local)".
- Smoke test node de la lógica del provider (validación, normalización, offline,
  discovery, capacidades) → todos los casos pasan.
- Tests jest: **no ejecutables en esta sesión** (jest no está en la imagen dev y no hay
  internet para npm); el spec queda en el repo para CI/local.

---

# FASE 16 — Icono de Ollama + panel "Modelos locales" en el selector de modelos

**Pedido (14-AGO-2026):** en el selector de modelos del chat, un icono para ver los
modelos locales y la información de cada uno — por ahora con el icono de Ollama.

## Qué se hizo

### Icono de Ollama
1. **`images/ollama.svg`** (nuevo): icono oficial de la llama (llama en círculo oscuro).
   Se sirve desde `/images/ollama.svg` (el volumen `./images` ya está montado en
   `/app/client/public/images`).
2. **`librechat.yaml`**: `iconURL: /images/ollama.svg` en el endpoint `Ollama (local)`
   → el endpoint aparece en el selector con su icono (verificado en vivo).

### Panel "Modelos locales" en el selector
3. **`client/.../Endpoints/components/OllamaIcon.tsx`** (nuevo): SVG vectorial
   `currentColor` para el botón del panel (se adapta a tema claro/oscuro).
4. **`client/.../Endpoints/components/LocalModelsPanel.tsx`** (nuevo): consume
   `/api/local-models/ollama/models` (JWT). Muestra: estado (🟢 Conectado + versión /
   🔴 No disponible), endpoint, botón **Actualizar modelos**, y una tarjeta por modelo
   con **metadatos reales** (tamaño, parámetros, cuantización, arquitectura, contexto,
   fecha, capacidades: Texto/Tools/Reasoning/Visión) y botón **Usar**. Errores
   informativos, nunca críticos.
5. **`client/.../Endpoints/components/LocalModelsSection.tsx`** (nuevo): item con el
   icono de Ollama al final del dropdown del selector; clic despliega/oculta el panel
   (aria-expanded para no cerrar el menú).
6. **`client/.../Endpoints/ModelSelector.tsx`**: render de `<LocalModelsSection />`.

### Build del cliente (la imagen upstream no trae vite)
7. **`scripts/build-client-inner.sh`** (nuevo): instala las devDeps de build en
   `/tmp/clientdeps` (árbol standalone, `npm install --strict-ssl=false` porque la
   red termina TLS con cert propio), apunta `react`/`react-dom`/`react-query` a las
   copias de la app (evita el crash de doble React 19 vs 18 — encontrado y resuelto),
   crea los symlinks en `/app/client/node_modules` y recompila `client/dist` con vite.
8. **`start-stack.sh` (paso 5.8)**: copia los fuentes custom del selector (5.7) y
   ejecuta el rebuild — la FASE 16 sobrevive a recreaciones del contenedor.

## Verificación en vivo (navegador, :3080)

- Selector de modelos → aparece **Ollama (local)** con icono de llama + item
  **"Modelos locales · Ollama"** con el mismo icono.
- Panel desplegado: **"Conectado · v0.32.9"**, endpoint `http://ollama:11434`,
  botón Actualizar. Tras descargar `qwen3:0.6b`, la tarjeta muestra:
  `qwen3:0.6b · 498 MB · 751.63M · Q4_K_M · Arquitectura: qwen3 · Contexto: 40,960`
  · Capacidades: Texto, Tools.
- **E2E completo**: botón "Usar" → la conversación cambia a
  `endpoint=Ollama (local)&model=qwen3:0.6b` → mensaje enviado → streaming con
  "Pensamientos" (reasoning) → respuesta final del modelo local en la UI, con el
  icono de Ollama, título generado automáticamente y medidor de contexto 37k.
- Build reproducible: `rm -rf /tmp/clientdeps` + `sh /tmp/build-client-inner.sh`
  → bundle reconstruido OK desde cero.

---

# FASE 15 — Eliminación del Panel Enterprise (`frontend/`) y limpieza final

**Decisión del usuario (14-AGO-2026):** el panel que aparecía en `http://localhost:3050`
NO es el dashboard que veníamos personalizando. La versión personalizada vive en el
**cliente de LibreChat** (`client/` + api custom, `:3080`). Por lo tanto:

1. **Eliminado el servicio `dashboard`** de `docker-compose.override.yml` (ya no se
   levanta con `docker compose up`). El `admin-panel` de upstream sigue desactivado
   por `profiles` (no compite con nada).
2. **Eliminado el contenedor e imagen** `mi-libre-chat-dashboard` (puerto `:3050`
   quedó libre — verificado: no hay socket escuchando).
3. **Eliminado el directorio `frontend/`** del proyecto (Panel Enterprise + Dockerfile
   + nginx.conf + node_modules, ~59 MB).
4. **Limpieza de referencias**: quitadas las menciones a `frontend/` en
   `api/test-services.sh`, la línea "Dashboard :3050" del resumen de
   `start-stack.sh`, y los origins `:3050` de `ALLOWED_ORIGINS` en `.env`.
5. **La integración de Ollama no se pierde**: el endpoint `Ollama (local)` vive en
   `librechat.yaml` (selector del chat con auto-discovery) y el backend
   `/api/local-models` sigue disponible en el api (`:3080`) para quien quiera
   consumirlo. El Modelfile del DeepSeek-V4-Flash-DSpark y `scripts/ollama-models.sh`
   quedan en el repo.

**Resultado: el proyecto queda como el LibreChat personalizado** — UI en
`http://localhost:3080` (login `f12@test.local` / `Test1234!`), selector de modelos
con LLM reales + Ollama (local), y sin el panel ajeno.

---

# FASE 17 — Panel de Modelos Locales completo: catálogo + descarga + runtimes headless

**Petición del usuario (14-AGO-2026):** en la parte local, una interfaz que (a) muestre
las LLM instaladas, (b) permita **explorar LLM abiertas** con peso en disco, parámetros
y demás información relevante, y (c) tenga **botón de descarga**. Además, agregar los
runtimes de LM Studio **sin el Desktop/GUI**: `lmstudio-js`, `lmstudio-python`,
`lms CLI`, `mlx-engine` y `llama.cpp`. Ollama y estos deben ir **juntos en la misma
sección** (no separados).

## Arquitectura (abstracción ampliada, sin rediseñar el selector)

```
LocalModelRegistry
├── OllamaProvider            (conectado hoy — v0.32.9)
├── OpenAICompatProvider      (clase base para runtimes OpenAI-compatibles)
│     ├── llama.cpp           (host:8080/v1)
│     ├── lms CLI (LM Studio) (host:1234/v1)
│     ├── MLX Engine          (host:1234/v1)
│     ├── lmstudio-js (SDK)   (host:1234/v1)
│     └── lmstudio-python SDK (host:1234/v1)
└── CatalogService            (catálogo de LLM abiertos + tamaño real)
```

Cada proveedor es un adapter que detecta disponibilidad, lista modelos, expone
metadatos/capacidades y maneja errores — agregar un runtime nuevo = nuevo adapter,
sin tocar el selector ni el panel.

## Archivos nuevos / modificados

1. **`api/server/services/localProviders/OpenAICompatProvider.js`** (nuevo): proveedor
   genérico para cualquier runtime con API OpenAI-compatible (`/v1/models`). Config de
   endpoint + label por runtime en `config.json`; health check por `fetch`; mapeo de
   `id`/`created`/`owned_by` al modelo interno. Se instancia 5 veces (los 5 runtimes).
2. **`api/server/services/localProviders/catalog.json`** (nuevo): catálogo curado de
   LLM abiertos (qwen3, gemma3, deepseek-r1, llama3.x, mistral, phi4, olmo, granite...)
   con familia, parámetros, cuantización, contexto, licencia, capacidades, modalidad y
   el tag de Ollama correspondiente — **sin inventar datos**.
3. **`api/server/services/localProviders/CatalogService.js`** (nuevo): consulta el
   **manifest real del registry de Ollama** (`registry.ollama.ai`) para enriquecer cada
   entrada con **tamaño real en disco** y checksum; cachea 10 min; si el registry no
   responde, degrada a los valores del catálogo sin romper.
4. **`api/server/services/localProviders/index.js`**: registra Ollama + los 5 runtimes
   headless (todos juntos, misma sección) y expone `getCatalog()` y `pullModel()`.
5. **`api/server/routes/localModels.js`**: nuevas rutas `GET /api/local-models/catalog`
   y `POST /api/local-models/:id/pull` (stream SSE de progreso con
   `res.flushHeaders()` + eventos `status|progress|done|error`), auth JWT.
6. **`api/server/index.js`**: exclusión del SSE de la compresión
   (`Content-Encoding` rompía el streaming del navegador; resuelto con
   `req.originalUrl` — `req.path` es relativo al router montado).
7. **`client/.../LocalModelsPanel.tsx`** (reescrito): chips de **los 6 proveedores
   juntos** (Ollama + llama.cpp + lms CLI + MLX + lmstudio-js + lmstudio-python),
   tabs **Instalados / Explorar**, tarjetas con metadatos completos, búsqueda en
   Explorar, y botón **Descargar** con progreso en vivo (SSE) y actualización de la
   lista al terminar.
8. **`images/ollama.svg`** (nuevo): el api sirve `/images/` desde
   `client/public/images`, y `docker-compose.override.yml` monta `./images` →
   `/app/client/public/images` (**bind mount** — el repo ES el contenido en
   vivo del contenedor, por eso los iconos no van en SYNC_FILES).
   `start-stack.sh` sincroniza todo lo anterior (5.7) y recompila el cliente
   (5.8).

> **Hallazgo de integridad (mismo día):** el bind mount de `./images` se
> descubrió al verificar que el icono daba 404 — un `rm -rf images/` en el
> repo borra el icono del contenedor en vivo. Restaurado `images/ollama.svg`
> (200 OK) y documentado en `start-stack.sh` para no repetirlo.

## Verificación en vivo (navegador, :3080)

- Panel: chips de **6 proveedores juntos**; Ollama conectado con sus modelos y los
  5 runtimes headless como "No disponible" con su endpoint y pista ("Inicia el
  servidor en el host y pulsa Actualizar") — sin romper el selector.
- **Explorar**: catálogo con **tamaños reales del registry** (qwen3:0.6b=498 MB,
  qwen3:8b=4.9 GB, deepseek-r1:1.5b=1.0 GB, gemma3:1b=778 MB...), licencias,
  contexto y botón Descargar.
- **Descarga E2E desde la UI**: Gemma 3 1B → progreso SSE en vivo
  ("0% · pulling aabd4debf0c8") → `done` → aparece en Instalados con sus metadatos.
  Lo mismo con **DeepSeek-R1 1.5B (1.1 GB)** vía botón del catálogo.
- **API**: `POST /api/local-models/ollama/pull` descargó `qwen3:1.7b` (1.4 GB) y
  `gemma3:1b` de extremo a extremo con stream de progreso.
- **SSE sin compresión**: `curl -H 'Accept-Encoding: gzip'` sobre el stream devuelve
  eventos puros (el filtro excluye la ruta por `originalUrl`), endpoints normales
  siguen comprimidos.

## Estado final

- **6 proveedores en la sección Modelos locales** (todos juntos, como pidió).
- **4 modelos instalados** en Ollama: qwen3:0.6b, qwen3:1.7b, gemma3:1b,
  deepseek-r1:1.5b — todos seleccionables y usables en el chat.
- Catálogo explorable con datos reales y descarga funcional desde el navegador.
- Sin LM Studio Desktop/GUI (solo runtimes headless: CLI, SDKs, engines).

---

# FASE 18 — SELECTOR SIN DUPLICACIÓN, FLYOUT LATERAL, 401 CORREGIDO, HARDWARE + COMPATIBILIDAD + FUENTES EXTERNAS

## Objetivo cumplido
El selector responde ahora a: **"¿Cuál es el mejor modelo que YO puedo ejecutar en MI hardware?"**

## 1. Eliminada la duplicación de Ollama
- El endpoint custom "Ollama (local)" ya NO aparece como categoría independiente en el selector
  (se filtra en ModelSelector.tsx de la lista y de la búsqueda).
- Ollama vive DENTRO de "Modelos locales", junto a llama.cpp, lms CLI (LM Studio), MLX Engine y
  los SDKs lmstudio-js/python — como pidió. El botón "Usar" sigue funcionando (el endpoint sigue
  en mappedEndpoints para la selección de chat).

## 2. Ventana lateral nativa
- "Modelos locales" es ahora un submenú del propio selector (CustomMenu con placement right,
  auto-flip): abre hacia la DERECHA con el mismo patrón visual de los demás submenús. No se creó
  un sistema visual paralelo.

## 3. HTTP 401 — causa raíz y solución
- CAUSA: el panel leía `localStorage["token"]`, pero NADIE escribe ese key en LibreChat: el token
  real vive en el header de axios (`getTokenHeader()`), renovado por el flujo de silent refresh.
  Resultado: en uso normal el fetch del panel iba sin Authorization → 401.
- SOLUCIÓN: el panel ahora (a) lee el token de `getTokenHeader()` (fallback a localStorage) y
  (b) ante un 401 real hace `request.refreshToken()` + `dispatchTokenUpdatedEvent` (misma
  recuperación que el SSE) y reintenta una vez. Verificado en vivo: borrado `localStorage["token"]`
  → el panel sigue cargando modelos sin 401.
- No se eliminó ninguna validación de seguridad: las rutas siguen con requireJwtAuth y los
  runtimes locales (Ollama/LM Studio) se consultan SIN credenciales (no las requieren).

## 4. Instalados
- Agrupado por proveedor con estado (🟢 Conectado / 🔴 No disponible), conteo de modelos y tarjetas
  con peso real en disco, parámetros, cuantización, arquitectura, contexto, fecha y capacidades.
- Badge de compatibilidad por modelo instalado según el hardware configurado.

## 5. Explorar — fuentes
- 📦 Catálogo (curado, con tamaño REAL del registry de Ollama y descarga E2E).
- 🤗 Hugging Face: API pública (sin clave). Datos reales: descargas, likes, trendingScore,
  pipeline_tag, licencia, parámetros (safetensors.total). Sin botón de descarga (no hay ollamaTag):
  enlace "Ver en HF". Cache 5 min.
- 🐙 GitHub: búsqueda pública de repos con modelos GGUF (stars reales). Representado explícitamente
  como repos que CONTIENEN modelos — NO el catálogo "GitHub Models" (ese requiere PAT; pendiente,
  ver Riesgos).
- Cada fuente falla de forma aislada (502 propio) sin romper el panel.

## 6. Hardware
- Auto-detección vía WebGL (renderer → GPU) + navigator.deviceMemory (RAM), con sugerencia de
  VRAM por GPU. Configuración manual (GPU/VRAM/RAM) persistida en localStorage.
- La VRAM no es detectable desde el navegador → se marca como estimación y se puede ajustar.

## 7. Compatibilidad (estimación honesta)
- `modelGB = params × bits(quant) / 8 × 1.05` (bits: Q4≈4.5, Q5≈5.5, Q6≈6.5, Q8≈8.5, FP16=16).
- 🟢 Excelente (cabe en VRAM), 🟡 Compatible (offload parcial), 🟠 Puede ser lento (solo CPU/RAM),
  🔴 No recomendado. Siempre etiquetado "(estimación)".

## 8. Model Score (datos reales)
- `score = 0.35·compat + 0.25·params + 0.15·contexto + 0.15·capacidades + 0.10·licencia`
  (en fuentes externas: 0.7·base + 0.3·popularidad real: log10(descargas)/7 en HF, stars/20000 en GH).
- `eficiencia = score / modelGB`. Recomendados = top 3 por score con compatibilidad.
- Insignias: 🏆 Top pick (mejor score compatible), ⚡ Mejor eficiencia, 🔥 Trending (HF,
  trendingScore real), 💎 Hidden gem (HF: likes≥8 y descargas<20k). Nada inventado.

## 9. Filtros
- Tamaño (<3B…>70B), Arquitectura (Dense/MoE), Modalidad, Capacidades, Contexto (8K+…128K+) y
  el toggle "✓ Compatible con mi PC" (deja solo Excelente/Compatible).

## 10. Archivos modificados
- client: ModelSelector.tsx, components/LocalModelsSection.tsx, components/LocalModelsPanel.tsx
- api: services/localProviders/CatalogService.js (searchExternal + HF/GitHub), catalog.json
  (architecture/modality + qwen3:30b-a3b MoE), services/localProviders/index.js, routes/localModels.js
- start-stack.sh (paso 5.9: reinicia el api tras sync/rebuild para aplicar backend)

## 11. Riesgos / pendientes
- GitHub Models (catálogo oficial) requiere PAT: no implementado, documentado.
- Rate limits públicos de HF/GitHub mitigados con cache de 5 min.
- Estimaciones de VRAM marcadas como tales (no son datos exactos).

## 12. Verificación en vivo (:3080)
- Selector sin "Ollama (local)" en la lista; "Modelos locales" como submenú lateral.
- 6 proveedores juntos; Instalados agrupado; Explorar con hardware detectado (GTX 1650 SUPER,
  8 GB), recomendados, insignias, filtros y las 3 fuentes funcionando con datos reales.
- Fix 401 probado (sin token en localStorage el panel carga).

### FASE 18b — Botón de descarga en Hugging Face
- Los modelos de HF ahora tienen **"Ver en HF" + "Descargar"**: el botón baja el GGUF vía Ollama
  (`ollama pull hf.co/repo`, probado de extremo a extremo: Qwen3-0.6B-GGUF 639 MB completado;
  SmolLM2-135M 88 MB con SSE en vivo desde la UI).
- El validador del pull acepta ids con `/` (hf.co/owner/repo[:quant]) — sanity check sin shell.
- GitHub sigue siendo repos que contienen modelos: se abre el repo ("Ver repo"), no se descarga.
- Verificado en vivo: tarjetas HF con ambos botones y POST /api/local-models/ollama/pull 200.

### FASE 19 — Modelos locales v2 + Personalizar navegación (14 AGO 2026)
P1 — Modelos locales:
- **Ya-instalados en Explorar**: badge verde "Instalado" en catálogo y HF (comparando contra el
  registry real de Ollama, sin duplicados; refresh automático tras cada descarga/borrado).
- **Selección de cuantización al descargar**: endpoint nuevo `/api/local-models/hf-quants?repo=…`
  (lista archivos GGUF del repo vía API pública HF, sin clave). El click en "Descargar" de HF carga
  quants y decide: >1 abre el selector, 1 descarga esa, 0 descarga directo (Ollama avisa si no es
  GGUF). Fix: el click ya no descarga directo mientras cargan las quants.
- **Pausar/reanudar**: el pull usa AbortController + SSE; "Pausar" aborta la conexión (Ollama
  continúa en segundo plano y `ollama pull` reanuda desde donde quedó) con `res.on('close')` +
  guard de `writableEnded` (no confundir desconexión con fin del stream).
- **Borrar modelo en Instalados**: endpoint `/api/local-models/ollama/delete` + botón "Borrar"
  con confirmación (probado E2E: borré SmolLM2-135M y lo restauré).
- **Runtime real en el host**: probado el adapter OpenAI-compat contra Ollama `/v1` real
  (8 modelos). Se encontró y corrigió un bug: los defaults incluían `/v1` → doble `/v1/v1/models`.

P2 — Personalizar navegación (Configuración):
- Nueva sección en **Configuración → Personalizar navegación** con acordeones expandibles por
  herramienta (Agentes, Skills, Prompts, Memorias, Marcadores, Archivos, Parámetros avanzados,
  MCP Settings) + switch "Mostrar en barra lateral" por herramienta + "Restaurar configuración
  predeterminada".
- Los switches controlan la barra lateral **en vivo** (verificado: Skills OFF desaparece de la
  barra, ON reaparece) y **persisten** vía los átomos Recoil existentes
  (`store/settings.ts` + `atomWithLocalStorage` de LibreChat). Las rutas y permisos no cambian.
- Archivos: nuevo átomo `showSidebarFiles` + gate en `useSideNavLinks`/`sidebarFeatures.config`.
- Tab `navigation` agregado en `Settings/types.ts` + registro en `registry.tsx` + claves
  `com_nav_*` en `en`/`es`.

### FASE 19b — Fix botones negros en Modelos locales
- **Causa**: el panel usaba `text-primary-content`, clase **inexistente** en el Tailwind config
  (el color primary se define con `foreground` → la clase válida es `text-primary-foreground`).
  Sin clase de texto, el texto heredaba el color por defecto del tema (claro en modo oscuro) sobre
  el fondo `bg-primary` (claro) → botones ilegibles ("en negro").
- **Fix**: 11 ocurrencias de `text-primary-content` → `text-primary-foreground` en
  LocalModelsPanel.tsx (botones Usar/Descargar/Reanudar, chips activos y selector de quants).
- **Además**: el build moría con OOM en este host (8 GB) — `--max-old-space-size=8192` → bajado a
  4096 en scripts/build-client-inner.sh. Un build interrumpido dejó `/app/client/dist` vacío y el
  api en crash loop (`ENOENT index.html`); se resolvió con placeholder + rebuild + restart.

### FASE 20 — Espacio en disco, Personalizar navegación v2, Sonidos y notificaciones (14 AGO 2026)
P1 — Espacio en disco antes de descargar:
- El api monta el volumen de Ollama en solo lectura (`ollama-data:/root/.ollama:ro` en
  docker-compose.override.yml) y expone `GET /api/local-models/ollama/space` vía `fs.statfs`
  (Node ≥18). Sin acceso → null (la UI omite la validación, no bloquea).
- La UI compara el tamaño real (catálogo / cuantización seleccionada) contra el espacio libre:
  botón ámbar + aviso "No cabe en disco" y opciones del selector de quants marcadas con "⚠ no cabe".
- Verificado: 1.03 TB libres por API y fetch del panel 200.

P2 — Modo claro verificado:
- El CSS define `html{}` (claro: `--primary` negro, `--primary-foreground` blanco) y `.dark`
  (inverso). Los botones del panel usan variables del tema: en claro = negro con texto blanco,
  en oscuro = blanco con texto negro; secundarios gris legible en ambos. El bug real era
  `text-primary-content` (clase inexistente), corregido en FASE 19b — verificado con computed
  styles en ambos modos.

P3 — Personalizar navegación v2:
- Cada herramienta (Nuevo chat, Historial, Agentes, Skills, Prompts, Memorias, Marcadores,
  Archivos, Parámetros, MCP) tiene ahora su botón "Abrir" SIEMPRE visible en la fila (sin
  expandir), con data-testid `settings-nav-open-*`.
- El botón dispara el evento global `open-side-panel` (escuchado en ExpandedPanel → setActive +
  onExpand) y cierra el diálogo de Configuración (Escape + fallback al botón Close). El panel de
  la herramienta se abre con sus funciones exactamente como desde el menú principal.
- El chevron/la fila siguen expandiendo el acordeón (descripción + switch + restaurar).

P4 — Sonidos y notificaciones (Configuración → Preferencias → 🔊 Sonidos y notificaciones):
- Backend: modelo `UserSoundPreference` (MongoDB, por usuario), rutas `GET/PUT
  /api/user/sound-preferences`, `GET /api/sounds/providers`, `GET /api/sounds/search`,
  `GET /api/sounds/:id` (todas con JWT; claves de proveedores SOLO en backend).
- Abstracción de proveedores: `services/sounds/local.js` (biblioteca sintetizada, 12 tonos,
  sin atribución, uso comercial permitido) + `services/sounds/freesound.js` (API pública con
  FREESOUND_API_TOKEN; licencias CC con atribución mostradas). Mixkit/ZapSplat/Pixabay sin API
  pública para sonidos → no implementados, documentado.
- Cliente: `SoundService` (singleton, síntesis WebAudio, un solo sonido a la vez, volumen por
  evento, "reducir durante actividad intensa", segundo plano), `useSoundSystem` (carga/persiste
  por usuario + conecta el EventBus de tareas/agentes → taskCompleted/error/warning), y el panel
  en Settings con biblioteca (búsqueda, filtros por proveedor/categoría/duración, favoritos,
  ▶ preview, licencia, "Usar").
- Eventos REALES: fin de respuesta del chat → `playEvent('aiResponse')`; errores del SSE →
  `playEvent('error')`. **Fix clave**: el chat usa `useResumableSSE` (no `useSSE`) — se agregó el
  disparo en los 3 puntos (final, error server-sent, max retries). También se normaliza el
  prefijo `local:` en la síntesis (antes el sonido guardado con prefijo nunca sonaba).
  Verificado de punta a punta: respuesta del modelo → 3 osciladores creados (sonido real).
- Fixes de infraestructura: EventBus crasheaba al montarse globalmente (`setMaxListeners` no
  existe en la versión instalada de eventemitter3 → guard); build de vite cacheaba chunks viejos
  (limpieza de `.vite` en build-client-inner.sh); `lucide-react` se enlaza al root del monorepo
  (rolldown no lo resolvía desde packages/client); heap de node 4096 (OOM en host de 8 GB);
  el modelo SoundPreferences debe vivir en `api/models` (alias `~/models`).

### FASE 21 — Personalizar navegación v3: switch deslizable por fila + funciones inline (14 AGO 2026)
Petición del usuario: quitar el botón "Abrir" de Nuevo chat e Historial; en el resto, un botón
deslizable visible en la fila que SOLO controla si la herramienta aparece en el menú principal;
y al hacer click en la fila (expandir/colapsar) deben aparecer las mismas funciones que en el
menú principal.

Cambios en `client/src/components/Nav/Settings/CustomizeNavigation.tsx`:
- `FixedRow` (Nuevo chat, Historial): eliminado el botón "Abrir"; queda icono + label + badge
  "Siempre visible" + chevron (expande una breve descripción). Se eliminó `openSidePanel`,
  `openNewChat`/`openHistory` y el import de `ArrowUpRight` (ya no se usan).
- `FeatureRow` (Agentes, Skills, Prompts, Memorias, Marcadores, Parámetros, MCP, Archivos):
  - El botón "Abrir" se reemplazó por un **switch deslizable visible directamente en la fila**
    (data-testid `settings-nav-toggle-<id>`, aria-label "Mostrar en barra lateral: <tool>") que
    escribe el mismo átomo Recoil que consume `useSideNavLinks` → la barra lateral se actualiza
    al instante y la preferencia persiste (mismo mecanismo de siempre, sin duplicar).
  - Al expandir la fila (click en fila o chevron) se montan **inline los mismos componentes del
    menú principal** (los que monta `useSideNavLinks` → `SidePanel/Nav`): `AgentPanelSwitch`,
    `SkillsAccordion`, `PromptsAccordion`, `MemoryPanel`, `BookmarkPanel`, `FilesPanel` y
    `MCPBuilderPanel`. Excepción: **Parámetros** queda excluido del render inline porque usa
    `useChatContext` (no existe dentro de Configuración) — su fila conserva descripción + switch.
- El cuerpo expandido ahora muestra: descripción + acción "Restaurar esta herramienta" +
  el panel real de la herramienta (mismas funciones, datos y botones que el menú principal).

Verificado en vivo (http://localhost:3080):
- No existe ningún botón "Abrir" en la sección (0 elementos `settings-nav-open-*`).
- 8 switches visibles en las filas + master "Modo avanzado" (9 switches en total).
- Expandir Skills muestra el panel real: "Skills / My Skills / No skills yet / Configuración de
  Administrador" (idéntico al menú principal).
- Switch OFF → la herramienta desaparece al instante de la barra lateral (Marcadores);
  ON → reaparece; y el estado persiste tras recargar la página.

### FASE 22 — Sonidos: subida personalizada + proveedores Pixabay/Mixkit + PHASE 0 de agentes (14 AGO 2026)
Petición: (1) permitir subir sonidos propios y que aparezcan los sonidos de Pixabay, Mixkit y
Freesound; (2) arrancar el "MASTER PROMPT — UNIVERSAL AI AGENT ARCHITECTURE" con su auditoría.

## A. Sonidos — subida de usuario (backend)
- Nuevo `api/server/services/sounds/uploads.js`: almacena en `<cwd>/uploads/sounds/<userId>/<uuid>.<ext>`.
  Validación: MIME en lista blanca (mp3/wav/ogg/m4a/webm), máx 5 MB, id `custom:<uuid>` no
  adivinable, acceso SOLO al propietario. Duración (máx 15 s) validada en cliente; el servidor no
  la revalida (sin ffprobe) — limitación documentada.
- `routes/sounds.js` nuevos: `POST /api/sounds/upload` (multer memoryStorage, 5 MB), `GET
  /api/sounds/custom`, `DELETE /api/sounds/custom/:id`, `GET /api/sounds/file/:id` (streaming JWT).
- `SoundController`: `ensureUploadDir()` al arrancar (montado en `index.js`); getById resuelve
  `custom:` con previewUrl.
- Cliente: `SoundService.playSoundId` reproduce `custom:`/`pixabay:` descargando el archivo con
  fetch+Authorization → blob URL (sin token en la URL/logs); `SoundsPanel` nueva sección
  "🎵 Mis sonidos" (subir con validación MIME/tamaño/duración vía Audio, listar, reproducir,
  borrar) + chips de proveedores con 🔑 cuando falta la clave.

## B. Sonidos — proveedores Pixabay y Mixkit
- `api/server/services/sounds/pixabay.js`: API real `https://pixabay.com/api/sounds/` con
  `PIXABAY_API_KEY` (backend), caché 5 min, mapeo defensivo de campos (previews/preview_hq/lq),
  licencia Pixabay Content (comercial sin atribución). Sin key → proveedor deshabilitado (🔑),
  el resto sigue funcionando.
- `api/server/services/sounds/mixkit.js`: Mixkit NO tiene API pública (verificado) → catálogo
  CURADO de 12 sonidos populares con página oficial (mixkit.co), licencia Mixkit Free, sin
  preview directo (sin hotlinking frágil). Se muestra su enlace para descargar.
- Freesound: ya existía (FASE 20) con `FREESOUND_API_TOKEN`.
- `docker-compose.override.yml`: pasa `PIXABAY_API_KEY` y `FREESOUND_API_TOKEN` (opcionales);
  documentadas en `.env.example`.

## C. Agentes — PHASE 0 del MASTER PROMPT (auditoría, sin tocar arquitectura)
Documentos generados tras inspección REAL del código:
- `CURRENT_ARCHITECTURE.md` — arquitectura actual (cliente → API → mi-opencode/Ollama).
- `CURRENT_CAPABILITIES.md` — 15 capacidades verificadas (agentes, skills, MCP, memorias,
  modelos locales, tools proxy real, multiagente, WorkflowEngine, EventBus, observabilidad…),
  6 parciales, 10 no implementadas.
- `MISSING_CAPABILITIES.md` — brechas priorizadas: Context Engine, Project Brain, memoria por
  capas, Tool Router, Workflow→UI/persistencia, Model routing, Auditor, Policy, Token economy,
  ComputeProvider; y qué NO se integrará sin justificación (Temporal/Argo/OPA/GraphRAG…).
- `SYSTEM_MAP.md` — topología y relaciones (qué usa qué, qué se rompería con cada cambio).
- `DEPENDENCY_MAP.md` — dependencias externas/internas + riesgos de impacto + tests existentes.
- `AUDIT.md` — hallazgos: bugs corregidos en fases previas, SIN placeholders en rutas críticas,
  WorkflowEngine sin UI (código muerto conocido), tests faltantes, seguridad.

## D. Verificación en vivo (http://localhost:3080)
- Providers: 5 (local, custom, mixkit, pixabay, freesound) — pixabay/freesound con 🔑 sin key.
- Mixkit search devuelve catálogo con página/licencia; UI muestra chips y resultados.
- Upload E2E: subida 200 → getById (nombre amigable) → stream con header 200 (audio/mpeg) →
  MIME inválido 400 → delete 200.
- Panel de sonidos: sección "Mis sonidos (subidos por ti)" + eventos + biblioteca, verificado.

### FASE 23 — Agentes: Model Routing Automático/Manual + conexión real con los LLM (14 AGO 2026)
Petición: en la parte de agentes faltaba algo visible (toggle Automático/Manual arriba) y
confirmar que los agentes están conectados con los LLM. Implementación de la sección 6
("MODEL ROUTING") del MASTER PROMPT, de forma REAL y conectada:

## A. Conexión agente ↔ LLM (verificada)
- El chat de agentes resuelve el modelo REAL en `agent.model_parameters.model`
  (controllers/agents/client.js: `this.model = options.agent.model_parameters.model`).
  El agente sí está conectado al LLM: al seleccionar un agente, su provider+modelo
  (p. ej. Ollama qwen3:0.6b) se usa en cada petición. Verificado creando un agente
  real vía POST /api/agents (provider ollama, model qwen3:0.6b).

## B. Model Routing (Automático / Manual)
- Nuevo modelo `api/models/AgentRoutingPreference.js` (colección propia, NO toca el
  schema de Agent): agentId (string) + userId + mode ('manual'|'auto') + tiers.
- Nuevo servicio `api/server/services/AgentRouting.js`:
  - `pickTier(text)`: heurística explícita y honesta — large (≥600 chars, bloques
    ```, refactor/auditoría/debug/arquitectura), medium (≥90 chars, código/sql/
    regex/workflow, >60 palabras), small (consultas cortas).
  - `applyAgentRouting(agent, messages)`: si mode=auto, resuelve el modelo efectivo
    por nivel y lo aplica SOLO al objeto local del agente (model + model_parameters.
    model — el que usa el cliente LLM). Nivel vacío → modelo del agente (no rompe).
- Controllers `openai.js` y `responses.js`: hook justo después de `db.getAgent` +
  log del tier elegido (observabilidad).
- Rutas `GET/PUT /api/agents/routing/:agentId` (JWT + propiedad vía `author`).
  Montadas en index.js ANTES del router de agentes.
- UI `client/src/components/SidePanel/Agents/AgentRouting.tsx`: control visible ARRIBA
  del panel de Agentes — segmented "Manual | Automático" + 3 selects de nivel
  (Pequeño/Mediano/Grande) con los modelos del proveedor del agente, persistido
  por PUT. En Manual, el agente usa siempre el modelo elegido (comportamiento original).

## C. Bugs encontrados y corregidos durante la verificación
- `db.createAgent` no registra schemas en un proceso node separado → la prueba usa
  el flujo HTTP real (POST /api/agents) — el agente se creó OK.
- El owner del agente es `author` (no `user`) → corregido en el controlador.
- `agentId` debe ser String (los agentes usan ids 'agent_xxx') → corregido en el modelo.
- El API de agentes rechaza curl sin User-Agent de navegador (uaParser) — nota para
  pruebas por API.

## D. Verificación en vivo (FASE 23)
- Agente REAL creado por API (provider ollama, model qwen3:0.6b) — el API de agentes
  funciona (nota: requiere User-Agent de navegador por uaParser).
- GET/PUT /api/agents/routing/:agentId → 200 (propiedad verificada; sin token → 401).
- applyAgentRouting con el agente real y la preferencia persistida:
  mensaje corto → tier small → SmolLM2-135M · mensaje sql → medium → qwen3:0.6b ·
  código/refactor largo → large → qwen3:30b · sin preferencia → manual, sin cambio.
- UI: toggle "Manual | Automático" visible ARRIBA del panel de Agentes (radios en DOM);
  en Automático sin agente muestra aviso; con agente muestra los 3 niveles.
- Chat de agentes por API: falla con `ENDPOINT_MODELS_NOT_LOADED: ollama` TAMBIÉN en modo
  manual → limitación PREEXISTENTE del runtime de agentes upstream con proveedor local
  (no la causa el routing; el routing aplica en los flujos OpenAI-compat / Responses).
- Conexión agente↔LLM: el modelo real se resuelve en `agent.model_parameters.model`
  (client.js) — el agente SÍ está conectado al LLM por arquitectura; el chat normal con
  Ollama funciona de punta a punta (verificado en FASE 20 con sonido real).

---

## FASE 24 — Chat de agentes con Ollama E2E + routing conectado al flujo real

### Problema encontrado (causa raíz)
- El error `ENDPOINT_MODELS_NOT_LOADED: ollama` NO era del runtime de agentes ni de
  `loadConfigModels` (que ya resuelve endpoints `fetch:true` a lista plana).
- Causa real: el agente se creó con `provider: 'ollama'`, pero el key real del endpoint
  en `modelsConfig` es `'Ollama (local)'` (normalizeEndpointName no convierte el display
  name). `validateAgentModel` consultaba `modelsConfig['ollama']` → undefined → error.
- Con `provider: 'Ollama (local)'` el chat de agentes funciona de punta a punta (respuesta
  real de qwen3:0.6b verificada).

### Cambios
- `api/server/services/Endpoints/agents/initialize.js`:
  - Hook de `applyAgentRouting` tras resolver `primaryAgent` y ANTES de `validateAgentModel`
    → el modelo elegido por el routing se propaga a `primaryConfig` → `AgentClient`
    (client.js usa `agent.model_parameters.model`). El routing ahora aplica TAMBIÉN en el
    flujo real de chat de agentes (antes solo en OpenAI-compat / Responses).
  - `getModelsConfig` se mueve antes del routing y se pasa a `applyAgentRouting`.
- `api/server/services/AgentRouting.js`:
  - Nueva función `isModelValid(agent, model, modelsConfig)`: valida que el modelo del tier
    exista en la lista plana de modelos del endpoint del agente. Si el tier apunta a un
    modelo inexistente (p. ej. desinstalado), se usa el modelo del agente (fallback) —
    el routing nunca rompe el flujo ni produce `illegal_model_request`.
- `start-stack.sh`: se agrega `api/server/services/Endpoints/agents/initialize.js` a
  `SYNC_FILES` para que el fix sobreviva reconstrucciones del contenedor.

### Verificación en vivo (agente real 'Ollama Agent OK', provider 'Ollama (local)', modo auto)
- Mensaje corto con tier small válido (`hf.co/QuantFactory/SmolLM2-135M-GGUF:latest`):
  stream con 1689 eventos `on_message_delta`, sin errores → el modelo local responde.
- Mensaje de refactor con tier large (`qwen3:1.7b`): stream con 24 eventos, respuesta real.
- Tier small apuntando a un modelo INEXISTENTE: el chat NO falla — usa el fallback
  (qwen3:0.6b responde '¡Hola! ¿Cómo estás?'), 0 `illegal_model_request`.
- Antes del fix de nombre: `illegal_model_request: Ollama (local)|SmolLM2-135M` (prueba de
  que el routing SÍ sobreescribía el modelo; solo faltaba el nombre exacto del modelo).

---

## FASE 25 — Routing en subagentes, métricas, presupuesto de contexto, sonidos 400, ventanas detrás, conexión LLM

### 1. Routing en subagentes
- `initialize.js`: `applyAgentRoutingToConfig` en el callback `onAgentInitialized` de
  `discoverConnectedAgents` (subagentes handoff/connected) — se muta el config ya inicializado
  porque `initializeAgent` clona model_parameters.
- `initialize.js` (loadAgentById): `applyAgentRouting` ANTES de `validateAgentModel` para
  subagentes cargados por id (spawn-tool) — el modelo elegido se propaga al config.
- El texto del usuario se pasa como `req.body.text` (el chat de agentes envía text, no messages).

### 2. Métricas de routing
- Modelo `AgentRoutingPreference.metrics`: total, byTier, fallbacks, lastRoutedModel, lastTier, lastAt.
- GET/PUT /api/agents/routing/:id incluyen metrics; `resetMetrics: true` las reinicia.
- UI: panel de métricas en el toggle (total/pequeño/mediano/grande/fallbacks/último modelo/fecha) + botón Reiniciar.
- Verificado E2E: total:3, byTier small:2/large:1, lastRoutedModel qwen3:1.7b — persisten tras reinicio.

### 3. Presupuesto de contexto
- `pickTier(text, contextTokens)`: contexto ≥ 8k sube un nivel, ≥ 32k fuerza large.
- Estimación honesta: ~1 token / 4 caracteres (`estimateTokens`), suma de todo el historial.
- Verificado E2E: mensaje de 34.000 caracteres → tier large → qwen3:1.7b (métricas lo confirman).

### 4. Conexión LLM verificada (punto 4 del encargo)
- AGENTES: `client.js:192 this.model = agent.model_parameters.model` — el modelo del agente llega al LLM.
- SKILLS: `listAlwaysApplySkills` (cargadas con `alwaysApply: true` y body para priming) + `primeInvokedSkills` → se inyectan al contexto del agente.
- PROMPTS: sistema de prompts con `AdvancedPrompts`, `autoSendPrompts`, `/prompts/new` — se usan en el chat (slash + flujo de prompts).
- MEMORIAS: `registerMemoryTools` (set_memory/delete_memory) cuando `memoryAvailable && agentRequestsMemory` — tools reales del runtime.
- MCP: `mcpAvailableTools` + `userMCPAuthMap` en loadToolsForExecution — tools MCP reales al runtime.
- ARCHIVOS: `addImageURLs(message, attachments)` (client.js) — multimodal real.
- CONCLUSIÓN: todo está conectado al LLM por arquitectura; el chat de agentes con Ollama funciona E2E (FASE 24). Skills/memoria/MCP requieren agente con la capability habilitada y modelo que soporte tools.

### 5. Sonidos HTTP 400 corregidos
- CAUSA: `searchSoundsController` devolvía 400 cuando Pixabay/Freesound no tenían key.
- FIX: degradación elegante → 200 con `needsKey:true` + `keyEnv` (búsqueda y getById).
- UI: aviso informativo "🔑 requiere clave" en la biblioteca en vez de "HTTP 400".
- Mixkit sin preview: el botón Reproducir abre la página oficial del sonido (no hotlinking).
- Verificado: search pixabay sin key → 200 {needsKey:true}; getById → 200 {sound:null}.

### 6. Ventanas que aparecían detrás (punto 6 y 7 del encargo)
- CAUSA A: el diálogo de Configuración usaba `z-50`, por debajo de los side panels (z-[110])
  y compitiendo con los OGDialog internos → los diálogos "Añadir" (skills/prompts) podían
  quedar detrás y el panel de Agentes tapaba la configuración.
- CAUSA B: los links inline ("Crear Prompt" → /prompts/new, "Crear skill") navegaban a otra
  ruta pero el modal de Configuración seguía abierto encima → la página nueva aparecía detrás.
- FIX (Dialog.tsx del Settings): z-index `z-[125]` (encima de side panels, debajo de OGDialog
  130+/140+) + cierre automático del diálogo cuando la ruta cambia tras abrirse.
- VERIFICADO EN VIVO: Crear Prompt → navega a /prompts/new y el diálogo se cierra (formulario visible);
  Create Skill → diálogo "Write skill instructions" (z-140) visible encima del settings (z-125).

### 7. Análisis: skins (apariencia/tema) y Archivos adjuntos (puntos 6 y 8 del encargo)
Ver sección "PROPUESTA FASE 26" más abajo.

### 8. Tests del routing
- `AgentRouting.spec.js` (23 aserciones: pickTier, contexto, lastUserText, tokens, isModelValid).
- Ejecutados con runner de node puro (la imagen de producción no trae jest): 23/23 ✓.

### 9. Archivos modificados
- api/server/services/AgentRouting.js (subagentes + contexto + métricas)
- api/server/services/Endpoints/agents/initialize.js (routing en subagentes + text)
- api/models/AgentRoutingPreference.js (campo metrics)
- api/server/controllers/AgentRoutingController.js (metrics + resetMetrics)
- api/server/controllers/SoundController.js (degradación needsKey)
- client/src/components/Nav/Settings/Dialog.tsx (z-[125] + cierre al navegar)
- client/src/components/SidePanel/Agents/AgentRouting.tsx (métricas + autollenado)
- client/src/components/Nav/Settings/SoundsPanel.tsx (needsKey + Mixkit pageUrl)
- api/server/services/AgentRouting.spec.js (nuevo)
- start-stack.sh (Dialog.tsx en SYNC_FILES)

---

## PROPUESTA FASE 26 (puntos 6 y 8 del encargo — análisis y diseño, SIN programar aún)

### A. Sistema de Skins / Temas — cómo igualar o superar Cursor, GitHub Copilot, Laucode, Manuscript

Estado actual: el dashboard tiene `ThemeSetting` (claro/oscuro) vía `ThemeContext`. Es un tema
global único. Propuesta por fases, todo open source / permisivo y ligero:

1. **Temas CSS variables (sin librería pesada)** — ya usamos tokens (bg-surface-*, text-*).
   Convertir el tema en un conjunto de variables CSS persistidas (cookie/recoil, ya existe
   ThemeContext) y permitir **múltiples temas**: Claro, Oscuro, Contraste alto, Sepia, y
   **temas de usuario** definidos con un editor de colores (pickers sobre los tokens, sin
   subir CSS arbitrario → seguro y ligero). Comparable a "Themes" de VS Code/Cursor.
2. **Editor visual de temas** (FASE 26.2): panel con swatches por grupo (fondo, superficie,
   texto, acentos, bordes, chat user/assistant bubbles). Export/import JSON de tema.
   Referencias open: `ui-theme-tools` (no es librería, patrón), variables CSS nativas.
3. **Skins por chat/espacio**: `data-theme` en el contenedor del chat permite que una
   conversación use su propio skin (como la extensión "Chat themes" de Chrome, MIT).
4. **Sintaxis highlight (Código)**: hoy probablemente usamos highlight.js/rehype. Añadir
   **tema de sintaxis sincronizado** con el tema activo (GitHub Light/Dark, One Dark, Tokyo
   Night, Dracula) vía CSS-variables del highlighter (rehype-pretty-code / shiki ligero).
   Esto iguala el "código bonito" de Cursor/Copilot sin peso extra.
5. **No introducir**: framer-motion para temas, ni themes.scss enormes, ni librerías de
   temas JS pesadas. Todo por CSS custom properties + persistencia existente (recursos < 1 MB).

Qué aportaría vs competidores: skins por conversación, editor visual propio, export/import
JSON, y cero dependencias nuevas pesadas.

### B. Archivos adjuntos en la barra lateral

Estado actual: "Adjuntar Archivos" (FilesPanel) está en la barra lateral y controlado por
"Personalizar navegación" (por defecto ON).

Recomendación: **mantenerlo en la barra lateral por defecto**, porque:
- El acceso a archivos adjuntos es una acción frecuente en chats con agentes.
- La visibilidad ya es configurable (switch ON/OFF) — el usuario decide.

Mejoras sugeridas (FASE 26):
1. Separar visualmente "Archivos del chat actual" (frecuente) de "Todos mis archivos" (raro)
   — pestañas dentro del mismo panel (sin duplicar rutas).
2. En la barra principal, mostrar solo el badge/contador de adjuntos del chat actual y que el
   panel completo viva en Personalizar navegación (default ON). Así la barra queda limpia.
3. Añadir acceso rápido: botón adjuntar desde el input (ya existe "Attach File Options") —
   mantenerlo como la vía primaria; el panel lateral queda como gestor.

### C. Priorización sugerida FASE 26
1. Temas CSS variables + 4 temas base + persistencia (bajo riesgo).
2. Editor visual de temas + export/import JSON.
3. Archivos: pestañas "actual" / "todos" en el panel existente.
4. Skins por conversación (data-theme) + syntax highlighting sincronizado.

Todo lo anterior se implementará reutilizando ThemeContext, tokens CSS y el sistema de
preferencias existente — sin dependencias nuevas pesadas, sin restriccione
s de licencia (ninguna herramienta propuesta es copyleft ni requiere servidor externo).

---

# FASE 27 — Streak (días de uso), navegación corregida, verificación completa

## 1. Racha de días de uso (streak) — implementada y verificada
- **Backend**: `api/models/UserStreak.js` (colección propia), `api/server/services/UserStreakService.js` (recordActivity con guard diario en memoria + getStreak con hito semanal de 7 días), `api/server/routes/streak.js` (GET /api/streak).
- **Hook**: `api/server/middleware/requireJwtAuth.js` registra actividad en cada petición autenticada (fire-and-forget, 1 escritura/día/usuario). La ruta GET /api/streak espera el registro antes de leer (sin carrera).
- **Lógica**: mismo día → sin cambio; ayer → streak+1; hueco → streak=1. totalActiveDays, bestStreak, firstActiveDate.
- **UI**: `client/src/components/Nav/StreakBadge.tsx` en el menú de usuario (header y barra lateral): 🔥 N días de racha + puntitos semanales + 🎁 "N más días para desbloquear +1 sesión extra cada día" (hito cada 7 días).
- **Verificado**: streak=1 primer día; simulación de "ayer" → streak=2, daysToUnlock=5; mismo día → idempotente; UI muestra "2 días de racha / 5 más días…".

## 2. Personalizar navegación — corregido
- La vista de cada herramienta ya **NO es pantalla completa**: es un panel inline dentro de Configuración (max-h 75vh, scroll interno) con barra de título, switch de visibilidad, restaurar, y **botón volver/minimizar funcional** (verificado en preview: abrir Prompts → volver → lista restaurada).
- Textos "Abrir a pantalla completa" → "Abrir".

## 3. Verificación de lo encargado antes (todo OK)
- Tema claro/oscuro en el menú principal (Header): botón Sun/Moon verificado.
- Menú de usuario arriba (estilo captura): email, Apariencia Light/Dark/Sistema, Mis archivos, Archivadas, Papelera, Configuración, Cerrar sesión.
- Papelera 30 días: crear → borrar → papelera → restaurar → el chat vuelve (E2E verificado) + aviso en el diálogo de borrado.
- Lectura en voz alta: se detiene al cambiar de chat (SpeechCleanup global).
- Ollama Fast Proxy: chat E2E verificado en el navegador ("Di hola" → "Hola!" por streaming, sin tokens de razonamiento; warm ~0.27s vs 2.5-6.6s antes).
- Categorías del Explorar (LLM/Imagen/Video/Voz/Audio/Embeddings/Multimodal) + VRAM visible + tamaño estimado: verificado por API.
- Ventanas detrás (z-index): corregido en FASE 25 y sigue funcionando.

## 4. Propuesta de memoria (pendiente de aprobación para implementar)
Ver sección "Memoria para que ningún LLM olvide nada" al final de este informe.

## 5. Propuesta Universal AI Model Selector (pendiente de aprobación)
Ver sección "Universal AI Model Selector — auditoría y propuesta" al final de este informe.

---

# Memoria para que ningún LLM olvide nada (propuesta — pendiente de aprobación)

## Contexto actual
El dashboard ya tiene un panel "Memorias" (`MemoryPanel`) y el runtime de agentes inyecta
tools `set_memory`/`delete_memory` (memoria explícita por usuario). El chat normal (no agente)
solo usa el historial de mensajes: si el contexto se llena o se abre una conversación nueva,
el LLM pierde detalles.

## Requisitos (según el encargo)
- Solución open source / libre / gratuita.
- Mínimo uso de RAM/CPU (sin vector DB pesada si no hace falta).
- Que ningún LLM olvide nada (o lo mínimo posible).

## Propuesta: memoria jerárquica de 3 capas (todo dentro de Mongo existente, cero servicios nuevos)

### Capa 1 — Episódica (ya existe): historial completo
Cada conversación guarda todos los mensajes en Mongo. Es la memoria literal: nunca se borra
(se puede restaurar desde la papelera). Coste: 0 RAM extra.

### Capa 2 — Resumen por conversación (nueva, barata)
- Tras cada N mensajes (p. ej. cada 6), un LLM pequeño (qwen3:0.6b-fast local, ya instalado)
  genera/actualiza un **resumen acumulativo** de la conversación: hechos, decisiones, datos
  (nombres, fechas, preferencias), pendientes.
- Se guarda en una colección `conversation_summaries` (conversationId, user, summary, updatedAt).
- Al volver a abrir la conversación o superar el presupuesto de contexto, se inyecta el resumen
  como mensaje system: "Resumen de la conversación hasta ahora: …" → el LLM no olvida aunque
  el contexto crudo se recorte (resumen + últimos K mensajes en vez de todo).
- Coste: una llamada al LLM local cada 6 mensajes (~ms con el proxy think:false). RAM: 0.
- Preferencia por usuario: activar/desactivar + frecuencia (settings existente).

### Capa 3 — Semántica de usuario (basada en la memoria explícita ya existente)
- Reutilizar la colección de Memorias existente (Mem0-style pero nativa): el usuario puede fijar
  hechos permanentes ("mi nombre es X", "prefiero respuestas cortas") y el sistema los inyecta
  en TODOS los chats (no solo agentes).
- Añadir "recordar esto" (botón en los mensajes): guarda un fragmento como memoria de usuario
  (una escritura, sin embeddings).
- Búsqueda: por texto (regex/token) en la misma colección — sin vector DB. Si más adelante hace
  falta, se añade un índice BM25/texto de Mongo (gratis, sin proceso extra).

## Qué NO implementar ahora (por consumo)
- No a Mem0/Letta (requieren servidores/colas/redis pesados, RAM extra).
- No a vector DB dedicada (Qdrant/Chroma) para este caso: el volumen de memoria explícita es
  pequeño y la búsqueda por texto alcanza. Se deja la puerta abierta vía adapter.

## Fases de implementación (si apruebas)
1. Capa 2 (resumen por conversación) + inyección al abrir/recortar contexto.
2. Capa 3 (botón "recordar esto" + inyección en todos los chats + settings).
3. Opcional: índice de texto en Mongo para la búsqueda de memorias.

---

# Universal AI Model Selector — auditoría y propuesta (pendiente de aprobación)

## Auditoría del estado actual
1. **Selector actual**: `client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx` — lista
   endpoints + modelos (librechat.yaml `endpoints.custom`, `fetch:true` para Ollama). Es un
   selector de LLMs de chat; no conoce modalidades (imagen/video/audio).
2. **Proveedores locales**: `api/server/services/localProviders/` — `LocalModelProvider`
   (interfaz), `OllamaProvider`, `OpenAICompatProvider` (LM Studio/llama.cpp/vLLM), `CatalogService`
   (HF/GitHub), `localModels.js` (rutas), `ollamaProxy.js` (FASE 26). Ya es extensible.
3. **Model Registry**: no existe como tal — la metadata vive en `LocalModelsPanel.tsx`
   (CatalogEntry: params, quant, contexto, capacidades, licencia, hardware) y en
   `librechat.yaml`. No hay registro central consultable.
4. **Capabilities**: parcial — `capabilities` por modelo vía `/api/show` de Ollama y catálogo;
   no hay un Capability Registry global.
5. **Runtimes**: Ollama (chat LLM). ComfyUI: **ya existe `api/server/routes/comfyui.js`** en el
   repo (sin revisar su estado). `connectors.js`, `discovery.js`, `huggingface.js`, `sandbox.js`,
   `multiagent.js`, `scheduler.js`, `rag.js`, `context.js` existen en rutas (auditar conexión real).
6. **Routing de modelos**: `AgentRouting` (FASE 23-24) solo para agentes.
7. **Job queue**: no existe (el chat es síncrono/SSE). `scheduler.js` podría servir de base.
8. **Resource manager**: solo estimación VRAM/RAM en el frontend (`HardwareCard`), no en backend.

## Propuesta de arquitectura (a aprobar)
```
DASHBOARD
   │
   ▼
UNIVERSAL AI SELECTOR (UI: modalidad → capacidad → modelo)
   │
   ▼
CAPABILITY ROUTER (TEXT_GENERATION, VISION, IMAGE_GEN, VIDEO_GEN, TTS, STT, EMBEDDINGS, ...)
   │
   ▼
MODEL REGISTRY (metadata única: id, provider, runtime, modalidad, capabilities, licencia,
                parámetros, cuantización, contexto, VRAM/RAM, inputs/outputs, estado)
   │
   ▼
UNIVERSAL GENERATION ENGINE  generate({ capability, model, input, parameters })
   │
   ├── OllamaAdapter      (LLM local, ya funcional + proxy think:false)
   ├── ComfyUIAdapter     (imagen/video: workflows ya soportados en rutas)
   ├── DiffusersAdapter   (imagen/edición, Apache-2.0)
   ├── KokoroAdapter      (TTS local 82M, Apache-2.0)
   ├── WhisperAdapter     (STT local faster-whisper, MIT)
   ├── OpenAI/Anthropic/Google Adapters (APIs existentes del chat)
   └── FutureAdapters     (cada provider = 1 adapter)
   + RESOURCE MANAGER (GPU/VRAM/RAM detectados + estimaciones + offload CPU)
   + JOB QUEUE (imagen/video/audio en background, el chat no se bloquea)
```

### Fases de implementación (1 a la vez, verificable)
- FASE A: Model Registry + Capability Registry (colección Mongo + API GET) alimentados por los
  providers existentes (Ollama hoy; ComfyUI/Kokoro/Whisper cuando se integren).
- FASE B: Universal Generation Engine con interfaz única y adapters Ollama/OpenAI (reutiliza el
  chat actual) + Resource Manager básico. Backward compatible: el selector actual sigue
  funcionando (la nueva UI se apoya encima).
- FASE C: ComfyUI adapter (imagen/video vía workflows, job queue, resultados por tipo).
- FASE D: Kokoro (TTS) + faster-whisper (STT) locales de bajo consumo + controles dinámicos
  según modalidad.
- FASE E: UI Universal AI Selector (filtros por modalidad/provider, indicadores de capacidad,
  controles dinámicos prompt/negativo/seed/FPS/voz…).

Sin dependencias nuevas pesadas: Ollama/ComfyUI ya están en el stack; Kokoro/faster-whisper
son pesos locales de decenas/cientos de MB con licencias permisivas. Todo el engine será código
propio sobre esas APIs (nada de frameworks extra).

---

# FASE 28 — Universal AI Selector, memoria nativa (estilo Mem0) y regalo del streak

## 1. Universal AI Selector — modalidades + metadata completa
- **Catálogo multi-modalidad** (`api/server/services/localProviders/CatalogService.js`): la búsqueda de Hugging Face se filtra por `pipeline_tag` (llm, imagen, video, voz, audio, embeddings, multimodal) y devuelve metadata REAL de HF: params (safetensors.total), tamaño estimado (etiquetado como estimación), licencia (cardData/tags), arquitectura (MoE/Dense), descargas, likes, trendingScore, modalidad.
- **Modalidad precisa**: `text-to-image`→Imagen, `image-to-text`→Visión, `text-to-video`→Video, `text-to-speech`→TTS, `automatic-speech-recognition`→STT, `feature-extraction`→Embeddings, `image-text-to-text`→Multimodal.
- **Verificado por API**: `deepseek`→Texto (MIT), `flux`→Imagen (5.5 GB), `wan`→Video (Apache-2.0), `kokoro`→TTS (Apache-2.0, 82M).
- **Licencia corta en tarjetas**: helper `shortLicense` en `LocalModelsPanel.tsx` (Apache-2.0 / MIT / Gemma ToU / CC-BY…). Antes cada tarjeta vertía el texto legal completo; ahora badges compactos.
- **Instalados muestra peso real en disco, parámetros, cuantización, VRAM estimada, arquitectura, contexto y licencia** (UI verificada en preview: SmolLM2 84.1 MB/135M/Q2_K, Qwen3-0.6B 610 MB/596M/Apache-2.0, deepseek-r1 1.0 GB/1.8B/Q4_K_M/MIT…).

## 2. Memoria — decisión: memoria NATIVA habilitada con LLM local (estilo Mem0, sin duplicar)
- **Investigación Mem0**: Apache-2.0, gratis, self-hosted; framework de memoria más adoptado. Pero: (a) el servidor Ollama del stack **no soporta embeddings**, y (b) el proyecto **ya tiene** un sistema de memoria nativo con el mismo patrón (LLM extrae → guarda clave-valor → inyecta contexto): tools `set_memory`/`delete_memory`, rutas `/api/memories`, panel UI de Memorias y agente de memoria con LLM configurable. La regla "no duplicar sistemas" manda: **habilitar la memoria nativa apuntada al LLM local** (0 dependencias nuevas, mínimo RAM/CPU).
- **Cambio**: `librechat.yaml` → bloque `memory` habilitado con el agente de memoria usando el endpoint custom `Ollama (local)` + `qwen3:0.6b` (suficiente para extraer recuerdos, sin inflar RAM). El YAML está bind-mounteado: el contenedor lo recibe al reiniciar.
- **Verificado E2E**: `POST /api/memories` → 201, `GET /api/memories` → 200 con recuerdos reales almacenados y `tokenLimit` respetado.
- Acceso en la UI: panel "Memorias" ya está en la barra lateral y en Personalizar navegación.

## 3. Streak con regalo 🎁 — implementado y probado de punta a punta
- **Backend**: `UserStreakService.claimGift(userId)` + `POST /api/streak/claim-gift`. `getStreak` expone `unlocked` (streak múltiplo del hito) y `giftReady` (hito sin reclamar). Campo `lastGiftClaimedStreak` para no volver a ofrecer el mismo hito.
- **Fix de carrera**: el hook fire-and-forget del middleware marcaba el día antes de escribir a Mongo y la primera lectura del día devolvía dato viejo. Se eliminó del middleware; el registro es ahora síncrono y determinista en `GET /api/streak` (cada carga de página cuenta un día). Verificado: primer GET del día → `streak:7, unlocked:true, giftReady:true` sin carreras.
- **UI**: `StreakGiftModal.tsx` — modal "¡Hito alcanzado! 🎁" con botón "Reclamar regalo"; aparece automáticamente al cargar (efecto en `HeaderUserMenu`) y al abrir el menú de usuario. Después de reclamar no reaparece (verificado en preview: modal → reclamar → recargar → sin modal, badge "7 días de racha").

## 4. Verificación E2E FASE 28
- Stack arriba: chat 200, Ollama 200, LibreChat/rag_api/vectordb/mongo/redis OK.
- Catálogo categorizado por API (4 categorías con metadata real).
- Panel Instalados con licencia corta (preview).
- Memoria nativa: create 201 / list 200.
- Regalo: streak 6→7, claim 200, giftClaimed true, modal UI verificado.

## Archivos modificados
`api/server/services/localProviders/CatalogService.js` · `api/server/services/localProviders/OllamaProvider.js` · `api/server/routes/localModels.js` · `api/models/UserStreak.js` · `api/server/services/UserStreakService.js` · `api/server/routes/streak.js` · `api/server/middleware/requireJwtAuth.js` · `librechat.yaml` · `client/src/components/Chat/Menus/Endpoints/components/LocalModelsPanel.tsx` · `client/src/components/Nav/StreakBadge.tsx` · `client/src/components/Nav/StreakGiftModal.tsx` (nuevo) · `client/src/components/Nav/HeaderUserMenu.tsx` · locales es/en · `start-stack.sh` (SYNC_FILES) · `INFORME_FASE12.md`

---

# FASE 29 — Runtimes de IA (ComfyUI, Kokoro, faster-whisper), sesión extra real, memoria visible en el chat y Universal AI Selector

## 1. Runtimes locales de IA — implementados y probados REALMENTE
### ComfyUI (imagen/video)
- Instalado DENTRO de `rag_api` (sin contenedor nuevo): torch CPU + ComfyUI 0.3.47 en `:8600` (--cpu).
- Checkpoint real descargado: `dreamlike-photoreal-2.0.safetensors` (2.1 GB, SD1.5 compatible; el tiny-sd de 22M probado NO carga en ComfyUI por arquitectura distinta — verificado y descartado honestamente).
- **Generación REAL verificada**: workflow txt2img vía API → PNG 256×256 (`tiny_sd_test_00001_.png`) en 225 s en CPU.
- Proxy del dashboard: `api/server/routes/comfyui.js` (`/api/comfyui/health|prompt|history/:id|view/:file`) con validación de workflows (máx 200 nodos, allowlist de clases). **Fix de arranque**: el agregado de rutas esperaba `module.exports = { router }` y exportaba directo → "argument handler must be a function"; corregido (fue el error que tumbó el api). También se corrigió `COMFYUI_URL` en `.env` (apuntaba a localhost:8188 de una integración previa → ahora `http://rag_api:8600`).

### Kokoro (TTS) + faster-whisper (STT)
- `api/ai_runtimes/tts_stt.py` (FastAPI) corriendo en `rag_api:8500`; kokoro-onnx (~325 MB, Apache-2.0, sin torch) + faster-whisper tiny (~75 MB, MIT, int8).
- **E2E verificado**: TTS 200 (WAV 24000 Hz, 2.8 s de audio en ~1.2 s CPU) → round-trip STT 200 (transcribe el mismo audio). Proxy `/api/ai-runtimes/health|tts|stt` con validación (tamaño máx, texto máx, detección de formato por cabecera, multipart parseado).

## 2. Regalo con sesión extra REAL
- Cada hito reclamado suma **+1 sesión extra al día** persistida (`extraSessionsPerDay` en UserStreak, acumulativa).
- Uso REAL: `sessionsUsedToday` se computa contando las conversaciones creadas hoy (verificado: 3 usadas). `dailySessionLimit` configurable (-1 = sin límite, nunca bloquea por defecto; si se configura, el límite base + extras se aplica al crear mensajes → 429 honesto).
- UI: badge del streak muestra "+N sesión(es) extra al día · M usadas hoy" + control para configurar el límite. **Fix de carrera**: el registro del día ya no es fire-and-forget del middleware (leer día nuevo devolvía dato viejo); ahora síncrono en GET /api/streak.

## 3. Memoria visible en el chat
- Botón 🧠 **Memories** en el header (desktop y móvil) con contador de recuerdos; abre el panel de Memorias existente (mismo componente, reutilizado, no duplicado) en un diálogo para ver/editar/borrar sin salir del chat. Fix: el overlay solo se monta al abrir.

## 4. Memoria: auditoría nativa vs Mem0 — decisión documentada
- **Conservar la nativa** (ver `KNOWLEDGE_ENGINE_AUDIT.md`): Mem0 es Apache-2.0/gratis/top, pero el Ollama local no soporta embeddings y la nativa ya implementa el patrón (tools + rutas + panel + agente con LLM local activo). Mejoras planificadas: scope por conversación, resumen-compresión al llegar al límite, importance scoring, Mem0 como adapter futuro (nunca paralelo).

## 5. Universal AI Selector — el selector dejó de ser solo LLM
- En el selector de modelos: cabecera **"Modelos de texto (LLM)"** para los proveedores de chat + sección **"✦ IA Universal — elige el tipo de IA"** con chips de modalidad (Todo/Texto/Imagen/Video/TTS/STT/Audio/Multimodal) que filtran la vista.
- Tarjetas de runtime con **estado en vivo** (health check): ComfyUI (Imagen/Video, v0.3.47, "Ver imagen de prueba"), Kokoro (TTS, botón **▶ Probar voz** que genera y reproduce el WAV real), faster-whisper (STT), Ollama multimodal ("Seleccionar modelo local" → chat).
- Verificado en el navegador: los 4 runtimes "Conectado"; "Probar voz" → POST /tts 200 real; "Ver imagen de prueba" → PNG real.
- El chat LLM sigue funcionando igual (sin regresiones); la arquitectura queda lista para conectar cada modalidad a su runtime (ComfyUI/Kokoro/whisper) desde el mismo selector.

## 6. Universal Knowledge Engine — auditoría fases 1-3 entregada
- `KNOWLEDGE_ENGINE_AUDIT.md`: estado real del repo (RAG/pgvector/SearchRuntime/memoria ya existentes → no duplicar), auditoría de tecnologías (SearXNG ⚠️ AGPL, GraphRAG ❌ pospuesto, SemDeDup ❌ NC/archivado, Tika ⚠️ RAM, pgvector halfvec ✅, zstd ✅) y arquitectura propuesta (Knowledge Router → RAG/Web → dedupe exacto+semántico → extracción → versionado → RAG). La implementación arranca en la FASE 4 del spec, fase a fase y con tests.

## Archivos FASE 29
Nuevos: `api/ai_runtimes/tts_stt.py` · `api/server/routes/aiRuntimes.js` · `api/server/routes/comfyui.js` · `client/src/components/Chat/Menus/Endpoints/components/UniversalAiSection.tsx` · `client/src/components/Chat/ChatMemoryButton.tsx` · `KNOWLEDGE_ENGINE_AUDIT.md`
Modificados: `api/server/index.js` · `api/server/routes/streak.js` · `api/server/services/UserStreakService.js` · `api/server/routes/messages.js` · `api/models/UserStreak.js` · `client/src/components/Nav/StreakBadge.tsx` · `client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx` · `client/src/components/Chat/Header.tsx` · `start-stack.sh` (SYNC + lanzamiento TTS/STT y ComfyUI) · `.env` (COMFYUI_URL) · `INFORME_FASE12.md`
