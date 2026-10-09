#!/bin/bash
# =============================================================================
# LiteLLM Provider Verification Script
# =============================================================================
# Script para verificar cada proveedor de LiteLLM con API keys reales
#
# Uso: ./verify_providers.sh [provider]
#
# Ejemplos:
#   ./verify_providers.sh              # Verificar todos
#   ./verify_providers.sh openai       # Solo OpenAI
#   ./verify_providers.sh anthropic    # Solo Anthropic
#
# =============================================================================

set -euo pipefail

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuración
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
LITELLM_KEY="${LITELLM_KEY:-${LITELLM_MASTER_KEY:-sk-test}}"

# Cargar .env si existe
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
fi

# Contadores
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# =============================================================================
# FUNCIONES
# =============================================================================

log_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((SKIPPED++))
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Hacer request a LiteLLM
llm_request() {
    local model="$1"
    local prompt="${2:-Di solo OK si me lees}"
    local max_tokens="${3:-10}"
    
    curl -s -X POST "$LITELLM_URL/v1/chat/completions" \
        -H "Authorization: Bearer $LITELLM_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"$model\",
            \"messages\": [{\"role\": \"user\", \"content\": \"$prompt\"}],
            \"max_tokens\": $max_tokens
        }" 2>/dev/null
}

# Verificar si un proveedor está configurado
check_provider_key() {
    local provider="$1"
    local key_var="${provider^^}_API_KEY"
    local key_value="${!key_var}"
    
    if [ -z "$key_value" ] || [ "$key_value" = "" ] || [[ "$key_value" == *"your-"* ]]; then
        return 1
    fi
    return 0
}

# =============================================================================
# TESTS POR PROVEEDOR
# =============================================================================

