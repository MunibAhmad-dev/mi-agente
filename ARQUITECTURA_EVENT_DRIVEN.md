# 🚌 ARQUITECTURA EVENT-DRIVEN

## Sistema de Eventos para LibreChat

**Fecha:** 2026-07-19  
**Auditor:** OpenHands AI Agent  

---

# PARTE I: ANÁLISIS DE COMUNICACIÓN

## 1.1 COMUNICACIÓN ACTUAL VS PROPUESTA

### Estado Actual (Acoplado)

```
Controlador → AgentClient → createRun() → getLLMConfig()
                    ↓
              loadTools()
                    ↓
              callbacks (handlers)
                    ↓
              SSE (res.write)
```

**Problemas:**
- Llamadas directas entre componentes
- Sin desacoplamiento
- Difícil de testear
- Difícil de extender

### Estado Propuesto (Event-Driven)

```
Componente A ──► EventBus.publish() ──► [Middleware] ──► Suscriptores
                    ↓
              EventHistory
                    ↓
              DeadLetterQueue
```

**Beneficios:**
- Desacoplamiento total
- Fácil de testear
- Fácil de extender
- Observabilidad completa

---

# PARTE II: EVENT BUS

## 2.1 ARQUITECTURA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EVENT BUS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     PUBLIC API                                        │   │
│  │                                                                      │   │
│  │  publish(event)           - Publicar evento                          │   │
│  │  subscribe(eventType, handler) - Suscribirse                        │   │
│  │  unsubscribe(subscriptionId) - Desuscribirse                        │   │
│  │  once(eventType, handler) - Suscribir una vez                        │   │
│  │  request(event)           - Request/Response                          │   │
│  │  reply(event, response)   - Responder                                │   │
│  │  use(middleware)          - Registrar middleware                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     MIDDLEWARES                                      │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │ Telemetry   │  │   Audit     │  │  Metrics    │              │   │
│  │  │ (Tracing)   │  │  (Logging)  │  │  (Prometheus)│              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     EVENT PROCESSING                                │   │
│  │                                                                      │   │
│  │  • Pattern matching (wildcards)                                    │   │
│  │  • Priority ordering                                               │   │
│  │  • Error handling with retry                                       │   │
│  │  • Dead letter queue                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2.2 API DEL EVENT BUS

```typescript
// Publicación
await eventBus.publish(createEvent(
  EventType.TASK_STARTED,
  { taskId, taskType },
  'TaskPlanner',
  { priority: EventPriority.HIGH }
));

// Suscripción
const subscriptionId = eventBus.subscribe(
  EventType.TASK_STARTED,
  (event) => {
    console.log('Task started:', event.payload);
  },
  { 
    filter: (e) => e.payload.taskType === 'code',
    priority: 10
  }
);

// Request/Response
const response = await eventBus.request(createRequestEvent(
  EventType.EXECUTION_REQUESTED,
  { task },
  'ExecutionEngine',
  'execution.response'  // topic para respuesta
));

// Middlewares
eventBus.use(new TelemetryMiddleware({ serviceName: 'librechat' }));
eventBus.use(new AuditMiddleware({ sensitiveFields: ['apiKey'] }));
eventBus.use(new MetricsMiddleware());
```

---

# PARTE III: CATÁLOGO DE EVENTOS

## 3.1 EVENTOS SISTEMA

| Evento | Tipo | Prioridad | Sinc/Async | Reintentos |
|--------|------|----------|------------|------------|
| `system.started` | Sistema | CRITICAL | Async | No |
| `system.ready` | Sistema | CRITICAL | Async | No |
| `system.shutdown` | Sistema | CRITICAL | Sync | No |
| `system.health_changed` | Sistema | HIGH | Async | No |

## 3.2 EVENTOS DE CONFIGURACIÓN

| Evento | Tipo | Prioridad | Sinc/Async | Reintentos |
|--------|------|----------|------------|------------|
| `config.changed` | Config | NORMAL | Async | No |
| `provider.registered` | Config | HIGH | Async | No |
| `provider.removed` | Config | HIGH | Async | No |
| `credential.updated` | Config | CRITICAL | Sync | No |

## 3.3 EVENTOS DE AGENTES

