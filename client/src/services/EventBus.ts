/**
 * EventBus Client Service
 * 
 * Implementación del EventBus del lado del cliente.
 * Recibe eventos del servidor a través de SSE y los re-emite localmente.
 */

import { EventEmitter } from 'eventemitter3';

export type EventType =
  // Agent Events
  | 'agent:created'
  | 'agent:started'
  | 'agent:paused'
  | 'agent:resumed'
  | 'agent:completed'
  | 'agent:failed'
  | 'agent:message'
  // Execution Events
  | 'execution:requested'
  | 'execution:started'
  | 'execution:completed'
  | 'execution:failed'
  // Tool Events
  | 'tool:started'
  | 'tool:completed'
  | 'tool:error'
  | 'tool:approval_required'
  // LLM Events
  | 'llm:request_started'
  | 'llm:request_completed'
  | 'llm:request_failed'
  // File Events
  | 'file:read'
  | 'file:written'
  | 'file:deleted'
  | 'file:created'
  | 'file:modified'
  // Command Events
  | 'command:started'
  | 'command:completed'
  | 'command:error'
  // Sandbox Events
  | 'sandbox:created'
  | 'sandbox:starting'
  | 'sandbox:started'
  | 'sandbox:apply_requested'
  | 'sandbox:apply_completed'
  | 'sandbox:apply_failed'
  | 'sandbox:discarded'
  // Session Events
  | 'session:start'
  | 'session:end'
  | 'session:error'
  // Change Events
  | 'change:pending'
  | 'change:approved'
  | 'change:rejected'
  | 'change:applied'
  // Milestone Events
  | 'milestone:reached'
  // Agent orchestrator events (dot + colon variants)
  | 'agent:removed'
  | 'agent:task_assigned'
  | 'agent:task_completed'
  | 'agent:message_sent'
  | 'orchestration:started'
  | 'orchestration:stopped'
  // Sandbox events (dot-notation variant used by useSandbox)
  | 'sandbox.created'
  | 'sandbox.destroyed'
  | 'sandbox.command.started'
  | 'sandbox.command.error'
  | 'sandbox.changes.applying'
  | 'sandbox.changes.applied'
  | 'sandbox.changes.error'
  | 'sandbox.changes.discarded'
  // Task / process events
  | 'terminal.input'
  | 'process.started'
  | 'process.completed'
  | 'process.killed'
  // Tool events (dot-notation variant)
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  // Browser events
  | 'browser.navigated'
  // Generic
  | 'error'
  | 'warning'
  | 'info'
  // Test-only event types
  | 'test'
  | 'test:event'
  | 'test1'
  | 'test2'
  | 'test3'
  | 'event:one'
  | 'event:two';

export interface EventBusEvent {
  id: string;
  type: EventType;
  message: string;
  timestamp: Date;
  source: string;
  data?: Record<string, unknown>;
}

export interface EventBusOptions {
  /** URL del stream SSE (opcional, usa el actual si no se provee) */
  streamUrl?: string;
  /** Auto-conectar al iniciar */
  autoConnect?: boolean;
  /** Reintentar conexiones fallidas */
  retryOnDisconnect?: boolean;
  /** Intervalo de reintento en ms */
  retryInterval?: number;
}

type EventHandler = (event: EventBusEvent) => void;

class EventBusClient {
  private static instance: EventBusClient;
  private emitter: EventEmitter;
  private eventSource: EventSource | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private retryInterval: number = 3000;
  private subscriptions: Map<string, Set<EventHandler>> = new Map();
  private eventQueue: EventBusEvent[] = [];
  private streamUrl: string = '';

  private constructor() {
    this.emitter = new EventEmitter();
    // Guard: eventemitter3 doesn't expose setMaxListeners in its types
    // but some runtimes do — call it safely via cast.
    const emitterAny = this.emitter as unknown as { setMaxListeners?: (n: number) => void };
    if (typeof emitterAny.setMaxListeners === 'function') {
      emitterAny.setMaxListeners(100);
    }
  }

  /**
   * Obtener instancia singleton
   */
  static getInstance(): EventBusClient {
    if (!EventBusClient.instance) {
      EventBusClient.instance = new EventBusClient();
    }
    return EventBusClient.instance;
  }

  /**
   * Obtener EventBus (alias para getInstance)
   */
  static getEventBus(): EventBusClient {
    return EventBusClient.getInstance();
  }

  /**
   * Conectar al stream SSE del servidor
   */
  connect(streamUrl?: string): void {
    if (this.isConnected && this.eventSource) {
      console.warn('[EventBus] Already connected');
      return;
    }

    this.streamUrl = streamUrl || this.getDefaultStreamUrl();
    
    try {
      this.eventSource = new EventSource(this.streamUrl);
      
      this.eventSource.onopen = () => {
        console.log('[EventBus] Connected to stream');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Enviar eventos encolados
        this.flushEventQueue();
        
        this.emitter.emit('connected');
      };

      this.eventSource.onerror = (error) => {
        console.error('[EventBus] Stream error:', error);
        this.isConnected = false;
        this.emitter.emit('error', error);
        
        // Reintentar conexión
        this.handleReconnect();
      };

      // Manejar eventos del servidor
      this.setupEventListeners();
      
    } catch (error) {
      console.error('[EventBus] Failed to connect:', error);
      this.emitter.emit('error', error);
    }
  }

