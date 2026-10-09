'use strict';

const EventEmitter3 = require('eventemitter3');

/**
 * EventStream - Collects all execution events from the agent
 * Provides trace data for learning, loop detection, and root cause analysis
 */
class EventStream {
  constructor(config = {}) {
    this.config = config;
    this.emitter = new EventEmitter3();
    this.events = [];
    this.traces = new Map(); // taskId -> events[]
    this.maxEvents = config.maxEvents || 10000;
    this.maxTraces = config.maxTraces || 1000;

    // Event types
    this.TYPES = {
      TASK_STARTED: 'task_started',
      PLAN_CREATED: 'plan_created',
      TOOL_SELECTED: 'tool_selected',
      TOOL_CALLED: 'tool_called',
      TOOL_FAILED: 'tool_failed',
      TOOL_SUCCEEDED: 'tool_succeeded',
      AGENT_STEP: 'agent_step',
      SUBAGENT_STARTED: 'subagent_started',
      SUBAGENT_FAILED: 'subagent_failed',
      SUBAGENT_SUCCEEDED: 'subagent_succeeded',
      USER_CORRECTION: 'user_correction',
      USER_REJECTION: 'user_rejection',
      USER_APPROVAL: 'user_approval',
      TASK_FAILED: 'task_failed',
      TASK_SUCCEEDED: 'task_succeeded',
      LOOP_DETECTED: 'loop_detected',
      ANOMALY_DETECTED: 'anomaly_detected',
      RESEARCH_STARTED: 'research_started',
      RESEARCH_COMPLETED: 'research_completed',
      LESSON_CREATED: 'lesson_created',
      LESSON_VALIDATED: 'lesson_validated',
      MEMORY_CONSOLIDATED: 'memory_consolidated',
      ERROR_OCCURRED: 'error_occurred',
      RECOVERY_ATTEMPTED: 'recovery_attempted',
      RECOVERY_SUCCEEDED: 'recovery_succeeded',
    };
  }

  /**
   * Record an event
   */
  record(type, data = {}) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      data,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
    };

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Add to trace if taskId present
    if (data.taskId) {
      if (!this.traces.has(data.taskId)) {
        this.traces.set(data.taskId, []);
      }
      this.traces.get(data.taskId).push(event);
    }

    this.emitter.emit(type, event);
    this.emitter.emit('any', event);
    return event;
  }

  /**
   * Get trace for a specific task
   */
  getTrace(taskId) {
    return this.traces.get(taskId) || [];
  }

  /**
   * Get recent events
   */
  getRecent(limit = 100, type = null) {
    let filtered = this.events;
    if (type) filtered = filtered.filter(e => e.type === type);
    return filtered.slice(-limit);
  }

  /**
   * Get events by type
   */
  getByType(type, limit = 100) {
    return this.events.filter(e => e.type === type).slice(-limit);
  }

  /**
   * Get time range events
   */
  getRange(startTime, endTime) {
    return this.events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Subscribe to events
   */
  on(type, callback) {
    this.emitter.on(type, callback);
  }

  /**
   * Get statistics
   */
  getStats() {
    const typeCounts = {};
    for (const event of this.events) {
      typeCounts[event.type] = (typeCounts[event.type] || 0) + 1;
    }
    return {
      totalEvents: this.events.length,
      totalTraces: this.traces.size,
      typeCounts,
    };
  }

  /**
   * Clear old events
   */
  prune(olderThanMs = 3600000) {
    const cutoff = Date.now() - olderThanMs;
    this.events = this.events.filter(e => e.timestamp > cutoff);
    return { pruned: true, remaining: this.events.length };
  }
}

module.exports = EventStream;
