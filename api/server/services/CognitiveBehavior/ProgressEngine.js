'use strict';

/**
 * ProgressEngine — Gen B Phase 19.
 * Tracks multi-step task progress.
 * Supports start, advance, complete, and real-time percent reporting.
 */

class ProgressEngine {
  constructor() {
    this._tasks = new Map(); // taskId → task record
    this.stats = { started: 0, completed: 0, active: 0 };
  }

  /**
   * Start tracking a new task.
   * @param {string} taskId
   * @param {string[]|object[]} steps  - Step names or objects { name, weight? }
   * @param {object} meta              - Optional metadata { label, userId, etc. }
   * @returns {object} task record
   */
  start(taskId, steps = [], meta = {}) {
    try {
      if (!taskId) return { error: 'taskId is required' };

      const normalizedSteps = (Array.isArray(steps) ? steps : []).map((s, i) => ({
        index: i,
        name: typeof s === 'string' ? s : (s.name || `Step ${i + 1}`),
        weight: (typeof s === 'object' && s.weight) ? s.weight : 1,
        status: 'pending',
        startedAt: null,
        completedAt: null,
      }));

      const task = {
        taskId,
        steps: normalizedSteps,
        totalWeight: normalizedSteps.reduce((sum, s) => sum + s.weight, 0) || 1,
        currentStep: null,
        completedWeight: 0,
        status: 'running',
        percent: 0,
        meta,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
      };

      this._tasks.set(taskId, task);
      this.stats.started++;
      this.stats.active++;
      return this._snapshot(task);
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Advance to a specific step (by name or index).
   * @param {string} taskId
   * @param {string|number} step  - Step name or index
   * @param {object} result       - Optional result data for this step
   * @returns {object} updated progress snapshot
   */
  advance(taskId, step, result = {}) {
    try {
      const task = this._tasks.get(taskId);
      if (!task) return { error: `Task '${taskId}' not found` };
      if (task.status === 'completed' || task.status === 'failed') {
        return { error: `Task '${taskId}' is already ${task.status}` };
      }

      // Complete the current step if any
      if (task.currentStep !== null) {
        const current = task.steps[task.currentStep];
        if (current && current.status === 'in_progress') {
          current.status = 'done';
          current.completedAt = new Date().toISOString();
          current.result = result;
          task.completedWeight += current.weight;
        }
      }

      // Find the next step
      let nextIndex = -1;
      if (typeof step === 'number') {
        nextIndex = step;
      } else if (typeof step === 'string') {
        nextIndex = task.steps.findIndex((s) => s.name === step);
      }

      if (nextIndex >= 0 && nextIndex < task.steps.length) {
        task.currentStep = nextIndex;
        task.steps[nextIndex].status = 'in_progress';
        task.steps[nextIndex].startedAt = new Date().toISOString();
      }

      task.percent = Math.round((task.completedWeight / task.totalWeight) * 100);
      return this._snapshot(task);
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Mark the task as complete.
   * @param {string} taskId
   * @returns {object} final snapshot
   */
  complete(taskId) {
    try {
      const task = this._tasks.get(taskId);
      if (!task) return { error: `Task '${taskId}' not found` };

      // Complete any in-progress step
      for (const step of task.steps) {
        if (step.status === 'in_progress') {
          step.status = 'done';
          step.completedAt = new Date().toISOString();
          task.completedWeight += step.weight;
        } else if (step.status === 'pending') {
          step.status = 'skipped';
        }
      }

      task.status = 'completed';
      task.percent = 100;
      task.completedAt = new Date().toISOString();
      this.stats.completed++;
      this.stats.active = Math.max(0, this.stats.active - 1);

      return this._snapshot(task);
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Mark the task as failed.
   * @param {string} taskId
   * @param {string} reason
   */
  fail(taskId, reason = 'unknown error') {
    try {
      const task = this._tasks.get(taskId);
      if (!task) return { error: `Task '${taskId}' not found` };
      task.status = 'failed';
      task.error = reason;
      task.completedAt = new Date().toISOString();
      this.stats.active = Math.max(0, this.stats.active - 1);
      return this._snapshot(task);
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get current progress for a task.
   * @param {string} taskId
   * @returns {{ percent, currentStep, done, status, steps }}
   */
  getProgress(taskId) {
    try {
      const task = this._tasks.get(taskId);
      if (!task) return { error: `Task '${taskId}' not found`, percent: 0, done: false };
      return this._snapshot(task);
    } catch (err) {
      return { error: err.message, percent: 0, done: false };
    }
  }

  /**
   * List all active tasks.
   */
  listActive() {
    try {
      return Array.from(this._tasks.values())
        .filter((t) => t.status === 'running')
        .map((t) => this._snapshot(t));
    } catch {
      return [];
    }
  }

  _snapshot(task) {
    const currentStepName = task.currentStep !== null && task.steps[task.currentStep]
      ? task.steps[task.currentStep].name
      : null;
    return {
      taskId: task.taskId,
      status: task.status,
      percent: task.percent,
      currentStep: currentStepName,
      currentStepIndex: task.currentStep,
      done: task.status === 'completed',
      steps: task.steps.map((s) => ({ name: s.name, status: s.status, weight: s.weight })),
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      meta: task.meta,
      error: task.error,
    };
  }

  getStats() {
    return { ...this.stats, totalTracked: this._tasks.size };
  }
}

let _instance = null;
function getProgressEngine() {
  if (!_instance) _instance = new ProgressEngine();
  return _instance;
}

module.exports = { ProgressEngine, getProgressEngine };
