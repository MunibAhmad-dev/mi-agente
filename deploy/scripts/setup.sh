#!/bin/bash

# ===========================================
# Mi LibreChat - Setup Script
# Initial setup for deployment environment
# ===========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "=========================================="
echo "  Mi LibreChat - Setup"
echo "=========================================="
echo ""

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Node.js
    if command -v node &> /dev/null; then
        success "Node.js: $(node -v)"
    else
        error "Node.js is not installed"
    fi
    
    # npm
    if command -v npm &> /dev/null; then
        success "npm: $(npm -v)"
    else
        error "npm is not installed"
    fi
    
    # Docker (optional)
    if command -v docker &> /dev/null; then
        success "Docker: $(docker --version)"
    else
        warn "Docker is not installed (optional)"
    fi
    
    # Docker Compose (optional)
    if command -v docker-compose &> /dev/null; then
        success "Docker Compose: $(docker-compose --version)"
    else
        warn "Docker Compose is not installed (optional)"
    fi
    
    # kubectl (optional)
    if command -v kubectl &> /dev/null; then
        success "kubectl: $(kubectl version --client 2>/dev/null | grep -oP 'GitVersion:"\K[^"]+')"
    else
        warn "kubectl is not installed (optional)"
    fi
}

# Install dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    # API dependencies
    if [ -f "../api/package.json" ]; then
        log "Installing API dependencies..."
        cd ../api && npm install
        success "API dependencies installed"
    fi
    
    # Frontend dependencies
    if [ -f "../frontend/package.json" ]; then
        log "Installing Frontend dependencies..."
        cd ../frontend && npm install
        success "Frontend dependencies installed"
    fi
    
    cd - > /dev/null
}

# Setup environment
setup_environment() {
    log "Setting up environment..."
    
    local env_file="../api/server/.env"
    
    if [ -f "$env_file" ]; then
        warn ".env file already exists, skipping..."
    else
        warn "Creating .env file..."
        
        # Generate random values
        local jwt_secret=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
        local creds_key=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
        local creds_iv=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1)
        
        cat > "$env_file" << EOF
# ===========================================
# Mi LibreChat Environment Configuration
# ===========================================

# Server
PORT=3001
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/librechat

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=$jwt_secret
CREDS_KEY=$creds_key
CREDS_IV=$creds_iv

# LLM Providers (optional)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Search (optional)
# MEILI_HOST=http://localhost:7700
# MEILI_API_KEY=your_meilisearch_key

# Analytics (optional)
# POSTHOG_API_KEY=phc_...
# ANALYTICS_ENDPOINT=https://app.posthog.com

# Rate Limiting
# RATE_LIMIT_WINDOW_MS=900000
# RATE_LIMIT_MAX_REQUESTS=100
EOF
        
        success "Created .env file"
    fi
}

# Build application
build_app() {
    log "Building application..."
    
    # Build frontend
    if [ -d "../frontend" ]; then
        cd ../frontend
        if [ -f "package.json" ]; then
            log "Building frontend..."
            npm run build
            success "Frontend built"
        fi
        cd - > /dev/null
    fi
}

# Setup complete
setup_complete() {
    echo ""
    echo "=========================================="
    success "Setup Complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo ""
    echo "  1. Configure your .env file:"
    echo "     nano ../api/server/.env"
    echo ""
    echo "  2. Deploy with Docker:"
    echo "     cd ../deploy/docker"
    echo "     ./deploy.sh docker"
    echo ""
    echo "  3. Or deploy to Kubernetes:"
    echo "     kubectl apply -f ../deploy/kubernetes/"
    echo ""
}

# Main
main() {
    check_prerequisites
    install_dependencies
    setup_environment
    build_app
    setup_complete
}

main
