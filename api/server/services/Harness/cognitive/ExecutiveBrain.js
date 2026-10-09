'use strict';

/**
 * ExecutiveBrain - Planning, routing, cognitive budget management.
 *
 * Decides:
 * - Which memory layer to use for retrieval
 * - Which retrieval strategy (vector/BM25/graph/hybrid)
 * - Which model to use
 * - Which tools to use
 * - Risk assessment
 * - Cognitive budget allocation
 */
class ExecutiveBrain {
  constructor(config = {}) {
    this.config = config;
    this.budget = {
      maxTokensPerTurn: config.maxTokens || 16384,
      maxToolCalls: config.maxToolCalls || 20,
      maxRetrievals: config.maxRetrievals || 10,
      maxMemoryOps: config.maxMemoryOps || 50,
      usedTokens: 0,
      usedToolCalls: 0,
      usedRetrievals: 0,
      usedMemoryOps: 0,
    };
    this.plans = [];
    this.riskThreshold = config.riskThreshold || 0.7;
  }

  /**
   * Create a plan for a task.
   */
  async plan(task, context = {}) {
    const analysis = this._analyzeTask(task);
    const plan = {
      id: `plan_${Date.now()}`,
      task,
      steps: analysis.steps,
      estimatedCost: analysis.estimatedCost,
      risk: analysis.risk,
      memoryStrategy: this._selectMemoryStrategy(analysis),
      retrievalStrategy: this._selectRetrievalStrategy(analysis),
      modelStrategy: this._selectModelStrategy(analysis),
      tools: analysis.tools,
      createdAt: Date.now(),
    };
    this.plans.push(plan);
    return plan;
  }

  /**
   * Check if we have budget for an operation.
   */
  canAfford(operation, amount = 1) {
    switch (operation) {
      case 'token': return this.budget.usedTokens + amount <= this.budget.maxTokensPerTurn;
      case 'tool': return this.budget.usedToolCalls + amount <= this.budget.maxToolCalls;
      case 'retrieval': return this.budget.usedRetrievals + amount <= this.budget.maxRetrievals;
      case 'memory': return this.budget.usedMemoryOps + amount <= this.budget.maxMemoryOps;
      default: return true;
    }
  }

  /**
   * Record usage of a resource.
   */
  useBudget(operation, amount = 1) {
    switch (operation) {
      case 'token': this.budget.usedTokens += amount; break;
      case 'tool': this.budget.usedToolCalls += amount; break;
      case 'retrieval': this.budget.usedRetrievals += amount; break;
      case 'memory': this.budget.usedMemoryOps += amount; break;
    }
  }

  /**
   * Reset budget for a new turn.
   */
  resetBudget() {
    this.budget.usedTokens = 0;
    this.budget.usedToolCalls = 0;
    this.budget.usedRetrievals = 0;
    this.budget.usedMemoryOps = 0;
  }

  /**
   * Assess risk of an action.
   */
  assessRisk(action) {
    let risk = 0;
    const factors = [];

    if (action.type === 'write' || action.type === 'delete') { risk += 0.3; factors.push('destructive'); }
    if (action.type === 'external') { risk += 0.2; factors.push('external'); }
    if (action.type === 'financial') { risk += 0.4; factors.push('financial'); }
    if (action.type === 'personal_data') { risk += 0.3; factors.push('personal-data'); }
    if (action.uncertain) { risk += 0.2; factors.push('uncertain'); }

    return { risk: Math.min(risk, 1), factors, needsApproval: risk >= this.riskThreshold };
  }

  _analyzeTask(task) {
    const lower = (task || '').toLowerCase();
    const steps = [];
    const tools = [];
    let estimatedCost = 1;
    let risk = 0.1;

    // Determine required steps
    if (lower.includes('search') || lower.includes('find') || lower.includes('buscar')) {
      steps.push({ action: 'retrieve', priority: 'high' });
      tools.push('web_search');
    }
    if (lower.includes('remember') || lower.includes('recall') || lower.includes('recordar')) {
      steps.push({ action: 'memory', priority: 'high' });
    }
    if (lower.includes('learn') || lower.includes('analyze') || lower.includes('aprender')) {
      steps.push({ action: 'learn', priority: 'medium' });
      estimatedCost += 2;
    }
    if (lower.includes('create') || lower.includes('generate') || lower.includes('crear')) {
      steps.push({ action: 'generate', priority: 'high' });
      tools.push('write_file');
      estimatedCost += 3;
    }
    if (lower.includes('code') || lower.includes('program') || lower.includes('código')) {
      steps.push({ action: 'code', priority: 'high' });
      tools.push('run_command');
      risk += 0.2;
    }

    if (steps.length === 0) {
      steps.push({ action: 'chat', priority: 'low' });
    }

    return { steps, tools, estimatedCost, risk };
  }

  _selectMemoryStrategy(analysis) {
    if (analysis.steps.some(s => s.action === 'memory')) return 'deep';
    if (analysis.steps.some(s => s.action === 'learn')) return 'episodic';
    return 'quick';
  }

  _selectRetrievalStrategy(analysis) {
    if (analysis.risk > 0.5) return 'conservative';
    if (analysis.steps.some(s => s.action === 'learn')) return 'thorough';
    return 'balanced';
  }

  _selectModelStrategy(analysis) {
    if (analysis.estimatedCost > 5) return 'powerful';
    if (analysis.risk > 0.5) return 'careful';
    return 'fast';
  }

  getStats() {
    return {
      plans: this.plans.length,
      budget: { ...this.budget },
      riskThreshold: this.riskThreshold,
    };
  }
}

module.exports = { ExecutiveBrain };
