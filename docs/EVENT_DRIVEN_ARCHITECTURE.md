# 🔄 Event-Driven Architecture - LibreChat

## 📋 Resumen Ejecutivo

Este documento describe la arquitectura Event-Driven implementada en LibreChat para desacoplar todos los componentes del sistema, permitiendo ejecución paralela, reintentos automáticos, auditoría completa y observabilidad.

---

## 🏗️ Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              LIBRECHAT EVENT BUS                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   LibreChat   │───►│   AI-OS      │───►│  Execution   │───►│  Workflow    │  │
│  │   (Frontend) │    │   Gateway    │    │   Engine     │    │   Engine     │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘    └──────┬───────┘  │
│                                                 │                     │          │
│                                                 ▼                     ▼          │
│                    ┌────────────────────────────────────────────────────────┐    │
│                    │                     EVENT BUS                          │    │
│                    │  ┌──────────────────────────────────────────────────┐ │    │
│                    │  │  Topics: system.*, agent.*, workflow.*, task.*,   │ │    │
│                    │  │          llm.*, media.*, apikey.*, metrics.*    │ │    │
│                    │  └──────────────────────────────────────────────────┘ │    │
│                    │           │              │              │              │    │
│                    │     ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐        │    │
│                    │     │ Middlewares│  │  DLQ   │  │  Metrics  │        │    │
│                    │     │ - Audit   │  │        │  │           │        │    │
│                    │     │ - Telemetry│  │        │  │           │        │    │
│                    │     │ - Metrics │  │        │  │           │        │    │
│                    │     └───────────┘  └─────────┘  └───────────┘        │    │
│                    └────────────────────────────────────────────────────────┘    │
│                                                 │                                │
│    ┌────────────────────────────────────────────┼────────────────────────────┐  │
│    │                    CONSUMIDORES             │                            │  │
│    ├────────────────────────────────────────────┼────────────────────────────┤  │
│    │                                            ▼                            │  │
│    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │  │
│    │  │Task Planner  │  │Capability     │  │ LLM Runtime  │  │   Media    │ │  │
│    │  │              │  │ Router        │  │              │  │  Runtime   │ │  │
│    │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │  │
│    │         │                │                │                 │          │  │
│    │         ▼                ▼                ▼                 ▼          │  │
│    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │  │
│    │  │ Runtime      │  │ API-Key       │  │ Provider     │  │ ComfyUI    │ │  │
│    │  │ Registry     │  │ Manager       │  │ Registry     │  │            │ │  │
│    │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │  │
│    └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Matriz de Componentes

### Componentes Productores (Publishers)

| Componente | Eventos que Produce | Tipo | Estado |
|------------|-------------------|------|--------|
| **ExecutionEngine** | `execution.*` | Async | ✅ Implementado |
| **TaskPlanner** | `task.*` | Async | ✅ Implementado |
| **WorkflowEngine** | `workflow.*` | Async | ✅ Implementado |
| **CapabilityRouter** | `capability.*`, `runtime.*`, `provider.*` | Sync/Async | ✅ Implementado |
| **RuntimeRegistry** | `runtime.*` | Async | ✅ Implementado |
| **ProviderRegistry** | `provider.*` | Async | ✅ Implementado |
| **API-Key Manager** | `apikey.*` | Async | 🔶 Python |
| **LLM Runtime** | `llm.*` | Async | 🔶 Por integrar |
| **Media Runtime** | `media.*` | Async | 🔶 Por integrar |
| **ComfyUI** | `media.*` | Async | 🔶 Por integrar |

### Componentes Consumidores (Subscribers)

| Componente | Eventos que Consume | Handlers |
|------------|-------------------|----------|
| **ExecutionEngine** | `task.completed`, `workflow.completed` | Continuación de flujo |
| **WorkflowEngine** | `task.*`, `execution.*` | Orquestación |
| **TaskPlanner** | `capability.resolved` | Replanificación |
| **CapabilityRouter** | `runtime.selected` | Selección de provider |
| **MetricsService** | `*.*` (wildcard) | Recolección de métricas |
| **AuditService** | `*.*` (wildcard) | Logging de auditoría |
| **HealthService** | `provider.*`, `system.*` | Monitoreo de salud |

