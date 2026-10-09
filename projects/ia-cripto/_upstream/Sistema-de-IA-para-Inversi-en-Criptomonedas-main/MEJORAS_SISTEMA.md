# 🚀 PLAN DE MEJORA - Sistema de IA Autónoma para Inversión en Criptomonedas

## 📋 Resumen Ejecutivo

Este documento presenta un plan detallado para evolucionar el sistema actual hacia una **plataforma SaaS robusta y escalable**, dividiendo el desarrollo en 4 áreas especializadas:

| Área | Enfoque | Herramientas Libres |
|------|---------|-------------------|
| **Backend/Arquitectura** | API, microservices, event-driven | Traefik, FastAPI, RabbitMQ |
| **Infraestructura** | Orquestación, automatización, scaling | Kubernetes, Terraform, Ansible |
| **ML/Pipelines** | Entrenamiento, MLOps, experiment tracking | MLflow, Kubeflow, Airflow |
| **Frontend/SaaS** | Panel de control multiusuario | React, Refine, Low-code |

---

# 1️⃣ ARQUITECTURA / BACKEND

## Estado Actual
- Servicios Docker básicos
- API directa con CCXT
- Sin API Gateway

## Mejoras Propuestas

### 🔑 API Gateway
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **Traefik** | API Gateway + Load Balancer | MIT | ⭐ Ligero, auto-discovery, let's encrypt |
| **Kong** | API Gateway | Apache 2.0 | Muy completo, plugins |
| **APISIX** | API Gateway | Apache 2.0 | Alto rendimiento, etcd |

**Recomendación**: Traefik (más simple, ideal para empezar)

```yaml
# docker-compose.traefik.yml
services:
  traefik:
    image: traefik:v3.0
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/traefik.yml:ro
    environment:
      - TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_ACME_EMAIL=tu@email.com
      - TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_ACME_STORAGE=/letsencrypt/acme.json
      - TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_ACME_HTTPCHALLENGE=true
```

### 🌐 REST API Moderno
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **FastAPI** | Framework Python | MIT | ⭐ Rápido, automático OpenAPI/Swagger |
| **Flask** | Framework Python | BSD | Simple, flexible |
| **FastAPI + SQLModel** | ORM | MIT | Type-safe, async |

**Recomendación**: FastAPI

```python
# api/main.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import pandas as pd

app = FastAPI(title="Crypto AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TradeRequest(BaseModel):
    symbol: str
    action: str  # buy/sell
    amount: float
    price: Optional[float] = None

class TradeResponse(BaseModel):
    success: bool
    order_id: Optional[str] = None
    message: str
    timestamp: str

@app.get("/")
async def root():
    return {"message": "Crypto AI Trading System API", "version": "1.0.0"}

@app.get("/api/v1/market/{symbol}")
async def get_market_data(symbol: str, timeframe: str = "1h"):
    """Obtener datos de mercado"""
    # Implementar con CCXT
    return {"symbol": symbol, "timeframe": timeframe}

@app.post("/api/v1/trade")
async def execute_trade(request: TradeRequest) -> TradeResponse:
    """Ejecutar trade"""
    # Implementar con TradingExecutor
    return TradeResponse(
        success=True,
        order_id="12345",
        message="Trade executed",
        timestamp=datetime.now().isoformat()
    )

@app.get("/api/v1/balance")
async def get_balance():
    """Obtener balance"""
    # Implementar
    return {"total": 10000.0, "available": 8000.0}

@app.get("/api/v1/positions")
async def get_positions():
    """Obtener posiciones abiertas"""
    return []

@app.get("/api/v1/performance")
async def get_performance():
    """Métricas de rendimiento"""
    return {
        "total_trades": 150,
        "win_rate": 0.65,
        "profit_factor": 1.8,
        "max_drawdown": 0.12,
        "sharpe_ratio": 1.5
    }
```

### 🔄 Message Queue (Event-Driven)
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **RabbitMQ** | Message Broker | MPL 2.0 | ⭐ Robusto, estándar enterprise |
| **NATS** | Message Broker | Apache 2.0 | Ultra rápido, simple |
| **Redis Streams** | Message Queue | BSD | Integrado con Redis |

**Recomendación**: RabbitMQ (más Features, mejor documentación)

