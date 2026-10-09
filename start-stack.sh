#!/usr/bin/env bash
# ==============================================================================
# start-stack.sh — Arranque reproducible de TODO el stack
#   mi-libre-chat (Mongo + Redis + api) + mi-opencode + opencode-bridge
# ------------------------------------------------------------------------------
# Por que existe:
#   - El compose base monta PORT desde la interpolacion del entorno; el shell
#     del agente/terminal puede exportar PORT (ej. 49914) y compose le da
#     precedencia sobre .env -> el api termina en un puerto inesperado.
#     Este script fuerza PORT=3080 SIEMPRE (ronda 33).
#   - El contenedor api pierde /app/librechat.yaml si se recrea sin el override
#     (el compose base no lo monta). Este script usa SIEMPRE
#     docker-compose.yml + docker-compose.override.yml (que monta el yaml,
#     define redis y define mi-opencode + bridge).
#   - Espera healthchecks reales antes de declarar exito.
#   - Ronda 35: check del daemon Docker + Redis/Mongo con comandos reales.
#
# Uso:
#   ./start-stack.sh            # levanta el stack (build solo si falta imagen)
#   ./start-stack.sh --rebuild  # levanta + reconstruye mi-opencode desde src
#   ./start-stack.sh --down     # detiene el stack (mantiene volumenes)
# ==============================================================================
set -euo pipefail

# --- 0) Matar el trap de PORT del entorno -------------------------------------
export PORT=3080

cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.port3090.yml"

# --- 0.5) Check del daemon Docker (ronda 35) ----------------------------------
if ! docker info >/dev/null 2>&1; then
  echo "[FATAL] El daemon de Docker no esta corriendo."
  echo "  -> Windows: abre Docker Desktop (Inicio -> Docker Desktop) y espera"
  echo "     a que el icono este estable (sin animacion)."
  echo "  -> Linux:   sudo systemctl start docker"
  exit 1
fi
echo "==> Daemon Docker OK"

# --- 1) Detener ----------------------------------------------------------------
if [ "${1:-}" = "--down" ]; then
  echo "==> Deteniendo el stack..."
  $COMPOSE down
  exit 0
fi

# --- 2) Validar config ---------------------------------------------------------
echo "==> Validando compose..."
$COMPOSE config --quiet

# --- 3) Build / pull -----------------------------------------------------------
if [ "${1:-}" = "--rebuild" ]; then
  echo "==> Reconstruyendo imagen mi-opencode desde el codigo fuente..."
  $COMPOSE build mi-opencode
fi

# --- 4) Levantar ---------------------------------------------------------------
echo "==> Levantando stack (PORT=$PORT)..."
$COMPOSE up -d

# --- 5) Healthchecks -----------------------------------------------------------
echo "==> Esperando healthchecks..."
wait_http() { # $1=nombre  $2=url  $3=tiempo maximo (s)
  local name="$1" url="$2" max="$3" i=0
  until curl -s -m 3 -o /dev/null "$url" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -ge "$max" ]; then
      echo "    [FAIL] $name no respondio en ${max}s -> $url"
      return 1
    fi
    sleep 1
  done
  echo "    [OK] $name -> $url"
}

wait_http "api librechat"     "http://localhost:3080/api/health" 60 || true
wait_http "mi-opencode"       "http://localhost:4096/session"    60 || true
wait_http "opencode-bridge"   "http://localhost:8787/health"     30 || true
wait_http "admin-panel"       "http://localhost:3000"            30 || true

# --- 5.5) Redis + Mongo con comandos reales (ronda 35) --------------------------
echo "==> Verificando Redis y Mongo..."
if docker exec chat-redis redis-cli PING 2>/dev/null | grep -q PONG; then
  echo "    [OK] redis PING -> PONG"
else
  echo "    [WARN] redis no responde PING (revisar: docker logs chat-redis)"
fi
if docker exec chat-mongodb mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1; then
  echo "    [OK] mongodb ping -> 1"
else
  echo "    [WARN] mongodb no responde ping (revisar: docker logs chat-mongodb)"
fi

