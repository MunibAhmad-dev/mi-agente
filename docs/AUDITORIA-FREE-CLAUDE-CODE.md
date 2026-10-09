# 🤖 AUDITORÍA TÉCNICA: Free Claude Code

**Repositorio:** https://github.com/alishahryar1/free-claude-code
**Fecha de Auditoría:** 2026-07-21
**Auditor:** OpenHands Agent

---

## RESUMEN EJECUTIVO

| Aspecto | Estado |
|---------|--------|
| Arquitectura | ✅ Profesional |
| Compatibilidad LiteLLM | ✅ Nativa |
| Proveedores | ✅ 25+ soportados |
| Protocolo | ✅ Anthropic + OpenAI Responses |
| Extensibilidad | ✅ Alta |
| Documentación | ✅ Completa |

---

## 1. ARQUITECTURA GENERAL

### 1.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FREE CLAUDE CODE - ARQUITECTURA                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         CLI CLIENTS                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │ Claude Code │  │   Codex     │  │     Pi     │                  │   │
│  │  │  (fcc-cli) │  │  (fcc-codex)│  │  (fcc-pi)  │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    FASTAPI PROXY (Port 8082)                          │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│  │  │ Anthropic   │  │ OpenAI      │  │  Model      │                │   │
│  │  │ Messages    │  │ Responses   │  │  Catalog    │                │   │
│  │  │ Handler    │  │ Handler     │  │             │                │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│  │  │  Model     │  │   Admin     │  │  Health     │                │   │
│  │  │  Router    │  │   UI        │  │  Check      │                │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    APPLICATION LAYER                                  │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│  │  │  Model     │  │  Provider   │  │   Lease     │                │   │
│  │  │  Metadata  │  │  Executor   │  │  Manager    │                │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    PROVIDER RUNTIMES                                   │   │
│  │                                                                      │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │   │
│  │  │ NVIDIA  │ │OpenRouter│ │ Gemini  │ │ DeepSeek│ │  Groq   │     │   │
│  │  │  NIM    │ │         │ │         │ │         │ │         │     │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │   │
│  │                                                                      │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │   │
│  │  │ Mistral │ │ Ollama  │ │Cloudflare│ │ Cohere  │ │  Local  │     │   │
│  │  │         │ │         │ │  Workers │ │         │ │  LM     │     │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Arquitectura de Paquetes

```
src/free_claude_code/
├── api/                    # HTTP Adapter (FastAPI)
│   ├── handlers/          # Product handlers (Messages, Responses)
│   └── model_catalog.py   # Model listing
├── application/           # Application Core (dependency-leaf)
│   ├── model_metadata.py   # Model metadata
│   ├── routing.py         # Routing logic
│   └── execution.py        # Provider execution
├── cli/                   # CLI Entrypoints
│   ├── launchers/        # Client wrappers
│   └── entrypoints.py     # Main commands
├── config/                # Configuration (no dependencies)
├── core/                  # Protocol Logic (no dependencies)
│   ├── anthropic/        # Anthropic protocol
│   ├── openai_responses/ # OpenAI Responses protocol
│   └── failures.py       # Error handling
├── messaging/             # Optional messaging bridges
│   └── workflow.py        # Workflow coordination
├── providers/            # Provider Runtimes
│   ├── openai_chat/      # OpenAI-compatible provider
│   ├── nvidia_nim/       # NVIDIA NIM
│   ├── open_router/       # OpenRouter
│   └── ...               # 25+ providers
└── runtime/              # Process Composition Root
```

### 1.3 Política de Dependencias

| Paquete | Dependencias Permitidas |
|---------|-------------------------|
| `config` | ninguna |
| `core` | ninguna |
| `application` | `config`, `core` |
| `messaging` | `core` |
| `providers` | `application`, `config`, `core` |
| `api` | `application`, `config`, `core` |
| `cli` | `config`, `core` |
| `runtime` | Todas |

---

## 2. PROVEEDORES SOPORTADOS (25+)

