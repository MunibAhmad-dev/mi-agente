# 🗄️ RESUMEN DE BASES DE DATOS Y ESQUEMAS — AI-OS

## Estado: 31 de Agosto, 2026

---

## 1. BASES DE DATOS PRINCIPALES

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE ALMACENAMIENTO                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   MongoDB    │  │  pgvector    │  │    Redis     │          │
│  │   8.0.20     │  │  0.8.0       │  │              │          │
│  │   :27017     │  │  :5432       │  │   :6379      │          │
│  │              │  │              │  │              │          │
│  │  Principal   │  │  Vectores    │  │  Cache +     │          │
│  │  (Datos)     │  │  (RAG)       │  │  Sessions    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │ MeiliSearch  │  │   LanceDB    │                             │
│  │  v1.35.1     │  │  (local)     │                             │
│  │  :7700       │  │              │                             │
│  │              │  │  Vector      │                             │
│  │  Full-Text   │  │  Store       │                             │
│  │  Search      │  │  Local       │                             │
│  └──────────────┘  └──────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. MONGODB — COLECCIONES PRINCIPALES

### Conexión:
```
mongodb://localhost:27017/LibreChat
```

### Colecciones:

| Colección | Propósito | Datos principales |
|-----------|-----------|-------------------|
| `users` | Usuarios registrados | email, password, roles, preferences |
| `conversations` | Conversaciones | title, model, messages[], createdAt |
| `messages` | Mensajes | userId, convoId, text, role, toolCalls[] |
| `presets` | Configuraciones de modelo | model, temperature, topP, etc |
| `prompts` | Prompts personalizados | name, prompt, category |
| `tags` | Etiquetas | name, conversationIds[] |
| `endpoints` | Endpoints de LLM | name, baseURL, models[] |
| `roles` | Roles de usuario | name, permissions[] |
| `plugins` | Plugins instalados | name, version, enabled |
| `keyPairs` | API keys encriptadas | name, key, hashed |
| `sessions` | Sesiones activas | userId, token, expiresAt |
| `refreshTokens` | Tokens de refresco | userId, token, expiresAt |
| `sharedLinks` | Enlaces compartidos | convoId, isPublic, expiresAt |
| `streaks` | Racha de uso | userId, count, lastLogin |
| `audit_logs` | Logs de auditoría | userId, action, timestamp |
| `memories` | Memoria del agente | userId, type, content, embeddings |
| `skills` | Skills aprendidas | name, description, code, metrics |
| `knowledge_base` | Base de conocimiento RAG | documents[], chunks[], embeddings |
| `tool_configs` | Configuración de tools | toolName, parameters, enabled |
| `suggested_actions` | Acciones sugeridas | context, actions[], rank |
| `execution_traces` | Trazas de ejecución | taskId, steps[], timestamps |
| `learnings` | Lecciones aprendidas | type, content, confidence, usage |
| `harness_sessions` | Sesiones del harness | agentId, state, checkpoints[] |
| `scheduler_tasks` | Tareas programadas | cron, action, status |
| `webhooks` | Webhooks configurados | url, events[], secret |
| `marketplace_items` | Items del marketplace | name, version, author, downloads |

### Esquemas de ejemplo:

