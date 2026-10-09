/**
 * GrokProvider — xAI Grok provider implementation.
 *
 * Supports:
 * - Grok 4.6 (flagship, 500k context)
 * - Grok 4.5 (code-focused, 1.5T params, trained on Cursor data)
 * - Grok 4 Fast (optimized search + reasoning)
 * - Grok 3 / 3-mini (legacy)
 *
 * xAI API is OpenAI-compatible, so we reuse the OpenAI SDK with a custom baseURL.
 *
 * Features:
 * - Streaming (SSE)
 * - Tool/Function calling
 * - Vision/Multimodal
 * - Think mode (reasoning)
 * - DeepSearch (web research)
 * - Structured outputs
 * - Cost tracking
 */

const OpenAI = require('openai');
const { LLMProvider, ReasoningEffort } = require('./LLMProvider');

const logger = {
  debug: (...args) => console.log('[GrokProvider]', ...args),
  info: (...args) => console.info('[GrokProvider]', ...args),
  warn: (...args) => console.warn('[GrokProvider]', ...args),
  error: (...args) => console.error('[GrokProvider]', ...args),
};

const XAI_BASE_URL = 'https://api.x.ai/v1';

/**
 * Grok Model Catalog — all supported Grok models with metadata
 */
const GROK_MODELS = {
  // Grok 4.x Family
  'grok-4-0709': {
    provider: 'xai',
    name: 'Grok 4.6',
    description: 'Flagship model. 500k context, configurable reasoning.',
    contextWindow: 500000,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['low', 'medium', 'high', 'xhigh'],
    supportsStreaming: true,
    supportsStructuredOutput: true,
    supportsDeepSearch: true,
    pricing: { input: 3.0, output: 15.0 }, // per 1M tokens (estimated)
    tier: 'flagship',
  },
  'grok-4-0709-fast': {
    provider: 'xai',
    name: 'Grok 4 Fast',
    description: 'Optimized for search and multimodal reasoning.',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['low', 'medium', 'high'],
    supportsStreaming: true,
    supportsStructuredOutput: true,
    supportsDeepSearch: true,
    pricing: { input: 0.5, output: 2.0 },
    tier: 'fast',
  },
  // Grok 4.5 (code-focused)
  'grok-4.5': {
    provider: 'xai',
    name: 'Grok 4.5',
    description: 'Code-focused. 1.5T params, trained on Cursor data.',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsVision: false,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['low', 'medium', 'high', 'xhigh'],
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 2.0, output: 6.0 },
    tier: 'code',
  },
  // Legacy
  'grok-3': {
    provider: 'xai',
    name: 'Grok 3',
    description: 'Previous generation model.',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['low', 'medium', 'high'],
    supportsStreaming: true,
    supportsStructuredOutput: false,
    pricing: { input: 3.0, output: 15.0 },
    tier: 'legacy',
  },
  'grok-3-mini': {
    provider: 'xai',
    name: 'Grok 3 Mini',
    description: 'Fast legacy model.',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsVision: false,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['low', 'medium', 'high'],
    supportsStreaming: true,
    supportsStructuredOutput: false,
    pricing: { input: 0.3, output: 0.5 },
    tier: 'legacy-economy',
  },
};

/**
 * GrokProvider — Concrete implementation for xAI Grok models
 */
