'use strict';

/**
 * GoalStateMonitor.js — Gen B Batch-C Phase 6.
 * Monitors goal achievement and tracks sub-goal completion.
 */

const crypto = require('crypto');

class GoalStateMonitor {
  constructor() {
    // Map: sessionId → { goals: Map<goalId, goalRecord> }
    this._sessions = new Map();
    this.stats = { sessions: 0, totalGoals: 0, completed: 0 };
  }

  /**
   * Set a new goal for a session.
   * @param {string} sessionId
   * @param {string} goal
   * @param {string[]} subGoals
   * @returns {{ goalId, goal, subGoals, status }}
   */
  setGoal(sessionId, goal, subGoals = []) {
    try {
      if (!sessionId) return { error: 'sessionId is required' };
      if (!goal) return { error: 'goal is required' };

      this._ensureSession(sessionId);
      const goalId = crypto.randomBytes(6).toString('hex');
      const normalizedSubGoals = (Array.isArray(subGoals) ? subGoals : []).map((sg, i) => ({
        id: `${goalId}-sg${i}`,
        label: typeof sg === 'string' ? sg : sg.label || `Sub-goal ${i + 1}`,
        status: 'pending',
        evidence: null,
        completedAt: null,
      }));

      const record = {
        goalId,
        goal,
        subGoals: normalizedSubGoals,
        status: 'active',
        progress: 0,
        blockers: [],
        createdAt: new Date().toISOString(),
        completedAt: null,
      };

      this._sessions.get(sessionId).goals.set(goalId, record);
      this.stats.totalGoals++;

      return { goalId, goal, subGoals: normalizedSubGoals, status: 'active' };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Update progress on a goal.
   * @param {string} sessionId
   * @param {string} goalId
   * @param {string} completedSubGoal - label or id of completed sub-goal
   * @param {string} evidence
   * @returns {{ complete: boolean, progress: number }}
   */
  updateProgress(sessionId, goalId, completedSubGoal, evidence = '') {
    try {
      const session = this._sessions.get(sessionId);
      if (!session) return { error: 'session not found', complete: false, progress: 0 };

      const record = session.goals.get(goalId);
      if (!record) return { error: 'goal not found', complete: false, progress: 0 };

      if (record.subGoals.length === 0) {
        // No sub-goals: mark the goal itself complete when evidence provided
        if (completedSubGoal || evidence) {
          record.status = 'complete';
          record.progress = 1;
          record.completedAt = new Date().toISOString();
          this.stats.completed++;
        }
        return { complete: record.status === 'complete', progress: record.progress };
      }

      // Find the sub-goal by label or id
      const sg = record.subGoals.find(
        (s) => s.label === completedSubGoal || s.id === completedSubGoal
      );

      if (sg && sg.status === 'pending') {
        sg.status = 'done';
        sg.evidence = evidence;
        sg.completedAt = new Date().toISOString();
      } else if (!sg) {
        // Treat unknown sub-goal as a blocker note
        record.blockers.push(`Unknown sub-goal: ${completedSubGoal}`);
      }

      const done = record.subGoals.filter((s) => s.status === 'done').length;
      record.progress = record.subGoals.length > 0 ? done / record.subGoals.length : 0;
      const complete = done === record.subGoals.length;

      if (complete && record.status !== 'complete') {
        record.status = 'complete';
        record.completedAt = new Date().toISOString();
        this.stats.completed++;
      }

      return { complete, progress: record.progress };
    } catch (err) {
      return { error: err.message, complete: false, progress: 0 };
    }
  }

  /**
   * Get full goal state for a session.
   * @param {string} sessionId
   * @returns {{ goals: object[], overallProgress: number, blockers: string[] }}
   */
  getGoalState(sessionId) {
    try {
      const session = this._sessions.get(sessionId);
      if (!session) return { goals: [], overallProgress: 0, blockers: [] };

      const goals = Array.from(session.goals.values()).map((g) => ({ ...g, subGoals: [...g.subGoals] }));
      const totalProgress = goals.length > 0
        ? goals.reduce((sum, g) => sum + g.progress, 0) / goals.length
        : 0;

      const blockers = goals.flatMap((g) => g.blockers);
      return {
        goals,
        overallProgress: Math.round(totalProgress * 100) / 100,
        blockers: [...new Set(blockers)],
      };
    } catch (err) {
      return { goals: [], overallProgress: 0, blockers: [], error: err.message };
    }
  }

  /**
   * Check whether a goal is met.
   * @param {string} sessionId
   * @param {string} goalId
   * @returns {boolean}
   */
  isGoalMet(sessionId, goalId) {
    try {
      const session = this._sessions.get(sessionId);
      if (!session) return false;
      const record = session.goals.get(goalId);
      return record ? record.status === 'complete' : false;
    } catch {
      return false;
    }
  }

  // ── private ──────────────────────────────────────────────────────────────────

  _ensureSession(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, { goals: new Map() });
      this.stats.sessions++;
    }
  }

  getStats() {
    return { ...this.stats, activeSessions: this._sessions.size };
  }
}

let _instance = null;
function getGoalStateMonitor() {
  if (!_instance) _instance = new GoalStateMonitor();
  return _instance;
}

module.exports = { GoalStateMonitor, getGoalStateMonitor };