```python
# services/message_queue.py
import pika
import json

class MessageQueue:
    def __init__(self, host='rabbitmq', port=5672):
        self.connection = pika.BlockingConnection(
            pika.ConnectionParameters(host=host, port=port)
        )
        self.channel = self.connection.channel()
        
        # Declarar colas
        self.channel.queue_declare(queue='trading_signals', durable=True)
        self.channel.queue_declare(queue='trade_execution', durable=True)
        self.channel.queue_declare(queue='risk_alerts', durable=True)
    
    def publish(self, queue: str, message: dict):
        self.channel.basic_publish(
            exchange='',
            routing_key=queue,
            body=json.dumps(message),
            properties=pika.BasicProperties(
                delivery_mode=2,  # Persistent
            )
        )
    
    def consume(self, queue: str, callback):
        self.channel.basic_qos(prefetch_count=1)
        self.channel.basic_consume(
            queue=queue,
            on_message_callback=callback
        )
        self.channel.start_consuming()

# Usage
mq = MessageQueue()
mq.publish('trading_signals', {
    'symbol': 'BTC/USDT',
    'action': 'buy',
    'confidence': 0.85,
    'timestamp': '2025-01-01T00:00:00Z'
})
```

### 📊 Base de Datos Avanzada
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **TimescaleDB** | Time-series DB | Apache 2.0 | ⭐ Optimizado para series temporales |
| **ClickHouse** | OLAP DB | Apache 2.0 | Analytics rápido |
| **Supabase** | Firebase alternative | Apache 2.0 | Realtime, auth |

**Recomendación**: TimescaleDB (especializado en datos financieros)

---

# 2️⃣ INFRAESTRUCTURA / SISTEMAS

## Estado Actual
- Docker Compose básico
- Sin orquestación avanzada
- Escalabilidad limitada

## Mejoras Propuestas

### ☸️ Orquestación con Kubernetes
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **K3s** | Kubernetes ligero | Apache 2.0 | ⭐ 40% menos recursos que k8s |
| **Rancher** | Manager K8s | Apache 2.0 | UI, multi-cluster |
| **K0s** | K8s alternativo | Apache 2.0 | Sin dependencies |

**Recomendación**: K3s (ideal para VPS/edge)

```yaml
# k3s/manifests/crypto-ai-system.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: crypto-ai-api
  namespace: crypto-ai
spec:
  replicas: 3
  selector:
    matchLabels:
      app: crypto-ai-api
  template:
    metadata:
      labels:
        app: crypto-ai-api
    spec:
      containers:
      - name: api
        image: cryptoai/api:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: crypto-ai-secrets
              key: database-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: crypto-ai-api
  namespace: crypto-ai
spec:
  selector:
    app: crypto-ai-api
  ports:
  - port: 80
    targetPort: 8000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: crypto-ai-ingress
  namespace: crypto-ai
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.tudominio.com
    secretName: crypto-ai-tls
  rules:
  - host: api.tudominio.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: crypto-ai-api
            port:
              number: 80
```

### 🔄 Automatización con Ansible
```yaml
# ansible/playbooks/deploy_crypto_ai.yml
---
- name: Deploy Crypto AI System
  hosts: production
  become: yes
  vars:
    docker_compose_version: "2.24.0"
    app_directory: /opt/crypto-ai
    
  tasks:
    - name: Install Docker
      ansible.builtin.apt:
        name:
          - docker.io
          - docker-compose
        state: present
        update_cache: yes
    
    - name: Create app directory
      ansible.builtin.file:
        path: "{{ app_directory }}"
        state: directory
        mode: '0755'
    
    - name: Deploy with Docker Compose
      community.docker.docker_compose_v2:
        project_src: "{{ app_directory }}"
        files:
          - docker-compose.yml
        state: present
    
    - name: Setup firewall
      ufw:
        state: enabled
        policy: deny
        rule:
          port: '{{ item }}'
          proto: tcp
      loop:
        - "22"
        - "80"
        - "443"
        - "3000"
        - "5678"
        - "6333"
```

### 📦 Infrastructure as Code (Terraform)
```hcl
# terraform/aws/main.tf
provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"
  
  name = "crypto-ai-vpc"
  cidr = "10.0.0.0/16"
  
  azs             = ["us-east-1a", "us-east-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "19.0.0"
  
  cluster_name    = "crypto-ai-cluster"
  cluster_version = "1.28"
  
  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  
  eks_managed_node_groups = {
    general = {
      instance_types = ["t3.medium"]
      min_size       = 2
      max_size       = 10
      desired_size   = 3
    }
  }
}
```

