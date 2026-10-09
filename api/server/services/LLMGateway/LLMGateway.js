/**
 * LLM Gateway - Intelligent routing and fallback system
 * Supports 12+ LLM providers with automatic failover
 */

const EventEmitter = require('events');
const logger = require('../../../utils/logger');

// Import providers
const OpenAIProvider = require('./providers/OpenAIProvider');
const XAIProvider = require('./providers/XAIProvider');
const GroqProvider = require('./providers/GroqProvider');
const DeepSeekProvider = require('./providers/DeepSeekProvider');
const CloudflareProvider = require('./providers/CloudflareProvider');
const MistralProvider = require('./providers/MistralProvider');
const CohereProvider = require('./providers/CohereProvider');
const HuggingFaceProvider = require('./providers/HuggingFaceProvider');
const OpenRouterProvider = require('./providers/OpenRouterProvider');
const GeminiProvider = require('./providers/GeminiProvider');
const AnthropicProvider = require('./providers/AnthropicProvider');
const PerplexityProvider = require('./providers/PerplexityProvider');
const LeptonProvider = require('./providers/LeptonProvider');
const TogetherProvider = require('./providers/TogetherProvider');

class LLMGateway extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      defaultModel: config.defaultModel || 'groq-llama-3.3-70b',
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
      enableFallback: config.enableFallback !== false,
      ...config,
    };

    // Initialize providers
    this.providers = this.initializeProviders(config.providers || {});

    // Provider statistics
    this.stats = this.initializeStats();

    logger.info('[LLMGateway] Initialized with providers:', Object.keys(this.providers).join(', '));
  }

  initializeProviders(providerConfigs) {
    const providers = {};

    // Define all available providers with their configs
    const providerDefinitions = {
      openai: {
        class: OpenAIProvider,
        config: providerConfigs.openai || {},
        models: [
          'o3', 'gpt-4o', 'gpt-4o-mini',
          'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
          'o3', 'o3-mini', 'o4-mini', 'gpt-4o', 'gpt-4o-mini',
        ],
        capabilities: ['chat', 'code', 'reasoning', 'vision', 'tools', 'streaming'],
        free: false,
        tier: 'paid',
      },
      xai: {
        class: XAIProvider,
        config: providerConfigs.xai || {},
        models: ['grok-4-0709', 'grok-4-0709-fast', 'grok-4.5', 'grok-3', 'grok-3-mini'],
        capabilities: ['chat', 'code', 'reasoning', 'vision', 'tools', 'streaming', 'deepsearch'],
        free: false,
        tier: 'paid',
      },
      groq: {
        class: GroqProvider,
        config: providerConfigs.groq || {},
        models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
        capabilities: ['chat', 'code'],
        free: true,
        tier: 'free',
      },
      deepseek: {
        class: DeepSeekProvider,
        config: providerConfigs.deepseek || {},
        models: ['deepseek-chat', 'deepseek-coder'],
        capabilities: ['chat', 'code', 'math'],
        free: true,
        tier: 'free_credit',
      },
      cloudflare: {
        class: CloudflareProvider,
        config: providerConfigs.cloudflare || {},
        models: [
          '@cf/meta/llama-3.1-8b-instruct',
          '@cf/mistral/mistral-7b-instruct-v0.2',
          '@cf/google/gemma-2-2b-it',
        ],
        capabilities: ['chat'],
        free: true,
        tier: 'free',
      },
      mistral: {
        class: MistralProvider,
        config: providerConfigs.mistral || {},
        models: ['mistral-small-latest', 'mistral-medium-latest', 'codestral-latest'],
        capabilities: ['chat', 'code'],
        free: true,
        tier: 'free',
      },
      cohere: {
        class: CohereProvider,
        config: providerConfigs.cohere || {},
        models: ['command-r-plus', 'command-r', 'command'],
        capabilities: ['chat', 'rag'],
        free: true,
        tier: 'free',
      },
      huggingface: {
        class: HuggingFaceProvider,
        config: providerConfigs.huggingface || {},
        models: ['meta-llama/Llama-3.1-8B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.2'],
        capabilities: ['chat'],
        free: true,
        tier: 'free',
      },
      openrouter: {
        class: OpenRouterProvider,
        config: providerConfigs.openrouter || {},
        models: [
          'anthropic/claude-3-haiku',
          'google/gemma-2-9b-it',
          'meta-llama/llama-3-8b-instruct',
        ],
        capabilities: ['chat', 'code', 'vision'],
        free: true,
        tier: 'free',
      },
      gemini: {
        class: GeminiProvider,
        config: providerConfigs.gemini || {},
        models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'],
        capabilities: ['chat', 'code', 'vision', 'math'],
        free: true,
        tier: 'free',
      },
      anthropic: {
        class: AnthropicProvider,
        config: providerConfigs.anthropic || {},
        models: ['claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307'],
        capabilities: ['chat', 'code', 'vision', 'reasoning'],
        free: true,
        tier: 'trial',
      },
      perplexity: {
        class: PerplexityProvider,
        config: providerConfigs.perplexity || {},
        models: ['sonar', 'sonar-pro', 'sonar-reasoning'],
        capabilities: ['chat', 'search'],
        free: true,
        tier: 'free',
      },
      lepton: {
        class: LeptonProvider,
        config: providerConfigs.lepton || {},
        models: ['llama-3.1-405b', 'llama-3.1-70b', 'qwen2.5-72b'],
        capabilities: ['chat', 'code'],
        free: true,
        tier: 'free',
      },
      together: {
        class: TogetherProvider,
        config: providerConfigs.together || {},
        models: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
        capabilities: ['chat', 'code'],
        free: true,
        tier: 'free_credit',
      },
    };

    // Initialize each provider
    for (const [name, def] of Object.entries(providerDefinitions)) {
      if (def.config.enabled !== false && def.config.apiKey) {
        try {
          providers[name] = {
            instance: new def.class(def.config),
            models: def.models,
            capabilities: def.capabilities,
            free: def.free,
            tier: def.tier,
            health: 'healthy',
            lastHealthCheck: Date.now(),
            stats: { requests: 0, errors: 0, latency: 0 },
          };
          logger.info(`[LLMGateway] Provider ${name} initialized`);
        } catch (error) {
          logger.error(`[LLMGateway] Failed to initialize provider ${name}:`, error.message);
        }
      }
    }

    // (D8) Sin API keys externas: registrar el LLM REAL del proyecto
    // (mi-opencode vía opencode-bridge) como proveedor default. Así el
    // CapabilityOrchestrator puede ejecutar modelos sin keys de terceros,
    // con el mismo LLM que usa el chat. Sin mock.
    if (Object.keys(providers).length === 0) {
      const BridgeGateway = require('../../../LLMGateway/LLMGateway');
      const bridge = new BridgeGateway();
      providers['mi-opencode'] = {
        instance: {
          complete: (args) => bridge.complete({ ...args, provider: 'mi-opencode' }),
        },
        models: [process.env.OPENCODE_BRIDGE_MODEL || 'mi-opencode-agent'],
        capabilities: ['chat', 'code', 'reasoning'],
        free: true,
        tier: 'free',
        health: 'healthy',
        lastHealthCheck: Date.now(),
        stats: { requests: 0, errors: 0, latency: 0 },
      };
      logger.info(
        '[LLMGateway] Sin API keys externas — usando mi-opencode (bridge) como proveedor',
      );
    }

    return providers;
  }

  initializeStats() {
    const stats = {};
    for (const name of Object.keys(this.providers)) {
      stats[name] = { requests: 0, errors: 0, totalLatency: 0, avgLatency: 0 };
    }
    return stats;
  }

  /**
   * Complete a chat request with automatic routing and fallback
   */
  async complete({ messages, model, provider, temperature, maxTokens, stream, userId }) {
    const startTime = Date.now();

    // 1. Select provider and model
    let selectedProvider = provider;
    let selectedModel = model;

    if (!selectedProvider) {
      const selection = this.selectProviderAndModel({ model, messages });
      selectedProvider = selection.provider;
      selectedModel = selection.model;
    }

    // 2. Get provider instance
    const providerData = this.providers[selectedProvider];
    if (!providerData) {
      throw new Error(`Provider ${selectedProvider} not available`);
    }

    // 3. Execute with fallback
    const providers = this.getFallbackChain(selectedProvider);

    let lastError;
    for (const p of providers) {
      try {
        const result = await this.executeOnProvider({
          provider: p,
          model: selectedModel,
          messages,
          temperature,
          maxTokens,
          stream,
        });

        // Record success
        this.recordSuccess(selectedProvider, Date.now() - startTime);
        return result;
      } catch (error) {
        lastError = error;
        this.recordError(selectedProvider, error);
        logger.warn(`[LLMGateway] Provider ${p} failed, trying fallback...`);

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          break;
        }
      }
    }

    throw lastError || new Error('All providers failed');
  }

  /**
   * Select the best provider and model based on requirements
   */
  selectProviderAndModel({ model, messages }) {
    // If model is specified, find its provider
    for (const [name, data] of Object.entries(this.providers)) {
      if (data.models.includes(model)) {
        return { provider: name, model };
      }
    }

    // Analyze message content for capabilities
    const content = messages
      .map((m) => m.content || '')
      .join(' ')
      .toLowerCase();
    const requiresCode =
      content.includes('code') || content.includes('function') || content.includes('python');
    const requiresMath =
      content.includes('math') || content.includes('calculate') || content.includes('equation');
    const requiresSearch =
      content.includes('search') || content.includes('web') || content.includes('find');

    // Select best free provider based on capabilities
    if (requiresCode) {
      const codeProviders = ['groq', 'deepseek', 'mistral', 'together'];
      for (const p of codeProviders) {
        if (this.providers[p]?.health === 'healthy') {
          return { provider: p, model: this.providers[p].models[0] };
        }
      }
    }

    if (requiresSearch) {
      if (this.providers.perplexity?.health === 'healthy') {
        return { provider: 'perplexity', model: 'sonar' };
      }
    }

    // Default to fastest free provider (Groq)
    if (this.providers.groq?.health === 'healthy') {
      return { provider: 'groq', model: 'llama-3.3-70b-versatile' };
    }

    // Fallback to first available provider
    const firstProvider = Object.keys(this.providers)[0];
    return { provider: firstProvider, model: this.providers[firstProvider].models[0] };
  }

  /**
   * Get fallback chain for a provider
   */
  getFallbackChain(primaryProvider) {
    if (!this.config.enableFallback) {
      return [primaryProvider];
    }

    // Order by health and capability
    const available = Object.entries(this.providers)
      .filter(([name, data]) => data.health === 'healthy')
      .sort((a, b) => {
        // Primary provider first
        if (a[0] === primaryProvider) return -1;
        if (b[0] === primaryProvider) return 1;
        // Then by free tier (prefer permanent free over credits)
        if (a[1].tier === 'free' && b[1].tier !== 'free') return -1;
        if (b[1].tier === 'free' && a[1].tier !== 'free') return 1;
        // Then by error rate
        return (
          a[1].stats.errors / (a[1].stats.requests || 1) -
          b[1].stats.errors / (b[1].stats.requests || 1)
        );
      });

    return available.map(([name]) => name);
  }

  /**
   * Execute request on a specific provider
   */
  async executeOnProvider({ provider, model, messages, temperature, maxTokens, stream }) {
    const providerData = this.providers[provider];
    if (!providerData) {
      throw new Error(`Provider ${provider} not found`);
    }

    const startTime = Date.now();

    const result = await providerData.instance.complete({
      model,
      messages,
      temperature,
      maxTokens,
      stream,
    });

    return result;
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableCodes = [
      'RATE_LIMITED',
      'TIMEOUT',
      'SERVICE_UNAVAILABLE',
      'BAD_GATEWAY',
      'GATEWAY_TIMEOUT',
    ];
    return (
      retryableCodes.includes(error.code) ||
      error.status === 429 ||
      error.status >= 500 ||
      error.message?.includes('timeout')
    );
  }

  /**
   * Record successful request
   */
  recordSuccess(provider, latency) {
    this.stats[provider] = this.stats[provider] || { requests: 0, errors: 0, totalLatency: 0 };
    this.stats[provider].requests++;
    this.stats[provider].totalLatency += latency;
    this.stats[provider].avgLatency =
      this.stats[provider].totalLatency / this.stats[provider].requests;

    if (this.providers[provider]) {
      this.providers[provider].health = 'healthy';
      this.providers[provider].lastHealthCheck = Date.now();
    }
  }

  /**
   * Record failed request
   */
  recordError(provider, error) {
    this.stats[provider] = this.stats[provider] || { requests: 0, errors: 0, totalLatency: 0 };
    this.stats[provider].errors++;

    // Mark unhealthy after too many errors
    const errorRate = this.stats[provider].errors / (this.stats[provider].requests || 1);
    if (errorRate > 0.5 || error.status === 401 || error.status === 403) {
      if (this.providers[provider]) {
        this.providers[provider].health = 'unhealthy';
      }
    }
  }

  /**
   * Get gateway statistics
   */
  getStats() {
    return {
      providers: Object.entries(this.providers).map(([name, data]) => ({
        name,
        health: data.health,
        models: data.models,
        capabilities: data.capabilities,
        free: data.free,
        tier: data.tier,
        stats: data.stats,
      })),
      summary: {
        totalRequests: Object.values(this.stats).reduce((sum, s) => sum + s.requests, 0),
        totalErrors: Object.values(this.stats).reduce((sum, s) => sum + s.errors, 0),
        avgLatency:
          Object.values(this.stats).reduce((sum, s) => sum + s.avgLatency, 0) /
          Object.keys(this.stats).length,
      },
    };
  }

  /**
   * Health check all providers
   */
  async healthCheck() {
    const results = {};

    for (const [name, data] of Object.entries(this.providers)) {
      try {
        const isHealthy = await data.instance.healthCheck();
        data.health = isHealthy ? 'healthy' : 'unhealthy';
        results[name] = { status: data.health, timestamp: Date.now() };
      } catch (error) {
        data.health = 'unhealthy';
        results[name] = { status: 'unhealthy', error: error.message, timestamp: Date.now() };
      }
    }

    return results;
  }

  /**
   * Get available models across all providers
   */
  getAvailableModels() {
    const models = [];

    for (const [provider, data] of Object.entries(this.providers)) {
      for (const model of data.models) {
        models.push({
          provider,
          model,
          capabilities: data.capabilities,
          free: data.free,
          tier: data.tier,
        });
      }
    }

    return models;
  }
}

// Singleton
let _instance = null;
LLMGateway.getGateway = function (config) {
  if (!_instance) {
    _instance = new LLMGateway(config);
  }
  return _instance;
};
LLMGateway.createGateway = function (config) {
  _instance = new LLMGateway(config);
  return _instance;
};

module.exports = LLMGateway;
