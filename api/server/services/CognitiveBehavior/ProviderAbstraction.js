'use strict';

/**
 * ProviderAbstraction — Gen B runtime phase.
 * Universal interface across different LLM providers.
 * Pre-registers: openai, anthropic, google, mistral, groq, deepseek.
 *
 * Provider config: { name, baseUrl?, apiKeyEnv, models, rateLimit?, costPerToken? }
 */

const PREREGISTERED = [
  {
    providerId: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o'],
    rateLimit: { rpm: 500, tpm: 150000 },
    costPerToken: { 'gpt-4': 0.00003, 'gpt-3.5-turbo': 0.000002, 'gpt-4-turbo': 0.00001, 'gpt-4o': 0.000005 },
    capabilities: ['chat', 'function_calling', 'vision', 'embeddings', 'code'],
    quality: 0.95,
    latencyMs: 1500,
  },
  {
    providerId: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-sonnet-4-5', 'claude-opus-4-5'],
    rateLimit: { rpm: 200, tpm: 100000 },
    costPerToken: { 'claude-3-opus': 0.000015, 'claude-3-sonnet': 0.000003, 'claude-3-haiku': 0.00000025 },
    capabilities: ['chat', 'function_calling', 'vision', 'long_context', 'reasoning'],
    quality: 0.95,
    latencyMs: 1800,
  },
  {
    providerId: 'google',
    name: 'Google AI (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyEnv: 'GOOGLE_AI_API_KEY',
    models: ['gemini-pro', 'gemini-pro-vision', 'gemini-ultra', 'gemini-1.5-pro'],
    rateLimit: { rpm: 60, tpm: 60000 },
    costPerToken: { 'gemini-pro': 0.000001, 'gemini-ultra': 0.000028 },
    capabilities: ['chat', 'vision', 'code', 'multimodal', 'long_context'],
    quality: 0.90,
    latencyMs: 1200,
  },
  {
    providerId: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY',
    models: ['mistral-small', 'mistral-medium', 'mistral-large', 'mixtral-8x7b'],
    rateLimit: { rpm: 100, tpm: 100000 },
    costPerToken: { 'mistral-small': 0.0000006, 'mistral-medium': 0.0000027, 'mistral-large': 0.000008 },
    capabilities: ['chat', 'function_calling', 'code'],
    quality: 0.85,
    latencyMs: 800,
  },
  {
    providerId: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    models: ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'gemma-7b-it'],
    rateLimit: { rpm: 30, tpm: 30000 },
    costPerToken: { 'llama3-70b': 0.00000059, 'llama3-8b': 0.00000005, 'mixtral': 0.00000027 },
    capabilities: ['chat', 'fast_inference', 'code'],
    quality: 0.80,
    latencyMs: 200,
  },
  {
    providerId: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    rateLimit: { rpm: 60, tpm: 60000 },
    costPerToken: { 'deepseek-chat': 0.00000014, 'deepseek-coder': 0.00000014 },
    capabilities: ['chat', 'code', 'reasoning', 'low_cost'],
    quality: 0.82,
    latencyMs: 1000,
  },
];

class ProviderAbstraction {
  constructor() {
    this.stats = { registered: 0, queries: 0 };
    this._providers = new Map();
    // Pre-register all built-in providers
    for (const p of PREREGISTERED) {
      this._providers.set(p.providerId, { ...p });
      this.stats.registered++;
    }
  }

  /**
   * Register (or update) a provider.
   * @param {string} providerId
   * @param {{ name, baseUrl?, apiKeyEnv, models, rateLimit?, costPerToken?, capabilities?, quality?, latencyMs? }} config
   */
  register(providerId, config) {
    try {
      if (!providerId || !config) return;
      const existing = this._providers.get(providerId) || {};
      this._providers.set(providerId, { ...existing, ...config, providerId });
      this.stats.registered++;
    } catch (_) {
      // non-throwing
    }
  }

  /**
   * Get a provider config by ID.
   * @param {string} providerId
   * @returns {object | null}
   */
  getProvider(providerId) {
    try {
      return this._providers.get(providerId) || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * List all registered providers.
   * @returns {object[]}
   */
  listProviders() {
    try {
      return [...this._providers.values()];
    } catch (_) {
      return [];
    }
  }

  /**
   * Find the best provider matching given requirements.
   * @param {{ maxCost?, minQuality?, maxLatency?, capabilities?: string[] }} requirements
   * @returns {{ providerId, model, reason }}
   */
  getBestProvider(requirements = {}) {
    try {
      this.stats.queries++;
      const { maxCost, minQuality, maxLatency, capabilities } = requirements;

      let candidates = [...this._providers.values()];

      // Filter by quality
      if (typeof minQuality === 'number') {
        candidates = candidates.filter((p) => (p.quality || 0) >= minQuality);
      }

      // Filter by latency
      if (typeof maxLatency === 'number') {
        candidates = candidates.filter((p) => (p.latencyMs || 99999) <= maxLatency);
      }

      // Filter by capabilities
      if (Array.isArray(capabilities) && capabilities.length > 0) {
        candidates = candidates.filter((p) => {
          const provCaps = p.capabilities || [];
          return capabilities.every((c) => provCaps.includes(c));
        });
      }

      // Filter by cost (use first model's cost as representative)
      if (typeof maxCost === 'number') {
        candidates = candidates.filter((p) => {
          if (!p.costPerToken) return true;
          const minCostEntry = Math.min(...Object.values(p.costPerToken));
          return minCostEntry <= maxCost;
        });
      }

      if (candidates.length === 0) {
        // Fall back to all providers, ranked by quality
        candidates = [...this._providers.values()];
      }

      // Rank: higher quality first, lower latency as tiebreaker
      candidates.sort((a, b) => {
        const qDiff = (b.quality || 0) - (a.quality || 0);
        if (qDiff !== 0) return qDiff;
        return (a.latencyMs || 9999) - (b.latencyMs || 9999);
      });

      const best = candidates[0];
      const model = Array.isArray(best.models) && best.models.length > 0 ? best.models[0] : 'default';

      const reasons = [];
      if (maxLatency) reasons.push(`latency ≤ ${maxLatency}ms`);
      if (minQuality) reasons.push(`quality ≥ ${minQuality}`);
      if (capabilities) reasons.push(`supports: ${capabilities.join(', ')}`);

      return {
        providerId: best.providerId,
        model,
        reason: `Best match for [${reasons.join('; ') || 'default quality ranking'}] — quality ${best.quality}, latency ${best.latencyMs}ms`,
      };
    } catch (err) {
      return { providerId: 'openai', model: 'gpt-3.5-turbo', reason: `Fallback due to error: ${err.message}` };
    }
  }

  /**
   * Check if a provider's API key is configured.
   * @param {string} providerId
   * @returns {boolean}
   */
  isAvailable(providerId) {
    try {
      const provider = this._providers.get(providerId);
      if (!provider || !provider.apiKeyEnv) return false;
      return !!process.env[provider.apiKeyEnv];
    } catch (_) {
      return false;
    }
  }

  getStats() {
    return { ...this.stats, providerCount: this._providers.size };
  }
}

let _instance = null;
function getProviderAbstraction() {
  if (!_instance) _instance = new ProviderAbstraction();
  return _instance;
}

module.exports = { ProviderAbstraction, getProviderAbstraction };