---

## 📝 Catálogo de Eventos

### Eventos del Sistema

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `system.started` | Sistema iniciado | Sync | ✅ |
| `system.ready` | Sistema listo | Sync | ✅ |
| `system.shutdown` | Sistema apagándose | Sync | ✅ |
| `system.health_changed` | Cambio de salud | Async | ✅ |

### Eventos de Configuración

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `config.changed` | Configuración modificada | Async | ✅ |
| `provider.registered` | Provider registrado | Sync | ✅ |
| `provider.removed` | Provider eliminado | Sync | ✅ |
| `credential.updated` | Credenciales actualizadas | Sync | ✅ |

### Eventos de Agentes

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `agent.created` | Agente creado | Sync | ✅ |
| `agent.started` | Agente iniciado | Async | ✅ |
| `agent.paused` | Agente pausado | Async | ✅ |
| `agent.resumed` | Agente resumido | Async | ✅ |
| `agent.finished` | Agente terminado | Async | ✅ |
| `agent.failed` | Agente falló | Async | ✅ |

### Eventos de Workflows

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `workflow.created` | Workflow creado | Sync | ✅ |
| `workflow.started` | Workflow iniciado | Async | ✅ |
| `workflow.step_started` | Paso iniciado | Async | ❌ |
| `workflow.step_finished` | Paso terminado | Async | ❌ |
| `workflow.completed` | Workflow completado | Async | ✅ |
| `workflow.failed` | Workflow falló | Async | ✅ |

### Eventos de Tareas

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `task.created` | Tarea creada | Sync | ✅ |
| `task.assigned` | Tarea asignada | Async | ✅ |
| `task.started` | Tarea iniciada | Async | ✅ |
| `task.progress` | Progreso de tarea | Async | ❌ |
| `task.completed` | Tarea completada | Async | ✅ |
| `task.failed` | Tarea falló | Async | ✅ |
| `task.cancelled` | Tarea cancelada | Async | ✅ |

### Eventos de Ejecución

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `execution.requested` | Ejecución solicitada | Sync | ✅ |
| `execution.started` | Ejecución iniciada | Async | ✅ |
| `execution.progress` | Progreso de ejecución | Async | ❌ |
| `execution.completed` | Ejecución completada | Async | ✅ |
| `execution.failed` | Ejecución falló | Async | ✅ |
| `execution.cancelled` | Ejecución cancelada | Async | ✅ |

### Eventos del Capability Router

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `capability.resolved` | Capacidades resueltas | Sync | ✅ |
| `runtime.selected` | Runtime seleccionado | Sync | ✅ |
| `provider.selected` | Provider seleccionado | Sync | ✅ |
| `fallback.triggered` | Fallback activado | Async | ✅ |

### Eventos de Claude Code

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `claude.started` | Ejecución Claude iniciada | Async | ✅ |
| `claude.finished` | Ejecución Claude terminada | Async | ✅ |
| `claude.patch_applied` | Patch aplicado | Async | ❌ |
| `claude.terminal_executed` | Comando terminal ejecutado | Async | ❌ |
| `claude.filesystem_modified` | Archivo modificado | Async | ❌ |

### Eventos de LLM

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `llm.request_started` | Request LLM iniciado | Async | ✅ |
| `llm.request_finished` | Request LLM terminado | Async | ✅ |
| `llm.retry` | Reintento de request | Async | ✅ |
| `llm.fallback` | Fallback activado | Async | ✅ |
| `llm.timeout` | Timeout de request | Async | ✅ |

### Eventos de Media

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `media.image_started` | Generación de imagen iniciada | Async | ✅ |
| `media.image_generated` | Imagen generada | Async | ✅ |
| `media.video_started` | Generación de video iniciada | Async | ✅ |
| `media.video_generated` | Video generado | Async | ✅ |
| `media.audio_generated` | Audio generado | Async | ✅ |

