/**
 * PlanMode.js — Explicit Planning Phase
 * 
 * Implements Claude Code-style plan mode:
 * - Analyze task before executing
 * - Create step-by-step plan
 * - Get user approval before executing
 * - Track plan progress
 * - Replan if errors occur
 * 
 * License: MIT
 * RAM: ~2MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[PlanMode]', ...args),
    info: (...args) => console.info('[PlanMode]', ...args),
    warn: (...args) => console.warn('[PlanMode]', ...args),
    error: (...args) => console.error('[PlanMode]', ...args),
};

class PlanMode extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'PlanMode';
        this._enabled = config.enabled !== false;
        this._autoApprove = config.autoApprove || false;
        this._maxSteps = config.maxSteps || 20;
        this._currentPlan = null;
        this._plans = new Map();
    }

    /**
     * Create a plan for a task.
     */
    async createPlan(task, context = {}) {
        if (!this._enabled) {
            return { planned: false, reason: 'Plan mode disabled' };
        }

        logger.info(`[PlanMode] Creating plan for: "${task.substring(0, 80)}..."`);

        const plan = {
            id: `plan_${Date.now()}`,
            task,
            steps: [],
            status: 'created',
            createdAt: Date.now(),
            context: {
                workingDir: context.workingDir || process.cwd(),
                availableTools: context.tools || [],
                previousAttempts: context.previousAttempts || 0,
            },
        };

        // Generate plan steps based on task analysis
        plan.steps = this._analyzeTask(task, context);

        this._currentPlan = plan;
        this._plans.set(plan.id, plan);

        this.emit('planCreated', { planId: plan.id, steps: plan.steps.length });

        return {
            planned: true,
            planId: plan.id,
            steps: plan.steps,
            summary: this._summarizePlan(plan),
        };
    }

    /**
     * Get the current plan.
     */
    getCurrentPlan() {
        return this._currentPlan;
    }

    /**
     * Mark a step as in progress.
     */
    startStep(stepIndex) {
        if (!this._currentPlan || !this._currentPlan.steps[stepIndex]) {
            return false;
        }

        this._currentPlan.steps[stepIndex].status = 'in_progress';
        this._currentPlan.steps[stepIndex].startedAt = Date.now();
        this._currentPlan.status = 'executing';

        this.emit('stepStarted', { step: stepIndex, planId: this._currentPlan.id });
        return true;
    }

    /**
     * Mark a step as completed.
     */
    completeStep(stepIndex, result = {}) {
        if (!this._currentPlan || !this._currentPlan.steps[stepIndex]) {
            return false;
        }

        const step = this._currentPlan.steps[stepIndex];
        step.status = 'completed';
        step.completedAt = Date.now();
        step.duration = step.completedAt - step.startedAt;
        step.result = result;

        this.emit('stepCompleted', { step: stepIndex, planId: this._currentPlan.id });

        // Check if all steps are completed
        const allDone = this._currentPlan.steps.every(s => s.status === 'completed');
        if (allDone) {
            this._currentPlan.status = 'completed';
            this._currentPlan.completedAt = Date.now();
            this.emit('planCompleted', { planId: this._currentPlan.id });
        }

        return true;
    }

    /**
     * Mark a step as failed.
     */
    failStep(stepIndex, error) {
        if (!this._currentPlan || !this._currentPlan.steps[stepIndex]) {
            return false;
        }

        const step = this._currentPlan.steps[stepIndex];
        step.status = 'failed';
        step.failedAt = Date.now();
        step.error = error;

        this._currentPlan.status = 'needs_replan';
        this.emit('stepFailed', { step: stepIndex, planId: this._currentPlan.id, error });

        return true;
    }

    /**
     * Replan after a failure.
     */
    async replan(reason) {
        if (!this._currentPlan) {
            return { replanned: false, reason: 'No current plan' };
        }

        logger.info(`[PlanMode] Replanning due to: ${reason}`);

        const failedStep = this._currentPlan.steps.find(s => s.status === 'failed');
        const completedSteps = this._currentPlan.steps.filter(s => s.status === 'completed');

        // Create new plan starting from the failed step
        const newPlan = {
            ...this._currentPlan,
            id: `plan_${Date.now()}`,
            status: 'replanned',
            previousPlanId: this._currentPlan.id,
            replanReason: reason,
            replannedAt: Date.now(),
            steps: [
                ...completedSteps.map(s => ({ ...s, status: 'completed' })),
                // New steps will be added by analyzeTask
            ],
        };

        // Add remaining steps
        const remainingSteps = this._analyzeTask(
            this._currentPlan.task,
            { ...this._currentPlan.context, failedStep: failedStep?.description }
        );
        newPlan.steps.push(...remainingSteps);

        this._currentPlan = newPlan;
        this._plans.set(newPlan.id, newPlan);

        this.emit('planReplanned', { planId: newPlan.id, reason });

        return {
            replanned: true,
            planId: newPlan.id,
            steps: newPlan.steps,
            summary: this._summarizePlan(newPlan),
        };
    }

    /**
     * Get plan progress.
     */
    getProgress() {
        if (!this._currentPlan) return null;

        const total = this._currentPlan.steps.length;
        const completed = this._currentPlan.steps.filter(s => s.status === 'completed').length;
        const failed = this._currentPlan.steps.filter(s => s.status === 'failed').length;
        const inProgress = this._currentPlan.steps.filter(s => s.status === 'in_progress').length;

        return {
            planId: this._currentPlan.id,
            status: this._currentPlan.status,
            total,
            completed,
            failed,
            inProgress,
            pending: total - completed - failed - inProgress,
            percentage: total > 0 ? Math.round(completed / total * 100) : 0,
        };
    }

    /**
     * Get all plans.
     */
    getPlans() {
        return [...this._plans.values()].map(p => ({
            id: p.id,
            task: p.task.substring(0, 100),
            status: p.status,
            steps: p.steps.length,
            createdAt: p.createdAt,
        }));
    }

    // ── Internal ──────────────────────────────────────────────

    _analyzeTask(task, context) {
        const taskLower = task.toLowerCase();
        const steps = [];

        // Detect task type and generate appropriate steps
        if (taskLower.includes('create') || taskLower.includes('write') || taskLower.includes('add')) {
            steps.push(
                { description: 'Analyze requirements', status: 'pending', type: 'analysis' },
                { description: 'Design solution', status: 'pending', type: 'design' },
                { description: 'Implement changes', status: 'pending', type: 'implementation' },
                { description: 'Verify implementation', status: 'pending', type: 'verification' },
            );
        } else if (taskLower.includes('fix') || taskLower.includes('debug') || taskLower.includes('error')) {
            steps.push(
                { description: 'Reproduce the issue', status: 'pending', type: 'analysis' },
                { description: 'Identify root cause', status: 'pending', type: 'analysis' },
                { description: 'Implement fix', status: 'pending', type: 'implementation' },
                { description: 'Verify fix works', status: 'pending', type: 'verification' },
                { description: 'Check for regressions', status: 'pending', type: 'verification' },
            );
        } else if (taskLower.includes('refactor') || taskLower.includes('improve') || taskLower.includes('optimize')) {
            steps.push(
                { description: 'Analyze current code', status: 'pending', type: 'analysis' },
                { description: 'Identify improvements', status: 'pending', type: 'design' },
                { description: 'Implement changes incrementally', status: 'pending', type: 'implementation' },
                { description: 'Run tests after each change', status: 'pending', type: 'verification' },
                { description: 'Verify no regressions', status: 'pending', type: 'verification' },
            );
        } else if (taskLower.includes('search') || taskLower.includes('find') || taskLower.includes('investigate')) {
            steps.push(
                { description: 'Define search criteria', status: 'pending', type: 'analysis' },
                { description: 'Search relevant files', status: 'pending', type: 'implementation' },
                { description: 'Analyze findings', status: 'pending', type: 'analysis' },
                { description: 'Summarize results', status: 'pending', type: 'implementation' },
            );
        } else {
            // Generic plan
            steps.push(
                { description: 'Understand the task', status: 'pending', type: 'analysis' },
                { description: 'Plan approach', status: 'pending', type: 'design' },
                { description: 'Execute plan', status: 'pending', type: 'implementation' },
                { description: 'Verify results', status: 'pending', type: 'verification' },
            );
        }

        return steps.slice(0, this._maxSteps);
    }

    _summarizePlan(plan) {
        const types = {};
        for (const step of plan.steps) {
            types[step.type] = (types[step.type] || 0) + 1;
        }

        return {
            totalSteps: plan.steps.length,
            types,
            estimatedTime: plan.steps.length * 30, // 30 seconds per step estimate
        };
    }
}

module.exports = { PlanMode };
module.exports.default = PlanMode;