### 🔐 Secrets Management
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **HashiCorp Vault** | Secrets Manager | MPL 2.0 | ⭐ Estándar industry |
| **SOPS** | Secrets ops | MPL 2.0 | GitOps friendly |
| **Sealed Secrets** | K8s secrets | Apache 2.0 | GitOps native |

**Recomendación**: Vault + SOPS

---

# 3️⃣ ML / PIPELINES

## Estado Actual
- Datos históricos con CCXT
- Sin pipeline de entrenamiento
- Sin experiment tracking

## Mejoras Propuestas

### 📈 Experiment Tracking
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **MLflow** | MLOps | Apache 2.0 | ⭐ Experimentos, modelos, deployment |
| **Weights & Biases** | MLOps | Proprietary | Excelente UI (freemium) |
| **Neptune** | MLOps | Proprietary | Colaboración |

**Recomendación**: MLflow (100% open source)

```python
# ml/training/trainer.py
import mlflow
from mlflow.tracking import MlflowClient
import pandas as pd
import numpy as np
from stable_baselines3 import PPO
from tensortrade import create_env

# Configurar MLflow
mlflow.set_tracking_uri("http://mlflow:5000")
mlflow.set_experiment("crypto_trading")

def train_model(symbol: str, timeframe: str, episodes: int = 1000):
    """Entrenar modelo de trading"""
    
    with mlflow.start_run(run_name=f"{symbol}_{timeframe}"):
        # Loggear parámetros
        mlflow.log_params({
            "symbol": symbol,
            "timeframe": timeframe,
            "episodes": episodes,
            "learning_rate": 0.0003,
            "gamma": 0.99,
        })
        
        # Crear entorno
        env = create_env(symbol=symbol, timeframe=timeframe)
        
        # Entrenar modelo
        model = PPO("MlpPolicy", env, verbose=1)
        model.learn(total_timesteps=episodes)
        
        # Evaluar
        eval_reward = evaluate_model(model, env)
        
        # Guardar métricas
        mlflow.log_metrics({
            "eval_reward": eval_reward,
            "win_rate": calculate_win_rate(env),
            "max_drawdown": calculate_max_drawdown(env),
        })
        
        # Guardar modelo
        mlflow.sklearn.log_model(model, "model")
        
        # Registrar modelo
        mlflow.register_model(
            f"runs:/{mlflow.active_run().info.run_id}/model",
            f"{symbol}_trading_model"
        )
        
        return model

def evaluate_model(model, env, episodes: int = 100):
    """Evaluar modelo"""
    total_reward = 0
    
    for episode in range(episodes):
        obs = env.reset()
        done = False
        
        while not done:
            action, _ = model.predict(obs)
            obs, reward, done, info = env.step(action)
            total_reward += reward
    
    return total_reward / episodes

# Uso
model = train_model("BTC/USDT", "1h", episodes=5000)
```

### 🔄 Pipelines de Datos (Airflow)
```python
# dags/data_pipeline.py
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'crypto-ai',
    'depends_on_past': False,
    'retries': 3,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    'crypto_data_pipeline',
    default_args=default_args,
    schedule_interval='@hourly',
    start_date=datetime(2025, 1, 1),
) as dag:
    
    fetch_market_data = PythonOperator(
        task_id='fetch_market_data',
        python_callable=lambda: fetch_data(),
    )
    
    calculate_indicators = PythonOperator(
        task_id='calculate_indicators',
        python_callable=lambda: calculate_ta_indicators(),
    )
    
    store_features = PythonOperator(
        task_id='store_features',
        python_callable=lambda: store_to_timeseries(),
    )
    
    trigger_training = PythonOperator(
        task_id='trigger_training',
        python_callable=lambda: trigger_model_training(),
    )
    
    fetch_market_data >> calculate_indicators >> store_features >> trigger_training
```

### 🎯 Model Registry
```python
# ml/registry.py
from mlflow.tracking import MlflowClient

client = MlflowClient()

def promote_model(model_name: str, stage: str):
    """Promover modelo a producción"""
    
    # Obtener última versión
    latest_version = client.get_latest_versions(model_name, stages=["Staging"])[0]
    
    # Archivar versión actual de Production
    for model in client.get_latest_versions(model_name, stages=["Production"]):
        client.transition_model_version_stage(
            name=model_name,
            version=model.version,
            stage="Archived"
        )
    
    # Promover nueva versión
    client.transition_model_version_stage(
        name=model_name,
        version=latest_version.version,
        stage=stage
    )
    
    print(f"✅ Model {model_name} v{latest_version.version} promoted to {stage}")
```

