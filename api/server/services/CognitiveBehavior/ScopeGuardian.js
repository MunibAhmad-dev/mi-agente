'use strict';

/**
 * ScopeGuardian — Gen B Safety Phase 6.
 * Prevents scope creep and keeps the agent on task.
 * Monitors progress updates for drift signals and guards proposed actions.
 */

// Words that signal expansion beyond the original scope
const DRIFT_SIGNALS = [
  'also', 'additionally', 'while we are at it', 'by the way', 'and another thing',
  'tangentially', 'unrelated', 'different topic', 'new feature', 'extra', 'bonus',
  'moreover', 'furthermore', 'on a separate note', 'side note', 'while i have you',
];

const DRIFT_THRESHOLD = 0.35; // drift score above this → drifted

function wordSet(text) {
  return new Set((text || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3));
}

function overlapRatio(setA, textB) {
  if (setA.size === 0) return 0;
  const wordsB = (textB || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const common = wordsB.filter((w) => setA.has(w)).length;
  return common / Math.max(setA.size, wordsB.length || 1);
}

class ScopeGuardian {
  constructor() {
    // taskId → { objective, constraints, objectiveWords, progressUpdates: [], createdAt }
    this._scopes = new Map();
    this.stats = { tasksDefned: 0, checksPerformed: 0, violations: 0, drifts: 0 };
  }

  /**
   * Define the scope for a task.
   * @param {string} taskId
   * @param {string} objective      - Primary objective statement
   * @param {string[]} constraints  - List of constraint strings
   * @returns {{ ok: boolean, taskId: string }}
   */
  defineScope(taskId, objective, constraints = []) {
    try {
      if (!taskId || !objective) {
        return { ok: false, error: 'taskId and objective are required' };
      }

      this._scopes.set(taskId, {
        taskId,
        objective,
        constraints: Array.isArray(constraints) ? constraints : [],
        objectiveWords: wordSet(objective),
        progressUpdates: [],
        createdAt: new Date().toISOString(),
      });
      this.stats.tasksDefned++;
      return { ok: true, taskId, objective };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Check whether a proposed action is in scope.
   * @param {string} taskId
   * @param {string} proposedAction - Description of the action to check
   * @returns {{ inScope: boolean, violation: string|null, suggestion: string }}
   */
  checkInScope(taskId, proposedAction) {
    try {
      this.stats.checksPerformed++;
      const scope = this._scopes.get(taskId);
      if (!scope) {
        return { inScope: false, violation: 'Task scope not defined', suggestion: 'Define scope first using defineScope()' };
      }
      if (!proposedAction) {
        return { inScope: false, violation: 'No action provided', suggestion: 'Provide a description of the action to check' };
      }

      // Check against constraints
      const actionLower = proposedAction.toLowerCase();
      for (const constraint of scope.constraints) {
        if (this._violatesConstraint(actionLower, constraint)) {
          this.stats.violations++;
          return {
            inScope: false,
            violation: `Action violates constraint: "${constraint}"`,
            suggestion: `Stay within bounds: ${scope.objective}`,
          };
        }
      }

      // Check topical overlap with objective
      const overlap = overlapRatio(scope.objectiveWords, proposedAction);
      if (overlap < 0.10 && scope.objectiveWords.size > 3) {
        this.stats.violations++;
        return {
          inScope: false,
          violation: `Action appears unrelated to objective (overlap: ${Math.round(overlap * 100)}%)`,
          suggestion: `Focus on: ${scope.objective}`,
        };
      }

      return { inScope: true, violation: null, suggestion: null };
    } catch (err) {
      return { inScope: true, violation: null, suggestion: null, error: err.message };
    }
  }

  /**
   * Monitor a progress update for scope drift.
   * @param {string} taskId
   * @param {string} progressUpdate
   * @returns {{ drifted: boolean, driftScore: number, correction: string|null }}
   */
  monitor(taskId, progressUpdate) {
    try {
      const scope = this._scopes.get(taskId);
      if (!scope) {
        return { drifted: false, driftScore: 0, correction: null, error: 'Scope not defined' };
      }

      scope.progressUpdates.push({ text: progressUpdate, at: new Date().toISOString() });
      if (scope.progressUpdates.length > 100) scope.progressUpdates.shift();

      const driftScore = this._computeDrift(progressUpdate, scope);
      const drifted = driftScore >= DRIFT_THRESHOLD;

      if (drifted) this.stats.drifts++;

      const correction = drifted
        ? `Refocus on primary objective: "${scope.objective}". Avoid expanding scope mid-task.`
        : null;

      return { drifted, driftScore: Math.round(driftScore * 100) / 100, correction };
    } catch (err) {
      return { drifted: false, driftScore: 0, correction: null, error: err.message };
    }
  }

  _computeDrift(text, scope) {
    if (!text) return 0;
    const textLower = text.toLowerCase();

    let driftScore = 0;

    // Signal words
    const signalCount = DRIFT_SIGNALS.filter((sig) => textLower.includes(sig)).length;
    driftScore += Math.min(0.4, signalCount * 0.12);

    // Low topical overlap with objective
    const overlap = overlapRatio(scope.objectiveWords, text);
    if (scope.objectiveWords.size > 3 && overlap < 0.10) {
      driftScore += 0.35;
    }

    // Constraint-violating language
    for (const constraint of scope.constraints) {
      if (this._violatesConstraint(textLower, constraint)) {
        driftScore += 0.25;
        break;
      }
    }

    return Math.min(1, driftScore);
  }

  _violatesConstraint(actionLower, constraint) {
    const constraintWords = wordSet(constraint);
    if (constraintWords.size === 0) return false;
    // Simple: if action contains "no X" type constraint enforcement
    const negPattern = /\b(no|not|avoid|prevent|block|never|do not)\b/i;
    if (negPattern.test(constraint)) {
      // Extract what's prohibited
      const prohibited = constraint.toLowerCase().replace(/\b(no|not|avoid|prevent|block|never|do not)\b/gi, '').trim();
      const prohibWords = wordSet(prohibited);
      return overlapRatio(prohibWords, actionLower) > 0.4;
    }
    return false;
  }

  getStats() {
    return { ...this.stats, activeTasks: this._scopes.size };
  }
}

let _instance = null;
function getScopeGuardian() {
  if (!_instance) _instance = new ScopeGuardian();
  return _instance;
}

module.exports = { ScopeGuardian, getScopeGuardian };