| Evento | Tipo | Prioridad | Sinc/Async | Reintentos |
|--------|------|----------|------------|------------|
| `agent.created` | Agent | HIGH | Async | No |
| `agent.started` | Agent | HIGH | Async | No |
| `agent.paused` | Agent | HIGH | Sync | No |
| `agent.resumed` | Agent | HIGH | Sync | No |
| `agent.finished` | Agent | HIGH | Async | No |
| `agent.failed` | Agent | CRITICAL | Async | Sí |

## 3.4 EVENTOS DE WORKFLOWS

| Evento | Tipo | Prioridad | Sinc/Async | Reintentos |
|--------|------|----------|------------|------------|
| `workflow.created` | Workflow | NORMAL | Async | No |
| `workflow.started` | Workflow | HIGH | Async | No |
| `workflow.step_started` | Workflow | NORMAL | Async | No |
| `workflow.step_finished` | Workflow | NORMAL | Async | No |
| `workflow.completed` | Workflow | HIGH | Async | No |
| `workflow.failed` | Workflow | HIGH | Async | Sí |

## 3.5 EVENTOS DE TASKS

| Evento | Tipo | Prioridad | Sinc/Async | Reintentos |
|--------|------|----------|------------|------------|
| `task.created` | Task | HIGH | Async | No |
| `task.assigned` | Task | NORMAL | Async | No |
| `task.started` | Task | HIGH | Async | No |
| `task.progress` | Task | LOW | Async | No |
| `task.completed` | Task | HIGH | Async | No |
| `task.failed` | Task | CRITICAL | Async | Sí |
| `task.cancelled` | Task | HIGH | Sync | No |

## 3.6 EVENTOS DE LLM

| Evento | Tipo | Prioridad | Sinc/Async | Reintentos |
|--------|------|----------|------------|------------|
| `llm.request_started` | LLM | NORMAL | Async | No |
| `llm.request_finished` | LLM | NORMAL | Async | No |
| `llm.retry` | LLM | HIGH | Async | Sí |
| `llm.fallback` | LLM | HIGH | Async | No |
| `llm.timeout` | LLM | HIGH | Async | Sí |

## 3.7 EVENTOS DE API-KEY

| Evento | Tipo | Prioridad | Sinc/Async | Reintentos |
|--------|------|----------|------------|------------|
| `apikey.selected` | APIKey | NORMAL | Async | No |
| `apikey.rotated` | APIKey | HIGH | Sync | No |
| `apikey.quota_exceeded` | APIKey | CRITICAL | Async | No |
| `apikey.rate_limit` | APIKey | HIGH | Async | No |
| `apikey.cooldown_started` | APIKey | NORMAL | Async | No |
| `apikey.cooldown_finished` | APIKey | NORMAL | Async | No |

---

# PARTE IV: CLASIFICACIÓN

## 4.1 EVENTOS SÍNCRONOS (Request/Response)

| Evento | Razón |
|--------|-------|
| `credential.updated` | Confirmación requerida |
| `agent.paused` | Esperar confirmación |
| `agent.resumed` | Esperar confirmación |
| `task.cancelled` | Confirmación de cancelación |
| `apikey.rotated` | Confirmación de rotación |

## 4.2 EVENTOS ASÍNCRONOS (Fire-and-Forget)

| Evento | Razón |
|--------|-------|
| `agent.started` | No requiere respuesta |
| `agent.finished` | No requiere respuesta |
| `task.started` | No requiere respuesta |
| `task.completed` | No requiere respuesta |
| `llm.request_started` | No requiere respuesta |
| `llm.request_finished` | No requiere respuesta |

## 4.3 EVENTOS PERSISTENTES (Guardados en EventStore)

| Evento | Razón |
|--------|-------|
| `agent.created` | Auditoría |
| `agent.failed` | Auditoría + debug |
| `workflow.created` | Auditoría |
| `workflow.failed` | Auditoría + debug |
| `task.created` | Auditoría |
| `task.failed` | Auditoría + debug |
| `apikey.quota_exceeded` | Auditoría |
| `apikey.rotated` | Auditoría |

## 4.4 EVENTOS REINTENTABLES

