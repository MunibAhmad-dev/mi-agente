# 🗺️ MAPA DE APIs E INTEGRACIONES — AI-OS

## Estado: 31 de Agosto, 2026

---

## 1. APIs INTERNAS (Endpoints del Backend)

### Autenticación
```
POST /api/auth/login              → Login local
POST /api/auth/register           → Registro
POST /api/auth/logout             → Logout
POST /api/auth/refresh            → Refrescar JWT
POST /api/auth/reset-password     → Reset contraseña
POST /api/auth/2fa/enable         → Habilitar 2FA
POST /api/auth/2fa/disable        → Deshabilitar 2FA
POST /api/auth/2fa/verify         → Verificar 2FA
```

### Conversaciones
```
GET    /api/convos                → Listar conversaciones
POST   /api/convos                → Crear conversación
GET    /api/convos/:id            → Obtener conversación
PUT    /api/convos/:id            → Actualizar conversación
DELETE /api/convos/:id            → Eliminar conversación
```

### Mensajes
```
GET    /api/messages              → Listar mensajes
POST   /api/messages              → Enviar mensaje (⚠️ PRINCIPAL)
GET    /api/messages/:id          → Obtener mensaje
PUT    /api/messages/:id          → Actualizar mensaje
DELETE /api/messages/:id          → Eliminar mensaje
```

### Agente (Harness)
```
POST   /api/harness/scaffold      → Crear sesión de agente
POST   /api/harness/pre-llm       → Pre-LLM (compact, inject)
POST   /api/harness/post-tool     → Post-tool (normalize)
POST   /api/harness/checkpoint    → Guardar checkpoint
POST   /api/harness/resume        → Resumir sesión
GET    /api/harness/state         → Estado del agente
```

### Modelos LLM
```
GET    /api/models                → Modelos disponibles
GET    /api/models/:provider      → Modelos de un proveedor
POST   /api/models/switch         → Cambiar modelo
```

### Herramientas
```
GET    /api/tools                 → Herramientas disponibles
POST   /api/tools/:tool/execute   → Ejecutar herramienta
GET    /api/tools/:tool/schema    → Schema de herramienta
```

### RAG
```
POST   /api/rag/search            → Búsqueda RAG
POST   /api/rag/index             → Indexar documento
GET    /api/rag/collections       → Colecciones
DELETE /api/rag/documents/:id     → Eliminar documento
```

### Memoria
```
GET    /api/memories              → Listar memorias
POST   /api/memories              → Crear memoria
DELETE /api/memories/:id          → Eliminar memoria
GET    /api/memories/search       → Buscar en memorias
```

### MCP
```
GET    /api/mcp/servers           → Servidores MCP
POST   /api/mcp/connect          → Conectar servidor
POST   /api/mcp/tools            → Listar tools MCP
POST   /api/mcp/execute          → Ejecutar tool MCP
```

### Visión
```
POST   /api/vision/screenshot     → Tomar screenshot
POST   /api/vision/analyze        → Analizar imagen
POST   /api/vision/route          → Enrutar por complejidad
```

### Skills
```
GET    /api/skills                → Listar skills
POST   /api/skills                → Crear skill
PUT    /api/skills/:id            → Actualizar skill
DELETE /api/skills/:id            → Eliminar skill
```

### Marketplace
```
GET    /api/marketplace           → Listar plugins
POST   /api/marketplace/install   → Instalar plugin
DELETE /api/marketplace/:id       → Desinstalar plugin
```

### Métricas y Sistema
```
GET    /api/metrics/dashboard     → Métricas del dashboard
GET    /api/metrics/realtime      → Métricas en tiempo real
GET    /api/performance/summary   → Resumen de rendimiento
GET    /api/system/health         → Estado del sistema
GET    /api/system/status         → Status detallado
```

### Configuración
```
GET    /api/config                → Configuración actual
PUT    /api/config                → Actualizar configuración
GET    /api/settings              → Ajustes del usuario
PUT    /api/settings              → Actualizar ajustes
```

### Usuarios
```
GET    /api/user                  → Usuario actual
PUT    /api/user                  → Actualizar usuario
GET    /api/users                 → Listar usuarios (admin)
POST   /api/users                 → Crear usuario (admin)
DELETE /api/users/:id             → Eliminar usuario (admin)
```

### Otros
```
GET    /api/endpoints             → Endpoints disponibles
GET    /api/presets               → Presets
POST   /api/presets               → Crear preset
GET    /api/prompts               → Prompts
POST   /api/prompts               → Crear prompt
GET    /api/tags                  → Etiquetas
POST   /api/search                → Búsqueda global
POST   /api/sandbox/execute       → Ejecutar en sandbox
GET    /api/scheduler/tasks       → Tareas programadas
POST   /api/scheduler/tasks       → Crear tarea
```

---

## 2. INTEGRACIONES EXTERNAS

### LLM Providers

| Proveedor | API | Autenticación | Costo |
|-----------|-----|---------------|-------|
| OpenAI | api.openai.com | API Key | Pago |
| DeepSeek | api.deepseek.com | API Key | Pago |
| xAI (Grok) | api.x.ai | API Key | Pago |
| Anthropic | api.anthropic.com | API Key | Pago |
| Ollama | localhost:11434 | Ninguna | Gratis |
| LM Studio | localhost:1234 | Ninguna | Gratis |

### OAuth Providers

| Proveedor | Protocolo | Uso |
|-----------|-----------|-----|
| GitHub | OAuth 2.0 | Login social |
| Google | OAuth 2.0 | Login social |
| Discord | OAuth 2.0 | Login social |
| LDAP | LDAP | Login empresarial |

### Servicios Externos

