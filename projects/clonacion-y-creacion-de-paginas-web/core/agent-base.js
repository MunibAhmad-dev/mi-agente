// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Agent Base Class
// ═══════════════════════════════════════════════════════════════════════════════

import { genId, timestamp, createLogger, globalBus } from './utils.js';

export class AgentBase {
  constructor(config = {}) {
    this.id = config.id || genId('agent');
    this.type = config.type || 'unknown';
    this.name = config.name || this.type;
    this.status = 'idle';
    this.capabilities = config.capabilities || [];
    this.requiredSkills = config.requiredSkills || [];
    this.currentTask = null;
    this.completedTasks = [];
    this.metrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      averageDuration: 0,
      lastActive: timestamp(),
      tokensUsed: 0,
      estimatedCost: 0,
    };
    this.log = createLogger(`${this.type}:${this.id}`);
  }

  async execute(task, context = {}) {
    this.status = 'busy';
    this.currentTask = task;
    this.metrics.lastActive = timestamp();
    globalBus.emit('agent:started', { agentId: this.id, type: this.type, taskId: task?.id });

    const start = Date.now();
    try {
      const result = await this.perform(task, context);
      const duration = Date.now() - start;

      this.metrics.tasksCompleted++;
      this.metrics.averageDuration =
        (this.metrics.averageDuration * (this.metrics.tasksCompleted - 1) + duration) / this.metrics.tasksCompleted;
      this.completedTasks.push(task?.id);
      this.status = 'idle';
      this.currentTask = null;

      globalBus.emit('agent:completed', { agentId: this.id, type: this.type, taskId: task?.id, duration });
      return { success: true, result, duration, evidence: result?.evidence || [] };
    } catch (error) {
      const duration = Date.now() - start;
      this.metrics.tasksFailed++;
      this.status = 'idle';
      this.currentTask = null;

      this.log.error(`Task failed: ${error.message}`);
      globalBus.emit('agent:error', { agentId: this.id, type: this.type, taskId: task?.id, error: error.message });
      return { success: false, error: error.message, stack: error.stack, duration };
    }
  }

  async perform(task, context) {
    // Override in subclasses
    throw new Error(`${this.type} agent must implement perform()`);
  }

  getStatus() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      status: this.status,
      capabilities: this.capabilities,
      currentTask: this.currentTask?.id || null,
      completedTasks: this.completedTasks.length,
      metrics: { ...this.metrics },
    };
  }

  canHandle(capability) {
    return this.capabilities.includes(capability);
  }
}
