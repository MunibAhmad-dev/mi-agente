# 🧠 Sistema de IA Autónoma para Inversión en Criptomonedas

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active-green)

Sistema multiagente de inteligencia artificial de código abierto diseñado para operar de manera autónoma en mercados de criptomonedas. Construido con herramientas 100% gratuitas y open source.

## 📋 Estado del Sistema

### ✅ Completado (MEJORADO)

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| **Docker Compose** | ✅ Listo | Servicios básicos configurados |
| **Market Data** | ✅ Listo | CCXT integration |
| **Memory** | ✅ Listo | Qdrant vector DB |
| **Risk Manager** | ✅ Listo | Gestión de riesgo |
| **Trading Executor** | ✅ Listo | Ejecución de trades |
| **FastAPI Backend** | ✅ Listo | REST API completa |
| **WebSocket** | ✅ Listo | Datos en tiempo real |
| **GraphQL** | ✅ Listo | API GraphQL Strawberry |
| **Redis Cache** | ✅ Listo | Cache de market data |
| **Rate Limiting** | ✅ Listo | SlowAPI protection |
| **ML Pipelines** | ✅ Listo | Airflow DAGs |
| **MLflow** | ✅ Listo | Experiment tracking |
| **Feature Store** | ✅ Listo | Feast config |
| **Frontend** | ✅ Completo | React + Ant Design |
| **TradingView Charts** | ✅ Listo | Gráficos profesionales |
| **Auth** | ✅ Completo | JWT Login/Register |
| **ArgoCD** | ✅ Listo | GitOps config |
| **K8s** | ✅ Listo | K3s manifests |

### 🚧 En Desarrollo

| Módulo | Progreso | Descripción |
|--------|----------|------------|
| **Frontend SaaS** | ✅ Completo | Dashboard multiusuario completo |
| **Auth** | ✅ Completo | Autenticación JWT + Login |
| **K8s** | ✅ Listo | Manifiestos K3s |

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Refine/React)                    │
│                    http://localhost:3000 (Grafana)            │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY (Traefik)                       │
│                      http://localhost:80                        │
│              Routing → /api, /grafana, /mlflow               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND API (FastAPI)                       │
│                      http://localhost:8000                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Market  │  │ Trading │  │ Portfolio│  │ Strategy │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  PostgreSQL   │    │   RabbitMQ   │    │   Qdrant    │
│   (Timescale)│    │   (Message  │    │  (Vector DB) │
│               │    │    Queue)    │    │              │
└───────────────┘    └───────────────┘    └───────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ML OPS LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Airflow   │  │   MLflow    │  │  TensorTrade │     │
│  │  (Pipelines)│  │ (Tracking)  │  │    (RL)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   TRADING LAYER                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Freqtrade  │  │    CCXT     │  │ Risk Engine │     │
│  │   (Bot)     │  │  (Exchanges)│  │             │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack Tecnológico (Mejorado)

### Backend
| Herramienta | Uso | Licencia |
|------------|-----|-----------|
| **FastAPI** | REST API | MIT |
| **WebSocket** | Tiempo real | MIT |
| **GraphQL** | Alternativa API | MIT |
| **Redis** | Cache | BSD |
| **Traefik** | API Gateway | MIT |
| **RabbitMQ** | Message Queue | MPL 2.0 |
| **PostgreSQL/TimescaleDB** | Base de datos | Apache 2.0 |
| **SlowAPI** | Rate Limiting | MIT |

### Datos & ML
| Herramienta | Uso | Licencia |
|------------|-----|-----------|
| **CCXT** | APIs Exchanges | MIT |
| **Qdrant** | Vector DB | Apache 2.0 |
| **Airflow** | Pipelines | Apache 2.0 |
| **MLflow** | MLOps | Apache 2.0 |
| **Feast** | Feature Store | Apache 2.0 |
| **TensorTrade** | RL Trading | Apache 2.0 |

### Orquestación & Monitoreo
| Herramienta | Uso | Licencia |
|------------|-----|-----------|
| **n8n** | Workflow automation | Apache 2.0 |
| **Grafana** | Dashboards | Apache 2.0 |
| **Prometheus** | Métricas | Apache 2.0 |
| **ArgoCD** | GitOps | Apache 2.0 |

### Frontend
| Herramienta | Uso | Licencia |
|------------|-----|-----------|
| **TradingView Charts** | Gráficos | Apache 2.0 |
| **Refine** | UI Framework | MIT |
| **React** | UI Library | MIT |
| **Ant Design** | Componentes | MIT |
| **Socket.io** | WebSocket Client | MIT |
| **React Hook Form** | Forms | MIT |
| **Zod** | Validation | MIT |

---

## 🚀 Inicio Rápido

### Requisitos Previos

- Docker y Docker Compose
- 4GB RAM mínimo (8GB recomendado)
- Ubuntu 20.04+ / Debian 11+

### Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/aoi555/Sistema-de-IA-para-Inversi-en-Criptomonedas.git
cd Sistema-de-IA-para-Inversi-en-Criptomonedas

# 2. Copiar archivo de entorno
cp .env.example .env

