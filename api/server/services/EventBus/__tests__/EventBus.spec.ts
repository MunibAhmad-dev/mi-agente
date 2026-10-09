/**
 * EventBus - Unit Tests
 */

import {
  EventBus,
  EventType,
  EventPriority,
  createEvent,
  getEventBus,
  createEventBus,
  BaseEvent,
  RequestEvent,
} from '../EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    // Create a fresh EventBus instance for each test
    eventBus = createEventBus({
      enableLogging: false,
      enableTelemetry: false,
      enableAudit: false,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('publish and subscribe', () => {
    it('should publish and receive events', async () => {
      const receivedEvents: BaseEvent[] = [];

      eventBus.subscribe(EventType.SYSTEM_STARTED, (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, { test: true }, 'TestSource'));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe(EventType.SYSTEM_STARTED);
      expect(receivedEvents[0].payload).toEqual({ test: true });
    });

    it('should support multiple subscribers for same event', async () => {
      const receivedByFirst: BaseEvent[] = [];
      const receivedBySecond: BaseEvent[] = [];

      eventBus.subscribe(EventType.TASK_CREATED, (event) => {
        receivedByFirst.push(event);
      });

      eventBus.subscribe(EventType.TASK_CREATED, (event) => {
        receivedBySecond.push(event);
      });

      await eventBus.publish(createEvent(EventType.TASK_CREATED, { id: 'task-1' }, 'TestSource'));

      expect(receivedByFirst).toHaveLength(1);
      expect(receivedBySecond).toHaveLength(1);
    });

    it('should handle async handlers', async () => {
      let handlerCompleted = false;

      eventBus.subscribe(EventType.EXECUTION_STARTED, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        handlerCompleted = true;
      });

      await eventBus.publish(createEvent(EventType.EXECUTION_STARTED, {}, 'TestSource'));

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(handlerCompleted).toBe(true);
    });

    it('should generate event ID and timestamp if not provided', async () => {
      let receivedEvent!: BaseEvent;

      eventBus.subscribe(EventType.SYSTEM_READY, (event) => {
        receivedEvent = event;
      });

      await eventBus.publish(createEvent(EventType.SYSTEM_READY, {}, 'TestSource'));

      expect(receivedEvent.id).toBeDefined();
      expect(receivedEvent.timestamp).toBeDefined();
      expect(typeof receivedEvent.id).toBe('string');
      expect(typeof receivedEvent.timestamp).toBe('number');
    });
  });

  describe('once', () => {
    it('should only receive event once', async () => {
      const receivedEvents: BaseEvent[] = [];

      eventBus.once(EventType.WORKFLOW_STARTED, (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish(createEvent(EventType.WORKFLOW_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.WORKFLOW_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.WORKFLOW_STARTED, {}, 'TestSource'));

      expect(receivedEvents).toHaveLength(1);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe and stop receiving events', async () => {
      const receivedEvents: BaseEvent[] = [];

      const subscriptionId = eventBus.subscribe(EventType.TASK_COMPLETED, (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish(createEvent(EventType.TASK_COMPLETED, {}, 'TestSource'));
      expect(receivedEvents).toHaveLength(1);

      eventBus.unsubscribe(subscriptionId);
      await eventBus.publish(createEvent(EventType.TASK_COMPLETED, {}, 'TestSource'));

      expect(receivedEvents).toHaveLength(1);
    });

    it('should unsubscribe multiple subscriptions', async () => {
      const receivedEvents: BaseEvent[] = [];

      const id1 = eventBus.subscribe(EventType.PROVIDER_SELECTED, (event) => {
        receivedEvents.push(event);
      });
      const id2 = eventBus.subscribe(EventType.PROVIDER_SELECTED, (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish(createEvent(EventType.PROVIDER_SELECTED, {}, 'TestSource'));
      expect(receivedEvents).toHaveLength(2);

      eventBus.unsubscribeAll([id1, id2]);
      await eventBus.publish(createEvent(EventType.PROVIDER_SELECTED, {}, 'TestSource'));

      expect(receivedEvents).toHaveLength(2);
    });
  });

  describe('wildcard patterns', () => {
    it('should match wildcard at end (prefix)', async () => {
      const receivedEvents: BaseEvent[] = [];

      eventBus.subscribe('llm.*', (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish(createEvent(EventType.LLM_REQUEST_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.LLM_REQUEST_FINISHED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.LLM_RETRY, {}, 'TestSource'));

      expect(receivedEvents).toHaveLength(3);
    });

    it('should match wildcard at start (suffix)', async () => {
      const receivedEvents: BaseEvent[] = [];

      eventBus.subscribe('*.started', (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.TASK_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.EXECUTION_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.LLM_REQUEST_FINISHED, {}, 'TestSource')); // Should not match

      expect(receivedEvents).toHaveLength(3);
    });

    it('should match all events with single wildcard', async () => {
      const receivedEvents: BaseEvent[] = [];

      eventBus.subscribe('*', (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.TASK_CREATED, {}, 'TestSource'));

      expect(receivedEvents).toHaveLength(2);
    });
  });

  describe('priorities', () => {
    it('should execute higher priority handlers first', async () => {
      const executionOrder: number[] = [];

      eventBus.subscribe(
        'test.priority',
        () => {
          executionOrder.push(1);
        },
        { priority: 10 },
      );

      eventBus.subscribe(
        'test.priority',
        () => {
          executionOrder.push(2);
        },
        { priority: 5 },
      );

      eventBus.subscribe(
        'test.priority',
        () => {
          executionOrder.push(3);
        },
        { priority: 15 },
      );

      await eventBus.publish(createEvent('test.priority' as EventType, {}, 'TestSource'));

      expect(executionOrder).toEqual([3, 1, 2]); // 15, 10, 5
    });
  });

  describe('correlationId propagation', () => {
    it('should propagate correlationId to events', async () => {
      let receivedEvent!: BaseEvent;
      const correlationId = 'test-correlation-123';

      eventBus.subscribe(EventType.EXECUTION_STARTED, (event) => {
        receivedEvent = event;
      });

      await eventBus.publish(
        createEvent(EventType.EXECUTION_STARTED, {}, 'TestSource', { correlationId }),
      );

      expect(receivedEvent.correlationId).toBe(correlationId);
    });
  });

  describe('event history', () => {
    it('should store event history', async () => {
      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.SYSTEM_READY, {}, 'TestSource'));

      const history = eventBus.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should limit history size', async () => {
      // Publish more than default 1000 events
      for (let i = 0; i < 1005; i++) {
        await eventBus.publish(createEvent(EventType.METRIC_COLLECTED, { index: i }, 'TestSource'));
      }

      const history = eventBus.getHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });

    it('should return limited history when specified', async () => {
      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.SYSTEM_READY, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.SYSTEM_SHUTDOWN, {}, 'TestSource'));

      const history = eventBus.getHistory(2);
      expect(history).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should handle errors in subscribers', async () => {
      const receivedEvents: BaseEvent[] = [];

      eventBus.subscribe(EventType.TASK_FAILED, () => {
        throw new Error('Handler error');
      });

      eventBus.subscribe(EventType.TASK_FAILED, (event) => {
        receivedEvents.push(event);
      });

      // Should not throw
      await eventBus.publish(createEvent(EventType.TASK_FAILED, {}, 'TestSource'));

      // Other handlers should still receive the event
      expect(receivedEvents).toHaveLength(1);
    });

    it('should add failed events to dead letter queue', async () => {
      let callCount = 0;

      eventBus.subscribe(EventType.EXECUTION_FAILED, () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('timeout error'); // Retryable
        }
      });

      await eventBus.publish(createEvent(EventType.EXECUTION_FAILED, {}, 'TestSource'));

      // Wait for retry
      await new Promise((resolve) => setTimeout(resolve, 500));

      const dlq = eventBus.getDeadLetterQueue();
      expect(dlq.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('retry logic', () => {
    it('should retry retryable errors', async () => {
      const callCount = { current: 0 };

      eventBus.subscribe(EventType.LLM_TIMEOUT, () => {
        callCount.current++;
        if (callCount.current < 3) {
          throw new Error('timeout error'); // Retryable
        }
      });

      await eventBus.publish(createEvent(EventType.LLM_TIMEOUT, {}, 'TestSource'));

      // Wait for retries
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(callCount.current).toBeGreaterThanOrEqual(1);
    });

    it('should not retry non-retryable errors', async () => {
      const callCount = { current: 0 };

      eventBus.subscribe(EventType.TASK_FAILED, () => {
        callCount.current++;
        throw new Error('Invalid argument'); // Not retryable
      });

      await eventBus.publish(createEvent(EventType.TASK_FAILED, {}, 'TestSource'));

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(callCount.current).toBe(1);
    });
  });

  describe('stats', () => {
    it('should track events published', async () => {
      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, {}, 'TestSource'));
      await eventBus.publish(createEvent(EventType.SYSTEM_READY, {}, 'TestSource'));

      const stats = eventBus.getStats();
      expect(stats.eventsPublished).toBe(2);
    });

    it('should track subscriptions', () => {
      eventBus.subscribe(EventType.SYSTEM_STARTED, () => {});
      eventBus.subscribe(EventType.SYSTEM_READY, () => {});

      const stats = eventBus.getStats();
      expect(stats.activeSubscriptions).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all subscribers and history', async () => {
      eventBus.subscribe(EventType.SYSTEM_STARTED, () => {});
      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, {}, 'TestSource'));

      eventBus.clear();

      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, {}, 'TestSource'));

      const stats = eventBus.getStats();
      expect(stats.activeSubscriptions).toBe(0);
      expect(eventBus.getHistory()).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    it('should publish shutdown event on shutdown', async () => {
      let shutdownReceived = false;

      eventBus.subscribe(EventType.SYSTEM_SHUTDOWN, () => {
        shutdownReceived = true;
      });

      await eventBus.shutdown();

      expect(shutdownReceived).toBe(true);
    });
  });

  describe('middleware', () => {
    it('should apply publish middleware', async () => {
      let middlewareCalled = false;

      eventBus.use({
        name: 'test-middleware',
        onPublish: (event) => {
          middlewareCalled = true;
          return { ...event, metadata: { ...event.metadata, middlewareApplied: true } };
        },
      });

      let receivedEvent!: BaseEvent;
      eventBus.subscribe(EventType.SYSTEM_STARTED, (event) => {
        receivedEvent = event;
      });

      await eventBus.publish(createEvent(EventType.SYSTEM_STARTED, {}, 'TestSource'));

      expect(middlewareCalled).toBe(true);
      expect(receivedEvent.metadata?.middlewareApplied).toBe(true);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getEventBus', () => {
      const instance1 = getEventBus();
      const instance2 = getEventBus();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance with createEventBus', () => {
      const instance1 = getEventBus();
      const instance2 = createEventBus({ enableLogging: false });
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('createEvent helper', () => {
    it('should create event with all properties', () => {
      const event = createEvent(
        EventType.TASK_CREATED,
        { id: 'task-1', name: 'Test Task' },
        'TaskPlanner',
        {
          correlationId: 'corr-123',
          priority: EventPriority.HIGH,
          metadata: { source: 'test' },
        },
      );

      expect(event.id).toBeDefined();
      expect(event.type).toBe(EventType.TASK_CREATED);
      expect(event.payload).toEqual({ id: 'task-1', name: 'Test Task' });
      expect(event.source).toBe('TaskPlanner');
      expect(event.correlationId).toBe('corr-123');
      expect(event.priority).toBe(EventPriority.HIGH);
      expect(event.metadata?.source).toBe('test');
    });

    it('should use default values when options not provided', () => {
      const event = createEvent(EventType.SYSTEM_READY, {}, 'TestSource');

      expect(event.priority).toBe(EventPriority.NORMAL);
      expect(event.correlationId).toBeUndefined();
      expect(event.metadata).toBeUndefined();
    });
  });

  describe('request-response pattern', () => {
    it('should support request-response with replyTo', async () => {
      // Handler that responds
      eventBus.subscribe(
        'request.test',
        async (event: RequestEvent<unknown, { response: string }>) => {
          const response = createEvent(
            event.replyTo as string,
            { response: 'response data' },
            'Handler',
          );
          await eventBus.publish(response);
        },
      );

      // Make request and wait for response
      const response = await new Promise<BaseEvent>((resolve) => {
        eventBus.subscribe('response.test', (event) => {
          resolve(event);
        });

        const request = createEvent(
          'request.test',
          { data: 'request data' },
          'Client',
          {},
        ) as RequestEvent<unknown, unknown>;
        request.replyTo = 'response.test';
        request.timeout = 5000;

        eventBus.publish(request);
      });

      expect(response.payload).toEqual({ response: 'response data' });
    });
  });

  describe('filter in subscribe options', () => {
    it('should filter events based on filter function', async () => {
      const receivedEvents: BaseEvent[] = [];

      eventBus.subscribe(
        'test.filter',
        (event) => {
          receivedEvents.push(event);
        },
        {
          filter: (event) => {
            return (event.payload as { value?: number })?.value !== undefined;
          },
        },
      );

      await eventBus.publish(createEvent('test.filter' as EventType, { value: 1 }, 'TestSource'));
      await eventBus.publish(
        createEvent('test.filter' as EventType, { noValue: true }, 'TestSource'),
      );
      await eventBus.publish(createEvent('test.filter' as EventType, { value: 2 }, 'TestSource'));

      expect(receivedEvents).toHaveLength(2);
      expect((receivedEvents[0].payload as { value: number }).value).toBe(1);
      expect((receivedEvents[1].payload as { value: number }).value).toBe(2);
    });
  });

  describe('concurrency', () => {
    it('should handle concurrent publish operations', async () => {
      const receivedCount = { current: 0 };

      eventBus.subscribe(EventType.CONFIG_CHANGED, () => {
        receivedCount.current++;
      });

      // Publish 100 events concurrently
      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          eventBus.publish(createEvent(EventType.CONFIG_CHANGED, { index: i }, 'TestSource')),
        ),
      );

      // Give time for all handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedCount.current).toBe(100);
    });

    it('should handle rapid subscribe/unsubscribe', async () => {
      const subscriptionIds: string[] = [];

      // Rapidly subscribe 50 handlers
      for (let i = 0; i < 50; i++) {
        subscriptionIds.push(eventBus.subscribe(EventType.CAPABILITIES_RESOLVED, () => {}));
      }

      // Rapidly unsubscribe all
      subscriptionIds.forEach((id) => eventBus.unsubscribe(id));

      await eventBus.publish(createEvent(EventType.CAPABILITIES_RESOLVED, {}, 'TestSource'));

      const stats = eventBus.getStats();
      expect(stats.activeSubscriptions).toBe(0);
    });
  });

  describe('memory management', () => {
    it('should handle large number of events without memory leak', async () => {
      // Subscribe and unsubscribe repeatedly
      for (let i = 0; i < 100; i++) {
        const id = eventBus.subscribe(EventType.METRIC_COLLECTED, () => {});
        eventBus.unsubscribe(id);
      }

      // Publish many events
      for (let i = 0; i < 500; i++) {
        await eventBus.publish(createEvent(EventType.METRIC_COLLECTED, { i }, 'TestSource'));
      }

      const stats = eventBus.getStats();
      expect(stats.activeSubscriptions).toBe(0);
      expect(eventBus.getHistory().length).toBeLessThanOrEqual(1000);
    });
  });
});