### Eventos de API-Key

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `apikey.selected` | Key seleccionada | Sync | ✅ |
| `apikey.rotated` | Key rotada | Async | ✅ |
| `apikey.quota_exceeded` | Cuota excedida | Async | ✅ |
| `apikey.rate_limit` | Rate limit detectado | Async | ✅ |
| `apikey.cooldown_started` | Cooldown iniciado | Async | ✅ |
| `apikey.cooldown_finished` | Cooldown terminado | Async | ✅ |

### Eventos de Provider

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `provider.healthy` | Provider saludable | Async | ✅ |
| `provider.unhealthy` | Provider no saludable | Async | ✅ |
| `provider.recovered` | Provider recuperado | Async | ✅ |

### Eventos de Observabilidad

| Evento | Descripción | Tipo | Persistente |
|--------|-------------|------|-------------|
| `metrics.collected` | Métricas recogidas | Async | ✅ |
| `audit.log_created` | Log de auditoría creado | Async | ✅ |
| `cost.updated` | Costo actualizado | Async | ✅ |
| `telemetry.recorded` | Telemetría registrada | Async | ✅ |

---

## 🔄 Clasificación de Eventos: Síncrono vs Asíncrono

### Eventos Síncronos (Request-Response)

Estos eventos requieren respuesta inmediata y bloquean hasta que se procesen:

| Evento | Razón |
|--------|-------|
| `system.started` | Inicialización depende del evento |
| `system.ready` | Sistema no está listo hasta recibir confirmación |
| `capability.resolved` | Routing depende del resultado |
| `runtime.selected` | Selección de runtime debe ser instantánea |
| `provider.selected` | Selección de provider debe ser instantánea |
| `apikey.selected` | Selección de key debe ser instantánea |

### Eventos Asíncronos (Fire-and-Forget)

Estos eventos se procesan en segundo plano:

| Evento | Razón |
|--------|-------|
| `execution.*` | No bloquean el flujo principal |
| `workflow.*` | Procesamiento en background |
| `task.*` | Ejecución en workers |
| `llm.*` | Requests pueden tomar tiempo |
| `media.*` | Generación puede tomar tiempo |
| `provider.*` | Health checks periódicos |
| `metrics.*` | Recolección no bloqueante |

### Eventos Persistentes vs Transitorios

**Persistentes (se guardan en Event Store):**
- Todos los eventos de estado (started, completed, failed)
- Eventos de facturación
- Eventos de auditoría

**Transitorios (solo en memoria):**
- Progresos (task.progress, execution.progress)
- Logs de debugging
- Health checks exitosos

### Eventos Reintentables

| Evento | Reintentable | Max Retries |
|--------|-------------|-------------|
| `llm.retry` | ✅ | 3 |
| `llm.timeout` | ✅ | 3 |
| `execution.failed` | ✅ | 5 |
| `workflow.failed` | ✅ | 3 |
| `task.failed` | ✅ | 3 |
| `provider.unhealthy` | ✅ | 5 |

---

## 🔌 API del Event Bus

### Métodos Principales

```typescript
// Publicar un evento
await eventBus.publish<T>(event: BaseEvent<T>): Promise<void>

// Suscribirse a un tipo de evento
const subscriptionId = eventBus.subscribe<T>(
  eventType: string,
  handler: (event: BaseEvent<T>) => void | Promise<void>,
  options?: SubscribeOptions
): string

// Suscribirse una sola vez
eventBus.once<T>(
  eventType: string,
  handler: (event: BaseEvent<T>) => void | Promise<void>
): string

// Cancelar suscripción
eventBus.unsubscribe(subscriptionId: string): void

// Solicitar-Responder (Request-Response pattern)
const response = await eventBus.request<T, R>(
  requestEvent: RequestEvent<T>,
  timeout?: number
): Promise<R>

// Publicar ordenadamente (garantiza orden)
await eventBus.publishOrdered<T>(event: BaseEvent<T>): Promise<void>

// Middlewares
eventBus.use(middleware: EventMiddleware): void

// Patrones con wildcards
// 'llm.*' - Matches todos los eventos llm
// '*.started' - Matches todos los eventos started
// '*.*' - Matches todos los eventos
```

