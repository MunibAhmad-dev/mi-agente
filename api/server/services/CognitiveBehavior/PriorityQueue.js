'use strict';

/**
 * PriorityQueue.js — Gen B Batch-C Phase 7.
 * Manages task priorities with weighted scoring and aging.
 */

const crypto = require('crypto');

const AGING_INTERVAL_MS = 60_000; // bump priority every 60 s if not dequeued
const AGING_INCREMENT = 0.5;       // fractional priority increase per interval

class PriorityQueue {
  constructor() {
    // Map: taskId → taskRecord
    this._tasks = new Map();
    this.stats = { enqueued: 0, dequeued: 0, updated: 0 };
  }

  /**
   * Add a task to the queue.
   * @param {object|string} task - task data or description
   * @param {number} priority - 1 (low) to 10 (critical)
   * @param {object} metadata
   * @returns {{ taskId, position }}
   */
  enqueue(task, priority = 5, metadata = {}) {
    try {
      const p = Math.min(10, Math.max(1, Number(priority) || 5));
      const taskId = crypto.randomBytes(8).toString('hex');
      const record = {
        taskId,
        task,
        priority: p,
        effectivePriority: p,
        metadata,
        status: 'pending',
        enqueuedAt: new Date().toISOString(),
        dequeuedAt: null,
        lastAged: Date.now(),
      };
      this._tasks.set(taskId, record);
      this.stats.enqueued++;
      const sorted = this._sorted();
      const position = sorted.findIndex((t) => t.taskId === taskId);
      return { taskId, position };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Remove and return the highest priority task.
   * @returns {object|null}
   */
  dequeue() {
    try {
      this._applyAging();
      const sorted = this._sorted();
      if (sorted.length === 0) return null;
      const top = sorted[0];
      top.status = 'dequeued';
      top.dequeuedAt = new Date().toISOString();
      this._tasks.delete(top.taskId);
      this.stats.dequeued++;
      return { ...top };
    } catch {
      return null;
    }
  }

  /**
   * Peek at the next task without removing it.
   * @returns {object|null}
   */
  peek() {
    try {
      this._applyAging();
      const sorted = this._sorted();
      return sorted.length > 0 ? { ...sorted[0] } : null;
    } catch {
      return null;
    }
  }

  /**
   * Change a task's priority.
   * @param {string} taskId
   * @param {number} newPriority
   */
  update(taskId, newPriority) {
    try {
      const record = this._tasks.get(taskId);
      if (!record) return { error: `Task ${taskId} not found` };
      const p = Math.min(10, Math.max(1, Number(newPriority) || record.priority));
      record.priority = p;
      record.effectivePriority = p;
      record.lastAged = Date.now();
      this.stats.updated++;
      return { taskId, priority: p };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * List all tasks, optionally filtered.
   * @param {{ status?: string, minPriority?: number, maxPriority?: number }} filter
   * @returns {object[]}
   */
  list(filter = {}) {
    try {
      this._applyAging();
      let tasks = Array.from(this._tasks.values());

      if (filter.status) {
        tasks = tasks.filter((t) => t.status === filter.status);
      }
      if (filter.minPriority !== undefined) {
        tasks = tasks.filter((t) => t.effectivePriority >= filter.minPriority);
      }
      if (filter.maxPriority !== undefined) {
        tasks = tasks.filter((t) => t.effectivePriority <= filter.maxPriority);
      }

      return tasks
        .sort((a, b) => b.effectivePriority - a.effectivePriority)
        .map((t) => ({ ...t }));
    } catch {
      return [];
    }
  }

  // ── private ──────────────────────────────────────────────────────────────────

  _sorted() {
    return Array.from(this._tasks.values())
      .filter((t) => t.status === 'pending')
      .sort((a, b) => b.effectivePriority - a.effectivePriority);
  }

  _applyAging() {
    const now = Date.now();
    for (const record of this._tasks.values()) {
      if (record.status !== 'pending') continue;
      const elapsed = now - record.lastAged;
      const increments = Math.floor(elapsed / AGING_INTERVAL_MS);
      if (increments > 0) {
        record.effectivePriority = Math.min(10, record.effectivePriority + increments * AGING_INCREMENT);
        record.lastAged = now;
      }
    }
  }

  getStats() {
    return { ...this.stats, pending: this._sorted().length, total: this._tasks.size };
  }
}

let _instance = null;
function getPriorityQueue() {
  if (!_instance) _instance = new PriorityQueue();
  return _instance;
}

module.exports = { PriorityQueue, getPriorityQueue };
