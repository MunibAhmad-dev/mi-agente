'use strict';

/**
 * TokenBudgetManager - Allocates token budgets dynamically across
 * context categories based on model, task type, and priority.
 */
class TokenBudgetManager {
  constructor(config = {}) {
    this.config = {
      totalBudget: config.totalBudget || 16000,
      reserve: config.reserve || 500,
      ...config,
    };

    // Default allocation percentages
    this.allocations = {
      system: 0.08,    // 8%
      task: 0.08,      // 8%
      memory: 0.12,    // 12%
      tools: 0.12,     // 12%
      rag: 0.30,       // 30%
      history: 0.15,   // 15%
      safety: 0.08,    // 8%
      reserve: 0.07,   // 7%
    };

    this.stats = { allocations: 0, overflows: 0 };
  }

  /**
   * Get model-specific context window.
   */
  getModelBudget(model) {
    const budgets = {
      'openai/gpt-4o-mini': 128000,
      'openai/gpt-4o-mini': 128000,
      'openai/gpt-4o': 128000,
      'xai/grok-4.6': 131072,
      'xai/grok-3-mini': 131072,
      'deepseek/deepseek-r1': 131072,
      'deepseek/deepseek-v3': 131072,
      'qwen/qwen-2.5-72b': 131072,
      'local/default': 32768,
    };
    return budgets[model] || this.config.totalBudget;
  }

  /**
   * Adjust allocations based on task type.
   */
  adjustForTask(taskType) {
    const adjusted = { ...this.allocations };

    switch (taskType) {
      case 'coding':
        adjusted.tools = 0.18;
        adjusted.rag = 0.25;
        adjusted.history = 0.12;
        break;
      case 'debugging':
        adjusted.history = 0.20;
        adjusted.tools = 0.15;
        adjusted.memory = 0.15;
        break;
      case 'research':
        adjusted.rag = 0.40;
        adjusted.memory = 0.15;
        adjusted.history = 0.08;
        break;
      case 'chat':
        adjusted.history = 0.25;
        adjusted.rag = 0.15;
        adjusted.memory = 0.10;
        break;
      case 'planning':
        adjusted.memory = 0.20;
        adjusted.rag = 0.25;
        adjusted.history = 0.10;
        break;
    }

    return adjusted;
  }

  /**
   * Calculate token budget for each category.
   */
  allocate(model, taskType, customBudget) {
    const totalBudget = customBudget || this.getBudgetForModel(model);
    const allocations = this.adjustForTask(taskType);

    const result = {};
    let used = 0;

    for (const [category, percentage] of Object.entries(allocations)) {
      const tokens = Math.floor(totalBudget * percentage);
      result[category] = tokens;
      used += tokens;
    }

    this.stats.allocations++;

    return {
      total: totalBudget,
      categories: result,
      used,
      available: totalBudget - used,
      reserve: result.reserve,
    };
  }

  /**
   * Get the actual budget for a model (with safety margin).
   */
  getBudgetForModel(model) {
    const contextWindow = this.getModelBudget(model);
    // Use 80% of context window to leave room for output
    return Math.floor(contextWindow * 0.8);
  }

  /**
   * Reallocate budget from one category to another.
   */
  reallocate(budget, from, to, tokens) {
    if (budget.categories[from] < tokens) {
      this.stats.overflows++;
      return budget;
    }

    budget.categories[from] -= tokens;
    budget.categories[to] = (budget.categories[to] || 0) + tokens;
    budget.available -= tokens;

    return budget;
  }

  /**
   * Check if a category is within budget.
   */
  checkBudget(budget, category, usedTokens) {
    const allowed = budget.categories[category] || 0;
    return {
      within: usedTokens <= allowed,
      used: usedTokens,
      allowed,
      overflow: Math.max(0, usedTokens - allowed),
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { TokenBudgetManager };
