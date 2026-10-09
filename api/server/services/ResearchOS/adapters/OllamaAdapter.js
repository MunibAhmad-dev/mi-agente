'use strict';

/**
 * OllamaAdapter — Face 10.
 * Wires the Ollama LLM backbone into the ResearchOS orchestrator.
 * Provides a unified LLM interface compatible with ResearchOrchestrator.
 */

const axios = require('axios');

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_URL = process.env.OLLAMA_HOST || 'http://localhost:11434';

class OllamaAdapter {
  constructor({ model = DEFAULT_MODEL, baseUrl = DEFAULT_URL, timeout = 120000 } = {}) {
    this.model = model;
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.provider = 'ollama';
  }

  async generate(prompt, opts = {}) {
    const resp = await axios.post(
      `${this.baseUrl}/api/generate`,
      {
        model: opts.model || this.model,
        prompt,
        stream: false,
        options: {
          temperature: opts.temperature || 0.7,
          num_predict: opts.max_tokens || 2048,
        },
      },
      { timeout: this.timeout },
    );
    return {
      text: resp.data.response,
      model: resp.data.model,
      done: resp.data.done,
      prompt_eval_count: resp.data.prompt_eval_count,
      eval_count: resp.data.eval_count,
    };
  }

  async chat(messages, opts = {}) {
    const resp = await axios.post(
      `${this.baseUrl}/api/chat`,
      {
        model: opts.model || this.model,
        messages,
        stream: false,
        options: { temperature: opts.temperature || 0.7 },
      },
      { timeout: this.timeout },
    );
    return {
      text: resp.data.message?.content || '',
      role: resp.data.message?.role || 'assistant',
      model: resp.data.model,
    };
  }

  async embeddings(text, opts = {}) {
    const resp = await axios.post(
      `${this.baseUrl}/api/embeddings`,
      { model: opts.model || this.model, prompt: text },
      { timeout: 30000 },
    );
    return { embeddings: resp.data.embedding, model: resp.data.model };
  }

  async listModels() {
    const resp = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 10000 });
    return resp.data.models || [];
  }

  async isAvailable() {
    try {
      await axios.get(`${this.baseUrl}/api/version`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async isModelAvailable(model) {
    try {
      const models = await this.listModels();
      return models.some((m) => m.name === model || m.name.startsWith(model));
    } catch {
      return false;
    }
  }
}

let _instance = null;
function getOllamaAdapter(opts) {
  if (!_instance) _instance = new OllamaAdapter(opts);
  return _instance;
}

module.exports = { OllamaAdapter, getOllamaAdapter };
