/**
 * DSHModelPlugin — Bridges our LLM Provider Registry with the Harness runtime.
 *
 * Adapts our GPTProvider/GrokProvider/etc. to the DSH model plugin interface.
 * Supports multi-provider routing, streaming, tool calling, and reasoning modes.
 *
 * Usage:
 *   const plugin = new DSHModelPlugin(config);
 *   await plugin.initialize();
 *   const response = await plugin.complete({ messages, model, tools, ... });
 */

let ProviderRegistry = null;
try {
  ProviderRegistry = require('../LLMProviders').ProviderRegistry;
} catch {
  try {
    const path = require('path');
    ProviderRegistry = require(path.join(__dirname, '..', 'LLMProviders')).ProviderRegistry;
  } catch {
    // ProviderRegistry not available
  }
}

const logger = {
  debug: (...args) => console.log('[DSHModelPlugin]', ...args),
  info: (...args) => console.info('[DSHModelPlugin]', ...args),
  warn: (...args) => console.warn('[DSHModelPlugin]', ...args),
  error: (...args) => console.error('[DSHModelPlugin]', ...args),
};

/**
 * Detect provider from model name.
 */
function detectProvider(model) {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.startsWith('gpt-') || m.startsWith('o3') || m.startsWith('o4') || m === 'gpt-image-1') {
    return 'openai';
  }
  if (m.startsWith('grok-')) {
    return 'xai';
  }
  if (m.startsWith('deepseek')) {
    return 'deepseek';
  }
  if (m.startsWith('claude')) {
    return 'anthropic';
  }
  if (m.startsWith('gemini')) {
    return 'gemini';
  }
  return null;
}

/**
 * DSHModelPlugin — Model adapter for the harness.
 */
class DSHModelPlugin {
  constructor(config = {}) {
    this.config = {
      defaultProvider: config.defaultProvider || 'openai',
      defaultModel: config.defaultModel || 'gpt-4o-mini',
      timeout: config.timeout || 180000,
      ...config,
    };

    this._registry = null;
    this._initialized = false;
  }

  /**
   * Initialize the model plugin with provider registry.
   */
  async initialize() {
    if (this._initialized) return;

    if (ProviderRegistry) {
      try {
        this._registry = new ProviderRegistry(this.config);
        logger.info('[DSHModelPlugin] Provider Registry loaded');
      } catch (err) {
        logger.warn('[DSHModelPlugin] Could not load ProviderRegistry:', err.message);
      }
    }

    this._initialized = true;
    logger.info('[DSHModelPlugin] Initialized');
  }

  /**
   * Complete a chat request through the appropriate provider.
   *
   * @param {object} params
   * @param {Array} params.messages
   * @param {string} [params.provider]
   * @param {string} [params.model]
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {Array} [params.tools]
   * @param {string} [params.reasoning_effort]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<ModelResponse>}
   */
  async complete(params) {
    const providerId = params.provider || detectProvider(params.model) || this.config.defaultProvider;
    const model = params.model || this.config.defaultModel;

    logger.debug(`[DSHModelPlugin] Routing: provider=${providerId}, model=${model}`);

    // Try provider registry first
    if (this._registry) {
      try {
        const { provider } = this._registry.getByModel(model);
        return await provider.complete({
          messages: params.messages,
          model,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          tools: params.tools,
          tool_choice: params.tool_choice,
          reasoning_effort: params.reasoning_effort,
          response_format: params.response_format,
          signal: params.signal,
        });
      } catch (error) {
        logger.error(`[DSHModelPlugin] Provider ${providerId} failed:`, error.message);
        throw error;
      }
    }

    // Fallback: try to load provider directly
    return this._directProviderCall(providerId, model, params);
  }

  /**
   * Stream a chat request.
   */
  async *stream(params) {
    const providerId = params.provider || detectProvider(params.model) || this.config.defaultProvider;
    const model = params.model || this.config.defaultModel;

    if (this._registry) {
      try {
        const { provider } = this._registry.getByModel(model);
        yield* provider.stream({
          messages: params.messages,
          model,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          tools: params.tools,
          reasoning_effort: params.reasoning_effort,
        });
        return;
      } catch (error) {
        logger.error(`[DSHModelPlugin] Stream failed:`, error.message);
      }
    }

    // Fallback: yield single chunk
    const result = await this.complete(params);
    yield { type: 'delta', content: result.content };
    yield { type: 'done', usage: result.usage };
  }

  /**
   * Direct provider call without registry.
   */
  async _directProviderCall(providerId, model, params) {
    // Dynamic require to avoid circular dependencies
    let ProviderClass;
    try {
      if (providerId === 'openai') {
        ProviderClass = require('../LLMProviders/GPTProvider').GPTProvider;
      } else if (providerId === 'xai') {
        ProviderClass = require('../LLMProviders/GrokProvider').GrokProvider;
      }
    } catch (error) {
      throw new Error(`Provider "${providerId}" not available: ${error.message}`);
    }

    if (!ProviderClass) {
      throw new Error(`Provider "${providerId}" not found`);
    }

    const provider = new ProviderClass(this.config);
    return provider.complete({
      messages: params.messages,
      model,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      tools: params.tools,
      reasoning_effort: params.reasoning_effort,
    });
  }

  /**
   * Get list of available provider IDs.
   */
  getProviderIds() {
    if (this._registry) {
      return this._registry.listProviders();
    }
    return ['openai', 'xai', 'mi-opencode'];
  }

  /**
   * Get list of available models.
   */
  listModels(providerId = null) {
    if (this._registry) {
      return this._registry.listModels(providerId);
    }
    return [];
  }

  /**
   * Health check all providers.
   */
  async healthCheck() {
    if (this._registry) {
      return this._registry.healthCheckAll();
    }
    return {};
  }
}

module.exports = { DSHModelPlugin, detectProvider };
