/**
 * PlanModeManager — Plan Mode / Auto Mode
 * Equivalent to Claude Code Plan Mode + Auto Mode classifier
 * 
 * License: MIT — Zero cost, custom implementation
 */

const EventEmitter = require('events');

class PlanModeManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, PlanSession>} */
    this.sessions = new Map();
    this.initialized = false;
    this.stats = { planSessions: 0, approved: 0, rejected: 0 };
  }

  initialize() {
    this.initialized = true;
    return { status: 'ok', module: 'PlanModeManager' };
  }

  /**
   * Enable plan mode for a session (read-only exploration)
   */
  enablePlanMode(sessionId, { userId = 'system', goal = '' } = {}) {
    const session = {
      sessionId,
      userId,
      goal,
      mode: 'plan', // 'plan' | 'execute' | 'auto'
      plan: null,
      exploration: [],
      readOnly: true,
      createdAt: new Date().toISOString(),
      approvedAt: null,
      steps: []
    };
    this.sessions.set(sessionId, session);
    this.stats.planSessions++;
    this.emit('plan:enabled', { sessionId });
    return { success: true, mode: 'plan', readOnly: true };
  }

  /**
   * Record an exploration step (read-only)
   */
  addExplorationStep(sessionId, step) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    session.exploration.push({
      type: step.type || 'observation',
      content: step.content,
      file: step.file,
      timestamp: new Date().toISOString()
    });
    return { success: true, explorationCount: session.exploration.length };
  }

  /**
   * Create implementation plan
   */
  createPlan(sessionId, plan) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    session.plan = {
      title: plan.title || 'Implementation Plan',
      steps: plan.steps || [],
      estimatedTime: plan.estimatedTime || 'unknown',
      risks: plan.risks || [],
      dependencies: plan.dependencies || [],
      createdAt: new Date().toISOString()
    };
    this.emit('plan:created', { sessionId, stepCount: plan.steps?.length || 0 });
    return { success: true, plan: session.plan };
  }

  /**
   * Approve plan → switch to execute mode
   */
  approvePlan(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    session.mode = 'execute';
    session.readOnly = false;
    session.approvedAt = new Date().toISOString();
    this.stats.approved++;
    this.emit('plan:approved', { sessionId });
    return { success: true, mode: 'execute', readOnly: false };
  }

  /**
   * Reject plan → stay in plan mode
   */
  rejectPlan(sessionId, reason = '') {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    session.mode = 'plan';
    session.readOnly = true;
    session.plan = null;
    this.stats.rejected++;
    this.emit('plan:rejected', { sessionId, reason });
    return { success: true, mode: 'plan' };
  }

  /**
   * Enable auto mode (classifier-based permissions)
   */
  enableAutoMode(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    session.mode = 'auto';
    session.readOnly = false;
    this.emit('auto:enabled', { sessionId });
    return { success: true, mode: 'auto' };
  }

  /**
   * Check if action is allowed in current mode
   */
  isActionAllowed(sessionId, action) {
    const session = this.sessions.get(sessionId);
    if (!session) return { allowed: false, reason: 'Session not found' };

    if (session.mode === 'plan') {
      const readOnlyActions = ['read', 'search', 'list', 'explain', 'plan', 'explore'];
      if (readOnlyActions.includes(action.type)) {
        return { allowed: true, reason: 'Read-only action in plan mode' };
      }
      return { allowed: false, reason: 'Write actions disabled in plan mode. Approve the plan first.' };
    }

    if (session.mode === 'auto') {
      const riskScore = this._assessRisk(action);
      if (riskScore < 0.3) return { allowed: true, risk: riskScore, reason: 'Low risk - auto-approved' };
      if (riskScore < 0.7) return { allowed: true, risk: riskScore, reason: 'Medium risk - auto-approved with monitoring' };
      return { allowed: false, risk: riskScore, reason: 'High risk - requires manual approval' };
    }

    return { allowed: true, reason: 'Execute mode - all actions allowed' };
  }

  _assessRisk(action) {
    let risk = 0;
    const highRisk = ['delete', 'deploy', 'push', 'drop', 'destroy', 'remove'];
    const medRisk = ['write', 'create', 'modify', 'install', 'update', 'edit'];
    const lowRisk = ['read', 'search', 'list', 'explain', 'analyze'];

    if (highRisk.some(w => action.type?.includes(w) || action.command?.includes(w))) risk += 0.6;
    else if (medRisk.some(w => action.type?.includes(w) || action.command?.includes(w))) risk += 0.3;
    else if (lowRisk.some(w => action.type?.includes(w))) risk += 0.1;

    if (action.target?.includes('/etc') || action.target?.includes('system')) risk += 0.3;
    if (action.network) risk += 0.2;
    return Math.min(risk, 1.0);
  }

  /**
   * Get session info
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  getStats() {
    return {
      ...this.stats,
      activeSessions: this.sessions.size,
      initialized: this.initialized
    };
  }
}

module.exports = PlanModeManager;