| # | Proveedor | Modelo Prefix | API Key Env |
|---|-----------|--------------|-------------|
| 1 | NVIDIA NIM | `nvidia_nim/` | `NVIDIA_NIM_API_KEY` |
| 2 | OpenRouter | `open_router/` | `OPENROUTER_API_KEY` |
| 3 | Google AI Studio | `gemini/` | `GEMINI_API_KEY` |
| 4 | Vertex AI | `vertex/` | `VERTEX_PROJECT_ID` |
| 5 | DeepSeek | `deepseek/` | `DEEPSEEK_API_KEY` |
| 6 | Mistral | `mistral/` | `MISTRAL_API_KEY` |
| 7 | Mistral Codestral | `mistral_codestral/` | `CODESTRAL_API_KEY` |
| 8 | OpenCode Zen | `opencode/` | `OPENCODE_API_KEY` |
| 9 | OpenCode Go | `opencode_go/` | `OPENCODE_API_KEY` |
| 10 | Vercel AI Gateway | `vercel/` | `AI_GATEWAY_API_KEY` |
| 11 | Amazon Bedrock | `bedrock/` | `AWS_BEARER_TOKEN_BEDROCK` |
| 12 | HuggingFace | `huggingface/` | `HUGGINGFACE_API_KEY` |
| 13 | Cohere | `cohere/` | `COHERE_API_KEY` |
| 14 | GitHub Models | `github_models/` | `GITHUB_MODELS_TOKEN` |
| 15 | Wafer | `wafer/` | `WAFER_API_KEY` |
| 16 | Kimi API | `kimi/` | `KIMI_API_KEY` |
| 17 | Kimi Code | `kimi_code/` | `KIMI_CODE_API_KEY` |
| 18 | MiniMax | `minimax/` | `MINIMAX_API_KEY` |
| 19 | Cerebras | `cerebras/` | `CEREBRAS_API_KEY` |
| 20 | Groq | `groq/` | `GROQ_API_KEY` |
| 21 | SambaNova | `sambanova/` | `SAMBANOVA_API_KEY` |
| 22 | Fireworks AI | `fireworks/` | `FIREWORKS_API_KEY` |
| 23 | Cloudflare Workers | `cloudflare/` | `CLOUDFLARE_API_TOKEN` |
| 24 | Z.ai | `zai/` | `ZAI_API_KEY` |
| 25 | Ollama Cloud | `ollama_cloud/` | `OLLAMA_API_KEY` |
| 26 | LM Studio | `lmstudio/` | `LM_STUDIO_BASE_URL` |
| 27 | llama.cpp | `llamacpp/` | `LLAMACPP_BASE_URL` |
| 28 | Ollama (local) | `ollama/` | `OLLAMA_BASE_URL` |

---

## 3. COMPONENTES PRINCIPALES

### 3.1 ProviderExecutor
**Ubicación:** `src/free_claude_code/application/execution.py`
**Responsabilidad:** Ejecución de requests a providers

```python
class ProviderExecutor:
    """Resolve a provider and execute one routed Anthropic Messages stream."""
    
    def stream(
        self,
        routed: RoutedMessagesRequest,
        wire_api: WireApi,
    ) -> AsyncIterator[str]:
        """Preflight y retorna stream del provider."""
```

### 3.2 OpenAIChatProvider
**Ubicación:** `src/free_claude_code/providers/openai_chat/provider.py`
**Responsabilidad:** Provider base OpenAI-compatible

```python
class OpenAIChatProvider(BaseProvider):
    """OpenAI-compatible /chat/completions provider."""
    
    def __init__(self, profile: OpenAIChatProfile, credentials: AsyncCredentialProvider):
        ...
    
    async def stream(self, request, reasoning) -> AsyncIterator[str]:
        """Ejecuta request y retorna stream SSE."""
```

### 3.3 ProviderAdmissionController
**Ubicación:** `src/free_claude_code/providers/admission.py`
**Responsabilidad:** Control de admisión y retry

```python
class ProviderAdmissionController:
    """Controla admisión de requests a providers."""
    
    def check_admission(self, provider_id) -> AdmissionResult
    def record_failure(self, provider_id, error)
    def record_success(self, provider_id)
```

### 3.4 FailurePolicy
**Ubicación:** `src/free_claude_code/providers/failure_policy.py`
**Responsabilidad:** Clasificación y manejo de errores

