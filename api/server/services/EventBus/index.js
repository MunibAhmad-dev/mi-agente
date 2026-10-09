/**
 * Event Bus - Sistema de Eventos Centralizado (JavaScript)
 *
 * Proporciona pub/sub desacoplado para toda la arquitectura.
 *
 * FLUJO:
 * Cualquier componente puede publicar eventos
 * Cualquier componente puede suscribirse a eventos
 * Los eventos pueden tener prioridades y correlación
 */

const EventEmitter = require('events');
const crypto = require('crypto');

const uuidv4 = () => crypto.randomUUID();

// Logger simple que usa console
const logger = {
  debug: (...args) => console.log('[EventBus]', ...args),
  info: (...args) => console.log('[EventBus]', ...args),
  warn: (...args) => console.warn('[EventBus]', ...args),
  error: (...args) => console.error('[EventBus]', ...args),
};

// Tipos de eventos del sistema
const EventType = {
  // Sistema
  SYSTEM_STARTED: 'system.started',
  SYSTEM_READY: 'system.ready',
  SYSTEM_SHUTDOWN: 'system.shutdown',

  // Ejecución
  EXECUTION_REQUESTED: 'execution.requested',
  EXECUTION_STARTED: 'execution.started',
  EXECUTION_COMPLETED: 'execution.completed',
  EXECUTION_FAILED: 'execution.failed',

  // Tasks
  TASK_CREATED: 'task.created',
  TASK_STARTED: 'task.started',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',

  // Workflow
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_STEP_STARTED: 'workflow.step_started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',

  // Runtime
  RUNTIME_REGISTERED: 'runtime.registered',
  RUNTIME_SELECTED: 'runtime.selected',
  RUNTIME_HEALTH_CHECK: 'runtime.health_check',

  // Provider
  PROVIDER_SELECTED: 'provider.selected',
  PROVIDER_HEALTHY: 'provider.healthy',
  PROVIDER_UNHEALTHY: 'provider.unhealthy',

  // LLM
  LLM_REQUEST_STARTED: 'llm.request_started',
  LLM_REQUEST_FINISHED: 'llm.request_finished',
  LLM_FALLBACK: 'llm.fallback',

  // Capability
  CAPABILITY_RESOLVED: 'capability.resolved',
  CAPABILITY_ROUTED: 'capability.routed',

  // API Key
  APIKEY_SELECTED: 'apikey.selected',
  APIKEY_ROTATED: 'apikey.rotated',
  APIKEY_QUOTA_EXCEEDED: 'apikey.quota_exceeded',
  APIKEY_RATE_LIMIT: 'apikey.rate_limit',

  // Media
  IMAGE_GENERATION_STARTED: 'media.image_started',
  IMAGE_GENERATED: 'media.image_generated',

  // Cost
  COST_UPDATED: 'cost.updated',
};

// Prioridades de eventos
const EventPriority = {
  CRITICAL: 'critical',
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
  BACKGROUND: 'background',
};

