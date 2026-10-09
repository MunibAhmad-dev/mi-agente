/**
 * BaseConnector — Abstract base class for all service connectors.
 *
 * Every connector must implement:
 *   - getId()         → unique connector identifier
 *   - getName()       → human-readable name
 *   - getActions()    → list of available actions
 *   - execute(action, params) → execute an action
 *   - healthCheck()   → verify connectivity
 *
 * Base class provides:
 *   - Auth token management
 *   - Rate limiting
 *   - Retry with backoff
 *   - Structured logging
 *   - Audit trail
 */

const logger = {
  info: (...args) => console.info('[Connector]', ...args),
  warn: (...args) => console.warn('[Connector]', ...args),
  error: (...args) => console.error('[Connector]', ...args),
};

class BaseConnector {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      timeout: config.timeout || 30000,
      rateLimitPerMinute: config.rateLimitPerMinute || 60,
      ...config,
    };

    this._token = null;
    this._tokenExpiresAt = null;
    this._requestCount = 0;
    this._windowStart = Date.now();
    this._auditLog = [];
  }

  /** Unique identifier. */
  getId() { throw new Error('getId() not implemented'); }

  /** Human-readable name. */
  getName() { throw new Error('getName() not implemented'); }

  /** List of available actions. */
  getActions() { throw new Error('getActions() not implemented'); }

  /** Execute an action. */
  async execute(action, params) { throw new Error('execute() not implemented'); }

  /** Health check. */
  async healthCheck() { return { healthy: true, connector: this.getId() }; }

  /**
   * Set auth token.
   */
  setToken(token, expiresAt = null) {
    this._token = token;
    this._tokenExpiresAt = expiresAt;
  }

  /**
   * Get auth token.
   */
  getToken() {
    if (this._tokenExpiresAt && new Date(this._tokenExpiresAt) < new Date()) {
      logger.warn(`[${this.getId()}] Token expired`);
      return null;
    }
    return this._token;
  }

  /**
   * Check rate limit.
   */
  _checkRateLimit() {
    const now = Date.now();
    if (now - this._windowStart > 60000) {
      this._requestCount = 0;
      this._windowStart = now;
    }
    if (this._requestCount >= this.config.rateLimitPerMinute) {
      return false;
    }
    this._requestCount++;
    return true;
  }

  /**
   * Execute with retry and rate limiting.
   */
  async _executeWithRetry(fn) {
    if (!this._checkRateLimit()) {
      throw new Error(`[${this.getId()}] Rate limit exceeded (${this.config.rateLimitPerMinute}/min)`);
    }

    let lastError;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await Promise.race([
          fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`[${this.getId()}] Request timeout`)), this.config.timeout),
          ),
        ]);
      } catch (error) {
        lastError = error;
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt) + Math.random() * 500;
          logger.warn(`[${this.getId()}] Retry ${attempt + 1} in ${Math.round(delay)}ms: ${error.message}`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * Record an action in the audit log.
   */
  _audit(action, params, result, error = null) {
    this._auditLog.push({
      timestamp: new Date().toISOString(),
      connector: this.getId(),
      action,
      paramsKeys: Object.keys(params || {}),
      success: !error,
      error: error?.message || null,
    });
    if (this._auditLog.length > 500) {
      this._auditLog = this._auditLog.slice(-250);
    }
  }

  /**
   * Get audit log.
   */
  getAuditLog(limit = 50) {
    return this._auditLog.slice(-limit);
  }

  /**
   * Get connector stats.
   */
  getStats() {
    return {
      connector: this.getId(),
      name: this.getName(),
      hasToken: !!this._token,
      tokenExpired: this._tokenExpiresAt ? new Date(this._tokenExpiresAt) < new Date() : false,
      requestCount: this._requestCount,
      auditLogSize: this._auditLog.length,
      actions: this.getActions().map(a => a.name),
    };
  }
}

module.exports = { BaseConnector };