| Servicio | API | Uso |
|----------|-----|-----|
| HuggingFace | huggingface.co | Modelos, datasets |
| ComfyUI | localhost:8188 | Generación de imágenes |
| MeiliSearch | localhost:7700 | Búsqueda full-text |
| Playwright | Interno | Navegador real |
| FFmpeg | Sistema | Procesamiento video |

---

## 3. PROTOCOLO MCP (Model Context Protocol)

```
┌─────────────────────────────────────────────────────────┐
│                    MCP ARCHITECTURE                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐         ┌──────────────┐             │
│  │  MCP Client  │◄───────►│  MCP Server  │             │
│  │  (AI-OS)     │  stdio  │  (externo)   │             │
│  └──────────────┘         └──────────────┘             │
│                                                         │
│  ┌──────────────┐         ┌──────────────┐             │
│  │  MCP Client  │◄───────►│  MCP Server  │             │
│  │  (AI-OS)     │   SSE   │  (remoto)    │             │
│  └──────────────┘         └──────────────┘             │
│                                                         │
│  Transportes soportados:                                │
│  ├── stdio (procesos locales)                          │
│  ├── SSE (Server-Sent Events)                          │
│  └── HTTP (REST)                                       │
│                                                         │
│  Servidores MCP compatibles:                            │
│  ├── filesystem                                         │
│  ├── github                                             │
│  ├── brave-search                                       │
│  ├── postgres                                           │
│  ├── sqlite                                             │
│  ├── puppeteer                                          │
│  └── custom servers                                     │
└─────────────────────────────────────────────────────────┘
```

---

## 4. WEBSOCKET (Socket.IO)

```
┌─────────────────────────────────────────────────────────┐
│                    WEBSOCKET EVENTS                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  CLIENT → SERVER                                        │
│  ├── message:create     → Nuevo mensaje                 │
│  ├── conversation:join  → Unirse a conversación         │
│  ├── conversation:leave → Salir de conversación         │
│  └── typing:start       → Indicador de escritura        │
│                                                         │
│  SERVER → CLIENT                                        │
│  ├── message:created    → Mensaje creado                │
│  ├── message:streaming  → Streaming de respuesta        │
│  ├── message:done       → Respuesta completa            │
│  ├── typing:show        → Mostrar indicador             │
│  ├── typing:hide        → Ocultar indicador             │
│  └── error              → Error                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 5. FLUJO DE UNA PETICIÓN COMPLETA

```
1. USUARIO escribe "Hola"
        │
        ▼
2. LibreChat → POST /api/messages
   Body: { text: "Hola", conversationId: "abc123" }
        │
        ▼
3. Auth Middleware
   └──▶ Verifica JWT token
   └──▶ Carga usuario de MongoDB
        │
        ▼
4. Messages Route
   └──▶ Guarda mensaje en MongoDB
   └──▶ Emite socket:message:created
        │
        ▼
5. AgentLoop (si está habilitado)
   │
   ├──▶ ContextCompactor
   │    └──▶ Comprime contexto si > 80% del límite
   │
   ├──▶ UniversalLLMRouter
   │    └──▶ Selecciona mejor LLM (Ollama/GPT/Grok/etc)
   │
   ├──▶ LLM API Call
   │    └──▶ Envía prompt + contexto + tools
   │
   ├──▶ LLM Responde
   │    ├──▶ Texto simple → Devuelve al usuario
   │    └──▶ Tool calls → Ejecuta herramientas
   │
   ├──▶ Tool Execution
   │    ├──▶ FilesystemTools → Lee/escribe archivos
   │    ├──▶ ShellTool → Ejecuta comandos
   │    ├──▶ BrowserManager → Navega en web
   │    └──▶ ... (55 tools)
   │
   ├──▶ Cognitive Processing
   │    ├──▶ Memory → Guarda aprendizaje
   │    ├──▶ Learning → Registra lección
   │    └──▶ RAG → Actualiza conocimiento
   │
   └──▶ Response
        ├──▶ Guarda en MongoDB
        ├──▶ Cachear en Redis
        └──▶ Streaming SSE al cliente
        │
        ▼
6. USUARIO ve la respuesta
```

---

## 6. INTEGRACIONES DE RED

```
┌─────────────────────────────────────────────────────────┐
│                    RED DE SERVICIOS                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  INTERNOS (Docker Network)                              │
│  ├── LibreChat ←→ MongoDB                              │
│  ├── LibreChat ←→ pgvector                             │
│  ├── LibreChat ←→ Redis                                │
│  ├── LibreChat ←→ MeiliSearch                          │
│  ├── LibreChat ←→ RAG API                              │
│  ├── LibreChat ←→ Ollama                               │
│  ├── LibreChat ←→ AI Model Browser                     │
│  └── LibreChat ←→ Admin Panel                          │
│                                                         │
│  EXTERNOS (Internet)                                    │
│  ├── LibreChat → api.openai.com (GPT)                  │
│  ├── LibreChat → api.deepseek.com (DeepSeek)           │
│  ├── LibreChat → api.x.ai (Grok)                       │
│  ├── LibreChat → api.anthropic.com (Claude)            │
│  ├── LibreChat → huggingface.co (Modelos)              │
│  └── LibreChat → Sitios web (Web Scraping)             │
│                                                         │
│  HOST (Tu computadora)                                  │
│  ├── LibreChat → localhost:11434 (Ollama)              │
│  ├── LibreChat → localhost:1234 (LM Studio)            │
│  ├── LibreChat → Filesystem (lectura/escritura)        │
│  ├── LibreChat → Terminal (comandos)                   │
│  ├── LibreChat → Navegador (Playwright)                │
│  └── LibreChat → Escritorio (screenshots, mouse, kbd)  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

*Documento generado para auditoría del proyecto AI-OS.*
