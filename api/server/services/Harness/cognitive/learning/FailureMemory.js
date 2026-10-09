'use strict';

/**
 * FailureMemory - Stores and analyzes failures for learning
 */
class FailureMemory {
  constructor(config = {}) {
    this.config = config;
    this.failures = new Map();
    this.failureCount = 0;
    this.maxFailures = config.maxFailures || 5000;
  }

  /**
   * Record a failure
   */
  record(data) {
    const failure = {
      id: `fail_${++this.failureCount}`,
      what: data.what || data.message || 'Unknown failure',
      why: data.why || data.cause || '',
      when: new Date().toISOString(),
      howOften: 1,
      conditions: data.conditions || {},
      model: data.model || null,
      tool: data.tool || null,
      skill: data.skill || null,
      environment: data.environment || {},
      recovery: data.recovery || null,
      prevention: data.prevention || null,
      resolved: false,
    };

    // Check for similar past failures
    const similar = this.findSimilar(failure);
    if (similar.length > 0) {
      const existing = similar[0];
      existing.howOften++;
      existing.when = failure.when;
      return existing;
    }

    this.failures.set(failure.id, failure);
    if (this.failures.size > this.maxFailures) {
      const oldest = this.failures.keys().next().value;
      this.failures.delete(oldest);
    }
    return failure;
  }

  /**
   * Record recovery for a failure
   */
  recordRecovery(failureId, recovery, prevention) {
    const f = this.failures.get(failureId);
    if (!f) return null;
    f.recovery = recovery;
    f.prevention = prevention;
    f.resolved = true;
    return f;
  }

  /**
   * Find similar failures
   */
  findSimilar(failure) {
    return Array.from(this.failures.values()).filter(f =>
      f.what === failure.what ||
      (f.tool && f.tool === failure.tool) ||
      (f.why && f.why === failure.why)
    );
  }

  /**
   * Get recurring failures
   */
  getRecurring(minCount = 2) {
    return Array.from(this.failures.values())
      .filter(f => f.howOften >= minCount)
      .sort((a, b) => b.howOften - a.howOften);
  }

  /**
   * Get unresolved failures
   */
  getUnresolved() {
    return Array.from(this.failures.values()).filter(f => !f.resolved);
  }

  /**
   * Get statistics
   */
  getStats() {
    const toolCounts = {};
    for (const f of this.failures.values()) {
      if (f.tool) toolCounts[f.tool] = (toolCounts[f.tool] || 0) + 1;
    }
    return {
      total: this.failures.size,
      resolved: Array.from(this.failures.values()).filter(f => f.resolved).length,
      recurring: this.getRecurring().length,
      toolCounts,
    };
  }
}

module.exports = FailureMemory;