test_openai() {
    local name="OpenAI"
    local models=("gpt-4o-mini" "gpt-4o" "gpt-4-turbo" "gpt-3.5-turbo")
    
    log_header "Testing $name"
    
    if ! check_provider_key "openai"; then
        log_skip "$name - API key no configurada"
        return
    fi
    
    local success=false
    for model in "${models[@]}"; do
        log_test "Testing $model..."
        local response
        response=$(llm_request "$model" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            log_pass "$model - OK"
            success=true
            break
        fi
    done
    
    if [ "$success" = false ]; then
        log_fail "$name - Ningún modelo respondió"
    fi
}

test_anthropic() {
    local name="Anthropic (Claude)"
    local models=("claude-3.5-sonnet" "claude-3.5-haiku" "claude-3-opus" "claude-3-sonnet")
    
    log_header "Testing $name"
    
    if ! check_provider_key "anthropic"; then
        log_skip "$name - API key no configurada"
        return
    fi
    
    local success=false
    for model in "${models[@]}"; do
        log_test "Testing $model..."
        local response
        response=$(llm_request "$model" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            log_pass "$model - OK"
            success=true
            break
        fi
    done
    
    if [ "$success" = false ]; then
        log_fail "$name - Ningún modelo respondió"
    fi
}

test_google() {
    local name="Google (Gemini)"
    local models=("gemini-1.5-flash" "gemini-1.5-pro" "gemini-2.0-flash")
    
    log_header "Testing $name"
    
    if ! check_provider_key "google"; then
        log_skip "$name - API key no configurada"
        return
    fi
    
    local success=false
    for model in "${models[@]}"; do
        log_test "Testing $model..."
        local response
        response=$(llm_request "$model" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            log_pass "$model - OK"
            success=true
            break
        fi
    done
    
    if [ "$success" = false ]; then
        log_fail "$name - Ningún modelo respondió"
    fi
}

test_groq() {
    local name="Groq"
    local models=("llama-3.1-70b" "llama-3.1-8b" "mixtral-8x7b")
    
    log_header "Testing $name"
    
    if ! check_provider_key "groq"; then
        log_skip "$name - API key no configurada"
        return
    fi
    
    local success=false
    for model in "${models[@]}"; do
        log_test "Testing $model..."
        local response
        response=$(llm_request "$model" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            log_pass "$model - OK"
            success=true
            break
        fi
    done
    
    if [ "$success" = false ]; then
        log_fail "$name - Ningún modelo respondió"
    fi
}

test_mistral() {
    local name="Mistral"
    local models=("mistral-small" "mistral-tiny")
    
    log_header "Testing $name"
    
    if ! check_provider_key "mistral"; then
        log_skip "$name - API key no configurada"
        return
    fi
    
    local success=false
    for model in "${models[@]}"; do
        log_test "Testing $model..."
        local response
        response=$(llm_request "$model" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            log_pass "$model - OK"
            success=true
            break
        fi
    done
    
    if [ "$success" = false ]; then
        log_fail "$name - Ningún modelo respondió"
    fi
}

test_deepseek() {
    local name="DeepSeek"
    local models=("deepseek-chat" "deepseek-coder")
    
    log_header "Testing $name"
    
    if ! check_provider_key "deepseek"; then
        log_skip "$name - API key no configurada"
        return
    fi
    
    local success=false
    for model in "${models[@]}"; do
        log_test "Testing $model..."
        local response
        response=$(llm_request "$model" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            log_pass "$model - OK"
            success=true
            break
        fi
    done
    
    if [ "$success" = false ]; then
        log_fail "$name - Ningún modelo respondió"
    fi
}

test_cohere() {
    local name="Cohere"
    local models=("command-r-plus" "command-r")
    
    log_header "Testing $name"
    
    if ! check_provider_key "cohere"; then
        log_skip "$name - API key no configurada"
        return
    fi
    
    local success=false
    for model in "${models[@]}"; do
        log_test "Testing $model..."
        local response
        response=$(llm_request "$model" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            log_pass "$model - OK"
            success=true
            break
        fi
    done
    
    if [ "$success" = false ]; then
        log_fail "$name - Ningún modelo respondió"
    fi
}

test_ollama() {
    local name="Ollama (Local)"
    local models=("llama-3.2" "mistral" "codellama")
    
    log_header "Testing $name"
    
    # Ollama no necesita API key
    log_info "Verificando si Ollama está corriendo..."
    
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        log_skip "$name - Ollama no está corriendo en localhost:11434"
        return
    fi
    
    local success=false
    for model in "${models[@]}"; do
        log_test "Testing $model..."
        local response
        response=$(llm_request "$model" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            log_pass "$model - OK"
            success=true
            break
        fi
    done
    
    if [ "$success" = false ]; then
        log_fail "$name - Ningún modelo respondió"
    fi
}

test_roles() {
    local name="Role Routing"
    
    log_header "Testing Role Routing"
    
    local roles=("chat" "fast" "coding")
    
    for role in "${roles[@]}"; do
        log_test "Testing role: $role..."
        local response
        response=$(llm_request "$role" "Responde solo con: OK" 5)
        
        if echo "$response" | grep -q '"choices"'; then
            local actual_model
            actual_model=$(echo "$response" | grep -o '"model":"[^"]*"' | head -1 | cut -d'"' -f4)
            log_pass "$role → $actual_model"
        else
            log_fail "$role - No respondió"
        fi
    done
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║         LITE LLM PROVIDER VERIFICATION SCRIPT              ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "URL: $LITELLM_URL"
    echo "Key: ${LITELLM_KEY:0:10}..."
    echo ""
    
    # Verificar que LiteLLM está corriendo
    log_info "Verificando conexión a LiteLLM..."
    if ! curl -s "$LITELLM_URL/health" > /dev/null 2>&1; then
        echo -e "${RED}ERROR: LiteLLM no está corriendo en $LITELLM_URL${NC}"
        echo "Levanta LiteLLM primero: docker-compose up -d litellm"
        exit 1
    fi
    log_pass "LiteLLM está corriendo"
    
    # Verificar API key
    if [ -z "$LITELLM_KEY" ] || [ "$LITELLM_KEY" = "sk-test" ]; then
        echo -e "${YELLOW}ADVERTENCIA: Usando key de prueba. Configura LITELLM_KEY real.${NC}"
    fi
    
    echo ""
    log_info "Iniciando pruebas de proveedores..."
    
    # Ejecutar tests según argumento
    local run_all=true
    
    if [ $# -gt 0 ]; then
        run_all=false
        case "$1" in
            openai) test_openai ;;
            anthropic) test_anthropic ;;
            google) test_google ;;
            groq) test_groq ;;
            mistral) test_mistral ;;
            deepseek) test_deepseek ;;
            cohere) test_cohere ;;
            ollama) test_ollama ;;
            roles) test_roles ;;
            all) run_all=true ;;
            *) echo "Proveedor desconocido: $1"; exit 1 ;;
        esac
    fi
    
    if [ "$run_all" = true ]; then
        test_openai
        test_anthropic
        test_google
        test_groq
        test_mistral
        test_deepseek
        test_cohere
        test_ollama
        test_roles
    fi
    
    # Resumen
    log_header "RESUMEN"
    echo ""
    echo -e "  ${GREEN}Pasados:${NC}   $PASSED"
    echo -e "  ${RED}Fallidos:${NC}   $FAILED"
    echo -e "  ${YELLOW}Omitidos:${NC}  $SKIPPED"
    echo ""
    
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ TODOS LOS PROVEEDORES CONFIGURADOS FUNCIONAN${NC}"
        exit 0
    else
        echo -e "${RED}✗ ALGUNOS PROVEEDORES FALLARON${NC}"
        exit 1
    fi
}

main "$@"