### 📊 Feature Store
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **Feast** | Feature Store | Apache 2.0 | ⭐ Estándar open source |
| **Tecton** | Feature Store | Proprietary | Enterprise |

**Recomendación**: Feast

```python
# features/feast_repo.py
from feast import Feature, FeatureView, FileSource
from feast.field import Field
from datetime import timedelta
from schema import Schema

# Definir fuentes de datos
market_data_source = FileSource(
    path="s3://crypto-ai-data/market_data/*.parquet",
    timestamp_field="timestamp",
    created_timestamp_column="created_at",
)

# Definir features
market_features = FeatureView(
    name="market_features",
    entities=["symbol"],
    ttl=timedelta(hours=1),
    features=[
        Field(name="rsi_14", dtype=Schema.FLOAT),
        Field(name="macd", dtype=Schema.FLOAT),
        Field(name="macd_signal", dtype=Schema.FLOAT),
        Field(name="bb_upper", dtype=Schema.FLOAT),
        Field(name="bb_lower", dtype=Schema.FLOAT),
        Field(name="volume_ratio", dtype=Schema.FLOAT),
    ],
    online=True,
    batch_source=market_data_source,
)
```

---

# 4️⃣ FRONTEND / PANEL DE CONTROL (SaaS)

## Estado Actual
- Dashboards Grafana básicos
- Sin panel multiusuario
- Sin gestión de usuarios

## Mejoras Propuestas

### 🖥️ Panel de Control Moderno
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **Refine** | React Framework | MIT | ⭐ CRUD rápido, +20 providers |
| **React Admin** | React Framework | MIT | Admin dashboard, Material UI |
| **Retool** | Low-code | Proprietary | Freemium |
| **Appsmith** | Low-code | Apache 2.0 | ⭐ Open source, visual |

**Recomendación**: Refine (100% open source, muy flexible)

```tsx
// frontend/src/App.tsx
import { Refine, AuthProvider } from "@refinedev/core";
import { useHistory } from "react-router-dom";
import { RefineKbarProvider } from "@refinedev/kbar";
import { 
  GitHubBanner, 
  LegacyAuthProvider,
  ThemedLayoutV2,
  ErrorComponent,
} from "@refinedev/antd";
import { AntdProvider, notificationProvider } from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";

import { Dashboard } from "./pages/dashboard";
import { Trades } from "./pages/trades";
import { Strategies } from "./pages/strategies";
import { Settings } from "./pages/settings";
import { Login } from "./pages/login";
import { API_URL, COGNITO_API_URL } from "./utility";

function App() {
  const history = useHistory();

  const authProvider: AuthProvider = {
    login: async ({ username, password }) => {
      // Implementar login
      return Promise.resolve();
    },
    logout: async () => {
      history.push("/login");
      return Promise.resolve();
    },
    checkError: async (error) => {},
    checkAuth: async () => {},
    getPermissions: async () => {},
    getUserIdentity: async () => {},
  };

  return (
    <Refine
      authProvider={authProvider}
      dataProvider={dataProvider}
      routerProvider={routerProvider}
      notificationProvider={notificationProvider}
      resources={[
        {
          name: "dashboard",
          list: "/",
          meta: { label: "Dashboard", icon: "Dashboard" },
        },
        {
          name: "trades",
          list: "/trades",
          create: "/trades/create",
          edit: "/trades/edit/:id",
          show: "/trades/show/:id",
        },
        {
          name: "strategies",
          list: "/strategies",
          create: "/strategies/create",
        },
        {
          name: "settings",
          list: "/settings",
        },
      ]}
    >
      {/* Components */}
    </Refine>
  );
}
```

### 📊 Dashboard Componente
```tsx
// frontend/src/pages/dashboard/index.tsx
import { useSimpleList, useOne } from "@refinedev/core";
import { Card, Row, Col, Statistic, Table, Tag } from "antd";

export const Dashboard = () => {
  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Balance Total"
              value={11293.00}
              prefix="$"
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="P&L Hoy"
              value={+234.50}
              prefix="$"
              valueStyle={{ color: "#3f8600" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Win Rate"
              value={68.5}
              suffix="%"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Posiciones Activas"
              value={3}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card title="Últimos Trades">
            <Table
              dataSource={recentTrades}
              columns={[
                { title: "Fecha", dataIndex: "date", key: "date" },
                { title: "Par", dataIndex: "symbol", key: "symbol" },
                { 
                  title: "Acción", 
                  dataIndex: "action", 
                  key: "action",
                  render: (action) => (
                    <Tag color={action === "buy" ? "green" : "red"}>
                      {action.toUpperCase()}
                    </Tag>
                  )
                },
                { title: "Cantidad", dataIndex: "amount", key: "amount" },
                { title: "Precio", dataIndex: "price", key: "price" },
                { 
                  title: "P&L", 
                  dataIndex: "pnl", 
                  key: "pnl",
                  render: (pnl) => (
                    <span style={{ color: pnl >= 0 ? "#3f8600" : "#cf1322" }}>
                      {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                    </span>
                  )
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Distribución de Portafolio">
            {/* Pie chart */}
          </Card>
        </Col>
      </Row>
    </div>
  );
};
```

