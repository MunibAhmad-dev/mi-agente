/**
 * LLMGateway — Multi-provider gateway for all LLM backends.
 *
 * Supports:
 * - opencode-bridge (mi-opencode) — existing provider
 * - OpenAI GPT (GPT-5.6 Sol/Terra/Luna, o3, o4, GPT-4.1) — NEW
 * - xAI Grok (Grok 4.5/4.6) — NEW
 *
 * Provider routing:
 * - If provider is specified, routes directly to that provider
 * - If model is specified, auto-detects provider from model name
 * - If neither, uses default provider from config
 * - Fallback chain on failure: configured provider → next in chain
 *
 * Features:
 * - Streaming support (SSE)
 * - Tool/Function calling
 * - Reasoning modes
 * - Cost tracking
 * - Automatic retries with exponential backoff
 */

let ProviderRegistry = null;
try {
  // Correct relative path from api/server/LLMGateway/ to api/server/services/LLMProviders/
  ProviderRegistry = require('../services/LLMProviders').ProviderRegistry;
} catch {
  // Fallback: try absolute path from __dirname
  try {
    const path = require('path');
    ProviderRegistry = require(path.join(__dirname, '..', 'services', 'LLMProviders')).ProviderRegistry;
  } catch {
    // ProviderRegistry not available — bridge-only mode
  }
}

const BRIDGE_URL = process.env.OPENCODE_BRIDGE_URL || 'http://opencode-bridge:8787';
const BRIDGE_KEY = process.env.OPENCODE_BRIDGE_KEY || '';
const BRIDGE_MODEL = process.env.OPENCODE_BRIDGE_MODEL || 'mi-opencode-agent';

const logger = {
  debug: (...args) => console.log('[LLMGateway]', ...args),
  info: (...args) => console.info('[LLMGateway]', ...args),
  warn: (...args) => console.warn('[LLMGateway]', ...args),
  error: (...args) => console.error('[LLMGateway]', ...args),
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
  return null;
}

/**
 * LLMGateway — Multi-provider gateway.
 */
class LLMGateway {
  constructor(config = {}) {
    this.config = {
      timeout: 180000,
      maxRetries: 2,
      retryDelay: 1000,
      defaultProvider: process.env.LLM_DEFAULT_PROVIDER || 'mi-opencode',
      defaultModel: process.env.LLM_DEFAULT_MODEL || null,
      fallbackChain: (process.env.LLM_FALLBACK_CHAIN || '').split(',').filter(Boolean),
      ...config,
    };

    this._providerRegistry = null;
    this._stats = {
      totalRequests: 0,
      byProvider: {},
    };

    // Try to initialize provider registry
    if (ProviderRegistry) {
      try {
        this._providerRegistry = new ProviderRegistry(this.config);
        logger.info(
          '[LLMGateway] Multi-provider mode — providers:',
          this._providerRegistry.listProviders(),
        );
      } catch (err) {
        logger.warn('[LLMGateway] Could not init ProviderRegistry:', err.message);
      }
    }

    logger.info(
      `[LLMGateway] Initialized (default: ${this.config.defaultProvider}, ` +
        `bridge: ${BRIDGE_URL})`,
    );
  }

  /**
   * Complete a chat request — routes to the appropriate provider.
   *
   * @param {object} params
   * @param {Array} params.messages
   * @param {string} [params.model]
   * @param {string} [params.provider]
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {string} [params.reasoning_effort]
   * @param {Array} [params.tools]
   * @param {string} [params.tool_choice]
   * @param {object} [params.response_format]
   * @param {boolean} [params.stream=false]
   * @param {AbortSignal} [params.signal]
   *
   * @returns {Promise<object>}
   */
  async complete(params = {}) {
    const startTime = Date.now();
    const provider = params.provider || detectProvider(params.model) || this.config.defaultProvider;
    const model = params.model || this.config.defaultModel;

    this._stats.totalRequests++;
    this._stats.byProvider[provider] = (this._stats.byProvider[provider] || 0) + 1;

    logger.debug(`[LLMGateway] Routing: provider=${provider}, model=${model || 'default'}`);

    try {
      let result;

      if (provider === 'mi-opencode' || provider === 'opencode-bridge') {
        // Route to opencode-bridge (existing)
        result = await this._routeToBridge(params);
      } else if (this._providerRegistry) {
        // Route through ProviderRegistry (GPT, Grok, etc.)
        const { provider: llmProvider } = this._providerRegistry.getByModel(
          model || this._defaultModelForProvider(provider),
        );
        result = await llmProvider.complete({
          messages: params.messages,
          model,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          reasoning_effort: params.reasoning_effort,
          tools: params.tools,
          tool_choice: params.tool_choice,
          response_format: params.response_format,
          signal: params.signal,
        });
      } else {
        // Fallback: try to use bridge with any provider
        result = await this._routeToBridge(params);
      }

      result.latencyMs = Date.now() - startTime;
      return result;
    } catch (error) {
      logger.error(`[LLMGateway] Provider ${provider} failed:`, error.message);

      // Try fallback chain
      for (const fallbackProvider of this.config.fallbackChain) {
        if (fallbackProvider === provider) continue;
        try {
          logger.info(`[LLMGateway] Trying fallback: ${fallbackProvider}`);
          return await this._fallback(fallbackProvider, params);
        } catch (fallbackError) {
          logger.warn(`[LLMGateway] Fallback ${fallbackProvider} also failed:`, fallbackError.message);
        }
      }

      throw error;
    }
  }

