#!/usr/bin/env bash
# ==============================================================================
# restore-custom.sh — Reaplica las personalizaciones (api + client) al contenedor
# LibreChat tras una recreación.
# ------------------------------------------------------------------------------
# Por qué existe:
#   El contenedor api se levanta desde la imagen registry (LibreChat original).
#   Nuestras personalizaciones se copian al contenedor en tiempo de ejecución
#   (docker cp) y se PIERDEN si el contenedor se recrea (docker compose up -d
#   con cambios de config, --force-recreate, etc.).
#   Este script restaura el estado personalizado completo:
#     1. api/   -> /app/api    (backend custom: rutas, servicios, tools, proxy)
#     2. client -> /app/client (frontend custom: src, public, sw, scripts)
#     3. Rebuild del bundle del cliente si hace falta (marker "IA Universal")
#     4. Reinicio del api
#
# Uso:
#   ./restore-custom.sh          # restauración rápida (rebuild solo si falta)
#   ./restore-custom.sh --force  # restauración completa (siempre rebuild)
# ==============================================================================
set -euo pipefail

cd "$(dirname "$0")"

CONTAINER=LibreChat
MARKER_DIR=/app/client/dist/assets
MARKER_STRING="IA Universal"   # string que solo existe en nuestro bundle
BUILD_SCRIPT=/tmp/build-client-inner.sh

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[FATAL] El contenedor ${CONTAINER} no está corriendo."
  echo "  -> Levanta primero el stack: ./start-stack.sh"
  exit 1
fi

echo "==> 1/4 Sincronizando api/ -> /app/api ..."
docker cp ./api/. "${CONTAINER}:/app/api/"

echo "==> 2/4 Sincronizando client/ -> /app/client ..."
docker cp ./client/. "${CONTAINER}:/app/client/"
docker cp scripts/build-client-inner.sh "${CONTAINER}:${BUILD_SCRIPT}"

NEED_BUILD=0
if [ "${1:-}" = "--force" ]; then
  NEED_BUILD=1
  echo "==> 3/4 --force: reconstruyendo el bundle del cliente..."
elif ! MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
  "grep -rq '${MARKER_STRING}' ${MARKER_DIR} 2>/dev/null"; then
  NEED_BUILD=1
  echo "==> 3/4 Marker personalizado ausente — reconstruyendo el bundle del cliente..."
else
  echo "==> 3/4 Bundle personalizado ya presente — se omite el rebuild (usa --force para reconstruir)."
fi

if [ "${NEED_BUILD}" = "1" ]; then
  MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c "sh ${BUILD_SCRIPT}"
fi

echo "==> 4/4 Reiniciando el api para cargar el backend y el bundle nuevos..."
docker restart "${CONTAINER}" >/dev/null

echo "OK: restauración completada."
echo "  - Dashboard:  http://localhost:3080"
echo "  - Acceso limpio (sin cache): http://localhost:3090"