| Evento | Razón |
|--------|-------|
| `agent.failed` | Puede ser error temporal |
| `workflow.failed` | Puede ser error temporal |
| `task.failed` | Puede ser error temporal |
| `llm.retry` | Es un retry |
| `llm.timeout` | Puede ser timeout temporal |

---

# PARTE V: COMPONENTES

## 5.1 COMPONENTES PRODUCTORES

| Componente | Eventos que Produce |
|-----------|-------------------|
| AI-OS | `system.*`, `config.*` |
| Task Planner | `task.*` |
| Workflow Engine | `workflow.*`, `task.*` |
| Execution Engine | `execution.*` |
| Capability Router | `capability.*`, `runtime.*` |
| Claude Code Runtime | `claude.*` |
| LLM Runtime | `llm.*` |
| Media Runtime | `media.*` |
| API-Key Manager | `apikey.*` |

## 5.2 COMPONENTES CONSUMIDORES

| Componente | Eventos que Consume |
|-----------|-------------------|
| AI-OS | `agent.*`, `workflow.*`, `task.*` |
| Dashboard | `*.*` (todos) |
| Audit Service | `*.*` (todos) |
| Metrics Service | `*.*` (todos) |
| Task Planner | `execution.*` |
| Workflow Engine | `task.*` |
| Claude Code Runtime | `task.started` |
| LLM Runtime | `llm.request_started` |
| API-Key Manager | `llm.*`, `media.*` |

---

# PARTE VI: FLUJO DE EVENTOS

## 6.1 FLUJO: Ejecución de Task

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE EVENTOS - Task Execution                       │
└─────────────────────────────────────────────────────────────────────────────┘

1. USUARIO ENVÍA MENSAJE
   │
   │ Event: (HTTP Request)
   ▼
   
2. AI-OS RECIBE REQUEST
   │
   │ Event: system.request_received
   │ Payload: { sessionId, userId, message }
   ▼
   
3. TASK PLANNER DESCOMPONE
   │
   │ Event: task.created
   │ Payload: { taskId, type: 'research', capabilities: ['web_search'] }
   │
   │ Event: task.created  
   │ Payload: { taskId, type: 'image_gen', capabilities: ['image_generation'] }
   ▼
   
4. WORKFLOW ENGINE CONSTRUYE DAG
   │
   │ Event: workflow.created
   │ Payload: { workflowId, tasks: [task1, task2], dependencies }
   │
   │ Event: workflow.started
   ▼
   
5. CAPABILITY ROUTER SELECCIONA RUNTIME
   │
   │ Event: capability.resolved
   │ Payload: { taskId, capabilities: ['web_search'] }
   │
   │ Event: runtime.selected
   │ Payload: { runtime: 'search', provider: 'tavily' }
   ▼
   
6. LLM RUNTIME EJECUTA
   │
   │ Event: llm.request_started
   │ Payload: { provider: 'tavily', model: 'search-api' }
   │
   │ Event: llm.request_finished
   │ Payload: { tokens: { input: 100, output: 500 } }
   ▼
   
7. API-KEY MANAGER REGISTRA USO
   │
   │ Event: apikey.selected
   │ Payload: { provider: 'tavily', keyId: 'xxx' }
   │
   │ Event: cost.updated
   │ Payload: { cost: 0.001, total: 0.05 }
   ▼
   
8. TASK COMPLETADA
   │
   │ Event: task.completed
   │ Payload: { taskId, result: {...} }
   ▼
   
9. WORKFLOW ACTUALIZA
   │
   │ Event: workflow.step_finished
   │ Payload: { workflowId, step: 1, completed: true }
   ▼
   
10. WORKFLOW COMPLETADO
    │
    │ Event: workflow.completed
    │ Payload: { workflowId, duration: 5000, totalCost: 0.01 }
    ▼
    
11. AI-OS NOTIFICA
    │
    │ Event: system.task_completed
    │ Payload: { sessionId, response: {...} }
    ▼
    
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RESPONSE AL USUARIO                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# PARTE VII: MIDDLEWARES

## 7.1 MIDDLEWARES IMPLEMENTADOS

### TelemetryMiddleware
- OpenTelemetry integration
- Distributed tracing
- Span creation for each event
- Correlation ID propagation

