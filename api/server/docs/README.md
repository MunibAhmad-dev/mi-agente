# 📚 Documentación API - Mi LibreChat Enterprise

## Visión General

Mi LibreChat proporciona una API REST completa para la integración y gestión del sistema enterprise. La documentación está disponible en múltiples formatos.

## 📖 Formatos de Documentación

### 1. Swagger UI (Interactivo)
**URL:** `http://localhost:3001/api/docs`

Interfaz web interactiva para:
- Explorar todos los endpoints
- Probar requests directamente
- Ver ejemplos de respuestas
- Autenticación integrada

### 2. ReDoc (Legible)
**URL:** `http://localhost:3001/api/docs/redoc`

Documentación elegante y responsive, ideal para:
- Lectura y comprensión
- Documentación de referencia
- Compartir con equipos

### 3. RapiDoc (Moderno)
**URL:** `http://localhost:3001/api/docs/rapidoc`

Interfaz moderna con:
- Diseño compacto
- Búsqueda rápida
- Tema claro/oscuro

## 📥 Exportaciones

### Postman Collection
**URL:** `http://localhost:3001/api/docs/postman`

Descarga una colección de Postman con todos los endpoints para importar en:
- Postman
- Insomnia
- Bruno

### OpenAPI Spec
**URL:** `http://localhost:3001/api/docs/spec` (JSON)
**URL:** `http://localhost:3001/api/docs/spec.yaml` (YAML)

## 🔌 Endpoints Principales

| Categoría | Prefijo | Descripción |
|-----------|---------|-------------|
| **Health** | `/api/health` | Estado del sistema |
| **System** | `/api/system` | Información del sistema |
| **Runtimes** | `/api/runtimes` | Gestión de runtimes |
| **Metrics** | `/api/metrics` | Métricas Prometheus |
| **Telemetry** | `/api/telemetry` | Logs, alerts, traces |
| **Capabilities** | `/api/capabilities` | Capacidades del sistema |
| **Workflows** | `/api/workflows` | Flujos de trabajo |
| **API Keys** | `/api/apikeys` | Gestión de claves |
| **Cache** | `/api/cache` | Sistema de caché |
| **Rate Limits** | `/api/ratelimit` | Control de límites |

## 🚀 Uso Rápido

### Health Check
```bash
curl http://localhost:3001/api/health
```

### Obtener Métricas
```bash
curl http://localhost:3001/api/metrics/summary
```

### Ver Logs
```bash
curl "http://localhost:3001/api/telemetry/logs?limit=50"
```

### Exportar Prometheus
```bash
curl "http://localhost:3001/api/metrics?format=prometheus"
```

## 📊 Estructura del OpenAPI Spec

```yaml
openapi: 3.0.3
info:
  title: Mi LibreChat Enterprise API
  version: 3.0.0
servers:
  - url: http://localhost:3001
paths:
  /api/health:
    get:
      summary: Health check del sistema
```

## 🔒 Autenticación

La API soporta autenticación Bearer Token. Para endpoints protegidos:

```bash
curl -H "Authorization: Bearer <token>" \
     http://localhost:3001/api/user
```

## 📝 Tipos de Datos

### HealthStatus
```json
{
  "status": "healthy",
  "timestamp": 1719000000000,
  "uptime": 3600,
  "version": "3.0.0"
}
```

### Metric
```json
{
  "name": "requests_total",
  "type": "counter",
  "value": 1234,
  "labels": { "status": "success" }
}
```

### Alert
```json
{
  "id": "alert_123",
  "type": "rate_limit",
  "message": "Rate limit exceeded",
  "severity": "warning",
  "status": "active"
}
```

## 🛠️ Herramientas Recomendadas

| Herramienta | Uso |
|-------------|-----|
| **Postman** | Testing completo de API |
| **Insomnia** | Alternativa a Postman |
| **Bruno** | API client moderno |
| **HTTPie** | Cliente CLI |
| **curl** | Requests rápidos |
| **Swagger Editor** | Editar spec online |

## 📞 Soporte

Para reportar errores o solicitar features en la API:
- GitHub Issues: https://github.com/aoi555/mi-libre-chat
- Documentación: https://github.com/aoi555/mi-libre-chat#readme
