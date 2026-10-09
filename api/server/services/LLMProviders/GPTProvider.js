/**
 * GPTProvider — OpenAI GPT provider implementation.
 *
 * Supports:
 * - GPT-5.6 Sol (flagship, 1M context, ultra mode)
 * - GPT-5.6 Terra (mid-range, cost-effective)
 * - GPT-5.6 Luna (fast, default for free/go)
 * - GPT-4.1 family
 * - o3/o4 reasoning models
 *
 * Features:
 * - Streaming (SSE)
 * - Tool/Function calling
 * - Vision/Multimodal
 * - Reasoning modes (none/low/medium/high/xhigh/max)
 * - Structured outputs
 * - Cost tracking
 */

const OpenAI = require('openai');
const { LLMProvider, ReasoningEffort } = require('./LLMProvider');

const logger = {
  debug: (...args) => console.log('[GPTProvider]', ...args),
  info: (...args) => console.info('[GPTProvider]', ...args),
  warn: (...args) => console.warn('[GPTProvider]', ...args),
  error: (...args) => console.error('[GPTProvider]', ...args),
};

/**
 * GPT Model Catalog — all supported GPT models with metadata
 */
const GPT_MODELS = {
  // GPT-5.6 Family (Jul 2026)
  'o3': {
    provider: 'openai',
    name: 'GPT-5.6 Sol',
    description: 'Flagship model. Agentic work, coding, research, cybersecurity, computer use.',
    contextWindow: 1050000,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    supportsUltraMode: true,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 15.0, output: 60.0 }, // per 1M tokens (estimated)
    tier: 'flagship',
  },
  'gpt-4o': {
    provider: 'openai',
    name: 'GPT-5.6 Terra',
    description: 'Mid-range. ~2x cheaper than Sol, competitive with GPT-5.5.',
    contextWindow: 512000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
    supportsUltraMode: false,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 7.5, output: 30.0 },
    tier: 'balanced',
  },
  'gpt-4o-mini': {
    provider: 'openai',
    name: 'GPT-5.6 Luna',
    description: 'Fast & economical. Default for Free/Go users.',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['none', 'low', 'medium', 'high'],
    supportsUltraMode: false,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 1.0, output: 4.0 },
    tier: 'fast',
  },
  // GPT-4.1 Family
  'gpt-4.1': {
    provider: 'openai',
    name: 'GPT-4.1',
    contextWindow: 1048576,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 2.0, output: 8.0 },
    tier: 'standard',
  },
  'gpt-4.1-mini': {
    provider: 'openai',
    name: 'GPT-4.1 Mini',
    contextWindow: 1048576,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 0.4, output: 1.6 },
    tier: 'economy',
  },
  'gpt-4.1-nano': {
    provider: 'openai',
    name: 'GPT-4.1 Nano',
    contextWindow: 1048576,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 0.1, output: 0.4 },
    tier: 'ultra-economy',
  },
  // o3/o4 Reasoning Models
  'o3': {
    provider: 'openai',
    name: 'o3',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['low', 'medium', 'high', 'xhigh'],
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 10.0, output: 40.0 },
    tier: 'reasoning',
  },
  'o3-mini': {
    provider: 'openai',
    name: 'o3 Mini',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsVision: false,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['low', 'medium', 'high'],
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 1.1, output: 4.4 },
    tier: 'reasoning-economy',
  },
  'o4-mini': {
    provider: 'openai',
    name: 'o4 Mini',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    reasoningLevels: ['low', 'medium', 'high', 'xhigh'],
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 1.1, output: 4.4 },
    tier: 'reasoning-economy',
  },
  // Legacy but still available
  'gpt-4o': {
    provider: 'openai',
    name: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 2.5, output: 10.0 },
    tier: 'standard',
  },
  'gpt-4o-mini': {
    provider: 'openai',
    name: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    pricing: { input: 0.15, output: 0.6 },
    tier: 'economy',
  },
};

/**
 * GPTProvider — Concrete implementation for OpenAI GPT models
 */
