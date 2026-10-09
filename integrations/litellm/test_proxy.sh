#!/usr/bin/env bash
# Prueba rápida del proxy LiteLLM de AI-OS una vez levantado
# (litellm --config integrations/litellm/config.yaml --port 4000)
#
# Uso: ./integrations/litellm/test_proxy.sh

set -euo pipefail

BASE_URL="${LITELLM_AIOS_BASE_URL:-http://localhost:4000}"
API_KEY="${LITELLM_AIOS_API_KEY:-sk-local-no-auth}"

echo "== 1. Health check general del proxy =="
curl -sf "${BASE_URL}/health/liveliness" && echo "OK" || echo "FALLÓ: ¿está corriendo litellm en ${BASE_URL}?"

echo
echo "== 2. Modelos que el proxy expone =="
curl -sf "${BASE_URL}/v1/models" -H "Authorization: Bearer ${API_KEY}" | grep -o '"id":"[^"]*"' || echo "FALLÓ al listar modelos"

echo
echo "== 3. Llamada real al rol 'aios-rapido' (debe usar order=1; si falla, cae a order=2) =="
curl -sf "${BASE_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "aios-rapido",
    "messages": [{"role": "user", "content": "Responde solo con la palabra: ok"}]
  }' | grep -o '"content":"[^"]*"' || echo "FALLÓ la llamada a aios-rapido"

echo
echo "== 4. Estado de health checks por deployment (requiere background_health_checks: true) =="
curl -sf "${BASE_URL}/health" -H "Authorization: Bearer ${API_KEY}" || echo "FALLÓ /health — puede tardar hasta health_check_interval en poblarse"
