# INTEGRACIÓN DEL CHAT INSTRUMENTER

**Fecha:** 2026-07-21
**Versión:** 1.0
**Estado:** Implementado - Listo para integrar en controllers

---

## TABLA DE CONTENIDOS

1. [Visión General](#1-visión-general)
2. [Archivos Creados](#2-archivos-creados)
3. [API del ChatInstrumenter](#3-api-del-chatinstrumenter)
4. [API del Middleware](#4-api-del-middleware)
5. [Guía de Integración](#5-guía-de-integración)
6. [Eventos Generados](#6-eventos-generados)
7. [Ejemplo de Uso](#7-ejemplo-de-uso)

---

## 1. VISIÓN GENERAL

El Chat Instrumenter conecta el sistema de chat/agentes con el EventBus de supervisión, generando eventos cuando:

- El agente **piensa** (estados de razonamiento)
- El agente **usa herramientas**
- Se **modifican archivos**
- Se **ejecutan comandos**
- Se **consultan documentos**
- Se **terminan tareas**

**No produce interfaz gráfica** - solo instrumentación del backend.

---

## 2. ARCHIVOS CREADOS

```
api/server/services/EventBus/
├── index.js                           ← Actualizado: exports del instrumenter
├── ChatInstrumenter.js                ← Servicio principal de instrumentación
├── ChatInstrumenterMiddleware.js      ← Middleware para wrappear callbacks
└── SupervisorEventTypes.js           ← Tipos de eventos existentes
```

---

## 3. API DEL CHATINSTRUMENTER

### 3.1 Inicialización

```javascript
const { chatInstrumenter } = require('../services/EventBus');

// Inicializar con metadata de sesión
chatInstrumenter.initialize();
chatInstrumenter.setSessionMetadata({
  sessionId: 'session-123',
  conversationId: 'convo-456',
  userId: 'user-789',
  agentId: 'agent-abc',
  model: 'claude-3-5-sonnet',
});
```

### 3.2 Eventos de Sesión

```javascript
// Sesión iniciada
chatInstrumenter.sessionStarted(metadata);

// Sesión terminada
chatInstrumenter.sessionEnded(metadata);
```

### 3.3 Eventos de Pensamiento

```javascript
// Agente comenzó a pensar
chatInstrumenter.agentThinking({
  reasoningType: 'general', // 'general' | 'reasoning_delta' | 'chain_of_thought'
});

// Agente terminó de pensar
chatInstrumenter.agentThoughtComplete({
  duration: 1500, // ms
});
```

### 3.4 Eventos de Herramientas

```javascript
// Herramienta comenzó
chatInstrumenter.toolStarted('read_file', {
  path: '/workspace/src/app.js',
});

// Herramienta terminó exitosamente
chatInstrumenter.toolEnded('read_file', {
  content: 'file content...',
});

// Herramienta falló
chatInstrumenter.toolError('bash_tool', {
  message: 'Command failed',
});
```

### 3.5 Tipos de Herramientas Clasificadas

```javascript
const { classifyTool } = require('../services/EventBus');

// Retorna: 'file_read' | 'file_modify' | 'command' | 'browser' | 'git' | 'other'
const category = classifyTool('bash_tool');
```

**Clasificación automática:**

| Categoría | Herramientas |
|-----------|--------------|
| `file_read` | read_file, ReadFile, list_files, search, rag_search |
| `file_modify` | create_file, edit_file, write_file, delete_file |
| `command` | bash_tool, execute, run_command |
| `browser` | browser_use, navigate, fetch_url |
| `git` | git, git_tool |

---

## 4. API DEL MIDDLEWARE

### 4.1 Inicialización

```javascript
const { instrumentMiddleware } = require('../services/EventBus');

// Inicializar con metadata de sesión
instrumentMiddleware.initialize({
  sessionId: 'session-123',
  conversationId: 'convo-456',
  userId: 'user-789',
});

// Finalizar sesión
instrumentMiddleware.finalize({
  sessionId: 'session-123',
});
```

### 4.2 Wrappers de Callbacks

```javascript
// Wrappear toolEndCallback
const instrumentedCallback = instrumentMiddleware.wrapToolEndCallback(originalCallback);

// Wrappear handler de ON_TOOL_EXECUTE
const instrumentedHandler = instrumentMiddleware.wrapToolExecuteHandler(originalHandler);

// Wrappear todos los handlers
const handlers = instrumentMiddleware.wrapAllHandlers(originalHandlers, {
  sessionId: 'session-123',
  userId: 'user-789',
});
```

---

## 5. GUÍA DE INTEGRACIÓN

### 5.1 Integración en `openai.js`

```javascript
// api/server/controllers/agents/openai.js

const { instrumentMiddleware } = require('~/server/services/EventBus');

// En la función que procesa requests...
async function processAgentRequest(req, res) {
  // 1. Extraer metadata de la request
  const metadata = {
    sessionId: req.body.conversationId || `session-${Date.now()}`,
    conversationId: req.body.conversationId,
    userId: req.user?.id,
    agentId: req.body.agentId,
    model: req.body.model,
  };

  // 2. Inicializar instrumentación
  instrumentMiddleware.initialize(metadata);

  try {
    // 3. Crear callbacks originales...
    const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });
    const toolExecuteOptions = {
      loadTools: async (toolNames, agentId) => { /* ... */ },
      toolEndCallback,
    };

    // 4. Instrumentar callbacks
    const instrumentedToolEndCallback = instrumentMiddleware.wrapToolEndCallback(toolEndCallback);
    toolExecuteOptions.toolEndCallback = instrumentedToolEndCallback;

    // 5. Crear handlers...
    const handlers = createHandlers(toolExecuteOptions);

    // 6. Instrumentar handlers
    const instrumentedHandlers = instrumentMiddleware.wrapAllHandlers(handlers, metadata);

    // 7. Ejecutar con handlers instrumentados
    await agentClient.run(instrumentedHandlers);

  } finally {
    // 8. Finalizar instrumentación
    instrumentMiddleware.finalize(metadata);
  }
}
```

### 5.2 Integración en `responses.js`

```javascript
// api/server/controllers/agents/responses.js

const { instrumentMiddleware } = require('~/server/services/EventBus');

async function processResponseRequest(req, res) {
  const metadata = {
    sessionId: req.body.conversationId || `session-${Date.now()}`,
    conversationId: req.body.conversationId,
    userId: req.user?.id,
  };

  instrumentMiddleware.initialize(metadata);

  try {
    // Crear callbacks y handlers con instrumentación...
    const handlers = createResponseHandlers(req, res);
    const instrumentedHandlers = instrumentMiddleware.wrapAllHandlers(handlers, metadata);

    await agentClient.stream(instrumentedHandlers);

  } finally {
    instrumentMiddleware.finalize(metadata);
  }
}
```

### 5.3 Hook en el Router

```javascript
// api/server/routes/agents.js

const { instrumentMiddleware } = require('~/server/services/EventBus');

// Middleware para agregar instrumentación
router.use((req, res, next) => {
  // Skip para endpoints que no requieren instrumentación
  if (req.path.includes('/health')) {
    return next();
  }

  // Inicializar con metadata básica
  req.instrumenter = {
    middleware: instrumentMiddleware,
    metadata: {
      sessionId: req.body?.conversationId || req.params?.conversationId,
      conversationId: req.body?.conversationId || req.params?.conversationId,
      userId: req.user?.id,
      agentId: req.body?.agentId,
    },
  };

  next();
});
```

---

## 6. EVENTOS GENERADOS

### 6.1 Eventos de Sesión

| Evento | Payload |
|--------|---------|
| `supervisor.session.created` | `{ sessionId, userId, conversationId, agentId }` |
| `supervisor.session.ended` | `{ sessionId, duration, stats }` |

### 6.2 Eventos de Pensamiento

| Evento | Payload |
|--------|---------|
| `chat.agent.thinking` | `{ agentId, reasoningType }` |
| `chat.agent.thought_complete` | `{ agentId, duration }` |

### 6.3 Eventos de Herramientas

| Evento | Payload | Trigger |
|--------|---------|---------|
| `chat.tool.started` | `{ toolName, toolCallId }` | Tool begins |
| `chat.tool.ended` | `{ toolName, duration, output }` | Tool completes |
| `chat.tool.error` | `{ toolName, error }` | Tool fails |
| `sandbox.file.modified` | `{ filePath, operation }` | File tool starts |
| `sandbox.file.written` | `{ filePath, linesChanged }` | File write completes |
| `sandbox.file.read` | `{ filePath, bytesRead }` | File read |
| `sandbox.command.executed` | `{ command }` | Command starts |
| `sandbox.command.output` | `{ command, stdout, stderr }` | Command completes |
| `sandbox.command.error` | `{ command, stderr }` | Command fails |

### 6.4 Eventos de Mensajes

| Evento | Payload |
|--------|---------|
| `supervisor.message.received` | `{ messageId, contentLength }` |
| `supervisor.message.sent` | `{ messageId, contentLength, tokensUsed }` |

### 6.5 Eventos de Run Steps

| Evento | Payload |
|--------|---------|
| `chat.run_step.started` | `{ stepId, stepType }` |
| `chat.run_step.completed` | `{ stepId, stepType, duration }` |

---

## 7. EJEMPLO DE USO

### 7.1 Uso Directo del Instrumenter

```javascript
const { chatInstrumenter, classifyTool } = require('../services/EventBus');

// Inicializar
chatInstrumenter.initialize();

// Configurar sesión
chatInstrumenter.setSessionMetadata({
  sessionId: 'sess-001',
  conversationId: 'conv-001',
  userId: 'user-001',
});

// Simular flujo de agente
console.log('Agente recibe mensaje...');
chatInstrumenter.messageReceived({ messageId: 'msg-001' });

console.log('Agente empieza a pensar...');
chatInstrumenter.agentThinking();

setTimeout(() => {
  console.log('Agente termina de pensar...');
  chatInstrumenter.agentThoughtComplete({ duration: 250 });

  console.log('Agente ejecuta herramienta read_file...');
  chatInstrumenter.toolStarted('read_file', { path: '/workspace/src/app.js' });

  setTimeout(() => {
    console.log('Herramienta completa...');
    chatInstrumenter.toolEnded('read_file', {
      content: 'const x = 1;',
    });

    console.log('Agente ejecuta bash...');
    chatInstrumenter.toolStarted('bash_tool', { command: 'npm test' });

    setTimeout(() => {
      console.log('Bash completa...');
      chatInstrumenter.toolEnded('bash_tool', {
        stdout: '10 tests passed',
        exitCode: 0,
      });

      console.log('Sesión terminada...');
      chatInstrumenter.sessionEnded();

      // Ver historial de eventos
      const { getEventBus } = require('../services/EventBus');
      const events = getEventBus().getHistory();
      console.log(`Total eventos: ${events.length}`);
      events.forEach(e => console.log(`  - ${e.type}`));

    }, 500);
  }, 500);
}, 500);
```

### 7.2 Verificar Eventos

```javascript
const { getEventBus, SupervisorEventTypes } = require('../services/EventBus');

const eventBus = getEventBus();

// Suscribirse a eventos de herramientas
eventBus.subscribe('chat.tool.*', (event) => {
  console.log(`[TOOL] ${event.type}:`, event.payload);
});

// Suscribirse a eventos de supervisión
eventBus.subscribe(SupervisorEventTypes.SUPERVISOR_TASK_COMPLETED, (event) => {
  console.log(`[TASK] Completed:`, event.payload);
});

// Ver historial
const history = eventBus.getHistory('chat.tool.*', 50);
console.log('Últimas 50 herramientas:', history);
```

### 7.3 Clasificación de Herramientas

```javascript
const { classifyTool, extractFilePath, extractCommand } = require('../services/EventBus');

// Clasificar herramientas
console.log(classifyTool('read_file'));         // 'file_read'
console.log(classifyTool('create_file'));        // 'file_modify'
console.log(classifyTool('bash_tool'));          // 'command'
console.log(classifyTool('browser_use'));        // 'browser'
console.log(classifyTool('git_tool'));           // 'git'

// Extraer path de argumentos
const args = { path: '/workspace/src/index.js' };
console.log(extractFilePath(args, 'read_file')); // '/workspace/src/index.js'

// Extraer comando
const cmdArgs = { command: 'npm install' };
console.log(extractCommand(cmdArgs, 'bash_tool')); // 'npm install'
```

---

## 8. PRÓXIMOS PASOS

### 8.1 Integrar en Controllers

1. **openai.js** - Agregar instrumentación al flujo de streaming
2. **responses.js** - Agregar instrumentación al flujo de responses
3. **client.js** - Agregar instrumentación al cliente de agentes

### 8.2 Eventos Adicionales (Opcional)

- [ ] Agregar eventos de token usage (`chat.token.usage`)
- [ ] Agregar eventos de costo (`chat.cost.calculated`)
- [ ] Agregar eventos de cache hit/miss (`chat.cache.*`)

### 8.3 Persistencia

- [ ] Guardar eventos en MongoDB (`supervisor_events`)
- [ ] Agregar índice por sessionId y timestamp
- [ ] Implementar paginación para eventos históricos

---

**Estado:** Implementación completada. Listo para integración en controllers.
