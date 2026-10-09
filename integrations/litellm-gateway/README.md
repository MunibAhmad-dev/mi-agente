# 🌐 LiteLLM Gateway - Enrutamiento Inteligente de Modelos IA

<p align="center">
  <img src="https://img.shields.io/badge/LiteLLM-v1.0-blue.svg" alt="LiteLLM">
  <img src="https://img.shields.io/badge/Providers-18+-green.svg" alt="Providers">
  <img src="https://img.shields.io/badge/License-MIT-orange.svg" alt="License">
</p>

Gateway centralizado para gestión de modelos LLM con **balanceo de carga**, **fallbacks automáticos**, **enrutamiento por roles** y **métricas**.

---

## 📋 Tabla de Contenidos

1. [Descripción](#-descripción)
2. [Arquitectura](#-arquitectura)
3. [Proveedores Soportados](#-proveedores-soportados)
4. [Enrutamiento por Roles](#-enrutamiento-por-roles)
5. [Instalación](#-instalación)
6. [Configuración](#-configuración)
7. [Uso](#-uso)
8. [API Reference](#-api-reference)
9. [Monitoring](#-monitoring)
10. [Troubleshooting](#-troubleshooting)

---

## 📖 Descripción

**LiteLLM Gateway** es un proxy que unifica el acceso a múltiples proveedores de modelos de lenguaje (LLM), proporcionando:

- 🔄 **Un endpoint** para todos los proveedores
- ⚖️ **Balanceo de carga** inteligente
- 🔁 **Fallbacks automáticos** cuando un proveedor falla
- 🎯 **Enrutamiento por roles** (chat, coding, vision, etc.)
- 📊 **Métricas y logging** centralizado
- 🚦 **Rate limiting** configurable
- 🔒 **Gestión de claves** centralizada

### Beneficios

| Beneficio | Descripción |
|-----------|-------------|
| **Simplicidad** | Un solo endpoint para tu aplicación |
| **Confiabilidad** | Fallbacks automáticos si un proveedor falla |
| **Optimización** | Routing basado en latencia o costo |
| **Observabilidad** | Logs y métricas centralizadas |
| **Flexibilidad** | 18+ proveedores disponibles |

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      LITE LLM GATEWAY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     CLIENT APPLICATION                    │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│                             │ http://localhost:4000/v1/chat     │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     LITE LLM PROXY                        │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────┐ │   │
│  │  │  Router        │  │  Rate Limiter │  │  Health    │ │   │
│  │  │  (latency-based)│  │  (60 req/min)  │  │  Check     │ │   │
│  │  └───────┬────────┘  └────────────────┘  └────────────┘ │   │
│  │          │                                                │   │
│  │  ┌───────┴───────────────────────────────────────────┐  │   │
│  │  │              MODEL SELECTION                       │  │   │
│  │  │   chat → gpt-4o / claude-3.5-sonnet / gemini    │  │   │
│  │  │   coding → claude-3.5-opus / deepseek-coder      │  │   │
│  │  │   fast → gpt-4o-mini / llama-3.1-8b              │  │   │
│  │  └───────────────────────┬───────────────────────────┘  │   │
│  └──────────────────────────┼──────────────────────────────┘   │
│                             │                                    │
│     ┌───────────────────────┼───────────────────────┐          │
│     │                       │                       │           │
│     ▼                       ▼                       ▼           │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐     │
│  │ OpenAI   │          │Anthropic │          │ Google   │     │
│  │ gpt-4o  │          │claude-3.5│          │ gemini-1 │     │
│  └──────────┘          └──────────┘          └──────────┘     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    OBSERVABILITY                          │   │
│  │   PostgreSQL (logs) │ Redis (cache) │ Prometheus        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔗 Proveedores Soportados

### Cloud Providers

| # | Proveedor | Modelos | Estado |
|---|-----------|---------|--------|
| 1 | OpenAI | GPT-4o, o1, GPT-3.5 | ✅ Listo |
| 2 | Anthropic | Claude 3.5, 3 Opus | ✅ Listo |
| 3 | Google | Gemini 1.5, 2.0 | ✅ Listo |
| 4 | Groq | Llama 3.1, Mixtral | ✅ Listo |
| 5 | Mistral | Mistral Large, Small | ✅ Listo |
| 6 | DeepSeek | DeepSeek Chat, Coder | ✅ Listo |
| 7 | Cohere | Command R+ | ✅ Listo |
| 8 | Together AI | Llama 3.1, Mixtral | ✅ Listo |
| 9 | NVIDIA NIM | Llama 3.1 | ✅ Listo |
| 10 | Perplexity | Sonar, Sonar Pro | ✅ Listo |

### Local Providers

| # | Proveedor | Modelos | Estado |
|---|-----------|---------|--------|
| 11 | Ollama | Llama 3, Mistral, CodeLLama | ✅ Listo |
| 12 | LM Studio | Modelos descargados | 🔜 Pendiente |
| 13 | KoboldCPP | Modelos locales | 🔜 Pendiente |

### Total: **18+ Proveedores**

---

## 🎯 Enrutamiento por Roles

### Roles Disponibles

| Rol | Uso | Modelos |
|-----|-----|---------|
| **chat** | Conversación general | gpt-4o, claude-3.5-sonnet, gemini-1.5-pro |
| **coding** | Programación | claude-3.5-opus, deepseek-coder, gpt-4-turbo |
| **vision** | Análisis de imágenes | gpt-4o, claude-3-opus, gemini-1.5-pro |
| **fast** | Respuestas rápidas | gpt-4o-mini, claude-3.5-haiku, llama-3.1-8b |
| **cheap** | Bajo costo | gpt-3.5-turbo, mistral-small, llama-3.1-8b |
| **long-context** | Contextos largos | claude-3.5-sonnet (200K), gemini-1.5-pro (2M) |

### Estrategias de Routing

```yaml
# Configuración de routing
router_settings:
  # Basado en latencia (recomendado)
  routing_strategy: latency-based-routing
  
  # O simple round-robin
  # routing_strategy: simple-round-robin
  
  # O weighted round-robin
  # routing_strategy: weighted-round-robin
```

### Fallbacks Automáticos

```yaml
fallback_config:
  gpt-4o:
    - claude-3.5-sonnet
    - gemini-1.5-pro
  
  claude-3.5-sonnet:
    - gpt-4o
    - gemini-1.5-pro
```

---

## 📥 Instalación

### Requisitos Previos

- 🐳 Docker y Docker Compose
- 🐙 Git
- 💾 4GB RAM mínimo
- 🗄️ 20GB disco

### Pasos de Instalación

#### 1. Clonar y Entrar al Directorio

```bash
cd integrations/litellm-gateway
```

#### 2. Copiar Variables de Entorno

```bash
cp .env.example .env
```

#### 3. Configurar API Keys

Edita `.env` y agrega tus API keys:

```env
LITELLM_MASTER_KEY=sk-tu-clave-master
OPENAI_API_KEY=sk-tu-openai-key
ANTHROPIC_API_KEY=sk-ant-tu-anthropic-key
GOOGLE_API_KEY=tu-google-key
# ... agregar otras keys según necesidad
```

#### 4. Iniciar Servicios

```bash
# Solo LiteLLM (sin monitoring)
docker-compose up -d

# Con Prometheus y Grafana (recomendado)
docker-compose --profile monitoring up -d
```

#### 5. Verificar

```bash
# Health check
curl http://localhost:4000/health

# Probar una solicitud
curl http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-tu-clave-master"
```

---

## ⚙️ Configuración

### Archivo config.yaml

Edita `config.yaml` para:

1. **Agregar/eliminar modelos**
2. **Configurar grupos de routing**
3. **Ajustar fallbacks**
4. **Configurar rate limiting**

### Ejemplo: Agregar un Nuevo Modelo

```yaml
# Agregar después de la sección model_list
- model_name: mi-modelo-custom
  litellm_params:
    model: openai/mi-modelo-custom
    api_key: os.environ/MI_API_KEY
  model_info:
    mode: chat
    context_window: 128000
```

### Ejemplo: Agregar Nuevo Proveedor

```yaml
# En litellm_params usar el formato:
# proveedor/nombre-modelo

- model_name: azure-gpt-4
  litellm_params:
    model: azure/gpt-4-turbo
    api_key: os.environ/AZURE_API_KEY
    api_base: https://tu-resource.openai.azure.com
    api_version: "2024-02-01"
```

---

## 🚀 Uso

### OpenAI-Compatible API

```python
import openai

client = openai.OpenAI(
    api_key="sk-tu-clave-master",
    base_url="http://localhost:4000/v1"
)

# Chat normal
response = client.chat.completions.create(
    model="chat",  # Usa el grupo 'chat'
    messages=[
        {"role": "user", "content": "Hola!"}
    ]
)

# Modelo específico
response = client.chat.completions.create(
    model="gpt-4o",  # Usa GPT-4o directamente
    messages=[
        {"role": "user", "content": "Hola!"}
    ]
)

# Coding
response = client.chat.completions.create(
    model="coding",  # Usa el grupo 'coding'
    messages=[
        {"role": "user", "content": "Escribe una función en Python"}
    ]
)
```

### Con cURL

```bash
# Chat
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-tu-clave-master" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "chat",
    "messages": [{"role": "user", "content": "Hola!"}]
  }'

# Listar modelos
curl http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-tu-clave-master"
```

### Con JavaScript

```javascript
const response = await fetch('http://localhost:4000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk-tu-clave-master',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'chat',
    messages: [
      { role: 'user', content: 'Hola!' }
    ]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

---

## 📚 API Reference

### Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/v1/chat/completions` | Chat completion |
| POST | `/v1/completions` | Text completion |
| POST | `/v1/embeddings` | Embeddings |
| GET | `/v1/models` | Listar modelos |
| GET | `/v1/model/info/{model}` | Info de modelo |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas Prometheus |
| GET | `/key/info` | Info de clave |

### Headers

| Header | Descripción |
|--------|-------------|
| `Authorization` | `Bearer {LITELLM_MASTER_KEY}` |
| `Content-Type` | `application/json` |
| `x-ratelimit-requests-remaining` | Requests restantes |

### Responses

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1710000000,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "¡Hola! ¿Cómo puedo ayudarte?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

---

## 📊 Monitoring

### Prometheus Metrics

Accede a métricas en: `http://localhost:4000/metrics`

```promql
# Métricas disponibles
litellm_requests_total  # Total de requests
litellm_requests_failed_total  # Requests fallidos
litellm_latency_per_request  # Latencia por request
litellm_cost_per_request  # Costo por request

# Ejemplo: Requests por modelo
sum by (model) (litellm_requests_total)

# Ejemplo: Latencia promedio
rate(litellm_latency_per_request[5m])
```

### Grafana Dashboard

Con el profile `monitoring`:

- **Grafana**: http://localhost:3000 (admin/admin123)
- **Prometheus**: http://localhost:9090

Dashboards pre-configurados:
- Overview de requests
- Latencia por modelo
- Costos
- Rate limiting
- Health de proveedores

### Logging

Logs almacenados en PostgreSQL:

```sql
-- Ver últimos requests
SELECT * FROM "LiteLLM"
ORDER BY created_at DESC
LIMIT 100;

-- Requests por usuario
SELECT user_id, COUNT(*) as total_requests,
       SUM(total_tokens) as total_tokens
FROM "LiteLLM"
GROUP BY user_id;
```

---

## 🔧 Troubleshooting

### Problemas Comunes

#### 1. Error: "AuthenticationError"

```bash
# Verificar que la key sea correcta
curl http://localhost:4000/key/info \
  -H "Authorization: Bearer sk-tu-clave-master"
```

#### 2. Error: "RateLimitExceeded"

```yaml
# Aumentar límites en config.yaml
router_settings:
  limits:
    default_limits:
      duration: 60
      requests_allowed: 100  # Aumentar
      tokens_allowed: 200000  # Aumentar
```

#### 3. Error: "ContextWindowExceeded"

```yaml
# Usar modelo con más contexto
model: "long-context"  # Usa claude-3.5-sonnet (200K tokens)
```

#### 4. Health Check Fallando

```bash
# Ver logs
docker logs litellm-gateway

# Reiniciar
docker-compose restart litellm
```

### Verificar Estado de Proveedores

```bash
curl http://localhost:4000/health
# Devuelve estado de cada proveedor
```

### Logs Detallados

```bash
# Ver todos los logs
docker logs -f litellm-gateway

# Ver solo errores
docker logs litellm-gateway | grep ERROR
```

---

## 🔒 Seguridad

### Buenas Prácticas

1. **No exponer clave master**
   - Usar variables de entorno
   - Rotar claves periódicamente

2. **Rate limiting**
   - Configurar límites apropiados
   - Monitorear uso

3. **Validar inputs**
   - No confiar en inputs de usuarios
   - Sanitizar prompts

4. **Auditoría**
   - Revisar logs regularmente
   - Monitorear costos

### Production Checklist

- [ ] Cambiar `LITELLM_MASTER_KEY`
- [ ] Configurar `CORS_ALLOWED_ORIGINS`
- [ ] Habilitar TLS (nginx/caddy proxy)
- [ ] Configurar backups de PostgreSQL
- [ ] Revisar rate limits
- [ ] Habilitar alertas de Slack

---

## 📄 Licencia

**MIT License**

---

## 🙏 Créditos

- **LiteLLM** - https://github.com/BerriAI/litellm
- **LibreChat** - Framework base
- **Comunidad Open Source**

---

<div align="center">
  <strong>Un endpoint. 18+ proveedores. Sin límites.</strong>
  <br>
  <em>Construido para producción con ❤️</em>
</div>