/**
 * Event Bus Singleton
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.subscriptions = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 1000;

    logger.info('[EventBus] Initialized');
  }

  /**
   * Publicar un evento
   */
  publish(type, payload, source = 'unknown', options = {}) {
    const event = {
      id: uuidv4(),
      type,
      timestamp: Date.now(),
      source,
      correlationId: options.correlationId,
      priority: options.priority || EventPriority.NORMAL,
      payload,
      metadata: options.metadata || {},
    };

    // Registrar en historial
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Log del evento
    if (options.log !== false) {
      logger.debug(`[EventBus] Event published: ${type}`, { eventId: event.id, source });
    }

    // Emitir el evento
    this.emit(type, event);

    return event;
  }

  /**
   * Suscribirse a un evento
   */
  subscribe(eventType, handler, options = {}) {
    const subscriptionId = uuidv4();

    const wrappedHandler = async (event) => {
      try {
        // Filtrar por correlación si se especifica
        if (options.correlationId && event.correlationId !== options.correlationId) {
          return;
        }

        await handler(event);
      } catch (error) {
        logger.error(`[EventBus] Handler error for ${eventType}:`, error);
      }
    };

    this.subscriptions.set(subscriptionId, { eventType, handler: wrappedHandler });
    this.on(eventType, wrappedHandler);

    logger.debug(`[EventBus] Subscribed to: ${eventType}`, { subscriptionId });

    return subscriptionId;
  }

  /**
   * Suscribirse a múltiples eventos (wildcard)
   */
  subscribeAll(pattern, handler) {
    const subscriptionId = uuidv4();

    const wrappedHandler = async (event) => {
      if (this.matchPattern(event.type, pattern)) {
        await handler(event);
      }
    };

    this.subscriptions.set(subscriptionId, { pattern, handler: wrappedHandler });
    this.on('*', wrappedHandler);

    return subscriptionId;
  }

  /**
   * Verificar si un tipo de evento coincide con un patrón
   */
  matchPattern(eventType, pattern) {
    if (pattern === '*') return true;
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(eventType);
    }
    return eventType === pattern;
  }

  /**
   * Desuscribirse de un evento
   */
  unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    if (subscription.pattern) {
      this.removeListener('*', subscription.handler);
    } else {
      this.removeListener(subscription.eventType, subscription.handler);
    }

    this.subscriptions.delete(subscriptionId);
    logger.debug(`[EventBus] Unsubscribed: ${subscriptionId}`);

    return true;
  }

  /**
   * Desuscribir todos
   */
  unsubscribeAll() {
    for (const [id] of this.subscriptions) {
      this.unsubscribe(id);
    }
    this.removeAllListeners();
    logger.info('[EventBus] All subscriptions cleared');
  }

  /**
   * Obtener historial de eventos
   */
  getHistory(eventType, limit = 100) {
    let history = this.eventHistory;

    if (eventType) {
      history = history.filter((e) => e.type === eventType);
    }

    return history.slice(-limit);
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    return {
      subscriptionCount: this.subscriptions.size,
      eventTypes: Array.from(new Set(this.eventHistory.map((e) => e.type))),
      totalEvents: this.eventHistory.length,
      listeners: this.listenerCount('*'),
    };
  }

  /**
   * Limpiar historial
   */
  clearHistory() {
    this.eventHistory = [];
    logger.debug('[EventBus] History cleared');
  }
}

// Singleton
let eventBusInstance = null;

function getEventBus() {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}

function createEventBus() {
  eventBusInstance = new EventBus();
  return eventBusInstance;
}

/**
 * Crear un evento estructurado
 */
function createEvent(type, payload, source, options = {}) {
  return {
    id: uuidv4(),
    type,
    timestamp: Date.now(),
    source,
    correlationId: options.correlationId || uuidv4(),
    priority: options.priority || EventPriority.NORMAL,
    payload,
    metadata: options.metadata || {},
  };
}

// Tipos de eventos de supervisor
const {
  SupervisorEventTypes,
  SupervisorEventCategories,
  createSessionPayload,
  createAgentPayload,
  createTaskPayload,
  createSandboxPayload,
  createCommandPayload,
  createFilePayload,
} = require('./SupervisorEventTypes');

// Chat Instrumenter
const {
  ChatInstrumenter,
  chatInstrumenter,
  TOOL_CATEGORIES,
  classifyTool,
  extractFilePath,
  extractCommand,
} = require('./ChatInstrumenter');

// Middleware de instrumentación
const { instrumentMiddleware, GraphEvents } = require('./ChatInstrumenterMiddleware');

module.exports = {
  EventBus,
  getEventBus,
  createEventBus,
  createEvent,
  EventType,
  EventPriority,
  // Supervisor Events
  SupervisorEventTypes,
  SupervisorEventCategories,
  // Payload helpers
  createSessionPayload,
  createAgentPayload,
  createTaskPayload,
  createSandboxPayload,
  createCommandPayload,
  createFilePayload,
  // Chat Instrumenter
  ChatInstrumenter,
  chatInstrumenter,
  TOOL_CATEGORIES,
  classifyTool,
  extractFilePath,
  extractCommand,
  // Middleware de instrumentación
  instrumentMiddleware,
  GraphEvents,
};