### Opciones de Suscripción

```typescript
interface SubscribeOptions {
  filter?: (event: BaseEvent) => boolean;  // Filtro personalizado
  priority?: number;                       // Prioridad del handler (mayor = primero)
  once?: boolean;                          // Auto-unsubscribe después de recibir
}
```

---

## 🛠️ Middlewares

### Middleware de Auditoría

Registra todos los eventos para auditoría:

```typescript
class AuditMiddleware implements EventMiddleware {
  name = 'audit';
  
  async onPublish(event: BaseEvent): Promise<BaseEvent> {
    await this.auditLog.save({
      eventId: event.id,
      eventType: event.type,
      source: event.source,
      timestamp: event.timestamp,
      payload: event.payload,
      correlationId: event.correlationId,
    });
    return event;
  }
}
```

### Middleware de Telemetría

Registra spans para distributed tracing:

```typescript
class TelemetryMiddleware implements EventMiddleware {
  name = 'telemetry';
  
  async onPublish(event: BaseEvent): Promise<BaseEvent> {
    const span = tracer.startSpan(`event.${event.type}`);
    span.setAttributes({
      'event.id': event.id,
      'event.source': event.source,
      'event.priority': event.priority,
    });
    event.metadata = { ...event.metadata, span };
    return event;
  }
}
```

### Middleware de Métricas

Recoge métricas Prometheus:

```typescript
class MetricsMiddleware implements EventMiddleware {
  name = 'metrics';
  
  onPublish(event: BaseEvent): BaseEvent {
    metrics.eventsPublished.inc({ type: event.type });
    return event;
  }
}
```

---

## 📨 Dead Letter Queue (DLQ)

Los eventos que fallan después de todos los reintentos van a la DLQ:

```typescript
// Configuración
const eventBus = new EventBus({
  maxRetries: 3,
  retryDelay: 1000,
  deadLetterQueueSize: 1000,
});

// Obtener eventos fallidos
const deadLetters = eventBus.getDeadLetterQueue();

// Reprocesar
await eventBus.reprocessDeadLetters();
```

---

## 📈 Observabilidad

### Métricas Prometheus

```
# Contadores
librechat_events_published_total{type, source}
librechat_events_consumed_total{type, subscriber}
librechat_events_failed_total{type, error_type}
librechat_events_dead_lettered_total{type}

# Histogramas
librechat_event_processing_duration_seconds{type}
librechat_event_queue_size

# Gauges
librechat_active_subscriptions
librechat_dead_letter_queue_size
```

### Logs Estructurados

```json
{
  "timestamp": "2026-07-20T12:00:00Z",
  "level": "info",
  "event": {
    "id": "evt-123",
    "type": "execution.completed",
    "source": "ExecutionEngine",
    "correlationId": "corr-456"
  },
  "message": "Execution completed successfully"
}
```

### Trazas Distribuidas

Cada evento propaga un `correlationId` para追踪 todo el flujo:

```
correlationId: corr-456
├── ExecutionEngine: execution.started (corr-456)
│   └── TaskPlanner: task.created (corr-456)
│       └── WorkflowEngine: workflow.started (corr-456)
│           ├── LLM Runtime: llm.request_started (corr-456)
│           └── LLM Runtime: llm.request_finished (corr-456)
└── ExecutionEngine: execution.completed (corr-456)
```

---

## 🔮 Plan de Migración a Sistema Distribuido

### Fase 1: Event Bus Interno (Actual)