# --- 5.6) CORS: recordatorio si se accede desde otro origin (ronda 35) ----------
ORIG=$(grep -E "^ALLOWED_ORIGINS=" .env | head -1 | cut -d= -f2-)
echo "==> ALLOWED_ORIGINS=$ORIG"
echo "    (si pruebas desde otro puerto/origin, agregalo a ALLOWED_ORIGINS en .env y recrea el api)"

# --- 5.7) Sync archivos custom del api (ronda 36) --------------------------------
# El api usa la imagen upstream (registry.librechat.ai/danny-avila/librechat-dev);
# las rutas custom (panel enterprise, tools proxy a mi-opencode, docs, etc.) viven
# en el disco y se copian al contenedor. Sin este paso, un `docker compose up` que
# recree el contenedor pierde tools.js y /api/tools devuelve 404.
echo "==> Sincronizando archivos custom al contenedor api..."
SYNC_FILES=(
  "api/server/index.js"
  "api/server/routes/index.js"
  "api/server/routes/panel.js"
  "api/server/routes/tools.js"
  "api/server/routes/performance.js"
  "api/server/routes/metrics.js"
  "api/server/routes/telemetry.js"
  "api/server/routes/system.js"
  "api/server/routes/enterprise.js"
  "api/server/routes/aiRuntimes.js"
  "api/server/routes/comfyui.js"
  "api/ai_runtimes/tts_stt.py"
  "api/server/services/initializeMCPs.js"
  "api/server/services/DocsService/index.js"
  "api/server/services/Performance/PerformanceMonitor.js"
  "api/server/services/Performance/ResponseCache.js"
  "api/server/services/Performance/QueryOptimizer.js"
  "api/server/services/Performance/BenchmarkTool.js"
  "api/server/services/Performance/CacheService.js"
  "api/server/services/Performance/HealthService.js"
  "api/server/services/Performance/index.js"
  "api/server/services/localProviders/LocalModelProvider.js"
  "api/server/services/localProviders/OllamaProvider.js"
  "api/server/services/localProviders/OpenAICompatProvider.js"
  "api/server/services/localProviders/CatalogService.js"
  "api/server/services/localProviders/catalog.json"
  "api/server/services/localProviders/index.js"
  "api/server/services/localProviders/config.json"
  "api/server/routes/localModels.js"
  "api/server/routes/sounds.js"
  "api/server/routes/vision.js"
  "api/server/routes/rag.js"
  "api/server/services/RAG/RAGService.js"
  "api/server/services/Vision/VisionService.js"
  "api/server/controllers/SoundController.js"
  "api/models/SoundPreferences.js"
  "api/server/services/sounds/local.js"
  "api/server/services/sounds/freesound.js"
  "api/server/services/sounds/pixabay.js"
  "api/server/services/sounds/mixkit.js"
  "api/server/services/sounds/uploads.js"
  "client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx"
  "client/src/components/Chat/Menus/Endpoints/components/OllamaIcon.tsx"
  "client/src/components/Chat/Menus/Endpoints/components/LocalModelsPanel.tsx"
  "client/src/components/Chat/Menus/Endpoints/components/LocalModelsSection.tsx"
  "client/src/components/Chat/Menus/Endpoints/components/UniversalAiSection.tsx"
  # FASE 19 — Personalizar navegación (Settings tab + sidebar visibility)
  "client/src/store/settings.ts"
  "client/src/hooks/Nav/sidebarFeatures.config.ts"
  "client/src/hooks/Nav/useSideNavLinks.ts"
  "client/src/components/Nav/Settings/types.ts"
  "client/src/components/Nav/Settings/registry.tsx"
  "client/src/components/Nav/Settings/Dialog.tsx"
  "client/src/components/Nav/Settings/CustomizeNavigation.tsx"
  "client/src/components/Nav/Settings/SoundsPanel.tsx"
  "client/src/components/Nav/Settings/VisionPanel.tsx"
  "client/src/components/Nav/Settings/KnowledgeEnginePanel.tsx"
  "client/src/components/Nav/Settings/RAGPanel.tsx"
  "client/src/components/UnifiedSidebar/ExpandedPanel.tsx"
  "client/src/hooks/SSE/useSSE.ts"
  "client/src/hooks/useSoundSystem.ts"
  "client/src/services/sound/SoundService.ts"
  "client/src/services/sound/synthesis.ts"
  "client/src/store/sound.ts"
  "client/src/App.jsx"
  "client/src/components/System/SoundSystemGate.jsx"
  "client/src/locales/en/translation.json"
  "client/src/locales/es/translation.json"
  "client/src/components/SidePanel/Agents/AgentRouting.tsx"
  "client/src/components/SidePanel/Agents/AgentPanel.tsx"
  "client/src/components/Prompts/forms/PromptForm.tsx"
  "api/models/AgentRoutingPreference.js"
  "api/server/services/AgentRouting.js"
  "api/server/controllers/AgentRoutingController.js"
  "api/server/routes/agentRouting.js"
  "api/server/controllers/agents/openai.js"
  "api/server/controllers/agents/responses.js"
  "api/server/services/Endpoints/agents/initialize.js"
  # FASE 34 — Motor de búsqueda universal + verificación factual
  "api/server/services/UniversalSearch/UniversalSearchService.js"
  "api/server/routes/universalSearch.js"
  # FASE 31 — web_search para agentes (DuckDuckGo + Bing, sin claves)
  "api/app/clients/tools/structured/DuckDuckGoSearch.js"
  # FASE 39/40 — tool knowledge_engine + ToolService (runtime de agentes)
  "api/app/clients/tools/structured/KnowledgeEngine.js"
  "api/server/services/ToolService.js"
  "api/app/clients/tools/index.js"
  "api/app/clients/tools/util/handleTools.js"
  "api/app/clients/tools/manifest.json"
  "api/server/services/SearchRuntime/SearchRuntime.js"
  # FASE 26 — papelera 30 días, Ollama Fast Proxy, categorías del explorador
  "api/server/routes/convos.js"
  "api/server/routes/ollamaProxy.js"
  "api/server/services/localProviders/CatalogService.js"
  "api/server/routes/localModels.js"
  # FASE 27 — racha de días de uso (streak)
  "api/models/UserStreak.js"
  "api/server/services/UserStreakService.js"
  "api/server/routes/streak.js"
  "api/server/middleware/requireJwtAuth.js"
  "client/src/components/Nav/StreakBadge.tsx"
  "client/src/components/Nav/StreakGiftModal.tsx"
  "client/src/components/Chat/ChatMemoryButton.tsx"
  "client/src/components/Chat/Header.tsx"
  "client/src/components/Chat/Header.tsx"
  "client/src/components/Nav/ThemeToggle.tsx"
  "client/src/components/Nav/HeaderUserMenu.tsx"
  "client/src/components/Nav/AccountSettings.tsx"
  "client/src/components/Nav/FeatureVisibilityMenu.tsx"
  "client/src/components/Nav/SettingsTabs/General/TrashChatsModal.tsx"
  "client/src/components/Conversations/ConvoOptions/DeleteButton.tsx"
  "client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx"
  "client/src/components/System/SpeechCleanup.tsx"
  "client/src/routes/Root.tsx"
)
# Nota: los iconos de endpoints viven en ./images (NO en SYNC_FILES):
# docker-compose.override.yml monta ./images -> /app/client/public/images
# (bind mount), asi que el repo ES el contenido del contenedor en vivo.
SYNC_OK=1
# Directorios custom que no existen en la imagen upstream: se crean antes de
# copiar archivos individuales (docker cp falla si el destino no existe).
MSYS_NO_PATHCONV=1 docker exec LibreChat mkdir -p \
  /app/api/server/services/localProviders >/dev/null 2>&1 || true
