#!/bin/bash

# ===========================================
# Mi LibreChat - Deployment Script
# Universal deployment script for all environments
# ===========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_DIR="$SCRIPT_DIR"
VERSION=${VERSION:-latest}
REGISTRY=${REGISTRY:-librechat}
ENVIRONMENT=${ENVIRONMENT:-production}

# ===========================================
# Functions
# ===========================================

log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
    exit 1
}

header() {
    echo ""
    echo -e "${CYAN}=========================================="
    echo -e "  Mi LibreChat Deployment Script"
    echo -e "==========================================${NC}"
}

show_help() {
    header
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  docker          Deploy using Docker Compose"
    echo "  docker:dev     Deploy development environment"
    echo "  docker:build   Build Docker images"
    echo "  docker:logs    View Docker logs"
    echo "  docker:stop    Stop Docker containers"
    echo "  k8s            Deploy to Kubernetes"
    echo "  k8s:status     Check Kubernetes status"
    echo "  k8s:logs       View Kubernetes logs"
    echo "  k8s:scale      Scale Kubernetes deployment"
    echo "  status         Show deployment status"
    echo "  cleanup        Clean up resources"
    echo "  help           Show this help message"
    echo ""
    echo "Options:"
    echo "  -v, --version VERSION   Set version (default: latest)"
    echo "  -e, --env ENVIRONMENT   Set environment (default: production)"
    echo "  -r, --registry URL      Set registry URL"
    echo ""
    echo "Examples:"
    echo "  $0 docker                    # Deploy with Docker"
    echo "  $0 docker:dev                # Deploy development"
    echo "  $0 k8s                       # Deploy to Kubernetes"
    echo "  $0 k8s:scale 5               # Scale to 5 replicas"
    echo "  $0 docker --version v3.0.0   # Specific version"
}

# ===========================================
# Docker Commands
# ===========================================

docker_build() {
    log "Building Docker images..."
    cd "$DEPLOY_DIR/docker"
    
    docker build -t "$REGISTRY/api:$VERSION" \
        -f Dockerfile \
        "$PROJECT_ROOT"
    
    success "Docker image built: $REGISTRY/api:$VERSION"
}

docker_deploy() {
    log "Deploying with Docker Compose..."
    cd "$DEPLOY_DIR/docker"
    
    # Create environment file if it doesn't exist
    if [ ! -f .env ]; then
        warn "Creating .env file from template..."
        cat > .env << EOF
# MongoDB
MONGO_USERNAME=librechat
MONGO_PASSWORD=change_me_in_production

# Security
JWT_SECRET=change_me_in_production_32_chars
CREDS_KEY=change_me_32_characters_here
CREDS_IV=change_me_16_characters

# LLM Providers (optional)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Environment
NODE_ENV=production
EOF
    fi
    
    docker-compose up -d
    success "Docker containers started"
    docker_deploy_status
}

docker_dev() {
    log "Deploying development environment..."
    cd "$DEPLOY_DIR/docker"
    
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    success "Development environment started"
    docker_deploy_status
}

docker_logs() {
    cd "$DEPLOY_DIR/docker"
    docker-compose logs -f
}

docker_stop() {
    log "Stopping Docker containers..."
    cd "$DEPLOY_DIR/docker"
    docker-compose down
    success "Containers stopped"
}

docker_deploy_status() {
    echo ""
    log "Deployment Status:"
    cd "$DEPLOY_DIR/docker"
    docker-compose ps
    echo ""
    log "Endpoints:"
    echo "  - API: http://localhost:3001"
    echo "  - Frontend: http://localhost:5173"
    echo "  - MongoDB: mongodb://localhost:27017"
    echo "  - Redis: redis://localhost:6379"
}

# ===========================================
# Kubernetes Commands
# ===========================================

k8s_deploy() {
    log "Deploying to Kubernetes..."
    cd "$DEPLOY_DIR/kubernetes"
    
    # Apply namespace and config
    kubectl apply -f namespace.yaml
    
    # Create secrets (prompt for values)
    if ! kubectl get secret librechat-secrets -n librechat &>/dev/null; then
        warn "Creating secrets..."
        read -p "MongoDB URI: " MONGO_URI
        read -p "JWT Secret (min 32 chars): " JWT_SECRET
        read -p "CREDS_KEY (32 chars): " CREDS_KEY
        read -p "CREDS_IV (16 chars): " CREDS_IV
        
        kubectl create secret generic librechat-secrets \
            -n librechat \
            --from-literal="MONGO_URI=$MONGO_URI" \
            --from-literal="JWT_SECRET=$JWT_SECRET" \
            --from-literal="CREDS_KEY=$CREDS_KEY" \
            --from-literal="CREDS_IV=$CREDS_IV" \
            --dry-run=client -o yaml | kubectl apply -f -
    fi
    
    # Apply deployment
    kubectl apply -f deployment.yaml
    
    success "Deployed to Kubernetes"
    k8s_status
}

k8s_status() {
    log "Kubernetes Status:"
    kubectl get all -n librechat
    echo ""
    kubectl get ingress -n librechat
}

k8s_logs() {
    log "Viewing logs..."
    kubectl logs -n librechat -l app=librechat-api -f
}

k8s_scale() {
    local replicas=${1:-3}
    log "Scaling to $replicas replicas..."
    kubectl scale deployment librechat-api -n librechat --replicas=$replicas
    success "Scaled to $replicas replicas"
}

k8s_cleanup() {
    warn "Cleaning up Kubernetes resources..."
    kubectl delete -f deployment.yaml
    kubectl delete -f namespace.yaml
    success "Cleanup complete"
}

# ===========================================
# Utility Commands
# ===========================================

show_status() {
    header
    echo ""
    
    # Docker status
    echo -e "${CYAN}Docker Status:${NC}"
    if command -v docker &> /dev/null; then
        cd "$DEPLOY_DIR/docker" 2>/dev/null && docker-compose ps || echo "  Not running or directory not found"
    else
        echo "  Docker not installed"
    fi
    
    echo ""
    
    # Kubernetes status
    echo -e "${CYAN}Kubernetes Status:${NC}"
    if command -v kubectl &> /dev/null; then
        kubectl get pods -n librechat 2>/dev/null || echo "  Namespace not found or kubectl not configured"
    else
        echo "  kubectl not installed"
    fi
    
    echo ""
}

cleanup() {
    warn "Cleaning up all resources..."
    
    if command -v docker &> /dev/null; then
        cd "$DEPLOY_DIR/docker" 2>/dev/null && docker-compose down -v 2>/dev/null || true
    fi
    
    if command -v kubectl &> /dev/null; then
        kubectl delete namespace librechat 2>/dev/null || true
    fi
    
    success "Cleanup complete"
}

# ===========================================
# Main
# ===========================================

# Parse arguments
COMMAND=${1:-help}
shift || true

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -e|--env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Execute command
case $COMMAND in
    docker)
        docker_build
        docker_deploy
        ;;
    docker:build)
        docker_build
        ;;
    docker:dev)
        docker_dev
        ;;
    docker:logs)
        docker_logs
        ;;
    docker:stop)
        docker_stop
        ;;
    docker:status)
        docker_deploy_status
        ;;
    k8s)
        k8s_deploy
        ;;
    k8s:status)
        k8s_status
        ;;
    k8s:logs)
        k8s_logs
        ;;
    k8s:scale)
        k8s_scale "${1:-3}"
        ;;
    k8s:cleanup)
        k8s_cleanup
        ;;
    status)
        show_status
        ;;
    cleanup)
        cleanup
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "Unknown command: $COMMAND"
        ;;
esac
