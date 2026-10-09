'use strict';

/**
 * LongHorizonExecution — Phase 20: Multi-phase long-running task management.
 *
 * Breaks a high-complexity goal into phases that can span multiple sessions.
 * Each phase has sub-tasks, checkpoints, and progress tracking. The agent can
 * pause mid-execution, persist state, and resume in a future session without
 * losing context.
 *
 * Integration:
 *   - HarnessEngine.registerGoal() creates a LongHorizonPlan
 *   - ExecutiveLoop references the active plan to continue from last checkpoint
 *   - harness.js /checkpoints route returns long-horizon plan status
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PLANS_DIR = path.join(process.cwd(), 'data', 'long_horizon_plans');

class LongHorizonExecution {
  constructor(options = {}) {
    this._plansDir = options.plansDir || PLANS_DIR;
    this._activePlans = new Map(); // planId → plan object
  }

  // ── Plan creation ───────────────────────────────────────────────────────────

  /**
   * Create a multi-phase execution plan from a goal description.
   * @param {object} opts  { goal, userId, phases, estimatedDurationMs }
   * @returns {object} the created plan
   */
  createPlan({ goal, userId, phases = null, estimatedDurationMs = null }) {
    if (!goal) throw new Error('goal is required');
    if (!userId) throw new Error('userId is required');

    const planId = crypto.randomUUID();
    const derivedPhases = phases || this._derivePhases(goal);

    const plan = {
      id: planId,
      goal,
      userId,
      status: 'active',      // active | paused | completed | failed
      currentPhaseIndex: 0,
      phases: derivedPhases.map((p, i) => ({
        id: `phase_${i}`,
        index: i,
        name: p.name || `Phase ${i + 1}`,
        description: p.description || '',
        tasks: (p.tasks || []).map((t, j) => ({
          id: `t${i}_${j}`,
          name: t,
          status: 'pending',  // pending | running | done | failed | skipped
          result: null,
          completedAt: null,
        })),
        status: i === 0 ? 'active' : 'pending',
        progress: 0,
        startedAt: i === 0 ? new Date().toISOString() : null,
        completedAt: null,
      })),
      estimatedDurationMs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,  // 0–100
      checkpoints: [],
    };

    this._activePlans.set(planId, plan);
    this._savePlan(plan);
    return plan;
  }

  // ── Phase/task progression ──────────────────────────────────────────────────

  /**
   * Mark a task as complete and advance the plan.
   * @param {string} planId
   * @param {string} taskId
   * @param {any}    result
   */
  completeTask(planId, taskId, result = null) {
    const plan = this._getPlan(planId);
    const phase = plan.phases[plan.currentPhaseIndex];
    if (!phase) throw new Error(`No active phase in plan ${planId}`);

    const task = phase.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found in current phase`);

    task.status = 'done';
    task.result = result;
    task.completedAt = new Date().toISOString();

    // Recalculate phase progress
    const done = phase.tasks.filter((t) => t.status === 'done' || t.status === 'skipped').length;
    phase.progress = phase.tasks.length ? Math.round((done / phase.tasks.length) * 100) : 100;

    // Auto-advance phase when all tasks done
    if (done === phase.tasks.length) {
      phase.status = 'completed';
      phase.completedAt = new Date().toISOString();

      const nextPhaseIdx = plan.currentPhaseIndex + 1;
      if (nextPhaseIdx < plan.phases.length) {
        plan.currentPhaseIndex = nextPhaseIdx;
        plan.phases[nextPhaseIdx].status = 'active';
        plan.phases[nextPhaseIdx].startedAt = new Date().toISOString();
      } else {
        plan.status = 'completed';
      }
    }

    // Overall progress
    const totalTasks = plan.phases.reduce((s, p) => s + p.tasks.length, 0);
    const doneTasks = plan.phases.reduce((s, p) => s + p.tasks.filter((t) => t.status === 'done').length, 0);
    plan.progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

    plan.updatedAt = new Date().toISOString();
    this._savePlan(plan);
    return plan;
  }

  /**
   * Pause a plan and save a checkpoint for later resumption.
   */
  pause(planId, checkpoint = {}) {
    const plan = this._getPlan(planId);
    plan.status = 'paused';
    plan.checkpoints.push({ ...checkpoint, ts: new Date().toISOString(), phaseIndex: plan.currentPhaseIndex });
    plan.updatedAt = new Date().toISOString();
    this._savePlan(plan);
    return plan;
  }

  /**
   * Resume a paused plan.
   */
  resume(planId) {
    const plan = this._getPlan(planId);
    if (plan.status !== 'paused') throw new Error(`Plan ${planId} is not paused (status: ${plan.status})`);
    plan.status = 'active';
    plan.updatedAt = new Date().toISOString();
    this._savePlan(plan);
    return plan;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  getPlan(planId) {
    return this._getPlan(planId);
  }

  listPlans(userId) {
    const onDisk = this._loadAllPlans().filter((p) => !userId || p.userId === userId);
    return onDisk;
  }

  getActivePlan(userId) {
    const all = this.listPlans(userId);
    return all.find((p) => p.status === 'active') || null;
  }

  getCurrentPhase(planId) {
    const plan = this._getPlan(planId);
    return plan.phases[plan.currentPhaseIndex] || null;
  }

  // ── Auto phase derivation ───────────────────────────────────────────────────

  _derivePhases(goal) {
    const lower = String(goal).toLowerCase();
    const phases = [];

    // Always start with analysis
    phases.push({
      name: 'Analysis & Planning',
      description: 'Understand requirements, identify constraints, build task graph',
      tasks: ['Analyze goal', 'Identify constraints', 'Enumerate sub-tasks'],
    });

    if (/code|implement|build|create|develop|fix|refactor/i.test(lower)) {
      phases.push({ name: 'Implementation', description: 'Write and integrate code', tasks: ['Write core logic', 'Wire integration', 'Handle edge cases'] });
      phases.push({ name: 'Testing & Verification', description: 'Verify correctness and security', tasks: ['Write tests', 'Run tests', 'Security review'] });
    }

    if (/research|analyze|investigate|understand/i.test(lower)) {
      phases.push({ name: 'Research', description: 'Gather and synthesize information', tasks: ['Collect sources', 'Synthesize findings', 'Identify gaps'] });
    }

    // Always end with review
    phases.push({
      name: 'Review & Delivery',
      description: 'Final review, documentation, and hand-off',
      tasks: ['Quality check', 'Document changes', 'Deliver results'],
    });

    return phases;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  _getPlan(planId) {
    if (this._activePlans.has(planId)) return this._activePlans.get(planId);
    const plan = this._loadPlan(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);
    this._activePlans.set(planId, plan);
    return plan;
  }

  _savePlan(plan) {
    try {
      if (!fs.existsSync(this._plansDir)) fs.mkdirSync(this._plansDir, { recursive: true });
      fs.writeFileSync(path.join(this._plansDir, `${plan.id}.json`), JSON.stringify(plan, null, 2));
      this._activePlans.set(plan.id, plan);
    } catch { /* non-fatal */ }
  }

  _loadPlan(planId) {
    try {
      const p = path.join(this._plansDir, `${planId}.json`);
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return null;
  }

  _loadAllPlans() {
    try {
      if (!fs.existsSync(this._plansDir)) return [];
      return fs.readdirSync(this._plansDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(this._plansDir, f), 'utf8')); } catch { return null; } })
        .filter(Boolean);
    } catch { return []; }
  }

  getStats() {
    const all = this._loadAllPlans();
    return {
      total: all.length,
      active: all.filter((p) => p.status === 'active').length,
      completed: all.filter((p) => p.status === 'completed').length,
      paused: all.filter((p) => p.status === 'paused').length,
    };
  }
}

// Singleton
let _instance = null;
function getLongHorizonExecution(options) {
  if (!_instance) _instance = new LongHorizonExecution(options);
  return _instance;
}

module.exports = { LongHorizonExecution, getLongHorizonExecution };
