'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * BackgroundTaskManager - Background job processing
 * Uses bree when available, falls back to built-in worker_threads.
 */
class BackgroundTaskManager {
  constructor(config = {}) {
    this.workDir = config.workDir || path.join(os.tmpdir(), 'harness-jobs');
    this.maxWorkers = config.maxWorkers || 4;
    this.jobTimeout = config.jobTimeout || 300000; // 5 min
    this.bree = null;
    this.jobs = new Map();
    this.history = [];
    this.workers = [];

    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }

    this._init();
  }

  _init() {
    try {
      const Bree = require('bree');
      this.bree = new Bree({
        root: this.workDir,
        jobs: [],
        worker: {
          workerArguments: ['--max-old-space-size=256'],
        },
      });
      console.log('[BackgroundTasks] Bree loaded');
    } catch (e) {
      console.warn('[BackgroundTasks] Bree not available, using built-in fallback');
    }
  }

  /**
   * Run a task in the background.
   */
  async runTask(taskFn, options = {}) {
    const taskId = options.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const timeout = options.timeout || this.jobTimeout;

    const job = {
      id: taskId,
      status: 'running',
      startedAt: new Date().toISOString(),
      result: null,
      error: null,
      duration: 0,
    };

    this.jobs.set(taskId, job);

    // Run with timeout
    const startTime = Date.now();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Task timeout after ${timeout}ms`)), timeout);
    });

    try {
      const result = await Promise.race([
        Promise.resolve().then(() => taskFn()),
        timeoutPromise,
      ]);

      job.status = 'completed';
      job.result = result;
      job.duration = Date.now() - startTime;
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      job.duration = Date.now() - startTime;
    }

    this.history.push({ ...job, completedAt: new Date().toISOString() });
    this.jobs.delete(taskId);

    return job;
  }

  /**
   * Schedule a recurring background task.
   */
  scheduleRecurring(id, intervalMs, taskFn) {
    const job = {
      id,
      status: 'scheduled',
      intervalMs,
      active: true,
      runCount: 0,
      lastRun: null,
    };

    const intervalId = setInterval(async () => {
      if (!job.active) return;
      job.runCount++;
      job.lastRun = new Date().toISOString();
      try {
        await taskFn();
      } catch (e) {
        console.error(`[BackgroundTasks] Recurring task ${id} failed:`, e.message);
      }
    }, intervalMs);

    job.intervalId = intervalId;
    this.jobs.set(id, job);
    return { id, scheduled: true, intervalMs };
  }

  /**
   * Cancel a scheduled task.
   */
  cancel(taskId) {
    const job = this.jobs.get(taskId);
    if (!job) return false;
    if (job.intervalId) clearInterval(job.intervalId);
    job.active = false;
    job.status = 'cancelled';
    this.jobs.delete(taskId);
    return true;
  }

  /**
   * Get active jobs.
   */
  getActiveJobs() {
    return Array.from(this.jobs.values()).map(j => ({
      id: j.id,
      status: j.status,
      runCount: j.runCount || 0,
      lastRun: j.lastRun,
    }));
  }

  /**
   * Get history.
   */
  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  getStats() {
    return {
      breeAvailable: !!this.bree,
      activeJobs: this.jobs.size,
      totalHistory: this.history.length,
      completedJobs: this.history.filter(h => h.status === 'completed').length,
      failedJobs: this.history.filter(h => h.status === 'failed').length,
    };
  }
}

module.exports = BackgroundTaskManager;