class GrokProvider extends LLMProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey - xAI API key
   * @param {string} [config.baseURL] - Override base URL
   * @param {number} [config.timeout=180000] - Request timeout
   * @param {number} [config.maxRetries=2]
   */
  constructor(config = {}) {
    super(config);

    this._apiKey = config.apiKey || process.env.XAI_API_KEY;
    this._baseURL = config.baseURL || XAI_BASE_URL;

    if (!this._apiKey) {
      logger.warn(
        '[GrokProvider] No valid XAI_API_KEY configured. ' +
          'Set XAI_API_KEY in .env or pass via config.',
      );
    }

    this._client = new OpenAI({
      apiKey: this._apiKey,
      baseURL: this._baseURL,
      timeout: this._config.timeout,
      maxRetries: this._config.maxRetries,
    });

    logger.info(`[GrokProvider] Initialized (baseURL: ${this._baseURL})`);
  }

  get id() {
    return 'xai';
  }

  get name() {
    return 'xAI Grok';
  }

  _defaultModelId() {
    return 'grok-4-0709-fast';
  }

  /**
   * Complete a chat request.
   */
  async complete(params) {
    const startTime = Date.now();

    return this._withRetry(async (attempt) => {
      let messages = this._normalizeMessages(params.messages);
      const model = params.model || this._defaultModelId();
      const modelConfig = GROK_MODELS[model] || {};

      // Context window management: auto-truncate if messages exceed context window
      if (modelConfig.contextWindow && !params.skipTruncation) {
        messages = this._truncateToContextWindow(messages, modelConfig.contextWindow);
      }

      const body = {
        model,
        messages,
        stream: false,
      };

      // Temperature
      if (params.temperature != null) {
        body.temperature = params.temperature;
      }

      // Max tokens
      if (params.maxTokens != null) {
        body.max_tokens = Math.min(params.maxTokens, modelConfig.maxOutputTokens || 16384);
      }

      // Reasoning effort (Think mode)
      if (params.reasoning_effort && modelConfig.supportsReasoning) {
        body.reasoning_effort = params.reasoning_effort;
      }

      // Tools
      if (params.tools && params.tools.length > 0 && modelConfig.supportsTools !== false) {
        body.tools = params.tools;
        if (params.tool_choice) {
          body.tool_choice = params.tool_choice;
        }
      }

      // Response format
      if (params.response_format) {
        body.response_format = params.response_format;
      }

      // Seed
      if (params.seed != null) {
        body.seed = params.seed;
      }

      // Search parameters for Grok-specific features
      if (params.search_parameters) {
        body.search_parameters = params.search_parameters;
      }

      logger.debug(`[GrokProvider] Request: model=${model}, messages=${messages.length}`);

      const response = await this._client.chat.completions.create(body);

      const latencyMs = Date.now() - startTime;
      const choice = response.choices?.[0];
      const usage = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : null;

      const cost = this._calculateCost(model, usage);
      this._recordRequest(latencyMs, usage, cost, true);

      logger.debug(
        `[GrokProvider] Response: model=${response.model}, ` +
          `tokens=${usage?.totalTokens}, latency=${latencyMs}ms, cost=$${cost.toFixed(6)}`,
      );

      return {
        content: choice?.message?.content || '',
        reasoningContent: choice?.message?.reasoning_content || null,
        model: response.model || model,
        provider: this.id,
        usage,
        finishReason: choice?.finish_reason || 'stop',
        toolCalls: choice?.message?.tool_calls || null,
        latencyMs,
        costUsd: cost,
      };
    });
  }

  /**
   * Stream a chat request (yields chunks).
   */
  async *stream(params) {
    const startTime = Date.now();

    try {
      const messages = this._normalizeMessages(params.messages);
      const model = params.model || this._defaultModelId();
      const modelConfig = GROK_MODELS[model] || {};

      const body = {
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      };

      if (params.temperature != null) {
        body.temperature = params.temperature;
      }
      if (params.maxTokens != null) {
        body.max_tokens = Math.min(params.maxTokens, modelConfig.maxOutputTokens || 16384);
      }
      if (params.reasoning_effort && modelConfig.supportsReasoning) {
        body.reasoning_effort = params.reasoning_effort;
      }
      if (params.tools && params.tools.length > 0 && modelConfig.supportsTools !== false) {
        body.tools = params.tools;
        if (params.tool_choice) {
          body.tool_choice = params.tool_choice;
        }
      }
      if (params.response_format) {
        body.response_format = params.response_format;
      }
      if (params.seed != null) {
        body.seed = params.seed;
      }
      if (params.search_parameters) {
        body.search_parameters = params.search_parameters;
      }

      logger.debug(`[GrokProvider] Stream request: model=${model}`);

      const stream = await this._client.chat.completions.create(body);

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;

        // Reasoning content
        if (delta?.reasoning_content) {
          yield { type: 'reasoning', reasoning: delta.reasoning_content };
        }

        // Text content
        if (delta?.content) {
          yield { type: 'delta', delta: delta.content };
        }

        // Tool calls
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            yield { type: 'tool_call', toolCall: tc };
          }
        }

        // Usage (final chunk)
        if (chunk.usage) {
          const usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
          const cost = this._calculateCost(model, usage);
          this._recordRequest(Date.now() - startTime, usage, cost, true);
          yield { type: 'done', usage, costUsd: cost };
        }
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this._recordRequest(latencyMs, null, 0, false);
      yield { type: 'error', error: error.message };
      throw error;
    }
  }

  /**
   * DeepSearch — Grok-specific web research feature.
   * Sends a search query through Grok's built-in web search.
   *
   * @param {object} params
   * @param {string} params.query - Search query
   * @param {string} [params.model] - Model to use
   * @param {number} [params.maxResults=10]
   * @returns {Promise<{results: Array, summary: string}>}
   */
  async deepSearch(params) {
    const model = params.model || 'grok-4-0709';

    return this.complete({
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant. Use web search to find comprehensive information ' +
            'about the query. Cite your sources.',
        },
        { role: 'user', content: params.query },
      ],
      model,
      reasoning_effort: 'high',
      search_parameters: {
        mode: 'on',
        return_citations: true,
      },
    });
  }

  /**
   * Calculate cost in USD.
   */
  _calculateCost(modelId, usage) {
    if (!usage) return 0;
    const modelConfig = GROK_MODELS[modelId];
    if (!modelConfig?.pricing) return 0;

    const inputCost = (usage.promptTokens / 1_000_000) * modelConfig.pricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * modelConfig.pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Health check.
   */
  async healthCheck() {
    if (!this._apiKey) {
      return false;
    }
    try {
      await this._client.models.list({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List available models.
   */
  async listModels() {
    return Object.entries(GROK_MODELS).map(([id, config]) => ({
      id,
      provider: this.id,
      ...config,
    }));
  }
}

module.exports = { GrokProvider, GROK_MODELS };