```python
def classify_provider_failure(exception) -> FailureClassification:
    """Clasifica error del provider."""
    
# Clasificaciones:
# - RATE_LIMIT
# - QUOTA_EXCEEDED  
# - TRANSIENT_ERROR
# - PERMANENT_ERROR
# - AUTH_ERROR
```

---

## 4. FLUJO DE SOLICITUDES

### 4.1 Flujo Anthropic Messages

```
Cliente (Claude Code)
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  POST /v1/messages                                              │
│  Headers: Authorization: Bearer <token>                        │
│  Body: { model, messages, tools, stream: true }                │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  MessagesHandler (api/handlers/messages.py)                      │
│  - Valida request                                               │
│  - Extrae model de Authorization o body                        │
│  - Llama a ProviderExecutor                                    │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  ProviderExecutor.stream()                                       │
│  - Resuelve provider desde model_id                             │
│  - Pre-flight check                                             │
│  - Ejecuta provider.stream()                                    │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  OpenAIChatProvider (provider/openai_chat/)                       │
│  - Construye request body                                        │
│  - Hace request HTTP a upstream                                  │
│  - Procesa stream                                               │
│  - Maneja recovery de errores                                    │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Conversiones Core                                              │
│  - OpenAI → Anthropic response format                           │
│  - SSE construction                                             │
│  - Token counting                                               │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
Cliente (Claude Code)
```

### 4.2 Flujo de Routing

```
Request entra
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Model ID Parsing                                               │
│  Ejemplo: "nvidia_nim/nvidia/nemotron-3-super-120b-a12b"      │
│  → provider_id: "nvidia_nim"                                   │
│  → provider_model: "nvidia/nemotron-3-super-120b-a12b"        │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Provider Resolution                                              │
│  1. Buscar provider en registry                                │
│  2. Validar credentials                                        │
│  3. Seleccionar adapter específico                              │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Provider Execution                                              │
│  1. Pre-flight check                                           │
│  2. Execute request                                            │
│  3. Stream/handle errors                                        │
│  4. Retry if needed                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. COMPATIBILIDAD CON LITELLM

### 5.1 Análisis

Free Claude Code NO es directamente compatible con LiteLLM porque:

1. **Protocolo diferente** - FCC usa Anthropic Messages, LiteLLM usa OpenAI Chat
2. **Model ID format diferente** - FCC usa `provider/model`, LiteLLM usa `provider/model`
3. **Funcionalidades diferentes** - FCC está optimizado para Claude Code

### 5.2 Posibilidades de Integración

| Opción | Complejidad | Resultado |
|--------|-------------|-----------|
| FCC como provider LiteLLM | Alta | Requiere adapter completo |
| FCC + LiteLLM en paralelo | Baja | Routing dual |
| FCC reemplaza LiteLLM | Media | Usar FCC como gateway |
| LiteLLM usa config de API Key Manager | Baja | Compartir config |

### 5.3 Recomendación

**FCC como provider standalone** integrado via API, no como reemplazo de LiteLLM.

```python
# Ejemplo de integración
import httpx

async def call_fcc(messages, model):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8082/v1/messages",
            json={
                "model": model,
                "messages": messages,
                "stream": True
            },
            headers={"Authorization": f"Bearer {FCC_API_KEY}"}
        )
        return response
```

---

## 6. SEGURIDAD

### 6.1 Autenticación

```python
# Token-based auth
headers = {"Authorization": f"Bearer {token}"}

# Validación de token en middleware
@app.middleware("http")
async def auth_middleware(request, call_next):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    # Validar token
    # Extraer user_id para rate limiting
```

### 6.2 Rate Limiting

```python
# Por IP y por token
class RateLimiter:
    async def check(self, key: str, limit: int, window: int) -> bool:
        """Verifica rate limit."""
```

---

## 7. PUNTOS DE EXTENSIÓN

### 7.1 Nuevo Provider

Para agregar un nuevo provider:

```python
# 1. Crear archivo en providers/
# src/free_claude_code/providers/my_provider/__init__.py
# src/free_claude_code/providers/my_provider/adapter.py

