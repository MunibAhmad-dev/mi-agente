/**
 * GoalManager — Continuous Goal Verification (/goal)
 * Equivalent to Claude Code /goal feature
 * 
 * License: MIT — Zero cost
 */

const EventEmitter = require('events');

class GoalManager extends EventEmitter {
  constructor() {
    super();
    this.goals = new Map();
    this.initialized = false;
    this.stats = { created: 0, achieved: 0, failed: 0 };
  }

  initialize() {
    this.initialized = true;
    return { status: 'ok', module: 'GoalManager' };
  }

  /**
   * Set a goal for continuous verification
   */
  set(sessionId, { description, condition, maxAttempts = 50, interval = 1000 }) {
    const goal = {
      sessionId,
      description,
      condition, // function or expression string
      maxAttempts,
      interval,
      attempts: 0,
      status: 'active', // active | achieved | failed | abandoned
      history: [],
      createdAt: new Date().toISOString()
    };
    this.goals.set(sessionId, goal);
    this.stats.created++;
    this.emit('goal:set', { sessionId, description });
    return { success: true, goalId: sessionId };
  }

  /**
   * Check if goal is achieved
   */
  check(sessionId, { context = {} } = {}) {
    const goal = this.goals.get(sessionId);
    if (!goal) return { checked: false, error: 'Goal not found' };
    if (goal.status !== 'active') return { checked: true, status: goal.status };

    goal.attempts++;
    let achieved = false;
    try {
      if (typeof goal.condition === 'function') {
        achieved = goal.condition(context);
      } else if (typeof goal.condition === 'string') {
        const { safeEvalCondition } = require('./safeEval');
        let expr = goal.condition;
        for (const [k, v] of Object.entries(context)) {
          expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), JSON.stringify(v));
        }
        achieved = safeEvalCondition(expr);
      }
    } catch (e) { achieved = false; }

    goal.history.push({
      attempt: goal.attempts,
      achieved,
      timestamp: new Date().toISOString(),
      context: Object.keys(context)
    });

    if (achieved) {
      goal.status = 'achieved';
      this.stats.achieved++;
      this.emit('goal:achieved', { sessionId, attempts: goal.attempts });
      return { checked: true, status: 'achieved', attempts: goal.attempts };
    }

    if (goal.attempts >= goal.maxAttempts) {
      goal.status = 'failed';
      this.stats.failed++;
      this.emit('goal:failed', { sessionId, attempts: goal.attempts });
      return { checked: true, status: 'failed', attempts: goal.attempts };
    }

    return { checked: true, status: 'active', attempts: goal.attempts, remaining: goal.maxAttempts - goal.attempts };
  }

  /**
   * Abandon a goal
   */
  abandon(sessionId) {
    const goal = this.goals.get(sessionId);
    if (!goal) return false;
    goal.status = 'abandoned';
    return true;
  }

  /**
   * Get goal status
   */
  get(sessionId) {
    return this.goals.get(sessionId) || null;
  }

  /**
   * List active goals
   */
  listActive() {
    return Array.from(this.goals.values()).filter(g => g.status === 'active');
  }

  getStats() {
    return {
      ...this.stats,
      activeGoals: Array.from(this.goals.values()).filter(g => g.status === 'active').length,
      totalGoals: this.goals.size
    };
  }
}

module.exports = GoalManager;
