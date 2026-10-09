#!/usr/bin/env bash
# ==============================================================================
# recover-tts-stt.sh — Recupera el runtime TTS/STT (Kokoro + faster-whisper)
# dentro del contenedor rag_api (puerto 8500).
# ------------------------------------------------------------------------------
# Por qué existe:
#   El runtime corre dentro de rag_api como proceso nohup; los modelos (~400 MB)
#   y los paquetes pip (kokoro_onnx, faster-whisper) viven en el filesystem del
#   contenedor, que se PIERDE si rag_api se recrea (docker compose up -d con
#   cambios de config). Este script lo restaura completo:
#     1. copia api/ai_runtimes/tts_stt.py -> /app/tts_stt.py
#     2. pip install kokoro_onnx faster-whisper si faltan
#     3. descarga modelos (kokoro-v1.0.onnx + voices) si faltan
#     4. mata procesos stale y lanza un server limpio en :8500
#     5. verifica /health
#
# Uso:
#   ./scripts/recover-tts-stt.sh
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=rag_api
PY="python -c \"import urllib.request,os,time\""  # reservado (no usado directo)

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[FATAL] ${CONTAINER} no está corriendo"
  exit 1
fi

if MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
  'python -c "import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8500/health\", timeout=3)" >/dev/null 2>&1'; then
  echo "[OK] runtime TTS/STT ya activo (health en :8500)"
  exit 0
fi

echo "==> 1/5 Copiando tts_stt.py..."
MSYS_NO_PATHCONV=1 docker cp api/ai_runtimes/tts_stt.py "${CONTAINER}:/app/tts_stt.py"

echo "==> 2/5 Verificando paquetes pip (kokoro_onnx, faster-whisper)..."
if ! MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
  'python -c "import kokoro_onnx, faster_whisper" >/dev/null 2>&1'; then
  echo "    ...instalando (puede tardar unos minutos)..."
  MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
    'pip install --no-input kokoro_onnx faster-whisper > /tmp/pip_install.log 2>&1'
  echo "    [OK] paquetes instalados"
else
  echo "    [OK] paquetes ya presentes"
fi

echo "==> 3/5 Verificando modelos TTS (~400 MB)..."
if ! MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c 'test -f /app/models/kokoro-v1.0.onnx'; then
  echo "    ...descargando kokoro-v1.0.onnx + voices-v1.0.bin..."
  MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c '
    python - <<PYEOF > /tmp/model_dl.log 2>&1
import urllib.request, os
urls = {
  "/app/models/kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
  "/app/models/voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}
os.makedirs("/app/models", exist_ok=True)
for path, url in urls.items():
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        continue
    urllib.request.urlretrieve(url, path + ".part")
    os.rename(path + ".part", path)
    print("OK", path, os.path.getsize(path))
PYEOF'
  echo "    [OK] modelos descargados"
else
  echo "    [OK] modelos ya presentes"
fi

echo "==> 4/5 Matando procesos stale y lanzando server limpio..."
MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c '
  for p in /proc/[0-9]*; do
    cmd=$(tr "\0" " " < "$p/cmdline" 2>/dev/null || true)
    case "$cmd" in *tts_stt*) kill -9 "${p##*/}" 2>/dev/null || true;; esac
  done
  sleep 2
' || true
MSYS_NO_PATHCONV=1 docker exec -d "${CONTAINER}" sh -c 'cd /app && nohup python tts_stt.py > /tmp/tts_stt.log 2>&1 &'

echo "==> 5/5 Verificando health..."
sleep 10
if MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
  'python -c "import urllib.request; print(urllib.request.urlopen(\"http://127.0.0.1:8500/health\", timeout=4).read()[:120])"'; then
  echo "[OK] runtime TTS/STT recuperado (modelos se cargan en el primer uso)"
else
  echo "[WARN] el runtime no respondió aún — revisa: docker logs rag_api | tail -20"
  exit 1
fi