  /**
   * Stream a chat request — yields chunks.
   */
  async *stream(params = {}) {
    const provider = params.provider || detectProvider(params.model) || this.config.defaultProvider;
    const model = params.model || this.config.defaultModel;

    if (provider === 'mi-opencode' || provider === 'opencode-bridge') {
      // Bridge doesn't support real streaming yet, yield as single chunk
      const result = await this._routeToBridge(params);
      yield { type: 'delta', delta: result.content };
      yield { type: 'done', usage: result.usage };
      return;
    }

    if (this._providerRegistry) {
      const { provider: llmProvider } = this._providerRegistry.getByModel(
        model || this._defaultModelForProvider(provider),
      );
      yield* llmProvider.stream({
        messages: params.messages,
        model,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        reasoning_effort: params.reasoning_effort,
        tools: params.tools,
        tool_choice: params.tool_choice,
        response_format: params.response_format,
      });
    } else {
      throw new Error('LLMGateway: No provider available for streaming');
    }
  }

  /**
   * Route to opencode-bridge (existing behavior).
   */
  async _routeToBridge(params) {
    if (!BRIDGE_KEY) {
      throw new Error('LLMGateway: OPENCODE_BRIDGE_KEY no está configurada en el entorno');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      const response = await fetch(`${BRIDGE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BRIDGE_KEY}`,
        },
        body: JSON.stringify({
          model: params.model || BRIDGE_MODEL,
          messages: params.messages || [],
          ...(params.temperature != null ? { temperature: params.temperature } : {}),
          ...(params.maxTokens != null ? { max_tokens: params.maxTokens } : {}),
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!response.ok) {
        const detail = data?.error?.message || text.slice(0, 200);
        throw new Error(`LLMGateway: bridge devolvió HTTP ${response.status} (${detail})`);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('LLMGateway: respuesta del bridge sin contenido de texto');
      }

      return {
        content,
        usage: data.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: data.model || params.model || BRIDGE_MODEL,
        provider: params.provider || 'mi-opencode',
        finishReason: data?.choices?.[0]?.finish_reason || 'stop',
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(
          `LLMGateway: timeout tras ${this.config.timeout}ms esperando al bridge (${BRIDGE_URL})`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fallback to another provider.
   */
  async _fallback(provider, params) {
    if (this._providerRegistry) {
      const model = this._defaultModelForProvider(provider);
      const { provider: llmProvider } = this._providerRegistry.getByModel(model);
      return await llmProvider.complete({
        messages: params.messages,
        model,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        reasoning_effort: params.reasoning_effort,
        tools: params.tools,
      });
    }
    throw new Error(`LLMGateway: No provider registry for fallback to ${provider}`);
  }

  /**
   * Get default model for a provider.
   */
  _defaultModelForProvider(provider) {
    const defaults = {
      openai: 'gpt-5.6-luna',
      xai: 'grok-4-0709-fast',
      'mi-opencode': BRIDGE_MODEL,
    };
    return defaults[provider] || BRIDGE_MODEL;
  }

  /**
   * Select provider and model based on current state.
   */
  selectProviderAndModel(preferredProvider) {
    const provider = preferredProvider || this.config.defaultProvider;

    if (provider === 'mi-opencode') {
      return { provider: 'mi-opencode', model: BRIDGE_MODEL };
    }

    if (this._providerRegistry) {
      const model = this._defaultModelForProvider(provider);
      return { provider, model };
    }

    return { provider: 'mi-opencode', model: BRIDGE_MODEL };
  }

  /**
   * Get gateway stats.
   */
  getStats() {
    return {
      ...this._stats,
      providers: this._providerRegistry ? this._providerRegistry.getStats() : {},
    };
  }

  /**
   * Health check all providers.
   */
  async healthCheck() {
    const results = {
      'mi-opencode': !!BRIDGE_KEY,
    };

    if (this._providerRegistry) {
      const providerHealth = await this._providerRegistry.healthCheckAll();
      for (const [id, healthy] of providerHealth) {
        results[id] = healthy;
      }
    }

    return results;
  }
}

// Singleton
let instance = null;

function getLLMGateway(config) {
  if (!instance) {
    instance = new LLMGateway(config);
  }
  return instance;
}

function createLLMGateway(config) {
  instance = new LLMGateway(config);
  return instance;
}

module.exports = LLMGateway;
module.exports.LLMGateway = LLMGateway;
module.exports.getLLMGateway = getLLMGateway;
module.exports.createLLMGateway = createLLMGateway;
