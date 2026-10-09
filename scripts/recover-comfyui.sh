#!/usr/bin/env bash
# ==============================================================================
# recover-comfyui.sh — Recupera el servidor ComfyUI dentro del contenedor
# rag_api (puerto 8600, modo CPU).
# ------------------------------------------------------------------------------
# Por qué existe:
#   ComfyUI (fuente en /app/ComfyUI-0.3.47) viene en la imagen de rag_api, pero
#   sus dependencias Python (torch/torchvision CPU) y el checkpoint viven en el
#   filesystem del contenedor y se PIERDEN si rag_api se recrea. Este script:
#     1. pip install torch torchvision (CPU) si faltan
#     2. descarga el checkpoint sd-v1-5-tiny (~2 GB) si falta
#     3. mata procesos stale y lanza un servidor limpio en :8600
#     4. verifica /system_stats
#
# Uso:
#   ./scripts/recover-comfyui.sh
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=rag_api
COMFY_DIR=/app/ComfyUI-0.3.47
CKPT="sd-v1-5-tiny.safetensors"
CKPT_URL="https://huggingface.co/ehristoforu/stable-diffusion-v1-5-tiny/resolve/main/${CKPT}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[FATAL] ${CONTAINER} no está corriendo"
  exit 1
fi

if MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
  'python -c "import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8600/system_stats\", timeout=4)" >/dev/null 2>&1'; then
  echo "[OK] ComfyUI ya activo en :8600"
  exit 0
fi

echo "==> 1/4 Verificando torch/torchvision (CPU)..."
if ! MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
  'python -c "import torch, torchvision" >/dev/null 2>&1'; then
  echo "    ...instalando (descarga grande, puede tardar)..."
  MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
    'pip install --no-input torch torchvision --index-url https://download.pytorch.org/whl/cpu > /tmp/pip_torch.log 2>&1'
  echo "    [OK] torch/torchvision instalados"
else
  echo "    [OK] ya presentes"
fi

echo "==> 2/4 Verificando checkpoint (${CKPT}, ~2 GB)..."
if ! MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c "test -f ${COMFY_DIR}/models/checkpoints/${CKPT}"; then
  echo "    ...descargando (puede tardar)..."
  MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c "
    python - <<PYEOF > /tmp/dl_ckpt.log 2>&1
import urllib.request, os
url = '${CKPT_URL}'
dest = '${COMFY_DIR}/models/checkpoints/${CKPT}'
os.makedirs(os.path.dirname(dest), exist_ok=True)
if os.path.exists(dest) and os.path.getsize(dest) > 100_000_000:
    print('SKIP ya existe')
else:
    tmp = dest + '.part'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=900) as r, open(tmp, 'wb') as f:
        while True:
            c = r.read(1 << 20)
            if not c:
                break
            f.write(c)
    os.rename(tmp, dest)
    print('OK', os.path.getsize(dest))
PYEOF"
  echo "    [OK] checkpoint listo"
else
  echo "    [OK] ya presente"
fi

echo "==> 3/4 Matando procesos stale y lanzando servidor limpio..."
MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c '
  for p in /proc/[0-9]*; do
    cmd=$(tr "\0" " " < "$p/cmdline" 2>/dev/null || true)
    case "$cmd" in *main.py*--cpu*) kill -9 "${p##*/}" 2>/dev/null || true;; esac
  done
  sleep 2
' || true
MSYS_NO_PATHCONV=1 docker exec -d "${CONTAINER}" sh -c \
  "cd ${COMFY_DIR} && nohup python main.py --cpu --force-fp16 --port 8600 --listen 0.0.0.0 > /tmp/comfy_server.log 2>&1 &"

echo "==> 4/4 Verificando health..."
sleep 25
if MSYS_NO_PATHCONV=1 docker exec "${CONTAINER}" sh -c \
  'python -c "import urllib.request; print(urllib.request.urlopen(\"http://127.0.0.1:8600/system_stats\", timeout=5).read()[:120])"'; then
  echo "[OK] ComfyUI recuperado en :8600"
else
  echo "[WARN] ComfyUI no respondió — revisa: docker logs rag_api / tmp/comfy_server.log"
  exit 1
fi