for f in "${SYNC_FILES[@]}"; do
  if [ -f "$f" ]; then
    if MSYS_NO_PATHCONV=1 docker cp "$f" "LibreChat:/app/$f" >/dev/null 2>&1; then
      echo "    [OK] $f"
    else
      echo "    [WARN] no se pudo copiar $f"
      SYNC_OK=0
    fi
  else
    echo "    [SKIP] $f no existe en disco"
  fi
done
if [ "$SYNC_OK" = "1" ]; then
  if MSYS_NO_PATHCONV=1 docker exec LibreChat sh -c 'node --check api/server/index.js && node --check api/server/routes/tools.js && echo OK' >/dev/null 2>&1; then
    echo "    [OK] sintaxis validada (index.js, tools.js)"
  else
    echo "    [WARN] la sintaxis de los archivos sincronizados no paso node --check"
  fi
fi

# --- 5.8b) Runtime local TTS/STT (FASE 29 + R41) -------------------------------
# Kokoro (TTS) + faster-whisper (STT) corren dentro del contenedor rag_api en el
# puerto 8500 (sin contenedor nuevo ni torch). Una recreación de rag_api pierde
# el código, los paquetes pip y los modelos (~400 MB); scripts/recover-tts-stt.sh
# lo restaura completo (copia + pip + modelos + server limpio).
echo "==> Verificando runtime TTS/STT en rag_api:8500..."
if bash scripts/recover-tts-stt.sh; then
  echo "    [OK] runtime TTS/STT listo"
