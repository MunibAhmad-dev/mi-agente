# 🚀 Deployment Guide

Guía completa para desplegar Mi LibreChat en diferentes entornos.

## 📁 Estructura

```
deploy/
├── docker/           ✅ Docker configurations
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   └── nginx.conf
├── kubernetes/       ✅ Kubernetes manifests
│   ├── namespace.yaml
│   └── deployment.yaml
└── scripts/         ✅ Deployment scripts
    ├── deploy.sh
    └── setup.sh
```

---

## 🐳 Docker Deployment

### Requisitos

- Docker 20.10+
- Docker Compose 2.0+

### Quick Start

```bash
# 1. Ir al directorio de deployment
cd deploy/docker

# 2. Configurar variables de entorno
cp .env.example .env
nano .env

# 3. Iniciar containers
docker-compose up -d

# 4. Verificar estado
docker-compose ps
```

### URLs

| Servicio | URL |
|----------|-----|
| API | http://localhost:3001 |
| Frontend | http://localhost:5173 |
| API Docs | http://localhost:3001/api/docs |
| MongoDB | mongodb://localhost:27017 |
| Redis | redis://localhost:6379 |

### Comandos Docker

```bash
# Iniciar
docker-compose up -d

# Detener
docker-compose down

# Ver logs
docker-compose logs -f

# Rebuild
docker-compose up -d --build

# Limpiar
docker-compose down -v
```

---

## �.kubernetes Deployment

### Requisitos

- Kubernetes 1.25+
- kubectl configurado
- Helm 3+ (opcional)

### Quick Start

```bash
# 1. Aplicar manifiestos
kubectl apply -f deploy/kubernetes/namespace.yaml
kubectl apply -f deploy/kubernetes/deployment.yaml

# 2. Verificar pods
kubectl get pods -n librechat

# 3. Ver servicios
kubectl get svc -n librechat
```

### Escalar

```bash
# Escalar API
kubectl scale deployment librechat-api -n librechat --replicas=5

# HPA (Horizontal Pod Autoscaler)
kubectl autoscale deployment librechat-api -n librechat \
    --cpu-percent=70 \
    --min=2 \
    --max=10
```

---

## 📜 Scripts de Deployment

### deploy.sh

Script универсальный para deployment:

```bash
# Docker
./deploy/scripts/deploy.sh docker
./deploy/scripts/deploy.sh docker:dev

# Kubernetes
./deploy/scripts/deploy.sh k8s
./deploy/scripts/deploy.sh k8s:status

# Utilidades
./deploy/scripts/deploy.sh status
./deploy/scripts/deploy.sh cleanup
```

### setup.sh

Script de configuración inicial:

```bash
./deploy/scripts/setup.sh
```

---

## 🔧 Configuración

### Variables de Entorno

| Variable | Descripción | Requerido |
|----------|-------------|-----------|
| `MONGO_URI` | URI de MongoDB | ✅ |
| `REDIS_URL` | URL de Redis | ✅ |
| `JWT_SECRET` | Secret para JWT (min 32 chars) | ✅ |
| `CREDS_KEY` | Key de encriptación (32 chars) | ✅ |
| `CREDS_IV` | IV de encriptación (16 chars) | ✅ |
| `OPENAI_API_KEY` | API key de OpenAI | Opcional |
| `ANTHROPIC_API_KEY` | API key de Anthropic | Opcional |

### Puerto y Dominio

Para cambiar el puerto o dominio, modificar:

**Docker:** `docker-compose.yml`
**Kubernetes:** `deployment.yaml`
**Nginx:** `nginx.conf`

---

## 🔒 Producción Checklist

- [ ] Cambiar todas las passwords por defecto
- [ ] Configurar SSL/TLS
- [ ] Habilitar firewall
- [ ] Configurar backups de MongoDB
- [ ] Revisar rate limits
- [ ] Configurar logs centralizados
- [ ] Habilitar métricas Prometheus
- [ ] Revisar límites de recursos

---

## 📊 Monitoreo

### Endpoints de Health

```bash
# Health check
curl http://localhost:3001/api/health

# Métricas Prometheus
curl http://localhost:3001/metrics

# Dashboard metrics
curl http://localhost:3001/api/metrics/dashboard
```

### Logs

```bash
# Docker
docker-compose logs -f api

# Kubernetes
kubectl logs -n librechat -l app=librechat-api -f
```

---

## 🔄 Actualización

### Docker

```bash
# Pull nueva imagen
docker-compose pull

# Restart con nueva versión
docker-compose up -d

# Backup antes de actualizar
docker-compose exec mongodb mongodump --archive > backup.archive
```

### Kubernetes

```bash
# Rolling update
kubectl set image deployment/librechat-api api=librechat/api:v3.0.0 -n librechat

# Ver progreso
kubectl rollout status deployment/librechat-api -n librechat
```

---

## 🛡️ Seguridad

### Buenas Prácticas

1. **No exponer puertos innecesarios**
2. **Usar secretos para credenciales**
3. **Configurar network policies**
4. **Habilitar TLS**
5. **Rotar secrets periódicamente**
6. **Usar usuarios no-root en containers**

### Scan de Vulnerabilidades

```bash
# Docker
docker scan librechat/api:latest

# Trivy
trivy image librechat/api:latest
```

---

## 📞 Soporte

Para problemas de deployment:
- GitHub Issues: https://github.com/aoi555/mi-libre-chat
- Documentación: https://github.com/aoi555/mi-libre-chat#readme
