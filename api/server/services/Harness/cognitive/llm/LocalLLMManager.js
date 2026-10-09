'use strict';

const http = require('http');

/**
 * LocalLLMManager - Manages local LLM processes.
 * Auto-detects Ollama, llama.cpp, GPT4All, LM Studio.
 * Manages lifecycle: detect → start → health check → stop.
 */
class LocalLLMManager {
  constructor(config = {}) {
    this.config = {
      ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
      lmStudioUrl: config.lmStudioUrl || 'http://localhost:1234',
      llamaCppUrl: config.llamaCppUrl || 'http://localhost:8080',
      gpt4allUrl: config.gpt4allUrl || 'http://localhost:4891',
      healthCheckInterval: config.healthCheckInterval || 30000,
      ...config,
    };
    this.providers = {};
    this.stats = { checks: 0, available: 0, models: 0 };
  }

  /**
   * Detect all available local providers.
   */
  async detectAll() {
    const results = {};

    // Check Ollama
    results.ollama = await this._checkProvider('ollama', this.config.ollamaUrl + '/api/tags');

    // Check LM Studio
    results.lmstudio = await this._checkProvider('lmstudio', this.config.lmStudioUrl + '/v1/models');

    // Check llama.cpp
    results.llamacpp = await this._checkProvider('llamacpp', this.config.llamaCppUrl + '/v1/models');

    // Check GPT4All
    results.gpt4all = await this._checkProvider('gpt4all', this.config.gpt4allUrl + '/v1/models');

    this.providers = results;
    this.stats.checks++;

    return results;
  }

  async _checkProvider(id, url) {
    try {
      const data = await this._httpGet(url, 3000);
      const models = this._extractModels(id, data);
      this.stats.models += models.length;
      return { available: true, models, url };
    } catch {
      return { available: false, models: [], url };
    }
  }

  _extractModels(providerId, data) {
    if (providerId === 'ollama' && data?.models) {
      return data.models.map(m => ({
        name: m.name,
        size: m.size,
        sizeGB: (m.size / (1024 * 1024 * 1024)).toFixed(1) + 'GB',
        family: m.details?.family || 'unknown',
        quantization: m.details?.quantization_level || 'unknown',
      }));
    }

    // OpenAI-compatible format (LM Studio, llama.cpp, GPT4All)
    if (data?.data) {
      return data.data.map(m => ({
        name: m.id || m.name,
        size: m.size || 0,
        owner: m.owned_by || 'unknown',
      }));
    }

    return [];
  }

  /**
   * List all available models across all providers.
   */
  listModels() {
    const models = [];
    for (const [providerId, provider] of Object.entries(this.providers)) {
      if (!provider.available) continue;
      for (const model of provider.models) {
        models.push({ ...model, provider: providerId, url: provider.url });
      }
    }
    return models;
  }

  /**
   * Get the best local model for a task.
   */
  getBestModel(taskType = 'chat') {
    const allModels = this.listModels();
    if (allModels.length === 0) return null;

    // Preference order by task
    const preferences = {
      coding: ['codellama', 'deepseek-coder', 'qwen2.5-coder', 'llama3.1'],
      chat: ['llama3.1', 'qwen2.5', 'mistral', 'gemma2'],
      research: ['deepseek-r1', 'qwen2.5', 'llama3.1'],
      creative: ['llama3.1', 'mistral', 'gemma2'],
    };

    const prefs = preferences[taskType] || preferences.chat;

    for (const pref of prefs) {
      const match = allModels.find(m => m.name.toLowerCase().includes(pref.toLowerCase()));
      if (match) return match;
    }

    return allModels[0]; // Fallback to first available
  }

  /**
   * Pull a model in Ollama.
   */
  async pullModel(modelName) {
    try {
      const data = await this._httpPost(this.config.ollamaUrl + '/api/pull', {
        name: modelName,
      });
      return { success: true, status: data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get Ollama model info.
   */
  async getModelInfo(modelName) {
    try {
      return await this._httpPost(this.config.ollamaUrl + '/api/show', {
        name: modelName,
      });
    } catch {
      return null;
    }
  }

  /**
   * Delete an Ollama model.
   */
  async deleteModel(modelName) {
    try {
      await this._httpPost(this.config.ollamaUrl + '/api/delete', {
        name: modelName,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Health check for all providers.
   */
  async healthCheck() {
    const results = {};
    for (const [id, provider] of Object.entries(this.providers)) {
      if (!provider.available) { results[id] = false; continue; }
      try {
        await this._httpGet(provider.url, 3000);
        results[id] = true;
      } catch {
        results[id] = false;
      }
    }
    return results;
  }

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

  _httpPost(url, body, timeout = 60000) {
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

  getStats() {
    return {
      ...this.stats,
      providers: Object.entries(this.providers).map(([id, p]) => ({
        id, available: p.available, modelCount: p.models.length,
      })),
    };
  }
}

module.exports = { LocalLLMManager };