- **Tecnología**: Node.js EventEmitter
- **Persistencia**: En memoria (historial de 1000 eventos)
- **Caso de uso**: Monolithic Node.js application
- **Limitaciones**:
  - No persiste entre reinicios
  - No escala horizontalmente
  - No hay garantías de entrega exactly-once

### Fase 2: Redis Streams (Próximo)

**Cuándo migrar**: Cuando haya múltiples instancias de la API

```typescript
// Nueva implementación
class RedisEventBus extends EventBus {
  private streams: Redis;
  
  async publish<T>(event: BaseEvent<T>): Promise<void> {
    await this.streams.xadd(
      event.type,
      '*',
      'data', JSON.stringify(event),
      'priority', event.priority
    );
  }
  
  async subscribe(
    eventType: string,
    handler: EventHandler
  ): Promise<string> {
    // Consumer groups para scaling
    await this.streams.xreadgroup(
      'consumer-group',
      'consumer-' + os.hostname(),
      'COUNT', 100,
      'BLOCK', 5000,
      'STREAMS', eventType,
      '>'
    );
  }
}
```

**Ventajas**:
- Persistencia de eventos
- Replay de eventos
- Múltiples consumers
- Latencia baja

### Fase 3: Apache Kafka (Futuro)

**Cuándo migrar**: Cuando se necesite:
- Throughput muy alto (>100K eventos/segundo)
- Event sourcing
- Event streaming a múltiples sistemas
- Confluent Schema Registry

**Configuración**:

```yaml
# kafka-config.yaml
kafka:
  brokers:
    - kafka-1:9092
    - kafka-2:9092
    - kafka-3:9092
  
  topics:
    - name: librechat.events
      partitions: 12
      replication: 3
      retention: 7days
    
    - name: librechat.dead-letter
      partitions: 3
      retention: 30days
  
  consumers:
    - group: execution-engine
      topics: [execution.*, task.*]
    - group: workflow-engine
      topics: [workflow.*]
    - group: observability
      topics: [*]  # Todos los eventos
```

### Compatibilidad hacia atrás

El EventBus está diseñado con una interfaz común que permite cambiar la implementación subyacente sin modificar los productores o consumidores:

```typescript
// Interfaz común
interface IEventBus {
  publish<T>(event: BaseEvent<T>): Promise<void>;
  subscribe<T>(type: string, handler: EventHandler<T>): string;
  unsubscribe(id: string): void;
  request<T, R>(event: RequestEvent<T>, timeout?: number): Promise<R>;
}

// Implementaciones
class InMemoryEventBus implements IEventBus { ... }
class RedisEventBus implements IEventBus { ... }
class KafkaEventBus implements IEventBus { ... }
```

---

## ✅ Checklist de Implementación

### Completados

- [x] EventBus core con publish/subscribe
- [x] Middlewares (Audit, Telemetry, Metrics)
- [x] Dead Letter Queue
- [x] Reintentos automáticos
- [x] Pattern matching con wildcards
- [x] Prioridades de eventos
- [x] Historial de eventos
- [x] Integración con ExecutionEngine
- [x] Integración con TaskPlanner
- [x] Integración con WorkflowEngine
- [x] Integración con CapabilityRouter
- [x] Integración con RuntimeRegistry
- [x] Integración con ProviderRegistry
- [x] Integración con SharedServices

### Por Completar

- [ ] Integración con LLM Runtime (llm.* events)
- [ ] Integración con Media Runtime (media.* events)
- [ ] Integración con ComfyUI (media.* events)
- [ ] Tests de concurrencia
- [ ] Tests de stress
- [ ] Documentación de API con OpenAPI
- [ ] Implementación Redis Streams
- [ ] Dashboard de monitoring del EventBus

---

## 📚 Referencias

- [Event-Driven Architecture Patterns](https://event-driven.io/)
- [Martin Fowler - Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Redis Streams](https://redis.io/docs/data-types/streams/)
- [Apache Kafka](https://kafka.apache.org/)
- [EventEmitter3](https://github.com/primus/eventemitter3)

---

*Documento actualizado: 2026-07-20*
