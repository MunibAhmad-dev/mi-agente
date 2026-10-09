# 🔄 FLUJO DE DATOS COMPLETO — AI-OS

## Estado: 31 de Agosto, 2026

---

## 1. FLUJO PRINCIPAL: USUARIO → RESPUESTA

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO PRINCIPAL DE DATOS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐                                                   │
│  │ USUARIO  │                                                   │
│  │ (Browser)│                                                   │
│  └────┬─────┘                                                   │
│       │                                                         │
│       │ 1. POST /api/messages                                   │
│       │    Body: { text, conversationId }                       │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                 API SERVER (Express)                     │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │ MIDDLEWARE CHAIN                                 │   │    │
│  │  │                                                  │   │    │
│  │  │  1. requireJwtAuth.js                           │   │    │
│  │  │     └──▶ Verifica JWT en header                 │   │    │
│  │  │     └──▶ Carga usuario de MongoDB               │   │    │
│  │  │                                                  │   │    │
│  │  │  2. validateMessageReq.js                       │   │    │
│  │  │     └──▶ Valida estructura del mensaje          │   │    │
│  │  │                                                  │   │    │
│  │  │  3. moderateText.js (opcional)                   │   │    │
│  │  │     └──▶ Moderación de contenido                │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │ ROUTE: messages.js                               │   │    │
│  │  │                                                  │   │    │
│  │  │  1. Guarda mensaje en MongoDB                   │   │    │
│  │  │     └──▶ db.messages.insertOne(...)             │   │    │
│  │  │                                                  │   │    │
│  │  │  2. Emite evento Socket.IO                      │   │    │
│  │  │     └──▶ io.emit('message:created', msg)        │   │    │
│  │  │                                                  │   │    │
│  │  │  3. Llama al AgentLoop                          │   │    │
│  │  │     └──▶ agentLoop.process(message)             │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │ AGENT LOOP (AgentLoop.js)                        │   │    │
│  │  │                                                  │   │    │
│  │  │  ┌──────────────────────────────────────────┐   │   │    │
│  │  │  │ WHILE (tool_call != null)                  │   │   │    │
│  │  │  │                                            │   │   │    │
│  │  │  │  ┌────────────────────────────────────┐   │   │   │    │
│  │  │  │  │ 1. CONTEXT COMPACTOR                │   │   │   │    │
│  │  │  │  │    └──▶ Comprime si > 80% límite   │   │   │   │    │
│  │  │  │  └────────────────────────────────────┘   │   │   │    │
│  │  │  │                                            │   │   │    │
│  │  │  │  ┌────────────────────────────────────┐   │   │   │    │
│  │  │  │  │ 2. MODEL ROUTER                     │   │   │   │    │
│  │  │  │  │    └──▶ Selecciona mejor LLM        │   │   │   │    │
│  │  │  │  │    └──▶ Ollama/GPT/Grok/DeepSeek    │   │   │   │    │
│  │  │  │  └────────────────────────────────────┘   │   │   │    │
│  │  │  │                                            │   │   │    │
│  │  │  │  ┌────────────────────────────────────┐   │   │   │    │
│  │  │  │  │ 3. LLM API CALL                     │   │   │   │    │
│  │  │  │  │    └──▶ Envía prompt + tools         │   │   │   │    │
│  │  │  │  │    └──▶ Recibe respuesta             │   │   │   │    │
│  │  │  │  └────────────────────────────────────┘   │   │   │    │
│  │  │  │                                            │   │   │    │
│  │  │  │  ┌────────────────────────────────────┐   │   │   │    │
│  │  │  │  │ 4. CHECK: ¿Tiene tool_calls?        │   │   │   │    │
│  │  │  │  │    │                                │   │   │   │    │
│  │  │  │  │    ├── NO → BREAK (respuesta final) │   │   │   │    │
│  │  │  │  │    │                                │   │   │   │    │
│  │  │  │  │    └── SÍ → Ejecutar tools          │   │   │   │    │
│  │  │  │  └────────────────────────────────────┘   │   │   │    │
│  │  │  │                                            │   │   │    │
│  │  │  │  ┌────────────────────────────────────┐   │   │   │    │
│  │  │  │  │ 5. TOOL EXECUTION                   │   │   │   │    │
│  │  │  │  │    └──▶ tools/index.js              │   │   │   │    │
│  │  │  │  │    └──▶ Busca tool por nombre       │   │   │   │    │
│  │  │  │  │    └──▶ Ejecuta tool.execute()      │   │   │   │    │
│  │  │  │  │    └──▶ Retorna resultado           │   │   │   │    │
│  │  │  │  └────────────────────────────────────┘   │   │   │    │
│  │  │  │                                            │   │   │    │
│  │  │  │  ┌────────────────────────────────────┐   │   │   │    │
│  │  │  │  │ 6. LOOP: Volver al paso 1           │   │   │   │    │
│  │  │  │  └────────────────────────────────────┘   │   │   │    │
│  │  │  │                                            │   │   │    │
│  │  │  └──────────────────────────────────────────┘   │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │ RESPONSE                                         │   │    │
│  │  │                                                  │   │    │
│  │  │  1. Guarda respuesta en MongoDB                 │   │    │
│  │  │  2. Cachear en Redis (5 min)                     │   │    │
│  │  │  3. Streaming SSE al cliente                    │   │    │
│  │  │  4. Emitir socket:message:done                  │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       │ 2. Respuesta (SSE/Socket)                              │
│       ▼                                                         │
│  ┌──────────┐                                                   │
│  │ USUARIO  │                                                   │
│  │ ve texto │                                                   │
│  └──────────┘                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. FLUJO DE AUTENTICACIÓN

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE AUTENTICACIÓN                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LOGIN LOCAL                                                    │
│  ┌──────────┐                                                   │
│  │ USUARIO  │                                                   │
│  └────┬─────┘                                                   │
│       │                                                         │
│       │ 1. POST /api/auth/login                                 │
│       │    Body: { email, password }                            │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ MIDDLEWARE CHAIN                                         │    │
│  │                                                          │    │
│  │  1. logHeaders.js → Log de headers                      │    │
│  │  2. loginLimiter.js → Rate limiting (5 intentos/min)    │    │
│  │  3. checkBan.js → Verificar si usuario está baneado     │    │
│  │  4. validateEmailLogin.js → Validar formato email        │    │
│  │  5. requireLocalAuth.js → Verificar credenciales        │    │
│  │     └──▶ Busca usuario en MongoDB                       │    │
│  │     └──▶ Compara password con bcrypt                    │    │
│  │     └──▶ Si 2FA habilitado → Redirect a /2fa            │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       │ 2. Login exitoso                                       │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ GENERAR TOKENS                                          │    │
│  │                                                          │    │
│  │  1. JWT Access Token (15 min)                           │    │
│  │  2. Refresh Token (7 días)                              │    │
│  │  3. Guardar refresh token en MongoDB                    │    │
│  │  4. Set-Cookie header                                   │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       │ 3. Respuesta                                           │
│       ▼                                                         │
│  ┌──────────┐                                                   │
│  │ USUARIO  │                                                   │
│  │ autenticado                                                  │
│  └──────────┘                                                   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  PETICIÓN AUTENTICADA                                           │
│  ┌──────────┐                                                   │
│  │ USUARIO  │                                                   │
│  └────┬─────┘                                                   │
│       │                                                         │
│       │ 1. GET /api/convos                                      │
│       │    Header: Authorization: Bearer <JWT>                 │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ requireJwtAuth.js                                       │    │
│  │                                                          │    │
│  │  1. Extraer token del header                            │    │
│  │  2. Verificar firma JWT                                 │    │
│  │  3. Decodificar payload (userId, email, role)           │    │
│  │  4. Buscar usuario en MongoDB                           │    │
│  │  5. Verificar que usuario existe y no está baneado      │    │
│  │  6. Asignar req.user = usuario                          │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       │ 2. Continúa al route handler                           │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ convos.js                                               │    │
│  │                                                          │    │
│  │  1. Buscar conversaciones donde userId = req.user._id   │    │
│  │  2. Retornar lista                                      │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. FLUJO DE RAG

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE RAG                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INDEXACIÓN                                                      │
│  ┌──────────┐                                                   │
│  │ USUARIO  │                                                   │
│  │ sube doc │                                                   │
│  └────┬─────┘                                                   │
│       │                                                         │
│       │ 1. POST /api/rag/index                                  │
│       │    Body: { file, collection }                           │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ RAG SERVICE                                              │    │
│  │                                                          │    │
│  │  1. Recibir archivo                                     │    │
│  │  2. Extraer texto (PDF, DOCX, TXT, etc)                 │    │
│  │  3. Dividir en chunks (512 tokens)                      │    │
│  │  4. Generar embeddings (sentence-transformers)          │    │
│  │  5. Guardar en pgvector                                 │    │
│  │  6. Indexar en MeiliSearch                              │    │
│  │  7. Guardar metadatos en MongoDB                        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  RECUPERACIÓN                                                   │
│  ┌──────────┐                                                   │
│  │ USUARIO  │                                                   │
│  │ pregunta │                                                   │
│  └────┬─────┘                                                   │
│       │                                                         │
│       │ 1. POST /api/messages                                   │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ AGENT LOOP                                               │    │
│  │                                                          │    │
│  │  1. Recibir pregunta del usuario                        │    │
│  │  2. Generar embedding de la pregunta                    │    │
│  │  3. pgvector: buscar vectores similares                 │    │
│  │     └──▶ SELECT * FROM embeddings                       │    │
│  │     └──▶ ORDER BY embedding <=> ?                       │    │
│  │     └──▶ LIMIT 10                                       │    │
│  │  4. MeiliSearch: búsqueda full-text                     │    │
│  │     └──▶ Buscar en documentos indexados                 │    │
│  │  5. Combinar resultados (hybrid search)                 │    │
│  │  6. Re-rank por relevancia                              │    │
│  │  7. Inyectar contexto en prompt                         │    │
│  │  8. Enviar a LLM con contexto enriquecido               │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       │ 2. Respuesta con fuentes                               │
│       ▼                                                         │
│  ┌──────────┐                                                   │
│  │ USUARIO  │                                                   │
│  │ respuesta│                                                   │
│  │ + fuentes│                                                   │
│  └──────────┘                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. FLUJO DE HERRAMIENTAS (TOOLS)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE EJECUCIÓN DE TOOLS                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ LLM RESponde con tool_call                             │    │
│  │                                                          │    │
│  │  {                                                      │    │
│  │    "tool_calls": [{                                     │    │
│  │      "function": {                                      │    │
│  │        "name": "ShellTool",                             │    │
│  │        "arguments": { "command": "ls -la" }             │    │
│  │      }                                                  │    │
│  │    }]                                                   │    │
│  │  }                                                      │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ TOOLS/INDEX.JS                                          │    │
│  │                                                          │    │
│  │  1. Buscar tool por nombre                              │    │
│  │     └──▶ tools['ShellTool']                             │    │
│  │                                                          │    │
│  │  2. Verificar permisos                                  │    │
│  │     └──▶ ¿Usuario tiene permiso?                        │    │
│  │                                                          │    │
│  │  3. Validar parámetros                                  │    │
│  │     └──▶ ¿Parámetros correctos?                         │    │
│  │                                                          │    │
│  │  4. Ejecutar tool.execute(params)                       │    │
│  │     └──▶ Retorna resultado                              │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ TOOL ESPECÍFICO                                         │    │
│  │                                                          │    │
│  │  ShellTool.execute({ command: "ls -la" })              │    │
│  │     └──▶ child_process.exec(command)                   │    │
│  │     └──▶ Retorna stdout + stderr                       │    │
│  │                                                          │    │
│  │  FilesystemTools.readFile({ path: "/etc/passwd" })     │    │
│  │     └──▶ fs.readFile(path)                             │    │
│  │     └──▶ Retorna contenido                             │    │
│  │                                                          │    │
│  │  BrowserManager.navigate({ url: "https://..." })      │    │
│  │     └──▶ playwright.goto(url)                          │    │
│  │     └──▶ Retorna página                                │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ RESULTADO → Vuelve al AgentLoop                        │    │
│  │                                                          │    │
│  │  {                                                      │    │
│  │    "tool": "ShellTool",                                 │    │
│  │    "result": "total 48\ndrwxr-xr-x...",                │    │
│  │    "success": true                                      │    │
│  │  }                                                      │    │
│  │                                                          │    │
│  │  → Se agrega al contexto                                │    │
│  │  → Se envía de vuelta al LLM                           │    │
│  │  → LLM decide siguiente paso                           │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. FLUJO DE MEMORIA

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE MEMORIA                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ESCRITURA                                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ AgentLoop detecta algo importante                      │    │
│  │                                                          │    │
│  │  1. Clasificar tipo de memoria:                         │    │
│  │     ├── Episódica (evento específico)                   │    │
│  │     ├── Semántica (conocimiento general)                │    │
│  │     ├── Procedural (cómo hacer algo)                   │    │
│  │     └── User (preferencias del usuario)                 │    │
│  │                                                          │    │
│  │  2. Generar embedding del contenido                     │    │
│  │                                                          │    │
│  │  3. Guardar en MongoDB:                                 │    │
│  │     {                                                   │    │
│  │       userId, type, content, embeddings,                │    │
│  │       confidence, source, usageCount                    │    │
│  │     }                                                   │    │
│  │                                                          │    │
│  │  4. Actualizar knowledge graph                          │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  LECTURA                                                        │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ AgentLoop necesita contexto                             │    │
│  │                                                          │    │
│  │  1. Generar embedding de la consulta                    │    │
│  │                                                          │    │
│  │  2. Buscar memorias similares:                          │    │
│  │     └──▶ MongoDB + pgvector                             │    │
│  │     └──▶ ORDER BY similarity DESC                       │    │
│  │     └──▶ LIMIT 10                                       │    │
│  │                                                          │    │
│  │  3. Filtrar por:                                         │    │
│  │     ├── confidence > 0.7                                │    │
│  │     ├── userId = actual                                 │    │
│  │     └── type matching                                   │    │
│  │                                                          │    │
│  │  4. Inyectar en contexto del LLM                        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  CONSOLIDACIÓN                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Periódicamente (o por demanda)                          │    │
│  │                                                          │    │
│  │  1. Agrupar memorias similares                          │    │
│  │  2. Fusionar duplicados                                 │    │
│  │  3. Actualizar confidence scores                        │    │
│  │  4. Archivar memorias obsoletas                         │    │
│  │  5. Limpiar memorias de baja calidad                    │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. FLUJO DE ENRUTAMIENTO DE MODELOS

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE MODEL ROUTING                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ AgentLoop necesita llamar a LLM                         │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ UNIVERSAL LLM ROUTER                                    │    │
│  │                                                          │    │
│  │  1. Analizar tarea:                                     │    │
│  │     ├── Tipo de tarea (código, texto, imagen, etc)      │    │
│  │     ├── Complejidad (simple, media, compleja)           │    │
│  │     ├── Contexto (tokens necesarios)                    │    │
│  │     └── Costo (presupuesto disponible)                  │    │
│  │                                                          │    │
│  │  2. Seleccionar modelo:                                 │    │
│  │     ├── Local (Ollama) → Gratis, más lento              │    │
│  │     ├── Remoto (GPT/Grok/DeepSeek) → Pago, más rápido  │    │
│  │     └── Mixto → Local para simple, remoto para complejo │    │
│  │                                                          │    │
│  │  3. Configurar parámetros:                              │    │
│  │     ├── temperature                                     │    │
│  │     ├── top_p                                           │    │
│  │     ├── max_tokens                                      │    │
│  │     └── tools                                           │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ PROVEEDOR SELECCIONADO                                  │    │
│  │                                                          │    │
│  │  Ollama:                                                │    │
│  │    POST http://localhost:11434/api/chat                 │    │
│  │    Body: { model: "qwen3:1.7b", messages, tools }      │    │
│  │                                                          │    │
│  │  OpenAI:                                                │    │
│  │    POST https://api.openai.com/v1/chat/completions      │    │
│  │    Header: Authorization: Bearer sk-...                 │    │
│  │                                                          │    │
│  │  DeepSeek:                                              │    │
│  │    POST https://api.deepseek.com/v1/chat/completions    │    │
│  │    Header: Authorization: Bearer sk-...                 │    │
│  │                                                          │    │
│  │  xAI (Grok):                                            │    │
│  │    POST https://api.x.ai/v1/chat/completions            │    │
│  │    Header: Authorization: Bearer xai-...                │    │
│  └────────────────────────────────────────────────────────┘    │
│       │                                                         │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ RESPONSE NORMALIZER                                     │    │
│  │                                                          │    │
│  │  1. Normalizar respuesta de cualquier proveedor         │    │
│  │  2. Unificar formato de tool_calls                      │    │
│  │  3. Extraer texto + tool_calls                          │    │
│  │  4. Retornar al AgentLoop                               │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

*Documento generado para auditoría del proyecto AI-OS.*
