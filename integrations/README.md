# 🚀 INTEGRACIÓN COMPLETA DEL SISTEMA

Sistema de chat con IA que integra LibreChat, LiteLLM Gateway, y múltiples proveedores de modelos.

---

## 📋 Tabla de Contenidos

1. [Arquitectura](#arquitectura)
2. [Servicios](#servicios)
3. [Inicio Rápido](#inicio-rápido)
4. [Configuración](#configuración)
5. [Verificación](#verificación)
6. [Solución de Problemas](#solución-de-problemas)

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      USUARIO                                 │
│                         │                                   │
│                         ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  LIBRECHAT (3080)                     │  │
│  │   Chat UI + Agentes + Plugins + Actions              │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              LITE LLM GATEWAY (4000)                  │  │
│  │   ┌─────────────────────────────────────────────┐   │  │
│  │   │  ROUTING: chat | coding | fast | vision     │   │  │
│  │   │  FALLBACK: order 1 → 2 → 3                  │   │  │
│  │   │  HEALTH CHECKS: background                   │   │  │
│  │   └─────────────────────────────────────────────┘   │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│     ┌──────────┬──────────┼──────────┬──────────┐            │
│     ▼          ▼          ▼          ▼          ▼            │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐       │
│  │OpenAI│  │Anthro│  │Google│  │ Groq  │  │Mistral│       │
│  │GPT-4 │  │Claude│  │Gemini│  │Llama3 │  │Large │       │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Servicios

| Servicio | Puerto | Descripción | Opcional |
|----------|--------|-------------|----------|
| **LibreChat** | 3080 | Chat UI principal | No |
| **LiteLLM** | 4000 | Proxy de modelos | No |
| **LiteLLM UI** | 4001 | Panel de administración | No |
| **PostgreSQL** | 5432 | Logs y métricas | No |
| **Redis** | 6379 | Cache | No |
| **MongoDB** | 27017 | Datos de chat | No |
| **Free Claude Code** | 3001 | CLI de Claude | Sí |
| **Prometheus** | 9090 | Métricas | Sí |
| **Grafana** | 3000 | Dashboards | Sí |

---

## 🚀 Inicio Rápido

### 1. Clonar y Entrar

```bash
git clone https://github.com/aoi555/mi-libre-chat.git
cd mi-libre-chat/integrations
```

### 2. Configurar API Keys

```bash
# Copiar ejemplo
cp litellm-gateway/.env.example litellm-gateway/.env

# Editar con tus keys
nano litellm-gateway/.env
```

**Contenido mínimo de `.env`:**

```env
# Clave maestra (cambiar!)
LITELLM_MASTER_KEY=sk-super-secreto-12345

# API Keys (al menos una)
OPENAI_API_KEY=sk-tu-openai-key
ANTHROPIC_API_KEY=sk-ant-tu-anthropic-key
GOOGLE_API_KEY=tu-google-key
```

### 3. Iniciar Servicios

```bash
# Servicios básicos (sin monitoring)
docker-compose up -d

# Con monitoring (Prometheus + Grafana)
docker-compose --profile monitoring up -d

# Con Free Claude Code
docker-compose --profile claude-code up -d

# Todo
docker-compose --profile monitoring --profile claude-code up -d
```

### 4. Verificar

```bash
# Ver servicios activos
docker-compose ps

# Test del gateway
curl http://localhost:4000/health

# Ver logs
docker-compose logs -f litellm
```

---

## ⚙️ Configuración

### LibreChat (librechat.yaml)

El archivo `librechat.yaml` ya está configurado para usar LiteLLM Gateway:

```yaml
endpoints:
  custom:
    - name: 'LiteLLM'
      apiKey: '${LITELLM_MASTER_KEY}'
      baseURL: 'http://litellm:4000/v1'
      models:
        default:
          - 'chat'
          - 'coding'
          - 'fast'
          - 'vision'
          - 'cheap'
        fetch: false
```

### Roles de Modelos

| Rol | Uso | Modelos (orden) |
|-----|-----|------------------|
| `chat` | Conversación general | Claude 3.5 Sonnet → GPT-4o → Gemini |
| `coding` | Programación | Claude 3.5 Opus → DeepSeek Coder → GPT-4 |
| `fast` | Respuestas rápidas | Claude 3.5 Haiku → GPT-4o-mini → Llama |
| `vision` | Análisis de imágenes | GPT-4o → Claude 3 Opus → Gemini |
| `cheap` | Bajo costo | GPT-3.5 → Mistral Small → DeepSeek |

---

## ✅ Verificación

### Test Suite Completa

```bash
# Suite de LiteLLM
./litellm-gateway/tests/test_suite.sh

# Suite de Integración
./litellm-gateway/tests/test_librechat_integration.sh
```

### Test Manual

```bash
# Chat básico
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-super-secreto-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "chat",
    "messages": [{"role": "user", "content": "Di solo OK"}],
    "max_tokens": 5
  }'
```

### Endpoints Disponibles

| Endpoint | Descripción |
|----------|-------------|
| `GET /health` | Health check |
| `GET /v1/models` | Modelos disponibles |
| `POST /v1/chat/completions` | Chat completion |
| `GET /metrics` | Métricas Prometheus |
| `GET /ui` | Panel de administración |

---

## 🔧 Solución de Problemas

### LiteLLM no responde

```bash
# Ver logs
docker-compose logs litellm

# Reiniciar
docker-compose restart litellm

# Verificar config
docker exec litellm-gateway cat /app/config.yaml
```

### Modelos no disponibles

```bash
# Ver modelos cargados
curl http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-super-secreto-12345"

# Verificar API keys
docker exec litellm-gateway env | grep API_KEY
```

### LibreChat no conecta

```bash
# Ver logs
docker-compose logs librechat

# Verificar que LiteLLM está corriendo
curl http://localhost:4000/health

# Ver configuración
grep -i litellm librechat.yaml
```

### Puerto en uso

```bash
# Ver qué usa el puerto 4000
lsof -i :4000

# Cambiar puerto en docker-compose.yml si es necesario
```

---

## 📊 URLs de Acceso

| Servicio | URL | Credenciales |
|----------|-----|--------------|
| LibreChat | http://localhost:3080 | - |
| LiteLLM API | http://localhost:4000 | Bearer key |
| LiteLLM UI | http://localhost:4001 | admin/admin123 |
| Grafana | http://localhost:3000 | admin/admin123 |
| Prometheus | http://localhost:9090 | - |

---

## 🧹 Limpiar

```bash
# Detener servicios
docker-compose down

# Detener y eliminar volúmenes (¡CUIDADO!)
docker-compose down -v

# Reconstruir
docker-compose down && docker-compose up -d --build
```

---

## 📚 Documentación Adicional

- [LiteLLM Gateway](litellm-gateway/README.md)
- [ComfyUI Integration](comfyui/README.md)
- [Integración Completa](../docs/INTEGRACION-COMPLETA.md)

> **Nota (Fase 10):** las integraciones `agent-builder`, `browser-use`,
> `claude-code-bridge` y `comfyui-bridge` fueron **eliminadas** (0 referencias
> en el código; sus rutas JS fueron retiradas en las Fases 7/9). Ver
> `../INTEGRATION_REPORT_FASE_10_PROYECTOS_EXTERNOS.md`.

---

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/nueva-caracteristica`)
3. Commit (`git commit -am 'Agrega característica'`)
4. Push (`git push origin feature/nueva-caracteristica`)
5. Pull Request

---

## 📄 Licencia

MIT License

---

<div align="center">
  <strong>🔗 Todo Integrado y Listo</strong>
  <br>
  <em>19 de Julio 2026</em>
</div>