### AuditMiddleware
- Audit logging
- Sensitive data redaction
- Event classification by criticality
- Compliance-ready logs

### MetricsMiddleware
- Prometheus-compatible metrics
- Event counters
- Latency histograms
- Subscription tracking

## 7.2 MIDDLEWARES FUTUROS (Opcional)

### RedisTransportMiddleware
- Distributed event transport
- Cross-instance communication
- Redis Pub/Sub integration

### KafkaTransportMiddleware
- Event streaming
- Event replay
- Distributed processing

---

# PARTE VIII: ERROR HANDLING

## 8.1 ESTRATEGIA DE ERRORES

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Evento falla                                                             │
│       │                                                                    │
│       ▼                                                                    │
│  ¿Es retryable?                                                           │
│       │                                                                    │
│  ┌────┴────┐                                                              │
│  │         │                                                              │
│  Sí        No                                                             │
│  │         │                                                              │
│  ▼         ▼                                                              │
│  Retry    Dead Letter Queue                                               │
│  (3x)     (DLQ)                                                           │
│  │         │                                                              │
│  │         ▼                                                              │
│  │    Alert + Manual                                                      │
│  │    Intervention                                                        │
│  │         │                                                              │
│  └────┬────┘                                                              │
│       │                                                                    │
│       ▼                                                                    │
│  Recoverable?                                                             │
│       │                                                                    │
│  ┌────┴────┐                                                              │
│  │         │                                                              │
│  Sí        No                                                             │
│  │         │                                                              │
│  ▼         ▼                                                              │
│  Retry    Log + Alert                                                     │
│  + Alert                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 8.2 ERRORES RETRYABLES

- `timeout`
- `ECONNREFUSED`
- `ETIMEDOUT`
- `network`
- HTTP 503, 502, 429

---

# PARTE IX: ESCALABILIDAD

## 9.1 MIGRACIÓN A SISTEMAS DISTRIBUIDOS

### Fase 1: Event Bus Interno (Actual)
```
Application → EventBus (in-process)
```

### Fase 2: Redis Transport
```
Application → EventBus → Redis Pub/Sub → Other Instances
```

### Fase 3: Kafka/Event Streaming
```
Application → EventBus → Kafka → Consumers
```

## 9.2 ABSTRACCIÓN DE TRANSPORTE

```typescript
interface EventTransport {
  publish(event: BaseEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): Promise<void>;
  unsubscribe(subscriptionId: string): Promise<void>;
}

// Implementaciones
class InProcessTransport implements EventTransport { ... }
class RedisTransport implements EventTransport { ... }
class KafkaTransport implements EventTransport { ... }
```

---

# PARTE X: ARCHIVOS CREADOS

## 10.1 ESTRUCTURA

```
api/server/services/
├── EventBus/
│   ├── index.ts
│   ├── EventBus.ts              (Core del Event Bus)
│   └── middlewares/
│       ├── TelemetryMiddleware.ts
│       ├── AuditMiddleware.ts
│       └── MetricsMiddleware.ts
│
├── RuntimeRegistry/
│   ├── index.ts
│   └── RuntimeRegistry.ts       (Plugin system)
│
└── CapabilityRouter/
    ├── index.ts
    └── CapabilityRouter.ts      (Routing by capabilities)
```

## 10.2 ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `api/server/index.js` | Inicializar EventBus |
| `packages/api/src/agents/run.ts` | Integrar con EventBus |
| `api/server/controllers/agents/client.js` | Publicar eventos |

---

# PARTE XI: PLAN DE INTEGRACIÓN

## Fase 1: Core EventBus (Inmediato)
- Implementar EventBus
- Implementar RuntimeRegistry
- Implementar CapabilityRouter
- Tests básicos

## Fase 2: Integración (Semana 1)
- Integrar con AgentClient
- Integrar con callbacks
- Middlewares de observabilidad

## Fase 3: Workflows (Semana 2)
- Task Planner genera eventos
- Workflow Engine consume eventos
- Ejecución paralela

## Fase 4: Distributed (Futuro)
- Redis Transport
- Multi-instance support
- Event persistence

---

*Documento generado: 2026-07-19*
*Auditor: OpenHands AI Agent*