else
  echo "    [WARN] la recuperación del runtime TTS/STT falló (revisar: docker logs rag_api)"
fi

# --- 5.8c) ComfyUI local (FASE 29 + R42) --------------------------------------
# ComfyUI corre dentro del contenedor rag_api en el puerto 8600 (--cpu). La
# fuente viene en la imagen, pero las deps (torch/torchvision CPU) y el
# checkpoint (~2 GB) se pierden si rag_api se recrea; recover-comfyui.sh los
# restaura y lanza el servidor.
echo "==> Verificando ComfyUI en rag_api:8600..."
if bash scripts/recover-comfyui.sh; then
  echo "    [OK] ComfyUI listo"
else
  echo "    [WARN] la recuperación de ComfyUI falló (revisar: docker logs rag_api)"
fi

# --- 5.8) Rebuild del cliente (FASE 16: Modelos locales en el selector) --------
# El api sirve el cliente desde /app/client/dist (build). Los fuentes custom del
# selector (icono Ollama + panel de modelos locales) se copiaron en 5.7; aca se
# recompila el bundle con scripts/build-client-inner.sh (devDeps standalone en
# /tmp/clientdeps con strict-ssl=false; librerias compartidas apuntadas a las
# copias de la app para evitar doble React).
echo "==> Reconstruyendo bundle del cliente (vite)..."
if MSYS_NO_PATHCONV=1 docker cp scripts/build-client-inner.sh LibreChat:/tmp/build-client-inner.sh >/dev/null 2>&1 && \
   MSYS_NO_PATHCONV=1 docker exec LibreChat sh /tmp/build-client-inner.sh >/dev/null 2>&1; then
  echo "    [OK] bundle del cliente reconstruido (Modelos locales en el selector)"
else
  echo "    [WARN] el build del cliente fallo — revisa /tmp/client-build.log dentro del contenedor"
fi

# --- 5.9) Reiniciar el api tras sync/rebuild (FASE 18) --------------------------
# Los cambios de backend (rutas/servicios locales) solo toman efecto al
# reiniciar el proceso; el dist del cliente ya quedo servido desde el disco.
echo "==> Reiniciando api para aplicar cambios de backend..."
if docker restart LibreChat >/dev/null 2>&1; then
  echo "    [OK] api reiniciado"
else
  echo "    [WARN] no se pudo reiniciar el api (revisar: docker ps)"
fi
sleep 5
wait_http "api librechat" "http://localhost:3080/api/health" 90 || true

# --- 6) Resumen ----------------------------------------------------------------
echo ""
echo "=== STACK LISTO ==="
echo "  LibreChat UI  : http://localhost:3080   (login: f12@test.local / admin12345)"
echo "  Acceso limpio : http://localhost:3090   (sin service worker ni cache vieja)"
echo "  mi-opencode   : http://localhost:4096   (password: OPENCODE_SERVER_PASSWORD del .env)"
echo "  opencode-bridge: http://localhost:8787"
echo "  Redis         : localhost:6379"
echo "  Mongo         : localhost:27017"
echo ""
echo "  Nota: el catalogo de modelos solo contiene LLM reales (OpenAI, Google, Claude,"
echo "  Groq, Mistral, OpenRouter, LiteLLM). mi-opencode NO aparece en el selector:"
echo "  es el motor del proyecto, no un LLM (ver INFORME_FASE12.md)."
echo "  Para reconstruir mi-opencode desde el codigo: ./start-stack.sh --rebuild"
