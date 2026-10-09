'use strict';

/**
 * CostOptimizer - Automatically selects the cheapest model for each task.
 * Tracks spending, enforces budgets, recommends cost-saving strategies.
 *
 * Priority: Local (free) → Cheap remote → Expensive remote.
 */
class CostOptimizer {
  constructor(config = {}) {
    this.config = {
      monthlyBudget: config.monthlyBudget || 100, // USD
      dailyBudget: config.dailyBudget || 5, // USD
      alertThreshold: config.alertThreshold || 0.8, // 80%
      preferLocal: config.preferLocal !== false,
      ...config,
    };

    // Model pricing (USD per 1M tokens)
    this.pricing = {
      // Local (free)
      'ollama/*': { input: 0, output: 0 },
      'lmstudio/*': { input: 0, output: 0 },
      'llamacpp/*': { input: 0, output: 0 },
      'gpt4all/*': { input: 0, output: 0 },
      'webllm/*': { input: 0, output: 0 },

      // OpenAI
      'openai/gpt-4o': { input: 2.50, output: 10.00 },
      'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
      'openai/gpt-4.1': { input: 2.00, output: 8.00 },
      'openai/o3': { input: 2.00, output: 8.00 },
      'openai/o4-mini': { input: 1.10, output: 4.40 },

      // xAI
      'xai/grok-3': { input: 3.00, output: 15.00 },
      'xai/grok-3-mini': { input: 0.30, output: 0.50 },

      // DeepSeek (cheapest)
      'deepseek/deepseek-r1': { input: 0.14, output: 0.28 },
      'deepseek/deepseek-v3': { input: 0.14, output: 0.28 },

      // Anthropic
      'anthropic/claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
      'anthropic/claude-haiku-35-20241022': { input: 0.80, output: 4.00 },
    };

    this.spending = {
      total: 0,
      byModel: {},
      byDay: {},
      byMonth: {},
    };

    this.stats = { recommendations: 0, savings: 0 };
  }

  /**
   * Get the cheapest model for a task type.
   */
  getCheapest(taskType = 'chat', availableProviders = []) {
    const candidates = availableProviders.length > 0
      ? availableProviders
      : Object.keys(this.pricing);

    // Sort by cost
    const sorted = candidates
      .map(id => ({
        id,
        pricing: this._getPricing(id),
        totalCost: this._getPricing(id).input + this._getPricing(id).output,
      }))
      .sort((a, b) => a.totalCost - b.totalCost);

    return sorted[0] || null;
  }

  /**
   * Recommend the best model given constraints.
   */
  recommend(options = {}) {
    const {
      taskType = 'chat',
      quality = 'medium', // low, medium, high
      latency = 'normal', // fast, normal, slow
      budget = null,
      requireTools = false,
      requireVision = false,
    } = options;

    const candidates = [];

    for (const [modelId, pricing] of Object.entries(this.pricing)) {
      const isFree = pricing.input === 0 && pricing.output === 0;

      // Skip if over budget
      if (budget !== null && pricing.input > budget) continue;

      // Score the model
      let score = 0;

      // Cost score (lower is better)
      const cost = pricing.input + pricing.output;
      score += Math.max(0, 100 - cost * 10);

      // Quality bonus
      if (quality === 'high') {
        if (modelId.includes('gpt-4o') || modelId.includes('grok-3') || modelId.includes('claude')) score += 30;
        if (modelId.includes('deepseek-r1')) score += 25;
      }

      // Free bonus
      if (isFree) score += 50;

      // Latency bonus for local
      if (latency === 'fast' && isFree) score += 20;

      candidates.push({ id: modelId, score, pricing, isFree });
    }

    candidates.sort((a, b) => b.score - a.score);
    this.stats.recommendations++;

    return candidates[0] || null;
  }

