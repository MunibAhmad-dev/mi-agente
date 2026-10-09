'use strict';

/**
 * LoopDetector - Detects repeated actions, infinite loops, and retry storms
 */
class LoopDetector {
  constructor(config = {}) {
    this.config = config;
    this.windowSize = config.windowSize || 10; // events to check
    this.repeatThreshold = config.repeatThreshold || 3; // same action N times = loop
    this.timeWindowMs = config.timeWindowMs || 60000; // 1 minute window
    this.detectedLoops = [];
    this.actionHistory = [];
    this.maxHistory = config.maxHistory || 500;
  }

  /**
   * Analyze a sequence of events for loops
   */
  analyze(events) {
    if (!events || events.length < 2) return { loops: [], stats: this._emptyStats() };

    const loops = [];
    const recentEvents = events.slice(-this.windowSize);

    // Check for repeated tool calls
    const toolCalls = recentEvents.filter(e =>
      e.type === 'tool_called' || e.type === 'TOOL_CALLED'
    );
    if (toolCalls.length >= this.repeatThreshold) {
      const lastN = toolCalls.slice(-this.repeatThreshold);
      const toolName = lastN[0]?.data?.toolName;
      const allSame = lastN.every(e => e.data?.toolName === toolName);
      if (allSame) {
        loops.push({
          type: 'repeated_tool_call',
          toolName,
          count: lastN.length,
          severity: 'high',
          events: lastN.map(e => e.id),
          startTime: lastN[0].timestamp,
          endTime: lastN[lastN.length - 1].timestamp,
        });
      }
    }

    // Check for repeated failed attempts
    const failures = recentEvents.filter(e =>
      e.type === 'tool_failed' || e.type === 'TOOL_FAILED'
    );
    if (failures.length >= this.repeatThreshold) {
      loops.push({
        type: 'repeated_failure',
        count: failures.length,
        severity: 'high',
        events: failures.map(e => e.id),
      });
    }

    // Check for circular reasoning (same agent step repeated)
    const agentSteps = recentEvents.filter(e =>
      e.type === 'agent_step' || e.type === 'AGENT_STEP'
    );
    if (agentSteps.length >= this.repeatThreshold) {
      const descriptions = agentSteps.map(e => JSON.stringify(e.data?.action || ''));
      const uniqueDescriptions = [...new Set(descriptions)];
      if (uniqueDescriptions.length < agentSteps.length / 2) {
        loops.push({
          type: 'circular_reasoning',
          count: agentSteps.length,
          uniqueActions: uniqueDescriptions.length,
          severity: 'medium',
          events: agentSteps.map(e => e.id),
        });
      }
    }

    // Check for oscillating decisions (alternating between two states)
    if (recentEvents.length >= 6) {
      const states = recentEvents.map(e => e.type);
      let oscillations = 0;
      for (let i = 2; i < states.length; i++) {
        if (states[i] === states[i - 2] && states[i] !== states[i - 1]) {
          oscillations++;
        }
      }
      if (oscillations >= 3) {
        loops.push({
          type: 'oscillating_decisions',
          count: oscillations,
          severity: 'medium',
        });
      }
    }

    // Check for retry storms (too many retries in time window)
    const recentInWindow = recentEvents.filter(e =>
      (Date.now() - e.timestamp) < this.timeWindowMs
    );
    if (recentInWindow.length > 20) {
      loops.push({
        type: 'retry_storm',
        count: recentInWindow.length,
        timeWindowMs: this.timeWindowMs,
        severity: 'critical',
      });
    }

    // Store detected loops
    for (const loop of loops) {
      this.detectedLoops.push({
        ...loop,
        detectedAt: new Date().toISOString(),
      });
    }

    return {
      loops,
      hasLoop: loops.length > 0,
      maxSeverity: loops.length > 0 ? loops.reduce((max, l) =>
        ['low', 'medium', 'high', 'critical'].indexOf(l.severity) >
        ['low', 'medium', 'high', 'critical'].indexOf(max) ? l.severity : max
      , 'low') : 'none',
      stats: this._calcStats(loops, events),
    };
  }

  /**
   * Check if a specific action is being repeated
   */
  isActionRepeated(actionKey, history = null) {
    const actions = history || this.actionHistory;
    const recent = actions.slice(-this.windowSize);
    const count = recent.filter(a => a === actionKey).length;
    return {
      repeated: count >= this.repeatThreshold,
      count,
      threshold: this.repeatThreshold,
    };
  }

  /**
   * Record an action for tracking
   */
  recordAction(action) {
    this.actionHistory.push(action);
    if (this.actionHistory.length > this.maxHistory) {
      this.actionHistory = this.actionHistory.slice(-this.maxHistory);
    }
  }

  /**
   * Get all detected loops
   */
  getDetectedLoops(limit = 50) {
    return this.detectedLoops.slice(-limit);
  }

  /**
   * Get loop statistics
   */
  getStats() {
    const typeCounts = {};
    for (const loop of this.detectedLoops) {
      typeCounts[loop.type] = (typeCounts[loop.type] || 0) + 1;
    }
    return {
      totalDetected: this.detectedLoops.length,
      typeCounts,
      recentLoops: this.detectedLoops.slice(-5),
    };
  }

  _calcStats(loops, events) {
    return {
      totalEvents: events.length,
      loopsDetected: loops.length,
      criticalLoops: loops.filter(l => l.severity === 'critical').length,
      highLoops: loops.filter(l => l.severity === 'high').length,
    };
  }

  _emptyStats() {
    return { totalEvents: 0, loopsDetected: 0, criticalLoops: 0, highLoops: 0 };
  }
}

module.exports = LoopDetector;
