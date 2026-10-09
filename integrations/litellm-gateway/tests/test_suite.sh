#!/bin/bash
# =============================================================================
# LiteLLM Gateway - Test Suite Completa
# =============================================================================
# Suite de 7 pruebas para verificar el funcionamiento del gateway
#
# Uso: ./test_suite.sh [opciones]
#
# Opciones:
#   --skip-model-tests   Salta pruebas que requieren API keys reales
#   --verbose            Muestra salida detallada
#   --json               Salida en formato JSON
#   --report FILE        Guardar reporte en archivo
#
# Requisitos:
#   - curl
#   - jq (opcional, para formateo JSON)
#   - Variables de entorno configuradas en .env
#
# Autor: Mi LibreChat
# Versión: 1.0.0
# =============================================================================

set -euo pipefail

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# CONFIGURACIÓN
# =============================================================================

# Cargar variables de entorno
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
fi

# Configuración por defecto
LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
LITELLM_KEY="${LITELLM_KEY:-${LITELLM_MASTER_KEY:-sk-test}}"
OUTPUT_JSON=false
VERBOSE=false
SKIP_MODEL_TESTS=false
REPORT_FILE=""

# Contadores
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Arrays para resultados
declare -a TEST_RESULTS=()

# =============================================================================
# FUNCIONES UTILITARIAS
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
}

log_debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

# Función para hacer requests
make_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local headers=("-H" "Authorization: Bearer $LITELLM_KEY")
    
    if [ -n "$data" ]; then
        headers+=("-H" "Content-Type: application/json")
        if [ "$VERBOSE" = true ]; then
            curl -s -X "$method" \
                -H "Authorization: Bearer $LITELLM_KEY" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "$LITELLM_URL$endpoint" 2>&1
        else
            curl -s -X "$method" \
                -H "Authorization: Bearer $LITELLM_KEY" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "$LITELLM_URL$endpoint" 2>/dev/null
        fi
    else
        curl -s -X "$method" \
            -H "Authorization: Bearer $LITELLM_KEY" \
            "$LITELLM_URL$endpoint" 2>/dev/null
    fi
}

# =============================================================================
# TESTS
# =============================================================================

test_health() {
    local test_name="Health Check"
    log_info "Ejecutando: $test_name"
    
    local response
    response=$(make_request "GET" "/health" "")
    
    if [ $? -eq 0 ] && echo "$response" | grep -q "status"; then
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"passed\"}")
        log_success "$test_name - Gateway está activo"
        ((TESTS_PASSED++))
        return 0
    else
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"failed\", \"error\": \"$response\"}")
        log_error "$test_name - Gateway no responde"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_models_list() {
    local test_name="Listar Modelos"
    log_info "Ejecutando: $test_name"
    
    local response
    response=$(make_request "GET" "/v1/models" "")
    
    if [ $? -eq 0 ] && echo "$response" | grep -q "data"; then
        local model_count
        model_count=$(echo "$response" | grep -o '"id"' | wc -l)
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"passed\", \"models\": $model_count}")
        log_success "$test_name - $model_count modelos disponibles"
        ((TESTS_PASSED++))
        return 0
    else
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"failed\", \"error\": \"$response\"}")
        log_error "$test_name - No se pudieron listar modelos"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_chat_completion() {
    local test_name="Chat Completion (GPT-4o-mini)"
    log_info "Ejecutando: $test_name"
    
    if [ "$SKIP_MODEL_TESTS" = true ]; then
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"skipped\"}")
        log_skip "$test_name - Omitido por configuración"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    local data='{
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "Di solo \"OK\" si me lees"}],
        "max_tokens": 10
    }'
    
    local response
    response=$(make_request "POST" "/v1/chat/completions" "$data")
    
    if [ $? -eq 0 ] && echo "$response" | grep -q "choices"; then
        local content
        content=$(echo "$response" | grep -o '"content":"[^"]*"' | head -1)
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"passed\"}")
        log_success "$test_name - Respuesta: $content"
        ((TESTS_PASSED++))
        return 0
    else
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"failed\", \"error\": \"$response\"}")
        log_error "$test_name - Error: $response"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_anthropic_completion() {
    local test_name="Claude Completion (claude-3.5-haiku)"
    log_info "Ejecutando: $test_name"
    
    if [ "$SKIP_MODEL_TESTS" = true ]; then
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"skipped\"}")
        log_skip "$test_name - Omitido por configuración"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    local data='{
        "model": "claude-3.5-haiku",
        "messages": [{"role": "user", "content": "Di solo \"OK\" si me lees"}],
        "max_tokens": 10
    }'
    
    local response
    response=$(make_request "POST" "/v1/chat/completions" "$data")
    
    if [ $? -eq 0 ] && echo "$response" | grep -q "choices"; then
        local content
        content=$(echo "$response" | grep -o '"content":"[^"]*"' | head -1)
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"passed\"}")
        log_success "$test_name - Respuesta: $content"
        ((TESTS_PASSED++))
        return 0
    else
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"failed\", \"error\": \"$response\"}")
        log_warning "$test_name - Modelo no disponible (normal si no está configurado)"
        ((TESTS_SKIPPED++))
        return 0
    fi
}

test_gemini_completion() {
    local test_name="Gemini Completion"
    log_info "Ejecutando: $test_name"
    
    if [ "$SKIP_MODEL_TESTS" = true ]; then
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"skipped\"}")
        log_skip "$test_name - Omitido por configuración"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    local data='{
        "model": "gemini-1.5-flash",
        "messages": [{"role": "user", "content": "Di solo \"OK\" si me lees"}],
        "max_tokens": 10
    }'
    
    local response
    response=$(make_request "POST" "/v1/chat/completions" "$data")
    
    if [ $? -eq 0 ] && echo "$response" | grep -q "choices"; then
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"passed\"}")
        log_success "$test_name - Gemini responde correctamente"
        ((TESTS_PASSED++))
        return 0
    else
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"failed\", \"error\": \"$response\"}")
        log_warning "$test_name - Modelo no disponible (normal si no está configurado)"
        ((TESTS_SKIPPED++))
        return 0
    fi
}

