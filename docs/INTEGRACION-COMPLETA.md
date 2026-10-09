# 🔗 INTEGRACIÓN COMPLETA DEL SISTEMA

**Fecha**: 19 de Julio 2026  
**Versión**: 1.0.0  
**Estado**: ✅ LISTO PARA IMPLEMENTACIÓN

---

## 📋 Tabla de Contenidos

1. [Arquitectura General](#arquitectura-general)
2. [Componentes](#componentes)
3. [Flujo de Datos](#flujo-de-datos)
4. [Proveedores Configurados](#proveedores-configurados)
5. [Instalación](#instalación)
6. [Configuración](#configuración)
7. [Verificación](#verificación)

---

## 🏗️ Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ARQUITECTURA COMPLETA                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         USUARIO / FRONTEND                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │   Chat      │  │   Agents    │  │   Images    │                  │   │
│  │  │   (UI)      │  │   (UI)      │  │   (UI)      │                  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │   │
│  └─────────┼──────────────────┼──────────────────┼───────────────────────┘   │
│            │                  │                  │                            │
│            └──────────────────┼──────────────────┘                            │
│                               ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         LIBRECHAT CORE                                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │   Chat       │  │   Agents     │  │   Actions    │                │   │
│  │  │   Endpoint   │  │   Endpoint   │  │   System     │                │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                │   │
│  └─────────┼──────────────────┼──────────────────┼────────────────────────┘   │
│            │                  │                  │                             │
│  ┌─────────┼──────────────────┼──────────────────┼────────────────────────┐  │
│  │         ▼                  ▼                  ▼                          │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    LITE LLM GATEWAY (Puerto 4000)                 │  │  │
│  │  │  ┌─────────────────────────────────────────────────────────────┐│  │  │
│  │  │  │                    ROUTING LAYER                             ││  │  │
│  │  │  │  • Role-based routing (chat/coding/fast)                      ││  │  │
│  │  │  │  • Health checks (background_health_checks)                   ││  │  │
│  │  │  │  • Fallbacks automáticos (order: 1, 2, 3)                    ││  │  │
│  │  │  │  • Rate limiting                                             ││  │  │
│  │  │  └─────────────────────────────────────────────────────────────┘│  │  │
│  │  │                            │                                       │  │
│  │  │  ┌─────────────────────────┼───────────────────────────────┐     │  │
│  │  │  │                         ▼                                │     │  │
│  │  │  │  ┌──────────────────────────────────────────────────────┐ │     │  │
│  │  │  │  │              PROVIDER LAYER                         │ │     │  │
│  │  │  │  │                                                      │ │     │  │
│  │  │  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │ │     │  │
│  │  │  │  │  │OpenAI    │  │Anthropic │  │ Google   │        │ │     │  │
│  │  │  │  │  │gpt-4o    │  │claude-3.5│  │gemini-1.5│       │ │     │  │
│  │  │  │  │  │order:2   │  │order:1   │  │order:3   │        │ │     │  │
│  │  │  │  │  └──────────┘  └──────────┘  └──────────┘        │ │     │  │
│  │  │  │  │                                                      │ │     │  │
│  │  │  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │ │     │  │
│  │  │  │  │  │ Groq     │  │ Mistral  │  │ DeepSeek │        │ │     │  │
│  │  │  │  │  │llama-3.1 │  │mistral-L │  │deepseek- │        │ │     │  │
│  │  │  │  │  │order:4   │  │order:5   │  │order:6   │        │ │     │  │
│  │  │  │  │  └──────────┘  └──────────┘  └──────────┘        │ │     │  │
│  │  │  │  └──────────────────────────────────────────────────────┘ │     │  │
│  │  │  └─────────────────────────────────────────────────────────────┘     │  │
│  │  │                            │                                       │  │
│  │  │  ┌─────────────────────────┼───────────────────────────────┐         │  │
│  │  │  │                         ▼                                │         │  │
│  │  │  │  ┌──────────────────────────────────────────────────────┐│         │  │
│  │  │  │  │              OBSERVABILITY                           ││         │  │
│  │  │  │  │  • PostgreSQL (logs)   • Redis (cache)               ││         │  │
│  │  │  │  │  • Prometheus metrics  • Health checks                ││         │  │
│  │  │  │  └──────────────────────────────────────────────────────┘│         │  │
│  │  │  └─────────────────────────────────────────────────────────────┘     │  │
│  │  └────────────────────────────────────────────────────────────────────┘   │
│  │                                                                              │
│  └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────────┐   │
│  │                    FREE CLAUDE CODE / AI-OS (Puerto 3001)                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │   │
│  │  │   Claude     │  │   MCP        │  │   Skills     │                   │   │
│  │  │   Code       │  │   Servers    │  │   System     │                   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │   │
│  └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────────┐   │
│  │                         COMFYUI (Puerto 8188)                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │   │
│  │  │   Text2Img   │  │   Img2Img    │  │   Video     │                   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │   │
│  └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Componentes

### 1. LibreChat (Puerto 3080)
**Propósito**: Chat UI principal con agentes

**Endpoints**:
- `/api/chat/completions` - Chat principal
- `/api/agents/*` - Sistema de agentes
- `/api/plugins/*` - Plugins system

**Dependencias**:
- MongoDB
- Redis
- LiteLLM Gateway

### 2. LiteLLM Gateway (Puerto 4000)
**Propósito**: Proxy unificado para todos los proveedores LLM

**Roles Configurados**:
| Rol | Modelos | Orden |
|-----|---------|-------|
| `chat` | claude-3.5-sonnet, gpt-4o, gemini-1.5-pro | 1, 2, 3 |
| `coding` | claude-3.5-opus, deepseek-coder, gpt-4-turbo | 1, 2, 3 |
| `fast` | claude-3.5-haiku, gpt-4o-mini, llama-3.1-8b | 1, 2, 3 |
| `vision` | gpt-4o, claude-3-opus, gemini-1.5-pro | 1, 2, 3 |
| `cheap` | gpt-3.5-turbo, mistral-small, deepseek-chat | 1, 2, 3 |

### 3. Free Claude Code (Puerto 3001)
**Propósito**: Claude CLI local con herramientas

**Características**:
- Claude Code CLI
- MCP Servers
- Skills system
- Sandbox execution

### 4. ComfyUI (Puerto 8188)
**Propósito**: Generación de imágenes/vídeo

**Modelos Soportados**:
- Stable Diffusion XL
- SDXL Turbo
- SVD (Video)
- ControlNet
- LoRAs

---

## 🔄 Flujo de Datos

### Chat Normal
```
Usuario → LibreChat → LiteLLM Gateway → Anthropic (Claude) → Respuesta
                                              ↓ (fallback)
                                         OpenAI (GPT-4)
```

### Coding Task
```
Usuario → LibreChat → LiteLLM Gateway → Claude 3.5 Opus → Código
                                              ↓ (fallback)
                                         DeepSeek Coder
```

### Image Generation
```
Usuario → LibreChat → ComfyUI API → Stable Diffusion → Imagen
```

### Claude Code Task
```
Usuario → LibreChat → Free Claude Code → Claude CLI → Resultado
```

---

## 🔗 Proveedores Configurados

### Con API Keys

| # | Proveedor | Modelos | Puerto | Auth |
|---|-----------|---------|--------|------|
| 1 | **Anthropic** | claude-3.5-sonnet, claude-3.5-haiku, claude-3-opus | 4000 | ✅ |
| 2 | **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo | 4000 | ✅ |
| 3 | **Google** | gemini-1.5-pro, gemini-2.0-flash | 4000 | ✅ |
| 4 | **Groq** | llama-3.1-70b, llama-3.1-8b, mixtral-8x7b | 4000 | ✅ |
| 5 | **Mistral** | mistral-large, mistral-small | 4000 | ✅ |
| 6 | **DeepSeek** | deepseek-chat, deepseek-coder | 4000 | ✅ |
| 7 | **Cohere** | command-r-plus, command-r | 4000 | ✅ |
| 8 | **Together AI** | meta-llama-3.1-70b | 4000 | ✅ |
| 9 | **NVIDIA NIM** | llama-3.1-nemotron | 4000 | ✅ |
| 10 | **Perplexity** | sonar, sonar-pro | 4000 | ✅ |

### Locales

| # | Proveedor | Modelos | Puerto | Auth |
|---|-----------|---------|--------|------|
| 11 | **Ollama** | llama-3.2, mistral, codellama | 11434 | ❌ |
| 12 | **LM Studio** | Modelos descargados | 1234 | ❌ |
| 13 | **ComfyUI** | SDXL, SVD | 8188 | ❌ |

### Sin Servidor (CLI)

| # | Proveedor | Descripción | Puerto |
|---|-----------|-------------|--------|
| 14 | **Free Claude Code** | Claude CLI local | 3001 |

---

## 📥 Instalación

### Opción 1: Docker Compose (Recomendado)

```bash
# Clonar el repositorio
git clone https://github.com/aoi555/mi-libre-chat.git
cd mi-libre-chat

# Ir a la carpeta de integración
cd integrations/litellm-gateway

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus API keys
nano .env

# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f
```

### Opción 2: Manual

```bash
# 1. LiteLLM Gateway
pip install 'litellm[proxy]'
litellm --config integrations/litellm-gateway/config.yaml --port 4000

# 2. LibreChat (en otra terminal)
cd mi-libre-chat
npm install
npm run start

# 3. Free Claude Code (opcional)
cd integrations/free-claude-code
./scripts/install.sh
./scripts/start.sh
```

---

## ⚙️ Configuración

### 1. Variables de Entorno (.env)

```env
# ===============================
# LITE LLM MASTER KEY
# ===============================
LITELLM_MASTER_KEY=sk-tu-clave-secreta-aqui

# ===============================
# OPENAI
# ===============================
OPENAI_API_KEY=sk-tu-openai-key

# ===============================
# ANTHROPIC (Claude)
# ===============================
ANTHROPIC_API_KEY=sk-ant-tu-anthropic-key

# ===============================
# GOOGLE (Gemini)
# ===============================
GOOGLE_API_KEY=tu-google-api-key

# ===============================
# GROQ (Gratis, rápido)
# ===============================
GROQ_API_KEY=gsk_tu-groq-key

# ===============================
# MISTRAL
# ===============================
MISTRAL_API_KEY=tu-mistral-key

# ===============================
# DEEPSEEK (Económico)
# ===============================
DEEPSEEK_API_KEY=sk-tu-deepseek-key

# ===============================
# OLLAMA (Local)
# ===============================
OLLAMA_BASE_URL=http://localhost:11434
```

### 2. LibreChat (librechat.yaml)

```yaml
# Apuntar al LiteLLM Gateway
endpoints:
  custom:
    - name: 'LiteLLM'
      apiKey: '${LITELLM_MASTER_KEY}'
      baseURL: 'http://localhost:4000/v1'
      models:
        default:
          - 'chat'
          - 'coding'
          - 'fast'
          - 'vision'
          - 'cheap'
        fetch: false
      titleConvo: true
      modelDisplayLabel: 'LiteLLM'
```

### 3. Free Claude Code

```env
# En integrations/free-claude-code/.env
ANTHROPIC_API_KEY=sk-ant-tu-anthropic-key
FREE_CLAUDE_CODE_PORT=3001
```

---

## ✅ Verificación

### Test 1: Health Checks

```bash
# LiteLLM Gateway
curl http://localhost:4000/health

# LibreChat
curl http://localhost:3080/api/health

# Free Claude Code
curl http://localhost:3001/health
```

### Test 2: LiteLLM Suite

```bash
cd integrations/litellm-gateway
./tests/test_suite.sh
```

### Test 3: Integración LibreChat

```bash
cd integrations/litellm-gateway
./tests/test_librechat_integration.sh
```

### Test 4: Chat Directo

```bash
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-tu-clave-secreta-aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "chat",
    "messages": [{"role": "user", "content": "Di solo OK"}],
    "max_tokens": 5
  }'
```

---

## 📊 Dashboard

### LiteLLM UI
- URL: http://localhost:4001
- User: admin
- Pass: (ver .env LITELLM_UI_PASSWORD)

### Prometheus (Métricas)
- URL: http://localhost:9090

### Grafana (Dashboards)
- URL: http://localhost:3000
- User: admin
- Pass: admin

---

## 🔒 Seguridad

### Checklist de Producción

- [ ] Cambiar `LITELLM_MASTER_KEY` por una clave segura
- [ ] Configurar CORS_ORIGINS específicos
- [ ] Habilitar TLS/HTTPS
- [ ] Configurar rate limits apropiados
- [ ] Habilitar logging de auditoría
- [ ] Configurar backups de PostgreSQL
- [ ] Revisar permisos de archivos

### Variables Sensibles

| Variable | Descripción | Importancia |
|----------|-------------|-------------|
| `LITELLM_MASTER_KEY` | Clave maestra del gateway | 🔴 Crítica |
| `ANTHROPIC_API_KEY` | Acceso a Claude | 🔴 Crítica |
| `OPENAI_API_KEY` | Acceso a GPT-4 | 🔴 Crítica |
| `GOOGLE_API_KEY` | Acceso a Gemini | 🟡 Alta |

---

## 📞 Troubleshooting

### LiteLLM no responde

```bash
# Ver logs
docker logs litellm-gateway

# Verificar que el puerto está abierto
netstat -tlnp | grep 4000

# Reiniciar
docker-compose restart litellm
```

### Modelos no disponibles

```bash
# Ver modelos disponibles
curl http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-tu-clave"

# Verificar API key
docker exec litellm-gateway env | grep API_KEY
```

### LibreChat no conecta

```bash
# Ver logs de LibreChat
docker logs librechat

# Verificar URL del gateway
grep -i litellm librechat.yaml
```

---

## 📄 Licencia

MIT License

---

<div align="center">
  <strong>🔗 Sistema Integrado y Listo para Producción</strong>
  <br>
  <em>19 de Julio 2026</em>
</div>
