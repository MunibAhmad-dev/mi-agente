#!/bin/bash
# AI-OS Setup for Freelancer
set -e

echo "============================================"
echo "   AI-OS - Setup Automatico para Freelancer"
echo "============================================"
echo ""

# Check Docker
echo "[1/6] Verificando Docker..."
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker no esta instalado."
    echo "Instala: https://docs.docker.com/get-docker/"
    exit 1
fi
echo "OK - Docker encontrado."

# Check Docker Compose
echo "[2/6] Verificando Docker Compose..."
if ! docker compose version &> /dev/null; then
    echo "ERROR: Docker Compose no esta disponible."
    exit 1
fi
echo "OK - Docker Compose encontrado."

# Create .env from template
echo "[3/6] Configurando variables de entorno..."
if [ ! -f .env ]; then
    cp .env.example .env
    
    # Generate random keys
    CREDS_KEY=$(openssl rand -hex 32)
    CREDS_IV=$(openssl rand -hex 16)
    MEILI_KEY=$(openssl rand -hex 32)
    SESSION_SEC=$(openssl rand -hex 32)
    
    # Replace placeholders
    sed -i.bak "s/your-credentials-encryption-key/$CREDS_KEY/g" .env
    sed -i.bak "s/your-credentials-initialization-vector/$CREDS_IV/g" .env
    sed -i.bak "s/your-meilisearch-master-key/$MEILI_KEY/g" .env
    sed -i.bak "s/your-admin-panel-session-secret/$SESSION_SEC/g" .env
    rm -f .env.bak
    
    echo "OK - .env creado con credenciales generadas automaticamente."
else
    echo "OK - .env ya existe."
fi

# Start MongoDB
echo "[4/6] Iniciando MongoDB..."
docker compose up -d mongodb
sleep 5
echo "OK - MongoDB corriendo en puerto 27017."

# Start all services
echo "[5/6] Iniciando todos los servicios..."
docker compose up -d
echo "OK - Todos los contenedores iniciados."

# Wait and verify
echo "[6/6] Verificando servicios..."
sleep 10
echo ""
echo "============================================"
echo "   SERVICIOS DISPONIBLES:"
echo "============================================"
echo ""
echo "   LibreChat (Chat UI):     http://localhost:3080"
echo "   Admin Panel:             http://localhost:3000"
echo "   AI Model Browser:        http://localhost:3456"
echo "   MongoDB:                 localhost:27017 (sin auth)"
echo "   Ollama (LLM local):      http://localhost:11434"
echo ""
echo "   Dashboard:               Abre client/dashboard.html"
echo ""
echo "============================================"
echo "   PARA CHATEAR: Abre http://localhost:3080"
echo "   PARA MONGODB: Usa MongoDB Compass"
echo "                  Connection: mongodb://localhost:27017/LibreChat"
echo "============================================"
echo ""

docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
