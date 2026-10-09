/**
 * Tests para EventBus Client
 */

import EventBusClient, { EventType, EventBusEvent } from '../EventBus';

describe('EventBusClient', () => {
  let eventBus: EventBusClient;

  beforeEach(() => {
    // Crear nueva instancia para cada test
    eventBus = EventBusClient.getInstance();
    // Limpiar
    eventBus.clear();
  });

  afterEach(() => {
    eventBus.clear();
    eventBus.disconnect();
  });

  describe('Suscripción y Emisión', () => {
    test('should subscribe and receive events', (done) => {
      const unsubscribe = eventBus.subscribe('agent:created', (event) => {
        expect(event.type).toBe('agent:created');
        expect(event.message).toBe('Test message');
        done();
      });

      eventBus.emit('agent:created', 'Test message', { agentId: 'agent-1' });

      unsubscribe();
    });

    test('should unsubscribe from events', () => {
      let callCount = 0;
      
      const handler = () => { callCount++; };
      
      eventBus.subscribe('test:event', handler);
      const unsubscribe = eventBus.subscribe('test:event', handler);
      
      eventBus.emit('test:event', 'Test');
      expect(callCount).toBe(2);
      
      unsubscribe();
      
      eventBus.emit('test:event', 'Test');
      expect(callCount).toBe(3); // Solo el primero sigue
    });

    test('should subscribe to all events with wildcard', (done) => {
      let eventCount = 0;
      
      eventBus.subscribe('*', (event) => {
        eventCount++;
        
        if (eventCount >= 2) {
          expect(eventCount).toBe(2);
          done();
        }
      });

      eventBus.emit('event:one', 'Event 1');
      eventBus.emit('event:two', 'Event 2');
    });

    test('should handle multiple event types', () => {
      const events: EventBusEvent[] = [];
      
      eventBus.subscribe('agent:created', (e) => events.push(e));
      eventBus.subscribe('agent:started', (e) => events.push(e));
      eventBus.subscribe('agent:completed', (e) => events.push(e));

      eventBus.emit('agent:created', 'Agent created');
      eventBus.emit('agent:started', 'Agent started');
      eventBus.emit('agent:completed', 'Agent completed');

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('agent:created');
      expect(events[1].type).toBe('agent:started');
      expect(events[2].type).toBe('agent:completed');
    });

    test('should include event data', () => {
      let receivedEvent: EventBusEvent | null = null;
      
      eventBus.subscribe('tool:started', (event) => {
        receivedEvent = event;
      });

      const testData = { toolId: 'read_file', args: { path: '/test' } };
      eventBus.emit('tool:started', 'Tool started', testData);

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent!.data).toEqual(testData);
      expect(receivedEvent!.source).toBe('client');
    });

    test('should generate unique event IDs', () => {
      const ids: string[] = [];
      
      eventBus.subscribe('test', (event) => ids.push(event.id));
      
      eventBus.emit('test', '1');
      eventBus.emit('test', '2');
      eventBus.emit('test', '3');

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    test('should include timestamp', () => {
      let receivedEvent: EventBusEvent | null = null;
      const beforeTime = new Date();
      
      eventBus.subscribe('test', (event) => {
        receivedEvent = event;
      });

      eventBus.emit('test', 'Test');
      
      const afterTime = new Date();
      
      expect(receivedEvent!.timestamp).toBeInstanceOf(Date);
      expect(receivedEvent!.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(receivedEvent!.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('Gestión de Eventos', () => {
    test('should emit with just type and message', () => {
      let receivedEvent: EventBusEvent | null = null;
      
      eventBus.subscribe('test', (event) => {
        receivedEvent = event;
      });

      eventBus.emit('test', 'Simple message');

      expect(receivedEvent!.message).toBe('Simple message');
      expect(receivedEvent!.data).toBeUndefined();
    });

    test('should emit with type, message and data', () => {
      let receivedEvent: EventBusEvent | null = null;
      
      eventBus.subscribe('test', (event) => {
        receivedEvent = event;
      });

      eventBus.emit('test', 'Message with data', { key: 'value', count: 42 });

      expect(receivedEvent!.message).toBe('Message with data');
      expect(receivedEvent!.data).toEqual({ key: 'value', count: 42 });
    });

    test('should handle nested data objects', () => {
      let receivedEvent: EventBusEvent | null = null;
      
      eventBus.subscribe('test', (event) => {
        receivedEvent = event;
      });

      const nestedData = {
        user: { name: 'Test', settings: { theme: 'dark' } },
        items: [1, 2, 3],
      };

      eventBus.emit('test', 'Nested data', nestedData);

      expect(receivedEvent!.data).toEqual(nestedData);
    });

    test('should publish events (alias for emit)', () => {
      let receivedEvent: EventBusEvent | null = null;
      
      eventBus.subscribe('test', (event) => {
        receivedEvent = event;
      });

      eventBus.publish({
        id: 'test-id',
        type: 'test',
        message: 'Published event',
        timestamp: new Date(),
        source: 'test',
        data: { published: true },
      });

      expect(receivedEvent!.id).toBe('test-id');
      expect(receivedEvent!.message).toBe('Published event');
    });
  });

  describe('Estado de Conexión', () => {
    test('should report disconnected by default', () => {
      expect(eventBus.getIsConnected()).toBe(false);
      expect(eventBus.getStatus()).toBe('disconnected');
    });

    test('should track connection status changes', (done) => {
      eventBus.on('connected', () => {
        expect(eventBus.getIsConnected()).toBe(true);
        expect(eventBus.getStatus()).toBe('connected');
        done();
      });

      // Simular conexión (en test, solo verificamos el estado)
      // La conexión real requiere un servidor
    });

    test('should emit error event', (done) => {
      eventBus.on('error', (error) => {
        expect(error).toBeDefined();
        done();
      });

      // Simular error
      eventBus.emit('error', 'Test error', { error: 'test' });
    });
  });

  describe('Eventos de Agent', () => {
    test('should handle agent:created event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('agent:created', (e) => { received = e; });

      eventBus.emit('agent:created', 'Agent created', {
        agentId: 'agent-123',
        name: 'TestAgent',
        role: 'orchestrator',
      });

      expect(received!.data!.agentId).toBe('agent-123');
      expect(received!.data!.name).toBe('TestAgent');
    });

    test('should handle agent:completed event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('agent:completed', (e) => { received = e; });

      eventBus.emit('agent:completed', 'Agent completed', {
        agentId: 'agent-123',
        duration: 5000,
      });

      expect(received!.data!.agentId).toBe('agent-123');
      expect(received!.data!.duration).toBe(5000);
    });

    test('should handle agent:failed event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('agent:failed', (e) => { received = e; });

      eventBus.emit('agent:failed', 'Agent failed', {
        agentId: 'agent-123',
        error: 'Connection timeout',
      });

      expect(received!.data!.error).toBe('Connection timeout');
    });
  });

  describe('Eventos de Tool', () => {
    test('should handle tool:started event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('tool:started', (e) => { received = e; });

      eventBus.emit('tool:started', 'Tool started', {
        id: 'tool-1',
        name: 'read_file',
        args: { path: '/test.txt' },
      });

      expect(received!.data!.name).toBe('read_file');
    });

    test('should handle tool:completed event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('tool:completed', (e) => { received = e; });

      eventBus.emit('tool:completed', 'Tool completed', {
        id: 'tool-1',
        result: 'file content',
      });

      expect(received!.data!.result).toBe('file content');
    });

    test('should handle tool:approval_required event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('tool:approval_required', (e) => { received = e; });

      eventBus.emit('tool:approval_required', 'Approval needed', {
        toolId: 'delete_file',
        reason: 'Deletes files',
      });

      expect(received!.data!.toolId).toBe('delete_file');
      expect(received!.data!.reason).toBe('Deletes files');
    });
  });

  describe('Eventos de Sandbox', () => {
    test('should handle sandbox:created event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('sandbox:created', (e) => { received = e; });

      eventBus.emit('sandbox:created', 'Sandbox created', {
        sandboxId: 'sandbox-123',
      });

      expect(received!.data!.sandboxId).toBe('sandbox-123');
    });

    test('should handle sandbox:apply_requested event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('sandbox:apply_requested', (e) => { received = e; });

      eventBus.emit('sandbox:apply_requested', 'Apply changes requested', {
        sandboxId: 'sandbox-123',
        files: ['file1.txt', 'file2.txt'],
      });

      expect(received!.data!.files).toContain('file1.txt');
    });
  });

  describe('Eventos de Change', () => {
    test('should handle change:pending event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('change:pending', (e) => { received = e; });

      eventBus.emit('change:pending', 'Change pending', {
        filePath: '/test.txt',
        changeType: 'modify',
      });

      expect(received!.data!.filePath).toBe('/test.txt');
      expect(received!.data!.changeType).toBe('modify');
    });

    test('should handle change:approved event', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('change:approved', (e) => { received = e; });

      eventBus.emit('change:approved', 'Change approved', {
        filePath: '/test.txt',
        approvedBy: 'user-1',
      });

      expect(received!.data!.approvedBy).toBe('user-1');
    });
  });

  describe('Limpieza', () => {
    test('should clear all listeners', () => {
      let callCount = 0;
      
      eventBus.subscribe('test1', () => callCount++);
      eventBus.subscribe('test2', () => callCount++);
      eventBus.subscribe('test3', () => callCount++);

      eventBus.emit('test1', '');
      eventBus.emit('test2', '');
      eventBus.emit('test3', '');
      
      expect(callCount).toBe(3);

      eventBus.clear();

      eventBus.emit('test1', '');
      eventBus.emit('test2', '');
      eventBus.emit('test3', '');
      
      // No debe incrementar porque se limpió
      expect(callCount).toBe(3);
    });

    test('should return unsubscribe function', () => {
      let callCount = 0;
      
      const unsubscribe = eventBus.subscribe('test', () => callCount++);
      
      eventBus.emit('test', '');
      expect(callCount).toBe(1);
      
      unsubscribe();
      
      eventBus.emit('test', '');
      expect(callCount).toBe(1); // No cambió
    });
  });

  describe('Singleton', () => {
    test('should return same instance', () => {
      const instance1 = EventBusClient.getInstance();
      const instance2 = EventBusClient.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    test('getEventBus should be alias for getInstance', () => {
      const { getEventBus } = require('../EventBus');
      
      const instance = getEventBus();
      expect(instance).toBe(EventBusClient.getInstance());
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid emissions', () => {
      let eventCount = 0;
      
      eventBus.subscribe('test', () => eventCount++);

      for (let i = 0; i < 100; i++) {
        eventBus.emit('test', `Event ${i}`);
      }

      expect(eventCount).toBe(100);
    });

    test('should handle empty data', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('test', (e) => { received = e; });

      eventBus.emit('test', 'Empty data', {});

      expect(received!.data).toEqual({});
    });

    test('should handle null in data', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('test', (e) => { received = e; });

      eventBus.emit('test', 'Null data', { nullValue: null, nested: { nullInNested: null } });

      expect(received!.data!.nullValue).toBeNull();
      expect((received!.data!.nested as Record<string, unknown>).nullInNested).toBeNull();
    });

    test('should handle special characters in message', () => {
      let received: EventBusEvent | null = null;
      
      eventBus.subscribe('test', (e) => { received = e; });

      eventBus.emit('test', 'Mensaje con ñ y emojis y simbolos especiales');

      expect(received!.message).toContain('ñ');
      expect(received!.message).toContain('🎉');
    });
  });
});

describe('EventType', () => {
  test('should have all agent event types', () => {
    const agentEvents: EventType[] = [
      'agent:created',
      'agent:started',
      'agent:paused',
      'agent:resumed',
      'agent:completed',
      'agent:failed',
      'agent:message',
    ];

    agentEvents.forEach(eventType => {
      expect(typeof eventType).toBe('string');
    });
  });

  test('should have all tool event types', () => {
    const toolEvents: EventType[] = [
      'tool:started',
      'tool:completed',
      'tool:error',
      'tool:approval_required',
    ];

    toolEvents.forEach(eventType => {
      expect(typeof eventType).toBe('string');
    });
  });

  test('should have all sandbox event types', () => {
    const sandboxEvents: EventType[] = [
      'sandbox:created',
      'sandbox:starting',
      'sandbox:started',
      'sandbox:apply_requested',
      'sandbox:apply_completed',
      'sandbox:apply_failed',
      'sandbox:discarded',
    ];

    sandboxEvents.forEach(eventType => {
      expect(typeof eventType).toBe('string');
    });
  });
});
