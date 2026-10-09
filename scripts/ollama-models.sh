#!/usr/bin/env bash
# =============================================================================
# ollama-models.sh — gestión de modelos en el runtime Ollama del stack.
# -----------------------------------------------------------------------------
# Requiere internet (registry.ollama.ai / huggingface.co). Sin internet, Ollama
# corre pero sin modelos (el dashboard muestra "Ollama conectado, 0 modelos").
#
# Uso:
#   ./scripts/ollama-models.sh            # listar modelos instalados
#   ./scripts/ollama-models.sh --test     # + descargar qwen3:0.6b (pequeño) y probar E2E
#   ./scripts/ollama-models.sh --deepseek # + registrar DeepSeek-V4-Flash DSpark (98 GB)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

OLLAMA="docker exec chat-ollama ollama"

if ! docker ps --format '{{.Names}}' | grep -q chat-ollama; then
  echo "[FATAL] chat-ollama no está corriendo. Levantá el stack: ./start-stack.sh"
  exit 1
fi

echo "=== Modelos instalados en Ollama ==="
$OLLAMA list || true

if [ "${1:-}" = "--test" ] || [ "${1:-}" = "--deepseek" ]; then
  echo ""
  echo "=== Descargando qwen3:0.6b (modelo pequeño de prueba, ~400 MB) ==="
  $OLLAMA pull qwen3:0.6b
  echo "  Listo. Probá en el chat (http://localhost:3080): endpoint 'Ollama (local)',"
  echo "  modelo 'qwen3:0.6b'. O en el dashboard: pestaña 'Modelos Locales' → Actualizar."
fi

if [ "${1:-}" = "--deepseek" ]; then
  echo ""
  echo "=== Registrando DeepSeek-V4-Flash-0731-DSpark (Lucebox, ~98 GB GGUF) ==="
  echo "  Repo: https://huggingface.co/Lucebox/DeepSeek-V4-Flash-0731-DSpark-GGUF"
  echo "  ⚠️  Muy grande (~98 GB) y requiere ~128 GB de RAM unificada."
  echo ""
  echo "  Opción A — pull directo (único .gguf en la raíz del repo):"
  echo "    docker exec chat-ollama ollama pull hf.co/Lucebox/DeepSeek-V4-Flash-0731-DSpark-GGUF"
  echo "  Opción B — Modelfile (confirmá el nombre del .gguf en el repo):"
  echo "    docker cp integrations/ollama/Modelfile.deepseek-v4-flash-dspark chat-ollama:/root/Modelfile.dspark"
  echo "    docker exec chat-ollama ollama create deepseek-v4-flash-dspark -f /root/Modelfile.dspark"
  echo ""
  echo "  Después de descargarlo, el chat lo descubre automáticamente (fetch:true)"
  echo "  y el dashboard con 'Actualizar modelos'."
fi
