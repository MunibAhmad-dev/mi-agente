/**
 * ProviderOrchestrator — Advanced multi-provider routing and failover.
 *
 * Features:
 *   - Configurable fallback chains (GPT → Grok → Local)
 *   - Provider health monitoring with circuit breaker
 *   - Cost-aware routing (prefer cheaper providers)
 *   - Latency-aware routing (prefer faster providers)
 *   - Load balancing across healthy providers
 *   - Provider-specific capability matching (vision, tools, reasoning)
 *   - Automatic recovery when providers come back online
 *   - Usage tracking and cost estimation
 *
 * Integration:
 *   ProviderOrchestrator sits ABOVE the individual providers.
 *   It decides WHICH provider to use, then delegates to DSHModelPlugin.
 */

const logger = {
  info: (...args) => console.info('[ProviderOrchestrator]', ...args),
  warn: (...args) => console.warn('[ProviderOrchestrator]', ...args),
  error: (...args) => console.error('[ProviderOrchestrator]', ...args),
};

/**
 * Provider health states.
 */
const HealthState = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  CIRCUIT_OPEN: 'circuit_open', // Too many failures — stop trying
};

/**
 * Provider cost tiers (per 1M tokens, approximate).
 */
const PROVIDER_COSTS = {
  openai: {
    'o3': { input: 10, output: 30 },
    'gpt-4o': { input: 5, output: 15 },
    'gpt-4o-mini': { input: 0.5, output: 2 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'o3': { input: 10, output: 40 },
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
 * Provider capabilities.
 */
const PROVIDER_CAPABILITIES = {
  openai: {
    tools: true,
    vision: true,
    streaming: true,
    reasoning: true,
    maxContext: 1050000,
    models: ['o3', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'],
  },
  xai: {
    tools: true,
    vision: true,
    streaming: true,
    reasoning: true,
    webSearch: true,
    maxContext: 500000,
    models: ['grok-4-0709', 'grok-4-0709-fast', 'grok-4.5', 'grok-3', 'grok-3-mini'],
  },
  'mi-opencode': {
    tools: true,
    vision: false,
    streaming: true,
    reasoning: false,
    maxContext: 128000,
    models: [],
  },
};

/**
 * Provider health entry.
 */
class ProviderHealth {
  constructor(providerId) {
    this.providerId = providerId;
    this.state = HealthState.HEALTHY;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.consecutiveFailures = 0;
    this.lastSuccess = null;
    this.lastFailure = null;
    this.avgLatency = 0;
    this.latencies = [];
    this.circuitOpenedAt = null;
    this.circuitRetryAfter = 30000; // 30s before retry
  }

  recordSuccess(latency) {
    this.totalRequests++;
    this.successfulRequests++;
    this.consecutiveFailures = 0;
    this.lastSuccess = Date.now();
    this.latencies.push(latency);
    if (this.latencies.length > 50) this.latencies.shift();
    this.avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;

    // Recover from circuit open
    if (this.state === HealthState.CIRCUIT_OPEN) {
      this.state = HealthState.HEALTHY;
      this.circuitOpenedAt = null;
      logger.info(`[ProviderOrchestrator] ${this.providerId} recovered → HEALTHY`);
    } else if (this.state === HealthState.UNHEALTHY) {
      this.state = HealthState.HEALTHY;
    }
  }

  recordFailure() {
    this.totalRequests++;
    this.failedRequests++;
    this.consecutiveFailures++;
    this.lastFailure = Date.now();

    // State transitions
    if (this.consecutiveFailures >= 5) {
      this.state = HealthState.CIRCUIT_OPEN;
      this.circuitOpenedAt = Date.now();
      logger.warn(`[ProviderOrchestrator] ${this.providerId} → CIRCUIT_OPEN (${this.consecutiveFailures} failures)`);
    } else if (this.consecutiveFailures >= 3) {
      this.state = HealthState.UNHEALTHY;
    } else if (this.consecutiveFailures >= 1) {
      this.state = HealthState.DEGRADED;
    }
  }

  /**
   * Check if circuit should be closed (retry allowed).
   */
  canRetry() {
    if (this.state !== HealthState.CIRCUIT_OPEN) return true;
    if (!this.circuitOpenedAt) return true;
    return Date.now() - this.circuitOpenedAt > this.circuitRetryAfter;
  }

  /**
   * Get success rate.
   */
  getSuccessRate() {
    if (this.totalRequests === 0) return 1.0;
    return this.successfulRequests / this.totalRequests;
  }

  toJSON() {
    return {
      providerId: this.providerId,
      state: this.state,
      totalRequests: this.totalRequests,
      successRate: Math.round(this.getSuccessRate() * 100) + '%',
      avgLatency: Math.round(this.avgLatency) + 'ms',
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

/**
 * ProviderOrchestrator — routes requests across providers.
 */
class ProviderOrchestrator {
  constructor(config = {}) {
    this.config = {
      defaultProvider: config.defaultProvider || process.env.LLM_DEFAULT_PROVIDER || 'openai',
      fallbackChain: config.fallbackChain || (process.env.LLM_FALLBACK_CHAIN || 'openai,xai').split(',').filter(Boolean),
      routingStrategy: config.routingStrategy || 'fallback', // fallback | cost | latency | round-robin
      costPriority: config.costPriority || 'balanced', // cheapest | balanced | quality
      healthCheckInterval: config.healthCheckInterval || 60000, // 1 minute
      ...config,
    };

    // Provider health tracking
    this._health = new Map();
    for (const provider of ['openai', 'xai', 'mi-opencode']) {
      this._health.set(provider, new ProviderHealth(provider));
    }

    // Round-robin state
    this._roundRobinIndex = 0;

    // Stats
    this._stats = {
      totalRouted: 0,
      byProvider: {},
      fallbacks: 0,
      costSavings: 0,
    };

    // Model plugin reference (set via setModelPlugin)
    this._modelPlugin = null;

    logger.info(
      `[ProviderOrchestrator] Strategy: ${this.config.routingStrategy}, ` +
      `Chain: ${this.config.fallbackChain.join(' → ')}`,
    );
  }

  /**
   * Set the model plugin for actual LLM calls.
   */
  setModelPlugin(plugin) {
    this._modelPlugin = plugin;
  }

  // ============================================================
  // MAIN ROUTING
  // ============================================================

  /**
   * Route a completion request through the orchestrator.
   *
   * @param {object} params - Request parameters (messages, model, tools, etc.)
   * @returns {Promise<{result: object, provider: string, model: string}>}
   */
  async route(params) {
    const startTime = Date.now();
    const requiredCapabilities = this._detectRequiredCapabilities(params);

    // Get ordered list of providers to try
    const candidates = this._getProviderCandidates(params, requiredCapabilities);

    let lastError;
    for (const candidate of candidates) {
      const { provider, model } = candidate;

      try {
        logger.debug(`[ProviderOrchestrator] Trying: ${provider}/${model}`);

        const result = await this._callProvider(provider, model, params);
        const latency = Date.now() - startTime;

        // Record success
        this._health.get(provider)?.recordSuccess(latency);
        this._stats.totalRouted++;
        this._stats.byProvider[provider] = (this._stats.byProvider[provider] || 0) + 1;

        return { result, provider, model, latency };
      } catch (error) {
        lastError = error;
        this._health.get(provider)?.recordFailure();
        this._stats.fallbacks++;

        logger.warn(
          `[ProviderOrchestrator] ${provider}/${model} failed: ${error.message}`,
        );
      }
    }

    // All providers failed
    throw new Error(
      `All providers failed. Last error: ${lastError?.message}`,
    );
  }

  /**
   * Route a streaming request.
   */
  async *routeStream(params) {
    const requiredCapabilities = this._detectRequiredCapabilities(params);
    const candidates = this._getProviderCandidates(params, requiredCapabilities);

    for (const candidate of candidates) {
      try {
        const stream = this._modelPlugin?.stream?.({
          ...params,
          provider: candidate.provider,
          model: candidate.model,
        });
        if (stream) {
          yield* stream;
          return;
        }
      } catch (error) {
        logger.warn(`[ProviderOrchestrator] Stream ${candidate.provider} failed: ${error.message}`);
        this._health.get(candidate.provider)?.recordFailure();
      }
    }

    throw new Error('All providers failed for streaming');
  }

  // ============================================================
  // PROVIDER SELECTION
  // ============================================================

  /**
   * Get ordered list of provider candidates based on strategy.
   */
  _getProviderCandidates(params, requiredCapabilities) {
    const requestedProvider = params.provider;
    const requestedModel = params.model;

    // If explicit provider requested, try that first
    if (requestedProvider) {
      const candidates = [{ provider: requestedProvider, model: requestedModel || this._defaultModelFor(requestedProvider) }];
      // Add fallbacks after
      for (const fb of this.config.fallbackChain) {
        if (fb !== requestedProvider) {
          candidates.push({ provider: fb, model: this._defaultModelFor(fb) });
        }
      }
      return candidates.filter(c => this._isAvailable(c.provider));
    }

    // Strategy-based routing
    switch (this.config.routingStrategy) {
      case 'cost':
        return this._costBasedCandidates(requiredCapabilities);
      case 'latency':
        return this._latencyBasedCandidates(requiredCapabilities);
      case 'round-robin':
        return this._roundRobinCandidates(requiredCapabilities);
      case 'fallback':
      default:
        return this._fallbackCandidates(requiredCapabilities);
    }
  }

  /**
   * Fallback strategy: try configured chain in order.
   */
  _fallbackCandidates(capabilities) {
    const candidates = [];
    for (const provider of this.config.fallbackChain) {
      if (!this._isAvailable(provider)) continue;
      if (!this._hasCapabilities(provider, capabilities)) continue;
      candidates.push({
        provider,
        model: this._bestModelFor(provider, capabilities),
      });
    }
    return candidates;
  }

  /**
   * Cost strategy: prefer cheapest provider.
   */
  _costBasedCandidates(capabilities) {
    const allCandidates = [];
    for (const provider of this.config.fallbackChain) {
      if (!this._isAvailable(provider)) continue;
      if (!this._hasCapabilities(provider, capabilities)) continue;

      const model = this._cheapestModelFor(provider, capabilities);
      const cost = this._estimateCost(provider, model);
      allCandidates.push({ provider, model, cost });
    }

    // Sort by cost (cheapest first)
    allCandidates.sort((a, b) => a.cost - b.cost);
    return allCandidates.map(c => ({ provider: c.provider, model: c.model }));
  }

  /**
   * Latency strategy: prefer fastest provider.
   */
  _latencyBasedCandidates(capabilities) {
    const allCandidates = [];
    for (const provider of this.config.fallbackChain) {
      if (!this._isAvailable(provider)) continue;
      if (!this._hasCapabilities(provider, capabilities)) continue;

      const health = this._health.get(provider);
      const latency = health?.avgLatency || 5000;
      allCandidates.push({
        provider,
        model: this._bestModelFor(provider, capabilities),
        latency,
      });
    }

    allCandidates.sort((a, b) => a.latency - b.latency);
    return allCandidates.map(c => ({ provider: c.provider, model: c.model }));
  }

  /**
   * Round-robin strategy: distribute evenly.
   */
  _roundRobinCandidates(capabilities) {
    const available = this.config.fallbackChain.filter(p =>
      this._isAvailable(p) && this._hasCapabilities(p, capabilities),
    );

    if (available.length === 0) return [];

    const startIdx = this._roundRobinIndex % available.length;
    const ordered = [
      ...available.slice(startIdx),
      ...available.slice(0, startIdx),
    ];
    this._roundRobinIndex = (this._roundRobinIndex + 1) % available.length;

    return ordered.map(p => ({
      provider: p,
      model: this._bestModelFor(p, capabilities),
    }));
  }

  // ============================================================
  // HELPERS
  // ============================================================

  _isAvailable(providerId) {
    const health = this._health.get(providerId);
    if (!health) return true; // Unknown provider — try it
    if (health.state === HealthState.CIRCUIT_OPEN) return health.canRetry();
    return true;
  }

  _hasCapabilities(providerId, required) {
    const caps = PROVIDER_CAPABILITIES[providerId];
    if (!caps) return true; // Unknown provider — assume it has capabilities
    return required.every(cap => caps[cap] !== false);
  }

  _defaultModelFor(providerId) {
    const defaults = { openai: 'gpt-4o-mini', xai: 'grok-3-mini', 'mi-opencode': 'default' };
    return defaults[providerId] || 'default';
  }

  _bestModelFor(providerId, capabilities) {
    if (capabilities.includes('reasoning')) {
      const reasoningModels = { openai: 'o3', xai: 'grok-4-0709' };
      return reasoningModels[providerId] || this._defaultModelFor(providerId);
    }
    return this._defaultModelFor(providerId);
  }

  _cheapestModelFor(providerId, capabilities) {
    const cheap = { openai: 'gpt-4o-mini', xai: 'grok-3-mini' };
    return cheap[providerId] || this._defaultModelFor(providerId);
  }

  _estimateCost(providerId, model) {
    const costs = PROVIDER_COSTS[providerId]?.[model] || PROVIDER_COSTS[providerId]?.default || { input: 5, output: 15 };
    // Estimate for ~2000 input + ~1000 output tokens
    return (costs.input * 2 + costs.output * 1) / 1000;
  }

  _detectRequiredCapabilities(params) {
    const caps = [];
    if (params.tools && params.tools.length > 0) caps.push('tools');
    if (params.messages?.some(m => m.content?.type === 'image_url')) caps.push('vision');
    if (params.reasoning_effort) caps.push('reasoning');
    return caps;
  }

  async _callProvider(provider, model, params) {
    if (!this._modelPlugin) {
      throw new Error('Model plugin not set');
    }
    return this._modelPlugin.complete({
      ...params,
      provider,
      model,
    });
  }

  // ============================================================
  // HEALTH & STATUS
  // ============================================================

  /**
   * Get health status of all providers.
   */
  getHealthStatus() {
    const status = {};
    for (const [id, health] of this._health) {
      status[id] = health.toJSON();
    }
    return status;
  }

  /**
   * Get the best available provider for a set of capabilities.
   */
  getBestProvider(capabilities = []) {
    const candidates = this._getProviderCandidates({}, capabilities);
    return candidates[0] || null;
  }

  /**
   * Get cost estimate for a request.
   */
  getCostEstimate(providerId, model, inputTokens = 2000, outputTokens = 1000) {
    const costs = PROVIDER_COSTS[providerId]?.[model] || PROVIDER_COSTS[providerId]?.default || { input: 5, output: 15 };
    return {
      provider: providerId,
      model,
      estimatedCost: (costs.input * inputTokens + costs.output * outputTokens) / 1000000,
      inputCost: (costs.input * inputTokens) / 1000000,
      outputCost: (costs.output * outputTokens) / 1000000,
      currency: 'USD',
    };
  }

  /**
   * Get orchestrator stats.
   */
  getStats() {
    return {
      ...this._stats,
      health: Object.fromEntries(
        Array.from(this._health.entries()).map(([id, h]) => [id, h.toJSON()]),
      ),
    };
  }

  /**
   * Force reset a provider's health (e.g., after manual fix).
   */
  resetProviderHealth(providerId) {
    const health = this._health.get(providerId);
    if (health) {
      health.state = HealthState.HEALTHY;
      health.consecutiveFailures = 0;
      health.circuitOpenedAt = null;
      logger.info(`[ProviderOrchestrator] Reset health for ${providerId}`);
    }
  }
}

module.exports = { ProviderOrchestrator, HealthState, PROVIDER_COSTS, PROVIDER_CAPABILITIES, ProviderHealth };