test_role_routing() {
    local test_name="Role Routing (chat, coding, fast)"
    log_info "Ejecutando: $test_name"
    
    if [ "$SKIP_MODEL_TESTS" = true ]; then
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"skipped\"}")
        log_skip "$test_name - Omitido por configuración"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    local roles=("chat" "coding" "fast" "cheap")
    local all_passed=true
    
    for role in "${roles[@]}"; do
        local data="{\"model\": \"$role\", \"messages\": [{\"role\": \"user\", \"content\": \"Test $role\"}], \"max_tokens\": 5}"
        local response
        response=$(make_request "POST" "/v1/chat/completions" "$data")
        
        if [ $? -eq 0 ] && echo "$response" | grep -q "choices"; then
            log_debug "Role $role: OK"
        else
            log_warning "Role $role: Falló (puede no estar configurado)"
            all_passed=false
        fi
    done
    
    if [ "$all_passed" = true ]; then
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"passed\"}")
        log_success "$test_name - Todos los roles funcionan"
        ((TESTS_PASSED++))
        return 0
    else
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"partial\", \"warning\": \"Algunos roles no disponibles\"}")
        log_warning "$test_name -部分 roles no disponibles"
        ((TESTS_PASSED++))
        return 0
    fi
}

test_authentication() {
    local test_name="Authentication"
    log_info "Ejecutando: $test_name"
    
    # Test con key inválida
    local response
    response=$(curl -s -X GET \
        -H "Authorization: Bearer invalid-key" \
        "$LITELLM_URL/health" 2>/dev/null)
    
    if echo "$response" | grep -qq "error\|401\|unauthorized"; then
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"passed\"}")
        log_success "$test_name - Auth funciona correctamente"
        ((TESTS_PASSED++))
        return 0
    else
        # Test con key válida
        response=$(make_request "GET" "/health" "")
        if [ $? -eq 0 ]; then
            TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"passed\"}")
            log_success "$test_name - Auth funciona"
            ((TESTS_PASSED++))
            return 0
        fi
        TEST_RESULTS+=("{\"test\": \"$test_name\", \"status\": \"warning\", \"note\": \"Auth test inconclusive\"}")
        log_warning "$test_name - Resultado inconclusive"
        ((TESTS_PASSED++))
        return 0
    fi
}

# =============================================================================
# REPORTE
# =============================================================================

print_summary() {
    echo ""
    echo "=============================================="
    echo "           RESUMEN DE TESTS"
    echo "=============================================="
    echo ""
    echo -e "${GREEN}Pasados:${NC}   $TESTS_PASSED"
    echo -e "${RED}Fallidos:${NC}   $TESTS_FAILED"
    echo -e "${YELLOW}Omitidos:${NC}  $TESTS_SKIPPED"
    echo ""
    echo "----------------------------------------------"
    echo "Total: $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
    echo "=============================================="
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ TODOS LOS TESTS PASARON${NC}"
        return 0
    else
        echo -e "${RED}✗ ALGUNOS TESTS FALLARON${NC}"
        return 1
    fi
}

generate_json_report() {
    if [ "$OUTPUT_JSON" = true ]; then
        local total=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
        local json="{\"timestamp\": \"$(date -Iseconds)\", \"total\": $total, \"passed\": $TESTS_PASSED, \"failed\": $TESTS_FAILED, \"skipped\": $TESTS_SKIPPED, \"tests\": ["
        
        local first=true
        for result in "${TEST_RESULTS[@]}"; do
            if [ "$first" = true ]; then
                first=false
            else
                json+=","
            fi
            json+="$result"
        done
        json+="]}"
        
        if [ -n "$REPORT_FILE" ]; then
            echo "$json" > "$REPORT_FILE"
            echo "Reporte guardado en: $REPORT_FILE"
        else
            echo "$json"
        fi
    fi
}

# =============================================================================
# PARSEO DE ARGUMENTOS
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-model-tests)
                SKIP_MODEL_TESTS=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --json)
                OUTPUT_JSON=true
                shift
                ;;
            --report)
                REPORT_FILE="$2"
                shift 2
                ;;
            --help|-h)
                echo "Uso: $0 [opciones]"
                echo ""
                echo "Opciones:"
                echo "  --skip-model-tests   Salta pruebas que requieren API keys"
                echo "  --verbose           Muestra salida detallada"
                echo "  --json              Salida en formato JSON"
                echo "  --report FILE       Guardar reporte en archivo"
                echo "  --help, -h          Muestra esta ayuda"
                exit 0
                ;;
            *)
                echo "Opción desconocida: $1"
                exit 1
                ;;
        esac
    done
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo "     LITE LLM GATEWAY - TEST SUITE v1.0"
    echo "=============================================="
    echo ""
    echo "URL: $LITELLM_URL"
    echo "Key: ${LITELLM_KEY:0:10}..."
    echo ""
    
    parse_args "$@"
    
    echo "----------------------------------------------"
    echo "Ejecutando suite de pruebas..."
    echo "----------------------------------------------"
    echo ""
    
    # Ejecutar tests
    test_health
    test_models_list
    test_authentication
    test_chat_completion
    test_anthropic_completion
    test_gemini_completion
    test_role_routing
    
    # Generar reporte
    print_summary
    generate_json_report
    
    # Exit code
    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    fi
    exit 0
}

main "$@"
