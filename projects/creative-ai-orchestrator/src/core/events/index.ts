// ============================================================================
// Event Bus - Pub/Sub for system-wide events
// ============================================================================
// Lightweight in-process event bus. When the system grows to multiple
// processes, swap the implementation for Redis/NATS underneath.
// ============================================================================

import { type CaioEvent, type EventType, newId } from "../types/index.js";

export type EventHandler = (event: CaioEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private history: CaioEvent[] = [];
  private maxHistory = 1000;

  on(eventType: EventType | "*", handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  async emit(event: Omit<CaioEvent, "id" | "timestamp">): Promise<void> {
    const fullEvent: CaioEvent = {
      ...event,
      id: newId(),
      timestamp: new Date(),
    };

    // Store in history
    this.history.push(fullEvent);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    // Notify specific handlers
    const specific = this.handlers.get(event.type);
    if (specific) {
      for (const handler of specific) {
        try {
          await handler(fullEvent);
        } catch (err) {
          console.error(`Event handler error for ${event.type}:`, err);
        }
      }
    }

    // Notify wildcard handlers
    const wildcard = this.handlers.get("*");
    if (wildcard) {
      for (const handler of wildcard) {
        try {
          await handler(fullEvent);
        } catch (err) {
          console.error(`Wildcard event handler error:`, err);
        }
      }
    }
  }

  getHistory(limit?: number): CaioEvent[] {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  getHistoryByType(type: EventType, limit?: number): CaioEvent[] {
    const filtered = this.history.filter((e) => e.type === type);
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }

  clearHistory(): void {
    this.history = [];
  }
}

// Singleton
let _instance: EventBus | undefined;

export function getEventBus(): EventBus {
  if (!_instance) {
    _instance = new EventBus();
  }
  return _instance;
}
