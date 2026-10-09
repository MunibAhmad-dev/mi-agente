# 📚 API Documentation - Mi LibreChat

**Versión:** 1.0.0  
**Base URL:** `https://tu-dominio.com/api`

---

## Autenticación

La API usa autenticación JWT. Incluye el token en el header `Authorization`:

```
Authorization: Bearer <tu_token_jwt>
```

### Headers Requeridos

| Header | Valor | Descripción |
|--------|-------|-------------|
| `Content-Type` | `application/json` | Tipo de contenido |
| `Authorization` | `Bearer <token>` | Token JWT de autenticación |

---

## Endpoints de Chat

### POST /api/chat

Envía un mensaje de chat y recibe una respuesta en streaming.

**Request Body:**

```json
{
  "message": "Hola, ¿cómo estás?",
  "conversationId": "opcional-id-conversacion",
  "model": "gpt-4",
  "stream": true,
  "options": {
    "temperature": 0.7,
    "max_tokens": 1000
  }
}
```

**Response:** `200 OK` (Server-Sent Events)

```
event: message
data: {"content": "¡Hola!", "messageId": "msg_123"}

event: message
data: {"content": " Estoy bien,", "messageId": "msg_123"}

event: final
data: {"content": "¡Hola! Estoy bien, gracias por preguntar.", "messageId": "msg_123"}
```

---

### POST /api/chat/edit

Edita un mensaje existente en una conversación.

**Request Body:**

```json
{
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "newContent": "Contenido corregido"
}
```

**Response:**

```json
{
  "success": true,
  "message": {
    "messageId": "msg_456",
    "content": "Contenido corregido",
    "updatedAt": "2026-07-20T12:00:00Z"
  }
}
```

---

## Endpoints de Conversaciones

### GET /api/conversations

Lista todas las conversaciones del usuario.

**Query Parameters:**

| Parámetro | Tipo | Default | Descripción |
|------------|------|---------|-------------|
| `page` | number | 1 | Número de página |
| `limit` | number | 20 | Conversaciones por página |
| `sort` | string | `desc` | Orden (`asc` o `desc`) |

**Response:**

```json
{
  "conversations": [
    {
      "conversationId": "conv_123",
      "title": "Mi primera conversación",
      "createdAt": "2026-07-19T10:00:00Z",
      "updatedAt": "2026-07-20T12:00:00Z",
      "messageCount": 15
    }
  ],
  "page": 1,
  "totalPages": 5,
  "totalCount": 100
}
```

---

### DELETE /api/conversations/:conversationId

Elimina una conversación.

**Response:**

```json
{
  "success": true,
  "message": "Conversación eliminada"
}
```

---

## Endpoints de Mensajes

### GET /api/messages/:conversationId

Obtiene todos los mensajes de una conversación.

**Response:**

```json
{
  "messages": [
    {
      "messageId": "msg_1",
      "content": "Mensaje del usuario",
      "isCreatedByUser": true,
      "createdAt": "2026-07-19T10:00:00Z"
    },
    {
      "messageId": "msg_2",
      "content": "Respuesta del asistente",
      "isCreatedByUser": false,
      "createdAt": "2026-07-19T10:00:01Z"
    }
  ]
}
```

---

### DELETE /api/messages/:messageId

Elimina un mensaje específico.

**Response:**

```json
{
  "success": true,
  "message": "Mensaje eliminado"
}
```

---

## Endpoints de Configuración

### GET /api/config

Obtiene la configuración pública de la aplicación.

**Response:**

```json
{
  "appTitle": "Mi LibreChat",
  "version": "v0.8.7",
  "providers": ["openai", "anthropic", "google"],
  "features": {
    "registration": true,
    "socialLogin": true,
    "fileUpload": true
  }
}
```

---

## Endpoints de Usuario

### GET /api/user

Obtiene información del usuario autenticado.

**Response:**

```json
{
  "id": "user_123",
  "username": "usuario_ejemplo",
  "email": "usuario@ejemplo.com",
  "createdAt": "2026-01-01T00:00:00Z",
  "role": "user",
  "balance": {
    "credits": 1000,
    "used": 250
  }
}
```

---

### PUT /api/user

Actualiza la información del usuario.

**Request Body:**

```json
{
  "username": "nuevo_nombre",
  "email": "nuevo@email.com"
}
```

---

### POST /api/user/logout

Cierra la sesión del usuario.

**Response:**

```json
{
  "success": true,
  "message": "Sesión cerrada"
}
```

---

## Endpoints de Keys (API Keys de usuario)

### GET /api/user/key

Obtiene la API key del usuario.

**Response:**

```json
{
  "key": "sk-...",
  "name": "Mi API Key",
  "createdAt": "2026-07-01T00:00:00Z",
  "lastUsed": "2026-07-20T12:00:00Z"
}
```

---

### POST /api/user/key

Crea una nueva API key.

**Request Body:**

```json
{
  "name": "Mi Key de Producción",
  "expiresIn": "90d"
}
```

**Response:**

```json
{
  "key": "sk-...",
  "name": "Mi Key de Producción",
  "createdAt": "2026-07-20T12:00:00Z",
  "expiresAt": "2026-10-18T12:00:00Z"
}
```

---

### DELETE /api/user/key

Elimina la API key del usuario.

**Response:**

```json
{
  "success": true,
  "message": "API key eliminada"
}
```

---

## Endpoints de Balance

### GET /api/user/balance

Obtiene el balance de créditos del usuario.

**Response:**

