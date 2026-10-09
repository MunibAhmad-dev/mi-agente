/**
 * CircuitBreaker — Resilience pattern for external API calls
 * ===========================================================
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
 */

const CircuitState = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
});

class CircuitBreaker {
  /**
   * @param {string} name - Circuit breaker identifier
   * @param {object} options
   * @param {number} options.failureThreshold - Failures before opening (default: 5)
   * @param {number} options.resetTimeoutMs - Time before half-open (default: 60000)
   * @param {number} options.successThreshold - Successes to close from half-open (default: 3)
   */
  constructor(name, options = {}) {
    this.name = name;
    this.state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this._failureThreshold = options.failureThreshold || 5;
    this._resetTimeoutMs = options.resetTimeoutMs || 60000;
    this._successThreshold = options.successThreshold || 3;
  }

  /**
   * Execute a function through the circuit breaker.
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>}
   */
  async execute(fn) {
    if (this.state === CircuitState.OPEN) {
      if (this._shouldTryReset()) {
        this.state = CircuitState.HALF_OPEN;
        this._successCount = 0;
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN. Retry after reset timeout.`);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  _onSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this._successCount++;
      if (this._successCount >= this._successThreshold) {
        this.state = CircuitState.CLOSED;
        this._failureCount = 0;
      }
    } else {
      this._failureCount = 0;
    }
  }

  _onFailure() {
    this._failureCount++;
    this._lastFailureTime = Date.now();
    if (this._failureCount >= this._failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  _shouldTryReset() {
    if (!this._lastFailureTime) return false;
    return Date.now() - this._lastFailureTime >= this._resetTimeoutMs;
  }

  getInfo() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this._failureCount,
      successCount: this._successCount,
      lastFailureTime: this._lastFailureTime,
    };
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
  }
}

const _breakers = new Map();

function getCircuitBreaker(name, options) {
  if (!_breakers.has(name)) {
    _breakers.set(name, new CircuitBreaker(name, options));
  }
  return _breakers.get(name);
}

module.exports = { CircuitBreaker, CircuitState, getCircuitBreaker };
