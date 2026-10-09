/**
 * LLM Provider Registry — Factory and registry for all LLM providers.
 *
 * Provides a unified interface to create, manage, and route to different
 * LLM providers (OpenAI/GPT, xAI/Grok, etc.) through a common abstraction.
 *
 * Usage:
 *   const { getProviderRegistry } = require('./LLMProviders');
 *   const registry = getProviderRegistry();
 *   const provider = registry.create('openai');
 *   const result = await provider.complete({ messages, model, ... });
 */

const { GPTProvider, GPT_MODELS } = require('./GPTProvider');
const { GrokProvider, GROK_MODELS } = require('./GrokProvider');

const logger = {
  debug: (...args) => console.log('[ProviderRegistry]', ...args),
  info: (...args) => console.info('[ProviderRegistry]', ...args),
  warn: (...args) => console.warn('[ProviderRegistry]', ...args),
  error: (...args) => console.error('[ProviderRegistry]', ...args),
};

/**
 * Model registry — all known models across all providers.
 * Maps model IDs to their provider and metadata.
 */
const MODEL_REGISTRY = {
  // GPT-5.6 Family
  ...GPT_MODELS,
  // Grok Family
  ...GROK_MODELS,
};

/**
 * Provider factory map — maps provider IDs to their constructor functions.
 */
const PROVIDER_FACTORIES = {
  openai: (config) => new GPTProvider(config),
  xai: (config) => new GrokProvider(config),
  grok: (config) => new GrokProvider(config), // alias
};

/**
 * Provider Registry — singleton that manages provider instances.
 */
class ProviderRegistry {
  constructor(config = {}) {
    this._providers = new Map();
    this._config = config;
    this._modelRegistry = MODEL_REGISTRY;
    logger.info('[ProviderRegistry] Initialized with providers:', Object.keys(PROVIDER_FACTORIES));
  }

  /**
   * Create or get a cached provider instance.
   * @param {string} providerId - 'openai', 'xai', or 'grok'
   * @param {object} [overrideConfig] - Override default config
   * @returns {LLMProvider}
   */
  create(providerId, overrideConfig = {}) {
    if (this._providers.has(providerId) && Object.keys(overrideConfig).length === 0) {
      return this._providers.get(providerId);
    }

    const factory = PROVIDER_FACTORIES[providerId];
    if (!factory) {
      throw new Error(
        `ProviderRegistry: unknown provider "${providerId}". ` +
          `Available: ${Object.keys(PROVIDER_FACTORIES).join(', ')}`,
      );
    }

    const config = { ...this._config, ...overrideConfig };
    const provider = factory(config);

    if (Object.keys(overrideConfig).length === 0) {
      this._providers.set(providerId, provider);
    }

    logger.info(`[ProviderRegistry] Created provider: ${providerId}`);
    return provider;
  }

  /**
   * Get a provider by model ID — auto-detects which provider owns the model.
   * @param {string} modelId - e.g. 'o3', 'grok-4.6'
   * @returns {{ provider: LLMProvider, modelConfig: object }}
   */
  getByModel(modelId) {
    const modelConfig = this._modelRegistry[modelId];
    if (!modelConfig) {
      throw new Error(
        `ProviderRegistry: unknown model "${modelId}". ` +
          `Known models: ${Object.keys(this._modelRegistry).join(', ')}`,
      );
    }

    const provider = this.create(modelConfig.provider);
    return { provider, modelConfig };
  }

  /**
   * List all available models with metadata.
   * @param {string} [providerId] - Optional filter by provider
   * @returns {Array<object>}
   */
  listModels(providerId = null) {
    return Object.entries(this._modelRegistry)
      .filter(([, config]) => !providerId || config.provider === providerId)
      .map(([id, config]) => ({
        id,
        ...config,
      }));
  }

  /**
   * List all registered provider IDs.
   * @returns {string[]}
   */
  listProviders() {
    return Object.keys(PROVIDER_FACTORIES);
  }

  /**
   * Health check all registered providers.
   * @returns {Promise<Map<string, boolean>>}
   */
  async healthCheckAll() {
    const results = new Map();
    for (const [id, provider] of this._providers) {
      try {
        const healthy = await provider.healthCheck();
        results.set(id, healthy);
      } catch {
        results.set(id, false);
      }
    }
    return results;
  }

  /**
   * Get stats for all providers.
   */
  getStats() {
    const stats = {};
    for (const [id, provider] of this._providers) {
      stats[id] = provider.getStats();
    }
    return stats;
  }
}

// Singleton
let instance = null;

function getProviderRegistry(config) {
  if (!instance) {
    instance = new ProviderRegistry(config);
  }
  return instance;
}

function createProviderRegistry(config) {
  instance = new ProviderRegistry(config);
  return instance;
}

module.exports = {
  ProviderRegistry,
  getProviderRegistry,
  createProviderRegistry,
  MODEL_REGISTRY,
  PROVIDER_FACTORIES,
};
