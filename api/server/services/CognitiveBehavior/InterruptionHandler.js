'use strict';

/**
 * InterruptionHandler — Gen B runtime phase.
 * Handles mid-task interruptions gracefully: checkpointing state,
 * interrupting a task, and resuming from saved state.
 *
 * Interruptions are resumable within 24 hours.
 */

const RESUME_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let _interruptCounter = 0;

function generateInterruptId() {
  return `int_${Date.now()}_${++_interruptCounter}`;
}

function suggestResumption(reason) {
  const r = (reason || '').toLowerCase();
  if (r.includes('user')) return 'User can resume this task when ready by providing the interrupt ID.';
  if (r.includes('timeout')) return 'Task timed out. Resume when system resources are available.';
  if (r.includes('error')) return 'Task encountered an error. Review the error and resume with corrected input.';
  if (r.includes('cancel')) return 'Task was cancelled. Resume only if still needed.';
  return 'Task was interrupted. Resume at any time within 24 hours using the interrupt ID.';
}

class InterruptionHandler {
  constructor() {
    this.stats = { checkpoints: 0, interruptions: 0, resumes: 0 };
    // taskId → { state, timestamp }
    this._checkpoints = new Map();
    // interruptId → { taskId, state, reason, timestamp, resumable }
    this._interruptions = new Map();
    // taskId → [interruptId, ...]
    this._byTask = new Map();
  }

  /**
   * Save task state as a checkpoint for potential resume.
   * @param {string} taskId
   * @param {*} state
   */
  checkpoint(taskId, state) {
    try {
      if (!taskId) return;
      this._checkpoints.set(taskId, { state, timestamp: Date.now() });
      this.stats.checkpoints++;
    } catch (_) {
      // non-throwing
    }
  }

  /**
   * Interrupt a running task and save its state.
   * @param {string} taskId
   * @param {string} [reason]
   * @returns {{ interruptId, savedState, resumable, suggestion }}
   */
  interrupt(taskId, reason = 'user_interrupt') {
    try {
      if (!taskId) {
        return { interruptId: null, savedState: null, resumable: false, suggestion: 'No task ID provided' };
      }

      const checkpoint = this._checkpoints.get(taskId);
      const interruptId = generateInterruptId();
      const now = Date.now();
      const resumable = !!checkpoint;

      const entry = {
        taskId,
        state: checkpoint ? checkpoint.state : null,
        reason,
        timestamp: now,
        resumable,
        resumed: false,
      };
      this._interruptions.set(interruptId, entry);

      if (!this._byTask.has(taskId)) this._byTask.set(taskId, []);
      this._byTask.get(taskId).push(interruptId);

      this.stats.interruptions++;

      return {
        interruptId,
        savedState: entry.state,
        resumable,
        suggestion: suggestResumption(reason),
      };
    } catch (err) {
      return { interruptId: null, savedState: null, resumable: false, suggestion: err.message };
    }
  }

  /**
   * Resume from a saved interruption.
   * @param {string} interruptId
   * @returns {{ taskId, state, timePaused: number } | null}
   */
  resume(interruptId) {
    try {
      if (!interruptId) return null;
      const entry = this._interruptions.get(interruptId);
      if (!entry) return null;
      if (!this.canResume(interruptId)) return null;

      const timePaused = Date.now() - entry.timestamp;
      entry.resumed = true;
      this.stats.resumes++;

      return {
        taskId: entry.taskId,
        state: entry.state,
        timePaused,
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * Get interruptions for a task (or all if no taskId given).
   * @param {string} [taskId]
   * @returns {object[]}
   */
  getInterruptions(taskId) {
    try {
      if (taskId) {
        const ids = this._byTask.get(taskId) || [];
        return ids
          .map((id) => ({ interruptId: id, ...this._interruptions.get(id) }))
          .filter(Boolean);
      }
      return [...this._interruptions.entries()].map(([id, entry]) => ({
        interruptId: id,
        ...entry,
      }));
    } catch (_) {
      return [];
    }
  }

  /**
   * Check if an interruption can still be resumed (within 24 hours).
   * @param {string} interruptId
   * @returns {boolean}
   */
  canResume(interruptId) {
    try {
      const entry = this._interruptions.get(interruptId);
      if (!entry || !entry.resumable || entry.resumed) return false;
      const age = Date.now() - entry.timestamp;
      return age < RESUME_TTL_MS;
    } catch (_) {
      return false;
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getInterruptionHandler() {
  if (!_instance) _instance = new InterruptionHandler();
  return _instance;
}

module.exports = { InterruptionHandler, getInterruptionHandler };
