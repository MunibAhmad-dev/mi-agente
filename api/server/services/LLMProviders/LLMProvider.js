/**
 * LLMProvider — Abstract base class for all LLM providers.
 *
 * Every provider (GPT, Grok, etc.) must extend this class and implement
 * the `complete()` and `stream()` methods.
 *
 * Design principles:
 * - Provider-agnostic: the rest of the system interacts only with this interface
 * - Streaming-first: every provider supports streaming by default
 * - Tool calling: native support for function/tool calling
 * - Error handling: structured errors with retry information
 * - Observability: built-in metrics, logging, and cost tracking
 */

const logger = {
  debug: (...args) => console.log('[LLMProvider]', ...args),
  info: (...args) => console.info('[LLMProvider]', ...args),
  warn: (...args) => console.warn('[LLMProvider]', ...args),
  error: (...args) => console.error('[LLMProvider]', ...args),
};

/**
 * Reasoning effort levels (mirrors OpenAI/xAI reasoning levels)
 */
const ReasoningEffort = {
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  XHIGH: 'xhigh',
  MAX: 'max',
};

/**
 * LLMProvider — base class
 */
class LLMProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey - API key for the provider
   * @param {string} [config.baseURL] - Override base URL
   * @param {number} [config.timeout=180000] - Request timeout in ms
   * @param {number} [config.maxRetries=2] - Max retries on transient errors
   * @param {number} [config.retryDelay=1000] - Base retry delay in ms
   * @param {string} [config.proxy] - HTTP proxy URL
   */
  constructor(config = {}) {
    this._config = {
      timeout: 180000,
      maxRetries: 2,
      retryDelay: 1000,
      ...config,
    };

    // Metrics
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: { prompt: 0, completion: 0, total: 0 },
      totalCostUsd: 0,
      avgLatencyMs: 0,
      lastUsedAt: null,
    };
    this._latencies = [];
  }

  /** @returns {string} Provider identifier */
  get id() {
    throw new Error('LLMProvider: subclass must implement get id()');
  }

  /** @returns {string} Display name */
  get name() {
    throw new Error('LLMProvider: subclass must implement get name()');
  }

  /**
   * Complete a chat request (non-streaming).
   *
   * @param {object} params
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {string} [params.model] - Model ID
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {string} [params.reasoning_effort] - Reasoning effort level
   * @param {Array} [params.tools] - Tool definitions for function calling
   * @param {string} [params.tool_choice] - Tool choice strategy
   * @param {object} [params.response_format] - Response format (json_schema, etc.)
   * @param {AbortSignal} [params.signal] - Abort signal
   * @param {number} [params.seed] - Random seed
   *
   * @returns {Promise<LLMResponse>}
   */
  async complete(params) {
    throw new Error('LLMProvider: subclass must implement complete()');
  }

  /**
   * Stream a chat request (yields chunks).
   *
   * @param {object} params - Same as complete()
   * @returns {AsyncGenerator<LLMStreamChunk>}
   */
  async *stream(params) {
    throw new Error('LLMProvider: subclass must implement stream()');
  }

  /**
   * Check if the provider is available (has valid API key, network, etc.).
   *
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      await this.complete({
        messages: [{ role: 'user', content: 'hi' }],
        model: this._defaultModelId(),
        maxTokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List available models from this provider.
   *
   * @returns {Promise<Array<{id: string, name: string, ...}>>}
   */
  async listModels() {
    return [];
  }

  /**
   * Get provider stats.
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Record a completed request for metrics.
   */
  _recordRequest(latencyMs, usage, costUsd = 0, success = true) {
    this._stats.totalRequests++;
    this._stats.lastUsedAt = new Date().toISOString();

    if (success) {
      this._stats.successfulRequests++;
    } else {
      this._stats.failedRequests++;
    }

    if (usage) {
      this._stats.totalTokens.prompt += usage.promptTokens || 0;
      this._stats.totalTokens.completion += usage.completionTokens || 0;
      this._stats.totalTokens.total += usage.totalTokens || 0;
    }

    this._stats.totalCostUsd += costUsd;

    // Rolling average latency
    this._latencies.push(latencyMs);
    if (this._latencies.length > 100) {
      this._latencies.shift();
    }
    this._stats.avgLatencyMs =
      this._latencies.reduce((a, b) => a + b, 0) / this._latencies.length;
  }

  /**
   * Retry wrapper with exponential backoff.
   */
  async _withRetry(fn, options = {}) {
    const maxRetries = options.maxRetries ?? this._config.maxRetries;
    const retryDelay = options.retryDelay ?? this._config.retryDelay;

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;

        // Don't retry on non-transient errors
        if (!this._isRetryable(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          // Use rate limit headers if available, otherwise exponential backoff
          let delay = retryDelay * Math.pow(2, attempt) + Math.random() * 500;
          const rateLimitWait = this._shouldWaitForRateLimit(error);
          if (rateLimitWait > delay) {
            delay = rateLimitWait;
          }
          logger.warn(
            `[${this.id}] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms:`,
            error.message,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * Determine if an error is retryable (transient).
   */
  _isRetryable(error) {
    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'EAI_AGAIN') {
      return true;
    }
    // HTTP status codes that are retryable
    if (error.status === 429 || error.status === 502 || error.status === 503 || error.status === 504) {
      return true;
    }
    // Rate limit errors
    if (error.message && error.message.includes('rate_limit')) {
      return true;
    }
    return false;
  }

  /**
   * Get the default model ID for this provider.
   */
  _defaultModelId() {
    throw new Error('LLMProvider: subclass must implement _defaultModelId()');
  }

  /**
   * Calculate cost for a request (USD).
   * Subclasses should override with actual pricing.
   */
  _calculateCost(modelId, usage) {
    return 0;
  }

  /**
   * Normalize messages to the format expected by the provider.
   */
  _normalizeMessages(messages) {
    if (!messages || !Array.isArray(messages)) {
      return [];
    }
    return messages.map((msg) => {
      if (typeof msg === 'string') {
        return { role: 'user', content: msg };
      }
      return {
        role: msg.role || 'user',
        content: msg.content || '',
        ...(msg.name ? { name: msg.name } : {}),
        ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
      };
    });
  }

  /**
   * Parse rate limit headers from API response.
   * Returns { remaining, limit, resetMs } or null.
   */
  _parseRateLimitHeaders(headers) {
    if (!headers) return null;
    const remaining = headers['x-ratelimit-remaining-requests'];
    const limit = headers['x-ratelimit-limit-requests'];
    const resetMs = headers['x-ratelimit-reset-requests'];
    if (remaining != null) {
      return {
        remaining: parseInt(remaining, 10),
        limit: parseInt(limit, 10) || 0,
        resetMs: resetMs ? this._parseRateLimitReset(resetMs) : 0,
      };
    }
    return null;
  }

  /**
   * Parse rate limit reset time (e.g., '1.2s', '60s', '1m').
   */
  _parseRateLimitReset(value) {
    if (typeof value === 'number') return value;
    const str = String(value);
    const match = str.match(/([\d.]+)(ms|s|m|h)?/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2] || 's';
    switch (unit) {
      case 'ms': return num;
      case 's': return num * 1000;
      case 'm': return num * 60000;
      case 'h': return num * 3600000;
      default: return num * 1000;
    }
  }

  /**
   * Check if we should wait before retrying (rate limit).
   */
  _shouldWaitForRateLimit(error) {
    if (error.status !== 429) return 0;
    const retryAfter = error.headers?.['retry-after'];
    if (retryAfter) {
      return this._parseRateLimitReset(retryAfter);
    }
    const rateLimit = error.headers?.['x-ratelimit-reset-requests'];
    if (rateLimit) {
      return this._parseRateLimitReset(rateLimit);
    }
    return 5000; // Default 5s wait for rate limits
  }

  /**
   * Estimate token count from messages (rough: ~4 chars per token).
   */
  _estimateTokens(messages) {
    if (!messages || !Array.isArray(messages)) return 0;
    return messages.reduce((total, msg) => {
      const content = typeof msg === 'string' ? msg : (msg.content || '');
      return total + Math.ceil(content.length / 4);
    }, 0);
  }

  /**
   * Truncate messages to fit within context window.
   * Keeps system message(s) and truncates oldest user/assistant messages.
   */
  _truncateToContextWindow(messages, contextWindow, reservedTokens = 4096) {
    if (!messages || !Array.isArray(messages)) return messages;
    
    const availableTokens = contextWindow - reservedTokens;
    const estimatedTokens = this._estimateTokens(messages);
    
    if (estimatedTokens <= availableTokens) {
      return messages; // Fits as-is
    }
    
    // Separate system messages from conversation
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    const systemTokens = this._estimateTokens(systemMessages);
    const availableForConversation = availableTokens - systemTokens;
    
    if (availableForConversation <= 0) {
      // System messages alone exceed limit - truncate the last one
      const lastSystem = systemMessages[systemMessages.length - 1];
      const maxChars = availableTokens * 4;
      return [
        ...systemMessages.slice(0, -1),
        { ...lastSystem, content: lastSystem.content.slice(0, maxChars) },
      ];
    }
    
    // Keep most recent messages that fit
    let tokenCount = 0;
    const keptMessages = [];
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const msgTokens = Math.ceil((conversationMessages[i].content || '').length / 4);
      if (tokenCount + msgTokens > availableForConversation) break;
      tokenCount += msgTokens;
      keptMessages.unshift(conversationMessages[i]);
    }
    
    // Add truncation notice
    if (keptMessages.length < conversationMessages.length) {
      keptMessages.unshift({
        role: 'system',
        content: `[Context truncated: ${conversationMessages.length - keptMessages.length} earlier messages removed to fit context window]`,
      });
    }
    
    return [...systemMessages, ...keptMessages];
  }
}

/**
 * @typedef {object} LLMResponse
 * @property {string} content - Response text content
 * @property {string} model - Model that generated the response
 * @property {string} provider - Provider ID
 * @property {object} usage - Token usage { promptTokens, completionTokens, totalTokens }
 * @property {string} finishReason - 'stop', 'length', 'tool_calls', etc.
 * @property {Array} toolCalls - Tool calls if any
 * @property {number} latencyMs - Response latency
 * @property {string} reasoningContent - Reasoning content if available
 */

/**
 * @typedef {object} LLMStreamChunk
 * @property {string} type - 'delta', 'tool_call', 'reasoning', 'done'
 * @property {string} [delta] - Text delta
 * @property {object} [toolCall] - Tool call delta
 * @property {string} [reasoning] - Reasoning delta
 * @property {object} [usage] - Final usage (only in 'done' chunk)
 */

module.exports = { LLMProvider, ReasoningEffort };
