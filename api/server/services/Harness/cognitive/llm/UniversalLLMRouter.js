'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * UniversalLLMRouter - Routes requests to ANY LLM provider.
 * Supports: Ollama, LM Studio, WebLLM, llama.cpp, GPT4All,
 *           OpenAI, xAI (Grok), DeepSeek, Anthropic, any OpenAI-compatible API.
 *
 * DeepSeek Harness pattern: tool-use loop that works with ALL providers.
 * Provider-agnostic: same interface for all.
 * Auto-detects available providers and selects the best one per task.
 */
class UniversalLLMRouter {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();
    this.stats = { calls: 0, byProvider: {}, errors: 0, totalTokens: 0 };
    this._modelCache = new Map(); // { providerId → { models, ts } }

    this._registerDefaultProviders();
  }

  _registerDefaultProviders() {
    // ── Local providers (free, no API key) ──
    this.register('ollama', {
      name: 'Ollama',
      type: 'local',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      costPerToken: 0,
      maxTokens: 32768,
      capabilities: ['chat', 'completion', 'embedding', 'tool_use', 'vision', 'thinking'],
      models: ['llama3.1', 'qwen2.5', 'qwen3', 'deepseek-r1', 'mistral', 'codellama', 'gemma3', 'moondream'],
      priority: 1,
      requiresApiKey: false,
    });

    this.register('lmstudio', {
      name: 'LM Studio',
      type: 'local',
      baseUrl: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234',
      costPerToken: 0,
      maxTokens: 32768,
      capabilities: ['chat', 'completion', 'embedding', 'tool_use', 'vision'],
      models: ['any loaded model'],
      priority: 2,
      requiresApiKey: false,
    });

    this.register('llamacpp', {
      name: 'llama.cpp',
      type: 'local',
      baseUrl: 'http://localhost:8080',
      costPerToken: 0,
      maxTokens: 32768,
      capabilities: ['chat', 'completion'],
      models: ['any GGUF model'],
      priority: 3,
      requiresApiKey: false,
    });

    this.register('gpt4all', {
      name: 'GPT4All',
      type: 'local',
      baseUrl: 'http://localhost:4891',
      costPerToken: 0,
      maxTokens: 8192,
      capabilities: ['chat', 'completion'],
      models: ['gpt4all-mistral', 'gpt4all-falcon', 'nomic-embed-text'],
      priority: 4,
      requiresApiKey: false,
    });

    // ── Remote providers (paid, need API key) ──
    this.register('openai', {
      name: 'OpenAI',
      type: 'remote',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: this.config?.openaiApiKey || process.env.OPENAI_API_KEY,
      costPerToken: 0.000002,
      maxTokens: 128000,
      capabilities: ['chat', 'completion', 'embedding', 'image', 'audio', 'function_calling', 'tool_use'],
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3', 'o4-mini'],
      priority: 10,
      requiresApiKey: true,
    });

    this.register('xai', {
      name: 'xAI (Grok)',
      type: 'remote',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: this.config?.xaiApiKey || process.env.XAI_API_KEY,
      costPerToken: 0.000002,
      maxTokens: 131072,
      capabilities: ['chat', 'completion', 'web_search', 'x_search', 'image_generation', 'tool_use'],
      models: ['grok-3', 'grok-3-mini', 'grok-3.5'],
      priority: 11,
      requiresApiKey: true,
    });

    this.register('deepseek', {
      name: 'DeepSeek',
      type: 'remote',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: this.config?.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
      costPerToken: 0.00000014,
      maxTokens: 131072,
      capabilities: ['chat', 'completion', 'function_calling', 'tool_use', 'thinking'],
      models: ['deepseek-r1', 'deepseek-v3', 'deepseek-chat'],
      priority: 5,
      requiresApiKey: true,
    });

    this.register('anthropic', {
      name: 'Anthropic (Claude)',
      type: 'remote',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: this.config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
      costPerToken: 0.000003,
      maxTokens: 200000,
      capabilities: ['chat', 'completion', 'vision', 'tool_use'],
      models: ['claude-sonnet-4-20250514', 'claude-haiku-35-20241022'],
      priority: 12,
      requiresApiKey: true,
    });

    // WebLLM (browser-based, free)
    this.register('webllm', {
      name: 'WebLLM (Browser)',
      type: 'browser',
      baseUrl: null,
      costPerToken: 0,
      maxTokens: 8192,
      capabilities: ['chat', 'completion'],
      models: ['Llama-3.1-8B', 'Qwen2.5-7B', 'Phi-3.5-mini'],
      priority: 6,
      requiresApiKey: false,
    });
  }

  /** Register a new provider. */
  register(id, provider) {
    this.providers.set(id, { ...provider, id });
  }

  /** Check which providers are available. */
  async checkAvailability() {
    const results = {};

    for (const [id, provider] of this.providers) {
      if (provider.type === 'browser') {
        results[id] = { available: typeof window !== 'undefined', provider: provider.name };
        continue;
      }

      if (provider.type === 'local' && provider.baseUrl) {
        try {
          const url = new URL(provider.baseUrl + '/api/tags');
          await this._httpGet(url.href, 3000);
          results[id] = { available: true, provider: provider.name };
        } catch {
          results[id] = { available: false, provider: provider.name };
        }
      } else if (provider.type === 'remote') {
        results[id] = {
          available: !!provider.apiKey,
          provider: provider.name,
          hasKey: !!provider.apiKey,
        };
      }
    }

    return results;
  }

  /** Select the best provider for a task. */
  selectProvider(taskType, options = {}) {
    const available = [];

    for (const [id, provider] of this.providers) {
      if (provider.type === 'browser' && typeof window === 'undefined') continue;
      if (provider.type === 'local' && !options.allowLocal) continue;
      if (provider.type === 'remote' && !provider.apiKey) continue;

      const required = options.capabilities || ['chat'];
      const hasAll = required.every(c => provider.capabilities.includes(c));

      if (hasAll) {
        available.push({ id, ...provider });
      }
    }

    if (available.length === 0) return null;

    available.sort((a, b) => {
      if (options.preferLocal && a.type === 'local' && b.type !== 'local') return -1;
      if (options.preferLocal && b.type === 'local' && a.type !== 'local') return 1;
      if (options.cheapest) return a.costPerToken - b.costPerToken;
      return a.priority - b.priority;
    });

    return available[0];
  }

  /** Route a chat request — public alias used by the /api/llm-router/chat endpoint. */
  async route({ messages, model, provider, options = {} } = {}) {
    return this.chat(messages, { ...options, model, provider });
  }

  /** Send a chat completion request to the best available provider. */
  async chat(messages, options = {}) {
    const provider = options.provider
      ? this.providers.get(options.provider)
      : this.selectProvider(options.taskType, options);

    if (!provider) {
      throw new Error('No available LLM provider. Install Ollama or configure an API key.');
    }

    this.stats.calls++;
    this.stats.byProvider[provider.id] = (this.stats.byProvider[provider.id] || 0) + 1;

    const startTime = Date.now();

    try {
      let result;

      if (provider.type === 'local') {
        result = await this._chatLocal(provider, messages, options);
      } else if (provider.type === 'remote') {
        result = await this._chatRemote(provider, messages, options);
      } else if (provider.type === 'browser') {
        result = await this._chatBrowser(provider, messages, options);
      }

      const latency = Date.now() - startTime;
      this.stats.totalTokens += (result.usage?.totalTokens || 0);

      return {
        ...result,
        provider: provider.id,
        providerName: provider.name,
        latency,
        cost: provider.costPerToken * (result.usage?.totalTokens || 0),
      };
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Quick availability probe for local providers.
   * Returns true if the provider responds to /api/tags within 2 s.
   */
  async _isLocalAvailable(provider) {
    try {
      await this._httpGet(provider.baseUrl + '/api/tags', 2000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Discover live models from a local provider (Ollama, LM Studio).
   * Results are cached for 5 minutes to avoid spamming /api/tags.
   * Falls back to the static model list when the provider is offline.
   */
  async discoverLocalModels(providerId) {
    const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 min
    const cached = this._modelCache.get(providerId);
    if (cached && Date.now() - cached.ts < MODEL_CACHE_TTL) return cached.models;

    const provider = this.providers.get(providerId);
    if (!provider || provider.type !== 'local') return [];

    try {
      const data = await this._httpGet(provider.baseUrl + '/api/tags', 3000);
      const models = (data.models || [])
        .map((m) => (typeof m === 'string' ? m : m.name))
        .filter(Boolean);

      if (models.length > 0) {
        provider.models = models; // update live model list
        this._modelCache.set(providerId, { models, ts: Date.now() });
      }
      return models;
    } catch {
      return provider.models; // fallback to static list
    }
  }

  /**
   * HTTP POST with exponential backoff (2 retries, 1 s / 2 s).
   */
  async _retryPost(url, body, timeout, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this._httpPost(url, body, timeout);
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  /**
   * Chat with a local provider (Ollama, LM Studio, llama.cpp, GPT4All).
   * Pre-flight health check prevents raw network errors when offline.
   * Retries up to 2 times with backoff on transient failures.
   * Auto-discovers live models on first call (cached 5 min).
   */
  async _chatLocal(provider, messages, options) {
    // Health check — surface a clean error instead of a raw ECONNREFUSED
    const alive = await this._isLocalAvailable(provider);
    if (!alive) {
      throw new Error(
        `${provider.name} is not reachable at ${provider.baseUrl}. ` +
        'Make sure it is running before sending messages.'
      );
    }

    // Auto-discover live models (updates provider.models in-place)
    await this.discoverLocalModels(provider.id).catch(() => {});

    const endpoint = this._getLocalEndpoint(provider.id);
    const model = options.model || provider.models[0];

    const body = {
      model,
      messages: messages.map(m => ({
        role: m.role || 'user',
        content: m.content || '',
      })),
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 4096,
        top_p: options.topP || 0.9,
      },
    };

    // Send tools if the provider supports them (Ollama, LM Studio)
    if (options.tools && provider.capabilities.includes('tool_use')) {
      body.tools = options.tools;
    }

    const response = await this._retryPost(endpoint.url, body, 120000);

    // Normalize response — extract tool_calls and content
    const message = response.message || {};
    const content = message.content || response.choices?.[0]?.message?.content || '';
    const toolCalls = this._normalizeToolCalls(
      message.tool_calls || response.choices?.[0]?.message?.tool_calls || [],
      provider.id
    );

    return {
      content,
      finishReason: response.done ? 'stop' : (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
      usage: {
        promptTokens: response.prompt_eval_count || response.usage?.prompt_tokens || 0,
        completionTokens: response.eval_count || response.usage?.completion_tokens || 0,
        totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
    };
  }

  /**
   * Chat with a remote provider (OpenAI, xAI, DeepSeek, Anthropic).
   * Now supports tool_calls from all providers.
   */
  async _chatRemote(provider, messages, options) {
    let url;
    const headers = {};

    if (provider.id === 'anthropic') {
      // Anthropic has a different API format
      url = provider.baseUrl + '/messages';
      headers['x-api-key'] = provider.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['Content-Type'] = 'application/json';

      const body = {
        model: options.model || provider.models[0],
        messages: messages.map(m => ({
          role: m.role || 'user',
          content: m.content || '',
        })),
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
      };

      if (options.tools) body.tools = options.tools;

      const response = await this._httpPostAuth(url, body, headers, 120000);

      const content = response.content?.map(c => c.text).join('') || '';
      const toolUse = response.content?.filter(c => c.type === 'tool_use') || [];
      const toolCalls = toolUse.map((t, i) => ({
        id: t.id || `call_${Date.now()}_${i}`,
        function: {
          name: t.name,
          arguments: typeof t.input === 'string' ? t.input : JSON.stringify(t.input),
        },
      }));

      return {
        content,
        finishReason: response.stop_reason || (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
        usage: {
          promptTokens: response.usage?.input_tokens || 0,
          completionTokens: response.usage?.output_tokens || 0,
          totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
      };
    } else {
      // OpenAI-compatible format (OpenAI, xAI, DeepSeek, etc.)
      url = provider.baseUrl + '/chat/completions';
      headers['Content-Type'] = 'application/json';
      headers['Authorization'] = `Bearer ${provider.apiKey}`;

      const body = {
        model: options.model || provider.models[0],
        messages: messages.map(m => ({
          role: m.role || 'user',
          content: m.content || '',
        })),
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4096,
        stream: false,
      };

      if (options.tools) body.tools = options.tools;
      if (options.response_format) body.response_format = options.response_format;

      const response = await this._httpPostAuth(url, body, headers, 120000);

      const choice = response.choices?.[0] || {};
      const message = choice.message || {};
      const toolCalls = this._normalizeToolCalls(message.tool_calls || [], provider.id);

      return {
        content: message.content || '',
        finishReason: choice.finish_reason || (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0),
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
      };
    }
  }

  /** Chat via WebLLM (browser only). */
  async _chatBrowser(provider, messages, options) {
    throw new Error('WebLLM requires browser environment. Use WebLLM in client-side code.');
  }

  /**
   * Normalize tool_calls from different providers into a standard format.
   * Handles Ollama, OpenAI, DeepSeek, xAI, and Anthropic formats.
   */
  _normalizeToolCalls(rawToolCalls, providerId) {
    if (!Array.isArray(rawToolCalls) || rawToolCalls.length === 0) return [];

    return rawToolCalls.map((tc, index) => {
      // Already in OpenAI format
      if (tc.function && tc.function.name) {
        return {
          id: tc.id || `call_${Date.now()}_${index}`,
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments || {}),
          },
        };
      }

      // Ollama format: { function: { name, arguments } } or { name, arguments }
      if (tc.function) {
        return {
          id: tc.id || `call_${Date.now()}_${index}`,
          function: {
            name: tc.function.name || tc.name,
            arguments: typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments || {}),
          },
        };
      }

      // Flat format: { name, arguments }
      if (tc.name) {
        return {
          id: tc.id || `call_${Date.now()}_${index}`,
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string'
              ? tc.arguments
              : JSON.stringify(tc.arguments || {}),
          },
        };
      }

      // Unknown format — skip
      return null;
    }).filter(Boolean);
  }

  _getLocalEndpoint(providerId) {
    const endpoints = {
      ollama: '/api/chat',
      lmstudio: '/v1/chat/completions',
      llamacpp: '/v1/chat/completions',
      gpt4all: '/v1/chat/completions',
    };

    const provider = this.providers.get(providerId);
    return { url: provider.baseUrl + (endpoints[providerId] || '/api/chat') };
  }

  /** Simple HTTP GET. */
  _httpGet(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.setTimeout(timeout, () => { req.destroy(); clearTimeout(timer); reject(new Error('Timeout')); });
    });
  }

  /** Simple HTTP POST. */
  _httpPost(url, body, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
      const data = JSON.stringify(body);

      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve(JSON.parse(responseData)); } catch { resolve(responseData); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.write(data);
      req.end();
    });
  }

  /** HTTP POST with custom headers. */
  _httpPostAuth(url, body, headers, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
      const data = JSON.stringify(body);

      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
      }, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve(JSON.parse(responseData)); } catch { resolve(responseData); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.write(data);
      req.end();
    });
  }

  /** List all registered providers. */
  listProviders() {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      costPerToken: p.costPerToken,
      maxTokens: p.maxTokens,
      capabilities: p.capabilities,
      models: p.models,
      requiresApiKey: p.requiresApiKey,
      hasKey: !!p.apiKey,
    }));
  }

  /** Get cheapest provider for a task type. */
  getCheapest(taskType = 'chat') {
    let cheapest = null;
    for (const [, provider] of this.providers) {
      if (provider.type === 'browser' && typeof window === 'undefined') continue;
      if (provider.type === 'remote' && !provider.apiKey) continue;
      if (provider.capabilities.includes(taskType)) {
        if (!cheapest || provider.costPerToken < cheapest.costPerToken) {
          cheapest = provider;
        }
      }
    }
    return cheapest;
  }

  getStats() {
    return { ...this.stats, providerCount: this.providers.size };
  }
}

module.exports = { UniversalLLMRouter };
