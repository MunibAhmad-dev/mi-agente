'use strict';

/**
 * EventBus - Inter-engine communication for the Cognitive Engine
 * Provider-agnostic, zero external dependencies.
 */
class EventBus {
  constructor() {
    this._handlers = new Map();
    this._history = [];
    this._maxHistory = 1000;
  }

  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    this._handlers.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }

  async emit(event, data = {}) {
    const handlers = this._handlers.get(event) || [];
    const wildcard = this._handlers.get('*') || [];
    const all = [...handlers, ...wildcard];

    this._history.push({ event, data, timestamp: Date.now() });
    if (this._history.length > this._maxHistory) this._history = this._history.slice(-this._maxHistory);

    const results = [];
    for (const handler of all) {
      try {
        const result = await handler({ event, data, timestamp: Date.now() });
        results.push(result);
      } catch (err) {
        console.error(`[EventBus] Error in handler for '${event}':`, err.message);
      }
    }
    return results;
  }

  getHistory(event = null, limit = 50) {
    let h = this._history;
    if (event) h = h.filter(e => e.event === event);
    return h.slice(-limit);
  }

  getStats() {
    return {
      events: Array.from(this._handlers.keys()),
      totalHandlers: Array.from(this._handlers.values()).reduce((s, h) => s + h.length, 0),
      historySize: this._history.length,
    };
  }
}

// Singleton
let _instance = null;
function getEventBus() {
  if (!_instance) _instance = new EventBus();
  return _instance;
}

module.exports = { EventBus, getEventBus };