### 👥 Autenticación Multiusuario
| Herramienta | Tipo | Licencia | Ventajas |
|------------|------|----------|----------|
| **Supabase Auth** | Auth + DB | Apache 2.0 | ⭐ Rápido, scalable |
| **Auth0** | Auth | Proprietary | Freemium |
| **Keycloak** | Auth | Apache 2.0 | Enterprise |

**Recomendación**: Supabase (auth + DB)

```tsx
// frontend/src/auth-provider.ts
import { AuthProvider } from "@refinedev/core";
import { SupabaseClient } from "./supabase";

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    const { data, error } = await SupabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return Promise.reject(error);
    }

    return Promise.resolve();
  },

  register: async ({ email, password }) => {
    const { data, error } = await SupabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) {
      return Promise.reject(error);
    }

    return Promise.resolve();
  },

  logout: async () => {
    const { error } = await SupabaseClient.auth.signOut();

    if (error) {
      return Promise.reject(error);
    }

    return Promise.resolve("/");
  },

  check: async () => {
    const { data: { session } } = await SupabaseClient.auth.getSession();

    if (session) {
      return Promise.resolve();
    }

    return Promise.reject();
  },

  getPermissions: async () => {
    const { data: { user } } = await SupabaseClient.auth.getUser();

    if (user) {
      return Promise.resolve(user.role);
    }

    return Promise.resolve();
  },
};
```

---

# 📅 ROADMAP DE IMPLEMENTACIÓN

## Fase 1: Backend & API (Semanas 1-4)
```
Semana 1-2: Configurar Traefik + API Gateway
Semana 3:   Implementar FastAPI endpoints
Semana 4:   Integrar RabbitMQ + TimescaleDB
```

## Fase 2: Infraestructura (Semanas 5-8)
```
Semana 5-6: Configurar K3s cluster
Semana 7:   Ansible playbooks deployment
Semana 8:   Vault secrets management
```

## Fase 3: ML/Pipelines (Semanas 9-12)
```
Semana 9-10: MLflow setup + experiment tracking
Semana 11:  Airflow data pipelines
Semana 12:  Feature store + model registry
```

## Fase 4: Frontend SaaS (Semanas 13-16)
```
Semana 13-14: Refine dashboard
Semana 15:   Multi-user auth + roles
Semana 16:   Deploy production
```

---

# 💰 PRESUPUESTO ESTIMADO (MEJORADO)

| Área | Componente | Costo VPS/Mes |
|------|-----------|---------------|
| **Backend** | API Server (2GB RAM) | $10 |
| **Infra** | K3s Cluster (4GB RAM) | $20 |
| **ML** | MLflow + Training (4GB RAM) | $20 |
| **Frontend** | Refine App (1GB RAM) | $5 |
| **DB** | TimescaleDB + Redis | $15 |
| **Total** | | **~$70/mes** |

---

# ✅ HERRAMIENTAS LIBRES SELECCIONADAS

| Categoría | Herramienta | why |
|----------|------------|-----|
| API Gateway | **Traefik** | Ligero, auto-SSL |
| REST API | **FastAPI** | Rápido, OpenAPI built-in |
| Message Queue | **RabbitMQ** | Robusto, features |
| Time-series DB | **TimescaleDB** | Optimizado financieros |
| K8s | **K3s** | 40% menos recursos |
| IaC | **Terraform + Ansible** | Estándar industry |
| MLOps | **MLflow** | 100% open source |
| Orchestration | **Airflow** | Enterprise grade |
| Feature Store | **Feast** | Estándar open source |
| Frontend | **Refine** | +20 providers, MIT |
| Auth | **Supabase** | Auth + DB + Realtime |

---

¿Te gustaría que implemente alguna de estas mejoras en el repositorio?