```javascript
// users
{
  _id: ObjectId,
  email: String,
  password: String (hashed),
  name: String,
  avatar: String,
  role: String (user/admin),
  permissions: [String],
  preferences: {
    model: String,
    temperature: Number,
    fontSize: String,
    theme: String
  },
  createdAt: Date,
  updatedAt: Date
}

// conversations
{
  _id: ObjectId,
  userId: ObjectId,
  title: String,
  model: String,
  endpoint: String,
  messages: [{
    messageId: String,
    sender: String (user/assistant/system),
    text: String,
    isEdited: Boolean,
    tokenCount: Number,
    createdAt: Date
  }],
  tags: [String],
  isArchived: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// messages
{
  _id: ObjectId,
  conversationId: ObjectId,
  userId: ObjectId,
  sender: String (user/assistant/system),
  text: String,
  isEdited: Boolean,
  plugin: {
    name: String,
    inputs: Object,
    outputs: Object
  },
  tokenCount: Number,
  createdAt: Date,
  updatedAt: Date
}

// memories
{
  _id: ObjectId,
  userId: ObjectId,
  type: String (episodic/semantic/procedural/user),
  content: String,
  context: String,
  embeddings: [Number],
  confidence: Number,
  source: String,
  usageCount: Number,
  lastUsedAt: Date,
  createdAt: Date,
  updatedAt: Date
}

// skills
{
  _id: ObjectId,
  name: String,
  description: String,
  code: String,
  category: String,
  version: String,
  author: String,
  metrics: {
    usageCount: Number,
    successRate: Number,
    avgExecutionTime: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

---

## 3. PGVECTOR — VECTORES RAG

### Conexión:
```
postgresql://myuser:mypassword@vectordb:5432/mydatabase
```

### Tablas:

| Tabla | Propósito |
|-------|-----------|
| `langchain_pg_embedding` | Embeddings de documentos |
| `langchain_pg_collection` | Colecciones de vectores |
| `documents` | Documentos indexados |
| `chunks` | Fragmentos de documentos |
| `metadata` | Metadatos de vectores |

### Uso:
- Almacenamiento de embeddings para RAG
- Búsqueda por similitud coseno
- Soporte para múltiples colecciones
- Integración con LangChain

---

## 4. REDIS — CACHE Y SESIONES

### Conexión:
```
redis://redis:6379
```

### Uso:
| Uso | TTL | Descripción |
|-----|-----|-------------|
| Sessions | 24h | Sesiones de usuario |
| Rate Limiting | 1m | Limitación de peticiones |
| Cache de modelos | 5m | Modelos disponibles cacheados |
| Cache de respuestas | 10m | Respuestas LLM cacheadas |
| Cache de embeddings | 1h | Embeddings cacheados |
| Colas de trabajo | - | Tareas en segundo plano |
| Pub/Sub | - | Eventos en tiempo real |

---

## 5. MEILISEARCH — BÚSQUEDA FULL-TEXT

### Conexión:
```
http://meilisearch:7700
```

### Índices:

| Índice | Propósito |
|--------|-----------|
| `conversations` | Búsqueda en conversaciones |
| `messages` | Búsqueda en mensajes |
| `documents` | Búsqueda en documentos |
| `knowledge` | Búsqueda en base de conocimiento |
| `skills` | Búsqueda en skills |
| `files` | Búsqueda en archivos |

### Capacidades:
- Búsqueda full-text
- Búsqueda fuzzy
- Facetas (filtros)
- Ordenamiento por relevancia
- Indexación automática

---

## 6. LANCEDB — VECTOR STORE LOCAL

### Conexión:
```
Local: ./data/lancedb/
```

### Uso:
- Vector store local (sin servidor)
- Almacenamiento de embeddings
- Búsqueda por similitud
- Alternativa ligera a pgvector
- Usado para RAG local

---

## 7. FLUJO DE DATOS

```
USUARIO
    │
    │  POST /api/messages
    ▼
┌─────────────────────────────────────────┐
│         API SERVER                       │
│                                          │
│  1. Auth Middleware                       │
│     └──▶ MongoDB: verify JWT            │
│                                          │
│  2. Messages Route                        │
│     └──▶ MongoDB: guardar mensaje        │
│                                          │
│  3. AgentLoop                             │
│     ├──▶ MongoDB: cargar conversación    │
│     ├──▶ pgvector: buscar contexto RAG   │
│     ├──▶ Redis: cache de respuestas      │
│     ├──▶ MeiliSearch: búsqueda full-text │
│     └──▶ LLM: generar respuesta          │
│                                          │
│  4. Tools                                 │
│     ├──▶ Filesystem: leer/escribir       │
│     ├──▶ Shell: ejecutar comandos        │
│     ├──▶ Browser: navegar                │
│     └──▶ Otros tools                     │
│                                          │
│  5. Cognitive                             │
│     ├──▶ Memory: guardar aprendizaje     │
│     ├──▶ Learning: registrar lecciones   │
│     └──▶ RAG: actualizar conocimiento    │
│                                          │
│  6. Response                              │
│     ├──▶ MongoDB: guardar respuesta      │
│     ├──▶ Redis: cachear respuesta        │
│     └──▶ SSE: streaming al cliente       │
└─────────────────────────────────────────┘
```

---

## 8. BACKUP Y PERSISTENCIA

| Datos | Ubicación | Backup |
|-------|-----------|--------|
| MongoDB | `./data-node/` | `docker exec chat-mongodb mongodump` |
| pgvector | Docker volume `pgdata2` | `docker exec vectordb pg_dump` |
| MeiliSearch | `./meili_data_v1.35.1/` | Copiar directorio |
| LanceDB | `./data/lancedb/` | Copiar directorio |
| Logs | `./logs/` | Copiar directorio |
| Uploads | `./uploads/` | Copiar directorio |
| Skills | `./skill/` | Copiar directorio |

---

*Documento generado para auditoría del proyecto AI-OS.*
