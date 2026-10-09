#!/bin/bash
# ============================================
# Install Script - Crypto AI System
# ============================================

set -e

echo "🚀 Installing Crypto AI Autonomous System..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p config data logs

# Copy env file if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env 2>/dev/null || echo "# Add your API keys here" > .env
fi

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
if command -v python3 &> /dev/null; then
    pip install -r requirements.txt
fi

# Start Docker services
echo "🐳 Starting Docker services..."
cd docker
docker-compose up -d
cd ..

# Wait for services
echo "⏳ Waiting for services..."
sleep 10

# Check status
echo "📊 Checking services..."
docker-compose ps

echo ""
echo "✅ Installation complete!"
echo ""
echo "Access:"
echo "  - n8n: http://localhost:5678"
echo "  - Grafana: http://localhost:3000"
echo "  - Prometheus: http://localhost:9090"
echo "  - Qdrant: http://localhost:6333"
echo ""
echo "Default credentials: admin / cryptoai2025"