# 3. Editar credenciales
nano .env

# 4. Iniciar servicios básicos
cd docker
docker-compose up -d

# O iniciar todos los servicios (producción)
docker-compose -f docker-compose.production.yml up -d
```

### Acceder a Servicios

| Servicio | URL | Credenciales |
|----------|-----|-------------|
| **API Docs** | http://localhost:8000/docs | - |
| **n8n** | http://localhost:5678 | admin / cryptoai2025 |
| **Grafana** | http://localhost:3000 | admin / cryptoai2025 |
| **Prometheus** | http://localhost:9090 | - |
| **MLflow** | http://localhost:5000 | - |
| **Traefik** | http://localhost:8080 | - |
| **Qdrant** | http://localhost:6333 | - |
| **Airflow** | http://localhost:8090 | airflow / airflow |

---

## 📁 Estructura del Proyecto

```
crypto-ai-system/
├── api/                    # FastAPI Backend
│   ├── main.py            # App principal
│   ├── core/              # Configuración
│   ├── routers/           # Endpoints
│   │   ├── market.py      # Datos mercado
│   │   ├── trading.py     # Trading
│   │   ├── portfolio.py   # Portafolio
│   │   ├── strategies.py  # Estrategias
│   │   └── performance.py # Métricas
│   └── services/           # Servicios
│
├── ml/                     # ML Pipelines
│   ├── dags/              # Airflow DAGs
│   │   ├── data_pipeline.py
│   │   └── training_pipeline.py
│   └── training/           # Entrenamiento
│
├── docker/                 # Docker
│   ├── docker-compose.yml          # Básico
│   └── docker-compose.production.yml # Production
│
├── frontend/               # React Frontend
│   └── src/
│       └── App.tsx
│
├── services/               # Módulos Python
│   ├── market_data.py
│   ├── memory.py
│   ├── risk_manager.py
│   └── trading_executor.py
│
├── config/                 # Configuraciones
│   ├── exchanges.json
│   └── settings.json
│
├── monitoring/             # Dashboards
│   ├── prometheus.yml
│   └── grafana/dashboards/
│
├── strategies/            # Estrategias trading
│   └── sample_strategy.py
│
├── scripts/              # Scripts
│   └── install.sh
│
├── MEJORAS_SISTEMA.md     # Plan de mejoras
└── README.md
```

---

## 📡 API Endpoints

### Market Data
```
GET /api/v1/market/ticker/{symbol}     # Precio actual
GET /api/v1/market/ohlcv/{symbol}      # Datos OHLCV
GET /api/v1/market/orderbook/{symbol}   # Order book
GET /api/v1/market/top/{quote}          # Top monedas
```

### Trading
```
POST /api/v1/trading/execute            # Ejecutar trade
GET  /api/v1/trading/order/{id}        # Estado orden
DELETE /api/v1/trading/order/{id}      # Cancelar orden
GET  /api/v1/trading/open              # Órdenes abiertas
GET  /api/v1/trading/history          # Historial
```

### Portfolio
```
GET /api/v1/portfolio/balance          # Balance
GET /api/v1/portfolio/positions       # Posiciones
GET /api/v1/portfolio/history        # Historial
POST /api/v1/portfolio/rebalance      # Rebalancear
```

### Strategies
```
GET    /api/v1/strategies              # Listar estrategias
POST   /api/v1/strategies              # Crear estrategia
GET    /api/v1/strategies/{id}         # Ver estrategia
PUT    /api/v1/strategies/{id}/start    # Iniciar
PUT    /api/v1/strategies/{id}/stop     # Detener
```

### Performance
```
GET /api/v1/performance/metrics       # Métricas
GET /api/v1/performance/daily        # Rendimiento diario
GET /api/v1/performance/drawdown     # Drawdown
GET /api/v1/performance/trades       # Análisis trades
```

---

## ⚙️ Configuración

### Variables de Entorno

```env
# Database
POSTGRES_PASSWORD=cryptoai2025

# API
SECRET_KEY=change-this-in-production

# Exchanges
BINANCE_API_KEY=tu_api_key
BINANCE_SECRET=tu_secret
```

---

## 🔒 Seguridad

- ✅ No exponer puertos innecesarios
- ✅ Usar VPN para producción
- ✅ API keys en variables de entorno
- ✅ Cambiar credenciales por defecto
- ✅ Backups regulares

---

## 📊 Monitoreo

Dashboard Grafana incluye:
- 💰 Balance Total
- 📈 P&L Acumulado
- 📉 Drawdown
- 🎯 Win Rate
- 🔢 Operaciones por día

---

## 🧪 Testing

```bash
# Ejecutar tests
pytest tests/

# Coverage
pytest --cov=services tests/
```

---

## 📝 Licencia

MIT License - Uso libre y modificación

---

## 🙏 Contribuciones

Pull requests bienvenidas!

---

## 📞 Contacto

- GitHub: https://github.com/aoi555

---

## ⚠️ Disclaimer

Este software es con fines educativos. Trading de criptomonedas conlleva riesgos significativos. Usa bajo tu propio riesgo.