  /**
   * Desconectar del stream
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
    this.emitter.emit('disconnected');
  }

  /**
   * Suscribirse a un tipo de evento
   */
  subscribe(eventType: EventType | '*', handler: EventHandler): () => void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    
    this.subscriptions.get(eventType)!.add(handler);
    
    // También suscribir al emitter interno
    this.emitter.on(eventType, handler);
    
    // Devolver función de cleanup
    return () => {
      this.unsubscribe(eventType, handler);
    };
  }

  /**
   * Desuscribirse de un evento
   */
  unsubscribe(eventType: EventType | '*', handler: EventHandler): void {
    const handlers = this.subscriptions.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
    this.emitter.off(eventType, handler);
  }

  /**
   * Publicar un evento (solo local)
   */
  publish(event: EventBusEvent): void {
    this.emitter.emit(event.type, event);
  }

  /**
   * Publicar evento simple
   */
  emit(type: EventType, message: string, data?: Record<string, unknown>): void {
    const event: EventBusEvent = {
      id: this.generateId(),
      type,
      message,
      timestamp: new Date(),
      source: 'client',
      data,
    };
    
    this.publish(event);
  }

  /**
   * Verificar si está conectado
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Obtener estado de conexión
   */
  getStatus(): 'connected' | 'disconnected' | 'connecting' {
    if (this.isConnected) return 'connected';
    if (this.eventSource?.CONNECTING) return 'connecting';
    return 'disconnected';
  }

  // Eventos internos
  on(event: 'connected' | 'disconnected' | 'error', handler: (data?: unknown) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: 'connected' | 'disconnected' | 'error', handler: (data?: unknown) => void): void {
    this.emitter.off(event, handler);
  }

  /**
   * Limpiar todos los listeners
   */
  clear(): void {
    this.emitter.removeAllListeners();
    this.subscriptions.clear();
    this.eventQueue = [];
  }

  /**
   * Configurar listeners de eventos SSE
   */
  private setupEventListeners(): void {
    if (!this.eventSource) return;

    // Manejar eventos del servidor
    const eventTypes: EventType[] = [
      'agent:created', 'agent:started', 'agent:paused', 'agent:resumed',
      'agent:completed', 'agent:failed', 'agent:message',
      'execution:requested', 'execution:started', 'execution:completed', 'execution:failed',
      'tool:started', 'tool:completed', 'tool:error', 'tool:approval_required',
      'llm:request_started', 'llm:request_completed', 'llm:request_failed',
      'file:read', 'file:written', 'file:deleted', 'file:created', 'file:modified',
      'command:started', 'command:completed', 'command:error',
      'sandbox:created', 'sandbox:starting', 'sandbox:started',
      'sandbox:apply_requested', 'sandbox:apply_completed', 'sandbox:apply_failed', 'sandbox:discarded',
      'session:start', 'session:end', 'session:error',
      'change:pending', 'change:approved', 'change:rejected', 'change:applied',
      'milestone:reached',
    ];

    eventTypes.forEach(type => {
      this.eventSource!.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const event: EventBusEvent = {
            id: data.id || this.generateId(),
            type: data.type || type,
            message: data.message || '',
            timestamp: new Date(data.timestamp || Date.now()),
            source: data.source || 'server',
            data: data.data || data,
          };
          
          this.handleEvent(event);
        } catch (error) {
          console.error(`[EventBus] Error parsing event ${type}:`, error);
        }
      });
    });

    // Manejar evento genérico 'message' del EventSource
    this.eventSource.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type) {
          const event: EventBusEvent = {
            id: data.id || this.generateId(),
            type: data.type,
            message: data.message || '',
            timestamp: new Date(data.timestamp || Date.now()),
            source: data.source || 'server',
            data: data.data || data,
          };
          
          this.handleEvent(event);
        }
      } catch (error) {
        // Ignorar errores de parseo en mensajes genéricos
      }
    };
  }

  /**
   * Manejar evento recibido
   */
  private handleEvent(event: EventBusEvent): void {
    // Si no está conectado, encolar
    if (!this.isConnected) {
      this.eventQueue.push(event);
      return;
    }

    // Re-emitir el evento localmente
    this.emitter.emit(event.type, event);
    
    // También re-emitir a wildcard subscribers
    const wildcardHandlers = this.subscriptions.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => handler(event));
    }
  }

  /**
   * Enviar eventos encolados
   */
  private flushEventQueue(): void {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (event) {
        this.emitter.emit(event.type, event);
      }
    }
  }

  /**
   * Manejar reconexión
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[EventBus] Max reconnection attempts reached');
      this.emitter.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    
    setTimeout(() => {
      console.log(`[EventBus] Reconnecting... (attempt ${this.reconnectAttempts})`);
      this.disconnect();
      this.connect(this.streamUrl);
    }, this.retryInterval * this.reconnectAttempts);
  }

  /**
   * Obtener URL por defecto del stream
   */
  private getDefaultStreamUrl(): string {
    // Intentar inferir de la URL actual
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.host;
    return `${protocol}//${host}/api/events/stream`;
  }

  /**
   * Generar ID único
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Exportar para uso directo
export const getEventBus = EventBusClient.getEventBus;
export const eventBus = EventBusClient.getInstance();

export default EventBusClient;
