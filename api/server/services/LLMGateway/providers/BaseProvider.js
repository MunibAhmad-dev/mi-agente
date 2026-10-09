/**
 * Base Provider - Abstract base class for all LLM providers
 * Handles HTTP requests, retries, rate limiting, and error handling
 */

const logger = require('../../../../utils/logger');

class BaseProvider {
  constructor(config) {
    this.config = {
      name: config.name || 'unknown',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
      ...config,
    };

    this.stats = {
      requests: 0,
      errors: 0,
      totalLatency: 0,
    };
  }

  /**
   * Make an HTTP request with retry logic
   */
  async request(endpoint, body, stream = false) {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = this.getHeaders();

    const options = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };

    let lastError;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const startTime = Date.now();

        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        const latency = Date.now() - startTime;
        this.stats.requests++;
        this.stats.totalLatency += latency;

        // Handle streaming responses
        if (stream && response.ok) {
          return this.handleStream(response);
        }

        // Handle non-streaming responses
        const data = await response.json();

        if (!response.ok) {
          const error = new Error(data.error?.message || `HTTP ${response.status}`);
          error.status = response.status;
          error.code = data.error?.type || 'UNKNOWN_ERROR';
          throw error;
        }

        return data;
      } catch (error) {
        lastError = error;

        // Don't retry on certain errors
        if (error.status === 400 || error.status === 401 || error.status === 403) {
          this.stats.errors++;
          throw error;
        }

        // Exponential backoff
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.warn(`[${this.config.name}] Request failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    this.stats.errors++;
    throw lastError;
  }

  /**
   * Handle streaming response
   */
  handleStreamResponse(response) {
    return response.body;
  }

  /**
   * Get request headers
   */
  getHeaders() {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get provider statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgLatency: this.stats.requests > 0 ? this.stats.totalLatency / this.stats.requests : 0,
    };
  }

  /**
   * Health check (override in subclasses)
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get capabilities
   */
  getCapabilities() {
    return {
      streaming: true,
      embeddings: false,
      functionCalling: false,
      vision: false,
      jsonMode: false,
    };
  }

  /**
   * Get rate limit
   */
  getRateLimit() {
    return {
      requestsPerMinute: 60,
    };
  }
}

module.exports = BaseProvider;