```json
{
  "balance": {
    "credits": 1000,
    "used": 250,
    "remaining": 750
  },
  "history": [
    {
      "amount": -10,
      "type": "chat",
      "model": "gpt-4",
      "timestamp": "2026-07-20T12:00:00Z"
    }
  ]
}
```

---

### POST /api/user/balance/add

Añade créditos al balance (admin).

**Request Body:**

```json
{
  "userId": "user_123",
  "amount": 100
}
```

---

## Endpoints de Agentes

### GET /api/agents

Lista todos los agentes disponibles.

**Response:**

```json
{
  "agents": [
    {
      "id": "agent_coder",
      "name": "Coder Agent",
      "description": "Agente especializado en código",
      "capabilities": ["code", "debug", "review"],
      "icon": "💻"
    }
  ]
}
```

---

### POST /api/agents

Crea un nuevo agente (admin).

**Request Body:**

```json
{
  "name": "Mi Agente",
  "description": "Descripción del agente",
  "capabilities": ["chat", "code"],
  "model": "gpt-4",
  "tools": ["web_search", "calculator"]
}
```

---

### PUT /api/agents/:agentId

Actualiza un agente existente.

---

### DELETE /api/agents/:agentId

Elimina un agente.

---

## Endpoints de Plugins/Skills

### GET /api/plugins

Lista plugins disponibles en el marketplace.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `category` | string | Filtrar por categoría |
| `search` | string | Búsqueda por nombre |
| `agent` | string | Filtrar por compatibilidad con agente |

**Response:**

```json
{
  "plugins": [
    {
      "id": "plugin_web_search",
      "name": "Web Search",
      "description": "Búsqueda en la web",
      "category": "search",
      "installs": 1500,
      "rating": 4.8,
      "compatibleAgents": ["claude_code", "cursor"]
    }
  ],
  "total": 200
}
```

---

### POST /api/plugins/install

Instala un plugin.

**Request Body:**

```json
{
  "pluginId": "plugin_web_search"
}
```

---

### DELETE /api/plugins/:pluginId

Desinstala un plugin.

---

## Endpoints de Discovery

### GET /api/discovery/search

Búsqueda universal en múltiples fuentes.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `q` | string | Query de búsqueda |
| `sources` | string | Fuentes separadas por coma (github,huggingface,mcp) |
| `limit` | number | Límite de resultados |

**Response:**

```json
{
  "results": [
    {
      "source": "github",
      "name": "awesome-ai-agents",
      "description": "Awesome list of AI agents",
      "stars": 3000,
      "url": "https://github.com/user/awesome-ai-agents"
    }
  ]
}
```

---

### GET /api/discovery/categories

Obtiene las categorías disponibles.

---

### GET /api/discovery/featured

Obtiene plugins/skills destacados.

---

## Endpoints de OAuth (Conectores)

### GET /api/auth/github

Inicia autenticación con GitHub.

**Redirect:** A GitHub OAuth

---

### GET /api/auth/github/callback

Callback de GitHub OAuth.

**Response:**

```json
{
  "success": true,
  "token": "github_token_encrypted"
}
```

---

### GET /api/auth/huggingface

Inicia autenticación con HuggingFace.

---

### GET /api/auth/huggingface/callback

Callback de HuggingFace OAuth.

---

## Endpoints de Modelos

### GET /api/models

Lista todos los modelos disponibles.

**Response:**

```json
{
  "models": [
    {
      "id": "gpt-4",
      "name": "GPT-4",
      "provider": "openai",
      "capabilities": ["chat", "vision", "function_calling"],
      "context_window": 128000,
      "cost_per_1k_input": 0.03,
      "cost_per_1k_output": 0.06
    }
  ]
}
```

---

## Códigos de Error

| Código | Descripción |
|--------|-------------|
| `400` | Bad Request - Parámetros inválidos |
| `401` | Unauthorized - Token inválido o expirado |
| `403` | Forbidden - No tienes permisos |
| `404` | Not Found - Recurso no encontrado |
| `429` | Too Many Requests - Rate limit excedido |
| `500` | Internal Server Error - Error del servidor |

---

## Rate Limiting

La API implementa rate limiting por usuario:

| Endpoint | Límite | Ventana |
|----------|--------|--------|
| `/api/chat` | 60 requests | 1 minuto |
| `/api/*` (general) | 100 requests | 1 minuto |
| `/api/*` (autenticado) | 500 requests | 1 minuto |

Los headers de respuesta incluyen información de rate limit:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 1689864060
```

---

## Ejemplos de Código

### JavaScript/Node.js

```javascript
const response = await fetch('https://tu-dominio.com/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <tu_token>'
  },
  body: JSON.stringify({
    message: 'Hola',
    model: 'gpt-4',
    stream: true
  })
});

for await (const chunk of response.body) {
  console.log(chunk);
}
```

### Python

```python
import requests

response = requests.post(
    'https://tu-dominio.com/api/chat',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <tu_token>'
    },
    json={
        'message': 'Hola',
        'model': 'gpt-4'
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        print(line)
```

---

## Webhooks

Los webhooks notifican eventos en tiempo real. Configura tu URL de webhook en el panel de administración.

### Eventos Soportados

- `chat.start` - Inicio de conversación
- `chat.end` - Fin de conversación
- `message.new` - Nuevo mensaje
- `message.error` - Error en mensaje

### Formato del Payload

```json
{
  "event": "chat.end",
  "timestamp": "2026-07-20T12:00:00Z",
  "data": {
    "conversationId": "conv_123",
    "messageCount": 10,
    "duration": 120
  }
}
```

---

*Documentación generada: 2026-07-20*