  /**
   * Calculate cost for a request.
   */
  calculateCost(modelId, inputTokens, outputTokens) {
    const pricing = this._getPricing(modelId);
    return {
      inputCost: (inputTokens / 1e6) * pricing.input,
      outputCost: (outputTokens / 1e6) * pricing.output,
      totalCost: (inputTokens / 1e6) * pricing.input + (outputTokens / 1e6) * pricing.output,
    };
  }

  /**
   * Record spending.
   */
  recordSpending(modelId, inputTokens, outputTokens) {
    const cost = this.calculateCost(modelId, inputTokens, outputTokens);
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);

    this.spending.total += cost.totalCost;
    this.spending.byModel[modelId] = (this.spending.byModel[modelId] || 0) + cost.totalCost;
    this.spending.byDay[today] = (this.spending.byDay[today] || 0) + cost.totalCost;
    this.spending.byMonth[month] = (this.spending.byMonth[month] || 0) + cost.totalCost;

    return cost;
  }

  /**
   * Check if we're within budget.
   */
  checkBudget() {
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);

    const dailySpent = this.spending.byDay[today] || 0;
    const monthlySpent = this.spending.byMonth[month] || 0;

    return {
      daily: {
        spent: dailySpent,
        budget: this.config.dailyBudget,
        remaining: this.config.dailyBudget - dailySpent,
        percentUsed: (dailySpent / this.config.dailyBudget * 100).toFixed(1),
        alert: dailySpent / this.config.dailyBudget >= this.config.alertThreshold,
      },
      monthly: {
        spent: monthlySpent,
        budget: this.config.monthlyBudget,
        remaining: this.config.monthlyBudget - monthlySpent,
        percentUsed: (monthlySpent / this.config.monthlyBudget * 100).toFixed(1),
        alert: monthlySpent / this.config.monthlyBudget >= this.config.alertThreshold,
      },
    };
  }

  /**
   * Get savings report (vs using most expensive model).
   */
  getSavingsReport() {
    let actualCost = 0;
    let worstCaseCost = 0;

    for (const [modelId, cost] of Object.entries(this.spending.byModel)) {
      actualCost += cost;
      // Assume worst case = GPT-4o pricing
      worstCaseCost += cost * 5; // Rough estimate
    }

    return {
      actualCost: actualCost.toFixed(4),
      estimatedWorstCase: worstCaseCost.toFixed(4),
      saved: (worstCaseCost - actualCost).toFixed(4),
      savedPercent: worstCaseCost > 0
        ? ((1 - actualCost / worstCaseCost) * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  _getPricing(modelId) {
    // Check exact match first
    if (this.pricing[modelId]) return this.pricing[modelId];

    // Check wildcard pattern
    const provider = modelId.split('/')[0];
    const wildcardKey = `${provider}/*`;
    if (this.pricing[wildcardKey]) return this.pricing[wildcardKey];

    // Default to expensive
    return { input: 10, output: 30 };
  }

  /**
   * Get cost comparison across providers.
   */
  compareCosts(inputTokens = 1000, outputTokens = 500) {
    const comparison = [];

    for (const [modelId, pricing] of Object.entries(this.pricing)) {
      if (modelId.includes('/*')) continue; // Skip wildcards
      const cost = this.calculateCost(modelId, inputTokens, outputTokens);
      comparison.push({
        model: modelId,
        inputCost: cost.inputCost.toFixed(6),
        outputCost: cost.outputCost.toFixed(6),
        totalCost: cost.totalCost.toFixed(6),
        isFree: pricing.input === 0 && pricing.output === 0,
      });
    }

    comparison.sort((a, b) => parseFloat(a.totalCost) - parseFloat(b.totalCost));
    return comparison;
  }

  getStats() {
    return {
      ...this.stats,
      spending: {
        total: this.spending.total.toFixed(4),
        byModel: this.spending.byModel,
      },
      budget: this.checkBudget(),
      savings: this.getSavingsReport(),
    };
  }
}

module.exports = { CostOptimizer };