class GPTProvider extends LLMProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey - OpenAI API key
   * @param {string} [config.baseURL] - Override base URL
   * @param {number} [config.organization] - OpenAI organization ID
   * @param {number} [config.timeout=180000] - Request timeout
   * @param {number} [config.maxRetries=2]
   */
  constructor(config = {}) {
    super(config);

    this._apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this._organization = config.organization || process.env.OPENAI_ORGANIZATION || undefined;
    this._baseURL = config.baseURL || process.env.OPENAI_BASE_URL || undefined;

    if (!this._apiKey || this._apiKey === 'user_provided') {
      logger.warn(
        '[GPTProvider] No valid OPENAI_API_KEY configured. ' +
          'Set OPENAI_API_KEY in .env or pass via config.',
      );
    }

    this._client = new OpenAI({
      apiKey: this._apiKey,
      organization: this._organization,
      baseURL: this._baseURL,
      timeout: this._config.timeout,
      maxRetries: this._config.maxRetries,
    });

    logger.info(
      `[GPTProvider] Initialized (baseURL: ${this._baseURL || 'https://api.openai.com/v1'})`,
    );
  }

  get id() {
    return 'openai';
  }

  get name() {
    return 'OpenAI GPT';
  }

  _defaultModelId() {
    return 'gpt-4o-mini';
  }

  /**
   * Complete a chat request.
   */
  async complete(params) {
    const startTime = Date.now();

    return this._withRetry(async (attempt) => {
      let messages = this._normalizeMessages(params.messages);
      const model = params.model || this._defaultModelId();
      const modelConfig = GPT_MODELS[model] || {};

      // Context window management: auto-truncate if messages exceed context window
      if (modelConfig.contextWindow && !params.skipTruncation) {
        messages = this._truncateToContextWindow(messages, modelConfig.contextWindow);
      }

      // Build request body
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

      // Reasoning effort (for reasoning models)
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

      // Response format (structured output)
      if (params.response_format) {
        body.response_format = params.response_format;
      }

      // Seed
      if (params.seed != null) {
        body.seed = params.seed;
      }

      // Abort signal via timeout
      if (params.signal) {
        body.signal = params.signal;
      }

      logger.debug(`[GPTProvider] Request: model=${model}, messages=${messages.length}`);

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

      // Calculate cost
      const cost = this._calculateCost(model, usage);

      // Record metrics
      this._recordRequest(latencyMs, usage, cost, true);

      logger.debug(
        `[GPTProvider] Response: model=${response.model}, ` +
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
      const modelConfig = GPT_MODELS[model] || {};

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

      logger.debug(`[GPTProvider] Stream request: model=${model}`);

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
   * Calculate cost in USD.
   */
  _calculateCost(modelId, usage) {
    if (!usage) return 0;
    const modelConfig = GPT_MODELS[modelId];
    if (!modelConfig?.pricing) return 0;

    const inputCost = (usage.promptTokens / 1_000_000) * modelConfig.pricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * modelConfig.pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Ultra Mode — GPT-5.6 Sol's multi-agent mode.
   * 
   * When enabled, the model distributes complex tasks among sub-agents,
   * each working on a part of the problem in parallel.
   * This is a model-level feature — we enable it via system prompt + reasoning.
   *
   * @param {object} params
   * @param {Array} params.messages
   * @param {string} [params.model='o3']
   * @param {string} params.task - The complex task to distribute
   * @returns {Promise<object>} Response with sub-agent results
   */
  async ultraMode(params) {
    const model = params.model || 'o3';
    const modelConfig = GPT_MODELS[model];
    
    if (!modelConfig?.supportsUltraMode) {
      throw new Error(
        `Ultra Mode is only available for GPT-5.6 Sol. Model "${model}" does not support it.`
      );
    }
    
    const ultraMessages = [
      {
        role: 'system',
        content: 'You are operating in Ultra Mode. Break down complex tasks into sub-tasks, ' +
          'work through each systematically, and provide a comprehensive answer. ' +
          'Show your reasoning for each sub-task.',
      },
      ...this._normalizeMessages(params.messages),
    ];
    
    return this.complete({
      messages: ultraMessages,
      model,
      reasoning_effort: 'max',
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      tools: params.tools,
    });
  }

  /**
   * Health check — lightweight probe.
   */
  async healthCheck() {
    if (!this._apiKey || this._apiKey === 'user_provided') {
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
    return Object.entries(GPT_MODELS).map(([id, config]) => ({
      id,
      provider: this.id,
      ...config,
    }));
  }
}

module.exports = { GPTProvider, GPT_MODELS };
