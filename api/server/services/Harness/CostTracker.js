/**
 * CostTracker — Tracks token usage and estimated costs.
 *
 * Features:
 *   - Per-request token tracking (prompt + completion)
 *   - Cost estimation per provider/model
 *   - Cumulative cost tracking per session/run
 *   - Budget limits with alerts
 *   - Cost comparison across providers
 *   - Export for billing dashboards
 *
 * Cost data from PROVIDER_COSTS (USD per 1M tokens).
 */

const logger = {
  info: (...args) => console.info('[CostTracker]', ...args),
  warn: (...args) => console.warn('[CostTracker]', ...args),
};

/**
 * Cost rates (USD per 1M tokens) — kept in sync with ProviderOrchestrator.
 */
const COST_RATES = {
  openai: {
    'o3': { input: 10, output: 30 },
    'gpt-4o': { input: 5, output: 15 },
    'gpt-4o-mini': { input: 0.5, output: 2 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'o3': { input: 10, output: 40 },
    'o3-mini': { input: 1.1, output: 4.4 },
    'o4-mini': { input: 1.1, output: 4.4 },
    default: { input: 2, output: 8 },
  },
  xai: {
    'grok-4-0709': { input: 3, output: 15 },
    'grok-4-0709-fast': { input: 0.6, output: 4 },
    'grok-4.5': { input: 2, output: 6 },
    'grok-3': { input: 3, output: 15 },
    'grok-3-mini': { input: 0.3, output: 0.5 },
    default: { input: 2, output: 10 },
  },
  'mi-opencode': { default: { input: 0, output: 0 } },
};

/**
 * CostTracker — tracks costs.
 */
class CostTracker {
  constructor(config = {}) {
    this.config = {
      budgetLimitUSD: config.budgetLimitUSD || null, // null = unlimited
      alertThreshold: config.alertThreshold || 0.8, // Alert at 80% of budget
      ...config,
    };

    this._requests = [];
    this._totals = { promptTokens: 0, completionTokens: 0, totalCostUSD: 0 };
    this._byProvider = {};
    this._byModel = {};
    this._alerts = [];
  }

  /**
   * Record a request's token usage and cost.
   *
   * @param {object} usage
   * @param {string} usage.provider
   * @param {string} usage.model
   * @param {number} usage.promptTokens
   * @param {number} usage.completionTokens
   * @param {number} [usage.latency] - Request latency in ms
   */
  record(usage) {
    const { provider, model, promptTokens = 0, completionTokens = 0, latency = 0 } = usage;

    const cost = this._calculateCost(provider, model, promptTokens, completionTokens);

    const entry = {
      timestamp: new Date().toISOString(),
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUSD: cost,
      latency,
    };

    this._requests.push(entry);
    if (this._requests.length > 10000) {
      this._requests = this._requests.slice(-5000);
    }

    // Update totals
    this._totals.promptTokens += promptTokens;
    this._totals.completionTokens += completionTokens;
    this._totals.totalCostUSD += cost;

    // Update by provider
    if (!this._byProvider[provider]) {
      this._byProvider[provider] = { promptTokens: 0, completionTokens: 0, costUSD: 0, requests: 0 };
    }
    this._byProvider[provider].promptTokens += promptTokens;
    this._byProvider[provider].completionTokens += completionTokens;
    this._byProvider[provider].costUSD += cost;
    this._byProvider[provider].requests++;

    // Update by model
    const modelKey = `${provider}/${model}`;
    if (!this._byModel[modelKey]) {
      this._byModel[modelKey] = { promptTokens: 0, completionTokens: 0, costUSD: 0, requests: 0 };
    }
    this._byModel[modelKey].promptTokens += promptTokens;
    this._byModel[modelKey].completionTokens += completionTokens;
    this._byModel[modelKey].costUSD += cost;
    this._byModel[modelKey].requests++;

    // Budget check
    if (this.config.budgetLimitUSD) {
      this._checkBudget();
    }

    return entry;
  }

  /**
   * Calculate cost for a request.
   */
  _calculateCost(provider, model, promptTokens, completionTokens) {
    const rates = COST_RATES[provider]?.[model] || COST_RATES[provider]?.default || { input: 5, output: 15 };
    return (rates.input * promptTokens + rates.output * completionTokens) / 1000000;
  }

  /**
   * Check budget and generate alerts.
   */
  _checkBudget() {
    const budget = this.config.budgetLimitUSD;
    const spent = this._totals.totalCostUSD;
    const ratio = spent / budget;

    if (ratio >= 1.0 && !this._alerts.some(a => a.type === 'budget_exceeded')) {
      const alert = { type: 'budget_exceeded', timestamp: new Date().toISOString(), spent, budget };
      this._alerts.push(alert);
      logger.warn(`[CostTracker] BUDGET EXCEEDED: $${spent.toFixed(4)} / $${budget}`);
    } else if (ratio >= this.config.alertThreshold && !this._alerts.some(a => a.type === 'budget_warning')) {
      const alert = { type: 'budget_warning', timestamp: new Date().toISOString(), spent, budget, percent: Math.round(ratio * 100) };
      this._alerts.push(alert);
      logger.warn(`[CostTracker] Budget warning: ${Math.round(ratio * 100)}% used ($${spent.toFixed(4)} / $${budget})`);
    }
  }

  // ============================================================
  // QUERIES
  // ============================================================

  /**
   * Get total usage summary.
   */
  getTotals() {
    return { ...this._totals };
  }

  /**
   * Get usage by provider.
   */
  getByProvider() {
    return { ...this._byProvider };
  }

  /**
   * Get usage by model.
   */
  getByModel() {
    return { ...this._byModel };
  }

  /**
   * Get recent requests.
   */
  getRecentRequests(limit = 20) {
    return this._requests.slice(-limit);
  }

  /**
   * Get alerts.
   */
  getAlerts(limit = 20) {
    return this._alerts.slice(-limit);
  }

  /**
   * Get cost comparison between providers.
   */
  getCostComparison() {
    const comparison = {};
    for (const [provider, data] of Object.entries(this._byProvider)) {
      comparison[provider] = {
        totalCost: data.costUSD,
        avgCostPerRequest: data.requests > 0 ? data.costUSD / data.requests : 0,
        totalTokens: data.promptTokens + data.completionTokens,
        requests: data.requests,
      };
    }
    return comparison;
  }

  /**
   * Export for billing/dashboard.
   */
  export() {
    return {
      totals: this.getTotals(),
      byProvider: this.getByProvider(),
      byModel: this.getByModel(),
      costComparison: this.getCostComparison(),
      alerts: this.getAlerts(),
      requestCount: this._requests.length,
    };
  }
}

module.exports = { CostTracker, COST_RATES };
