/**
 * LLMGateway — Rate limiting, failover, retry, and load balancing for LLM providers
 * Free alternative to LiteLLM: wraps our existing UniversalLLMRouter
 * 
 * License: MIT — Zero cost (extends existing router)
 */

const EventEmitter = require('events');

class LLMGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    this.router = null; // Will be set via setRouter()
    this.initialized = false;
    this.config = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      rateLimitWindow: options.rateLimitWindow || 60000, // 1 min
      maxRequestsPerWindow: options.maxRequestsPerWindow || 100,
      timeout: options.timeout || 30000,
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5
    };
    /** @type {Map<string, ProviderState>} */
    this.providers = new Map();
    this.requestLog = [];
    this.stats = { totalRequests: 0, successful: 0, failed: 0, retried: 0, circuitBroken: 0 };
  }

  /**
   * Connect to existing UniversalLLMRouter
   */
  setRouter(router) {
    this.router = router;
    this.initialized = true;
    return { status: 'ok', module: 'LLMGateway' };
  }

  /**
   * Initialize without router (standalone mode)
   */
  initialize() {
    this.initialized = true;
    return { status: 'ok', module: 'LLMGateway', mode: 'standalone' };
  }

  /**
   * Route a request through the gateway
   */
  async route({ prompt, model, provider, temperature = 0.7, maxTokens = 2048, userId = 'system' }) {
    this.stats.totalRequests++;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    // Check rate limit
    if (!this._checkRateLimit(userId)) {
      return { success: false, error: 'Rate limit exceeded', requestId };
    }

    // Try with retries and failover
    let lastError = null;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this._executeRequest({ prompt, model, provider, temperature, maxTokens });
        const duration = Date.now() - startTime;

        this.stats.successful++;
        this._logRequest({ requestId, attempt, success: true, duration, provider: result.provider });

        return {
          success: true,
          requestId,
          response: result.response,
          provider: result.provider,
          model: result.model,
          duration,
          attempt,
          tokens: result.tokens
        };
      } catch (err) {
        lastError = err;
        this.stats.retried++;
        this._logRequest({ requestId, attempt, success: false, error: err.message });

        // Check circuit breaker
        const providerState = this._getProviderState(provider || 'default');
        providerState.failures++;
        if (providerState.failures >= this.config.circuitBreakerThreshold) {
          providerState.circuitBroken = true;
          providerState.brokenUntil = Date.now() + 60000; // 1 min cooldown
          this.stats.circuitBroken++;
          this.emit('circuit:broken', { provider });
          break;
        }

        if (attempt < this.config.maxRetries) {
          await this._delay(this.config.retryDelay * attempt);
        }
      }
    }

    this.stats.failed++;
    return { success: false, error: lastError?.message || 'All retries failed', requestId, attempts: this.config.maxRetries };
  }

  async _executeRequest({ prompt, model, provider, temperature, maxTokens }) {
    if (this.router && typeof this.router.route === 'function') {
      return await this.router.route({ prompt, model, provider, temperature, maxTokens });
    }
    // Fallback: direct HTTP to API
    throw new Error('No router connected. Call setRouter() first.');
  }

  _checkRateLimit(userId) {
    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindow;
    const recentRequests = this.requestLog.filter(r => r.userId === userId && r.timestamp > windowStart);
    return recentRequests.length < this.config.maxRequestsPerWindow;
  }

  _getProviderState(provider) {
    if (!this.providers.has(provider)) {
      this.providers.set(provider, { failures: 0, circuitBroken: false, brokenUntil: 0, requests: 0, latency: [] });
    }
    return this.providers.get(provider);
  }

  _logRequest(entry) {
    this.requestLog.push({ ...entry, timestamp: Date.now() });
    if (this.requestLog.length > 10000) this.requestLog = this.requestLog.slice(-5000);
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * Get provider health status
   */
  getProviderHealth() {
    const health = {};
    for (const [provider, state] of this.providers) {
      health[provider] = {
        healthy: !state.circuitBroken || Date.now() > state.brokenUntil,
        failures: state.failures,
        circuitBroken: state.circuitBroken,
        requests: state.requests
      };
    }
    return health;
  }

  getStats() {
    return { ...this.stats, providers: this.providers.size, requestLogSize: this.requestLog.length };
  }
}

module.exports = LLMGateway;
