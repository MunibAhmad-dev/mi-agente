'use strict';

let ScheduledJobModel;
try {
  ScheduledJobModel = require('~/models/ScheduledJob');
} catch { /* model optional */ }

/**
 * SchedulerManager - Cron jobs and scheduled task management
 * Uses node-cron for scheduling. Zero dependencies fallback available.
 */
class SchedulerManager {
  constructor(config = {}) {
    this.jobs = new Map();
    this.cron = null;
    this.history = [];
    this.maxHistory = config.maxHistory || 100;

    try {
      this.cron = require('node-cron');
      console.log('[Scheduler] node-cron loaded');
    } catch (e) {
      console.warn('[Scheduler] node-cron not available, using built-in setInterval fallback');
    }
  }

  /**
   * Load persisted jobs from MongoDB and re-schedule them.
   * Call once after construction when DB is ready.
   * @param {Function} callbackFactory - (jobId) => callback fn
   */
  async loadPersistedJobs(callbackFactory) {
    if (!ScheduledJobModel) return;
    try {
      const rows = await ScheduledJobModel.find({ active: true }).lean();
      for (const row of rows) {
        if (this.jobs.has(row.jobId)) continue;
        const cb = callbackFactory ? callbackFactory(row.jobId) : () => {};
        this.schedule(row.jobId, row.expression, cb, row.options || {});
      }
    } catch { /* DB not ready */ }
  }

  /**
   * Schedule a recurring task with cron expression.
   */
  schedule(id, cronExpression, callback, options = {}) {
    if (this.jobs.has(id)) {
      this.unschedule(id);
    }

    const task = {
      id,
      expression: cronExpression,
      callback,
      options,
      createdAt: new Date().toISOString(),
      runCount: 0,
      lastRun: null,
      lastError: null,
      active: true
    };

    if (this.cron) {
      task.cronJob = this.cron.schedule(cronExpression, async () => {
        await this._executeTask(task);
      }, {
        scheduled: true,
        timezone: options.timezone || undefined
      });
    } else {
      // Fallback: convert cron to interval (very basic)
      const intervalMs = this._cronToInterval(cronExpression);
      task.intervalId = setInterval(async () => {
        await this._executeTask(task);
      }, intervalMs);
    }

    this.jobs.set(id, task);
    this._addHistory('scheduled', id);
    if (ScheduledJobModel) {
      ScheduledJobModel.findOneAndUpdate(
        { jobId: id },
        { jobId: id, expression: cronExpression, options, active: true, createdAt: task.createdAt },
        { upsert: true, new: true },
      ).catch(() => { /* non-fatal */ });
    }
    return { id, expression: cronExpression, active: true };
  }

  /**
   * Execute a task and track results.
   */
  async _executeTask(task) {
    const startTime = Date.now();
    try {
      await task.callback();
      task.runCount++;
      task.lastRun = new Date().toISOString();
      task.lastError = null;
      this._addHistory('executed', task.id, { duration: Date.now() - startTime });
    } catch (err) {
      task.lastError = err.message;
      this._addHistory('error', task.id, { error: err.message });
    }
  }

  /**
   * Schedule a one-time delayed task.
   */
  scheduleOnce(id, delayMs, callback) {
    const timeoutId = setTimeout(async () => {
      try {
        await callback();
        this._addHistory('executed-once', id);
      } catch (err) {
        this._addHistory('error', id, { error: err.message });
      }
      this.jobs.delete(id);
    }, delayMs);

    this.jobs.set(id, {
      id,
      type: 'once',
      timeoutId,
      createdAt: new Date().toISOString(),
      active: true
    });

    return { id, type: 'once', delayMs };
  }

  /**
   * Unschedule a task.
   */
  unschedule(id) {
    const task = this.jobs.get(id);
    if (!task) return false;

    if (task.cronJob) task.cronJob.stop();
    if (task.intervalId) clearInterval(task.intervalId);
    if (task.timeoutId) clearTimeout(task.timeoutId);

    task.active = false;
    this.jobs.delete(id);
    this._addHistory('unscheduled', id);
    if (ScheduledJobModel) {
      ScheduledJobModel.findOneAndUpdate({ jobId: id }, { active: false }).catch(() => {});
    }
    return true;
  }

  /**
   * Pause a task.
   */
  pause(id) {
    const task = this.jobs.get(id);
    if (!task) return false;

    if (task.cronJob) task.cronJob.stop();
    if (task.intervalId) {
      clearInterval(task.intervalId);
      task.intervalId = null;
    }
    task.active = false;
    return true;
  }

  /**
   * Resume a task.
   */
  resume(id) {
    const task = this.jobs.get(id);
    if (!task || !task.expression) return false;

    task.active = true;
    if (this.cron) {
      task.cronJob = this.cron.schedule(task.expression, async () => {
        await this._executeTask(task);
      });
    } else {
      const intervalMs = this._cronToInterval(task.expression);
      task.intervalId = setInterval(async () => {
        await this._executeTask(task);
      }, intervalMs);
    }
    return true;
  }

  /**
   * List all scheduled tasks.
   */
  listJobs() {
    return Array.from(this.jobs.values()).map(j => ({
      id: j.id,
      expression: j.expression,
      active: j.active,
      runCount: j.runCount || 0,
      lastRun: j.lastRun,
      lastError: j.lastError,
      createdAt: j.createdAt
    }));
  }

  /**
   * Get execution history.
   */
  getHistory() {
    return this.history.slice(-this.maxHistory);
  }

  /**
   * Stop all tasks.
   */
  stopAll() {
    for (const [id, task] of this.jobs) {
      if (task.cronJob) task.cronJob.stop();
      if (task.intervalId) clearInterval(task.intervalId);
      if (task.timeoutId) clearTimeout(task.timeoutId);
      task.active = false;
    }
    this._addHistory('stopped-all');
  }

  /**
   * Get stats.
   */
  getStats() {
    return {
      totalJobs: this.jobs.size,
      activeJobs: Array.from(this.jobs.values()).filter(j => j.active).length,
      cronAvailable: !!this.cron,
      historySize: this.history.length,
      totalExecutions: this.history.filter(h => h.event === 'executed').length
    };
  }

  _addHistory(event, jobId, details = {}) {
    this.history.push({
      event,
      jobId: jobId || null,
      timestamp: new Date().toISOString(),
      ...details
    });
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  /**
   * Very basic cron-to-interval conversion (fallback only).
   * Only handles: X X X X X (every minute), X/5 X X X X (every 5 min), etc.
   */
  _cronToInterval(expression) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return 60000; // default 1 min

    const [min, hour, dom, month, dow] = parts;

    // */N pattern for minutes
    if (min.startsWith('*/')) {
      return parseInt(min.substring(2)) * 60 * 1000;
    }

    // Every minute
    if (min === '*') return 60000;

    // Specific minute
    return 60000;
  }
}

module.exports = SchedulerManager;
