# 🧪 Test Suite - LiteLLM Gateway

Este directorio contiene scripts de prueba para verificar el funcionamiento del gateway.

---

## 📁 Archivos

| Archivo | Descripción |
|---------|-------------|
| `test_suite.sh` | Suite completa (7 tests) |
| `test_librechat_integration.sh` | Tests de integración con LibreChat (8 tests) |

---

## 🚀 Uso Rápido

### Test del Gateway

```bash
cd integrations/litellm-gateway

# Ejecutar todos los tests
./tests/test_suite.sh

# Con salida JSON
./tests/test_suite.sh --json

# Guardar reporte
./tests/test_suite.sh --report results.json

# Omitir tests de modelos (sin API keys)
./tests/test_suite.sh --skip-model-tests
```

### Test de Integración

```bash
# Test de integración con LibreChat
./tests/test_librechat_integration.sh

# Con URLs personalizadas
./tests/test_librechat_integration.sh \
  --librechat-url http://localhost:3080 \
  --litellm-url http://localhost:4000

# Omitir tests E2E (que requieren navegador)
./tests/test_librechat_integration.sh --skip-e2e
```

---

## 📋 Tests Incluidos

### test_suite.sh (7 tests)

| # | Test | Descripción |
|---|------|-------------|
| 1 | Health Check | Verifica que el gateway responde |
| 2 | Listar Modelos | Lista modelos disponibles |
| 3 | Authentication | Verifica auth funciona |
| 4 | Chat Completion | Test con GPT-4o-mini |
| 5 | Claude Completion | Test con Claude 3.5 Haiku |
| 6 | Gemini Completion | Test con Gemini 1.5 |
| 7 | Role Routing | Test de enrutamiento por roles |

### test_librechat_integration.sh (8 tests)

| # | Test | Descripción |
|---|------|-------------|
| 1 | LibreChat Health | LibreChat está activo |
| 2 | LiteLLM Health | Gateway está activo |
| 3 | LibreChat Models | Lista modelos de LibreChat |
| 4 | LiteLLM Models | Lista modelos del gateway |
| 5 | LiteLLM Chat | Chat completion funciona |
| 6 | LibreChat Chat API | API de chat responde |
| 7 | Rate Limiting | Rate limits activos |
| 8 | E2E Flow | Flujo completo E2E |

---

## ⚙️ Requisitos

### Para test_suite.sh

- `curl` instalado
- LiteLLM Gateway corriendo en puerto 4000
- API keys configuradas en `.env` (para tests de modelos)

### Para test_librechat_integration.sh

- `curl` instalado
- LibreChat corriendo en puerto 3080
- LiteLLM Gateway corriendo en puerto 4000

---

## 🔧 Configuración de Puertos

Por defecto, los tests asumen:

| Servicio | Puerto | Variable de Entorno |
|----------|--------|---------------------|
| LiteLLM | 4000 | `LITELLM_URL` |
| LibreChat | 3080 | `LIBRECHAT_URL` |

Para cambiar:

```bash
export LITELLM_URL=http://mi-servidor:4000
export LIBRECHAT_URL=http://mi-servidor:3080
```

---

## 📊 Ejemplo de Salida

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LIBRECHAT + LITELLM INTEGRATION TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LibreChat: http://localhost:3080
LiteLLM:   http://localhost:4000

----------------------------------------------
Ejecutando suite de integración...
----------------------------------------------

[INFO] TEST 1: LibreChat Health Check
[PASS] LibreChat está activo

[INFO] TEST 2: LiteLLM Gateway Health Check
[PASS] LiteLLM Gateway está activo

...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           RESUMEN DE INTEGRACIÓN

  LibreChat: http://localhost:3080
  LiteLLM:   http://localhost:4000

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ Pasados:   8
  ✗ Fallidos:   0
  ⊘ Omitidos:  0
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ INTEGRACIÓN FUNCIONA CORRECTAMENTE
```

---

## 🔍 Troubleshooting

### "Connection refused"

Verifica que los servicios están corriendo:

```bash
# Ver LiteLLM
curl http://localhost:4000/health

# Ver LibreChat
curl http://localhost:3080/api/health
```

### "Authentication failed"

Verifica la API key:

```bash
export LITELLM_KEY=sk-tu-clave-real
```

### Tests de modelos fallan

Es normal si no tienes todas las API keys configuradas. Usa:

```bash
./test_suite.sh --skip-model-tests
```

---

## 📝 Agregar Nuevos Tests

Para agregar un nuevo test, sigue este formato:

```bash
test_mi_nuevo_test() {
    local test_name="Mi Nuevo Test"
    log_info "Ejecutando: $test_name"
    
    local response
    response=$(request_auth "$LITELLM_URL/mi-endpoint" "GET" "")
    
    if [ $? -eq 0 ] && echo "$response" | grep -q "success"; then
        TEST_RESULTS+=("{\"test\": \"mi_nuevo_test\", \"status\": \"passed\"}")
        log_success "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        TEST_RESULTS+=("{\"test\": \"mi_nuevo_test\", \"status\": \"failed\"}")
        log_error "$test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}
```

---

## 📄 Licencia

MIT License