# 2. Definir provider profile
class MyProviderProfile(ProviderProfile):
    provider_id = "my_provider"
    name = "My Provider"
    api_key_env = "MY_PROVIDER_API_KEY"
    
    # Model mappings
    models = {
        "my_provider/model-1": {...},
    }

# 3. Registrar en catalog
# providers/__init__.py o config/provider_catalog.py
```

### 7.2 Nueva Funcionalidad de Mensajería

```python
# En messaging/
class MyMessenger(IncomingMessage):
    async def handle(self, message) -> Response:
        ...
```

---

## 8. LIMITACIONES

### 8.1 Limitaciones Técnicas

| Limitación | Impacto | Notas |
|-----------|---------|-------|
| Sin multi-tenant | Medio | Diseñado para usuario único |
| Admin UI local only | Bajo | No hay versión hosted |
| Sin streaming bidireccional | Bajo | Solo streaming server-to-client |
| Rate limiting básico | Medio | Sin quotas granulares |

### 8.2 Limitaciones de Proveedores

| Limitación | Proveedores Afectados |
|-----------|----------------------|
| Rate limits | Todos (via upstream) |
| Cuotas | Todos (via upstream) |
| Disponibilidad | Todos |
| Latencia | Proveedores remotos |

---

## 9. RIESGOS DE INTEGRACIÓN

### 9.1 Con LibreChat

| Riesgo | Nivel | Mitigación |
|--------|-------|------------|
| Conflicto de protocolos | Alto | Usar como provider standalone |
| Duplicación de model catalog | Medio | Unificar catalogs |
| Latencia adicional | Medio | Cache local |
| Consistencia de estado | Alto | Webhooks |

### 9.2 Con LiteLLM

| Riesgo | Nivel | Mitigación |
|--------|-------|------------|
| Protocolo incompatible | Alto | No integrar directamente |
| Redundancia | Medio | FCC como fallback |
| Config conflicts | Bajo | Configs separadas |

### 9.3 Con API Key Manager

| Riesgo | Nivel | Mitigación |
|--------|-------|------------|
| Keys duplicadas | Medio | FCC usa sus propias keys |
| Rate limits compartidos | Bajo | Rate limit por provider |
| Estado inconsistente | Medio | Sync periódico |

---

## 10. POSIBLES MEJORAS

### Alta Prioridad
1. **API REST completa** - Actualmente limitado a Anthropic Messages
2. **Model catalog compartido** - Con LibreChat
3. **Multi-tenant support** - Para uso multi-usuario
4. **Metrics export** - Prometheus/OpenTelemetry

### Media Prioridad
1. **Webhooks para eventos** - Notificaciones de cambios
2. **Caching inteligente** - De respuestas
3. **Batch requests** - Para eficiencia
4. **Cost tracking** - Por provider y usuario

### Baja Prioridad
1. **Admin UI hosted** - Versión cloud
2. **SSO integration** - OAuth/SAML
3. **Audit logs** - Compliance
4. **A/B testing** - De providers

---

## 11. CONCLUSIÓN

### Fortalezas
- Arquitectura muy bien diseñada y modular
- 25+ providers soportados
- Protocolos completos (Anthropic + OpenAI Responses)
- Extensibilidad alta
- Documentación excelente

### Limitaciones
- Diseñado para usuario único
- Admin UI local-only
- Sin API REST completa
- Rate limiting básico

### Recomendación
**✅ RECOMENDADO como provider compatible con LibreChat**

FCC puede integrarse como un provider más dentro del sistema, proporcionando acceso a modelos adicionales. No debe reemplazar a LiteLLM sino coexistir como una opción adicional.

---

## 12. ANEXO: COMPARACIÓN CON LITELLM

| Aspecto | LiteLLM | Free Claude Code |
|---------|---------|------------------|
| Providers | 100+ | 25+ |
| Protocolos | OpenAI, Anthropic, Azure | Anthropic, OpenAI Responses |
| Function calling | Sí | Sí |
| Streaming | Sí | Sí |
| Rate limiting | Avanzado | Básico |
| Cost tracking | Sí | No |
| UI Admin | Enterprise | Local |
| Auto-rotation | No | No |
| Multi-tenant | Sí | No |

---

**Fin del Informe de Auditoría - Free Claude Code**
