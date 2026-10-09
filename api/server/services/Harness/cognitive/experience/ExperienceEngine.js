'use strict';

const crypto = require('crypto');

/**
 * ExperienceEngine - Records task executions with full context.
 */
class ExperienceEngine {
  constructor(config = {}) {
    this.config = config;
    this.bus = config.bus;
    this.experiences = new Map();
    this.stats = { recorded: 0, replayed: 0 };
  }

  async record(experience) {
    const id = experience.id || `exp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const entry = {
      id,
      task: experience.task || '',
      actions: experience.actions || [],
      observations: experience.observations || [],
      result: experience.result || { success: false },
      context: experience.context || {},
      strategy: experience.strategy || null,
      duration: experience.duration || 0,
      timestamp: Date.now(),
      userId: experience.userId || 'default',
      tags: experience.tags || [],
    };
    this.experiences.set(id, entry);
    this.stats.recorded++;
    if (this.bus) await this.bus.emit('experience:recorded', { id, task: entry.task });
    return entry;
  }

  async getExperience(id) { return this.experiences.get(id); }

  async getRecent(n = 10) {
    return Array.from(this.experiences.values()).slice(-n);
  }

  async getByTask(task) {
    const q = (task || '').toLowerCase();
    return Array.from(this.experiences.values()).filter(e => (e.task || '').toLowerCase().includes(q));
  }

  async getSuccessful() {
    return Array.from(this.experiences.values()).filter(e => e.result?.success);
  }

  async getFailed() {
    return Array.from(this.experiences.values()).filter(e => !e.result?.success);
  }

  async replay(id) {
    const exp = this.experiences.get(id);
    if (!exp) return null;
    this.stats.replayed++;
    return exp;
  }

  getStats() {
    const all = Array.from(this.experiences.values());
    return {
      ...this.stats,
      total: all.length,
      successful: all.filter(e => e.result?.success).length,
      failed: all.filter(e => !e.result?.success).length,
      avgDuration: all.length > 0 ? all.reduce((s, e) => s + (e.duration || 0), 0) / all.length : 0,
    };
  }
}

module.exports = { ExperienceEngine };
