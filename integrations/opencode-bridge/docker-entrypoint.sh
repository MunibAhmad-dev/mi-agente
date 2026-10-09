#!/bin/sh
# ------------------------------------------------------------------------------
# Entrypoint de opencode-bridge dentro de Docker (Fase 2).
#
# server.ts (deliberadamente, ver comentario de diseño al inicio de ese
# archivo) solo lee OPENCODE_SERVER_PASSWORD y BRIDGE_API_KEY como variables
# de entorno normales — no tiene soporte para "_FILE". No se tocó server.ts
# para no arriesgar el comportamiento ya verificado con curl real (ver
# README.md, sección "Qué se verificó de verdad"). En su lugar, este script
# resuelve los secretos ANTES de arrancar el proceso Node y los exporta como
# variables de entorno normales dentro del contenedor.
#
# Convención (igual que en mi-opencode/docker-entrypoint.dev.sh): si existe
# <VAR>_FILE apuntando a un archivo, su contenido gana sobre <VAR>. Si no,
# se usa <VAR> tal cual (compatibilidad con Fase 1 / arranque nativo).
# ------------------------------------------------------------------------------
set -eu

resolve_secret() {
  var_name="$1"
  file_var_name="${var_name}_FILE"
  # sh POSIX no tiene indirección de variables nativa cómoda; usamos eval
  # con nombres de variable controlados por nosotros mismos (no por input
  # externo), así que es seguro aquí.
  eval "file_path=\${${file_var_name}:-}"
  if [ -n "$file_path" ] && [ -f "$file_path" ]; then
    eval "${var_name}=\$(cat \"$file_path\")"
    export "${var_name?}"
  fi
}

resolve_secret OPENCODE_SERVER_PASSWORD
resolve_secret BRIDGE_API_KEY

if [ -z "${BRIDGE_API_KEY:-}" ]; then
  echo "[opencode-bridge/docker-entrypoint] ADVERTENCIA: BRIDGE_API_KEY no está definida (ni por archivo ni por variable). El adaptador aceptará requests sin autenticación." >&2
fi

echo "[opencode-bridge/docker-entrypoint] arrancando en puerto ${BRIDGE_PORT:-8787}, backend en ${OPENCODE_BASE_URL:-http://127.0.0.1:4096}"

exec node --experimental-strip-types src/server.ts
