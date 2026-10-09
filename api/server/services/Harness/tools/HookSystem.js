'use strict';

/**
 * HookSystem - Event-driven hook system for agent actions
 * Supports PreToolUse, PostToolUse, PrePrompt, PostPrompt, OnError, OnMessage
 * Uses eventemitter3 for high-performance event handling
 */
class HookSystem {
  constructor() {
    const EventEmitter3 = require('eventemitter3');
    this.emitter = new EventEmitter3();
    this.hooks = new Map(); // event -> [{id, callback, priority, once}]
    this.hookCount = 0;
    this.executionLog = [];
    this.maxLogSize = 1000;

    // Built-in events
    this.EVENTS = {
      PRE_TOOL_USE: 'preToolUse',
      POST_TOOL_USE: 'postToolUse',
      PRE_PROMPT: 'prePrompt',
      POST_PROMPT: 'postPrompt',
      ON_ERROR: 'onError',
      ON_MESSAGE: 'onMessage',
      PRE_SUBAGENT: 'preSubagent',
      POST_SUBAGENT: 'postSubagent',
      ON_TASK_START: 'onTaskStart',
      ON_TASK_COMPLETE: 'onTaskComplete',
      ON_TASK_FAIL: 'onTaskFail',
      ON_LOOP_DETECTED: 'onLoopDetected',
      ON_LEARNING: 'onLearning',
    };
  }

  /**
   * Register a hook callback for an event
   */
  registerHook(event, callback, options = {}) {
    const { priority = 0, once = false, id } = options;
    const hookId = id || `hook_${++this.hookCount}`;

    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }

    this.hooks.get(event).push({
      id: hookId,
      callback,
      priority,
      once,
      registeredAt: new Date().toISOString(),
    });

    // Sort by priority (higher = first)
    this.hooks.get(event).sort((a, b) => b.priority - a.priority);

    return hookId;
  }

  /**
   * Unregister a hook by id
   */
  unregisterHook(event, hookId) {
    if (!this.hooks.has(event)) return false;
    const hooks = this.hooks.get(event);
    const idx = hooks.findIndex(h => h.id === hookId);
    if (idx === -1) return false;
    hooks.splice(idx, 1);
    return true;
  }

  /**
   * Execute all hooks for an event
   * Hooks run in priority order. If a hook returns false, the chain stops.
   * If a hook returns an object, it modifies the context for subsequent hooks.
   */
  async triggerHooks(event, context = {}) {
    const hooks = this.hooks.get(event) || [];
    if (hooks.length === 0) return { context, blocked: false, hookResults: [] };

    const hookResults = [];
    let modifiedContext = { ...context };
    let blocked = false;
    const toRemove = [];

    for (const hook of hooks) {
      try {
        const result = await hook.callback(modifiedContext);
        hookResults.push({ hookId: hook.id, result });

        if (result === false) {
          blocked = true;
          break;
        }
        if (result && typeof result === 'object') {
          modifiedContext = { ...modifiedContext, ...result };
        }
        if (hook.once) {
          toRemove.push(hook.id);
        }
      } catch (err) {
        hookResults.push({ hookId: hook.id, error: err.message });
      }
    }

    // Remove one-time hooks
    for (const hookId of toRemove) {
      this.unregisterHook(event, hookId);
    }

    // Log execution
    this._logExecution(event, context, modifiedContext, blocked, hookResults);

    return { context: modifiedContext, blocked, hookResults };
  }

  /**
   * PreToolUse hook - called before a tool is executed
   */
  async triggerPreToolUse(toolName, args, agentContext = {}) {
    return this.triggerHooks(this.EVENTS.PRE_TOOL_USE, {
      toolName,
      args,
      ...agentContext,
    });
  }

  /**
   * PostToolUse hook - called after a tool is executed
   */
  async triggerPostToolUse(toolName, args, result, agentContext = {}) {
    return this.triggerHooks(this.EVENTS.POST_TOOL_USE, {
      toolName,
      args,
      result,
      ...agentContext,
    });
  }

  /**
   * PrePrompt hook - called before sending prompt to LLM
   */
  async triggerPrePrompt(messages, model, agentContext = {}) {
    return this.triggerHooks(this.EVENTS.PRE_PROMPT, {
      messages,
      model,
      ...agentContext,
    });
  }

  /**
   * PostPrompt hook - called after receiving LLM response
   */
  async triggerPostPrompt(response, model, agentContext = {}) {
    return this.triggerHooks(this.EVENTS.POST_PROMPT, {
      response,
      model,
      ...agentContext,
    });
  }

  /**
   * OnError hook - called when an error occurs
   */
  async triggerOnError(error, context = {}) {
    return this.triggerHooks(this.EVENTS.ON_ERROR, {
      error: error.message || String(error),
      stack: error.stack,
      ...context,
    });
  }

  /**
   * OnMessage hook - called on new message
   */
  async triggerOnMessage(message, context = {}) {
    return this.triggerHooks(this.EVENTS.ON_MESSAGE, {
      message,
      ...context,
    });
  }

  /**
   * Get all registered hooks for an event
   */
  getHooks(event) {
    return this.hooks.get(event) || [];
  }

  /**
   * Get all events with registered hooks
   */
  getRegisteredEvents() {
    return Array.from(this.hooks.keys());
  }

  /**
   * Get execution log
   */
  getExecutionLog(limit = 100) {
    return this.executionLog.slice(-limit);
  }

  /**
   * Get hook statistics
   */
  getStats() {
    const stats = {
      totalHooks: 0,
      eventsWithHooks: 0,
      hooksByEvent: {},
    };

    for (const [event, hooks] of this.hooks) {
      stats.hooksByEvent[event] = hooks.length;
      stats.totalHooks += hooks.length;
      stats.eventsWithHooks++;
    }

    return stats;
  }

  /**
   * Log hook execution
   */
  _logExecution(event, inputContext, outputContext, blocked, results) {
    this.executionLog.push({
      event,
      timestamp: new Date().toISOString(),
      hookCount: results.length,
      blocked,
      modified: JSON.stringify(inputContext) !== JSON.stringify(outputContext),
    });

    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog = this.executionLog.slice(-this.maxLogSize);
    }
  }

  /**
   * Clear all hooks
   */
  clear() {
    this.hooks.clear();
    this.executionLog = [];
  }
}

module.exports = HookSystem;
