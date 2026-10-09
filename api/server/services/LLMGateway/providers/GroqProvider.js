/**
 * Groq Provider - High-speed LLM inference
 * Free tier: ~14,400 requests/day, 30 RPM
 */

const BaseProvider = require('./BaseProvider');

class GroqProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
    });

    this.defaultModels = ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const requestBody = {
      model: model || 'llama-3.3-70b-versatile',
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 4096,
      stream: stream || false,
    };

    return this.request('/chat/completions', requestBody, stream);
  }

  async embeddings({ input, model = 'llama-3.3-70b-versatile' }) {
    return this.request('/embeddings', { input, model });
  }

  async healthCheck() {
    try {
      await this.request('/models');
      return true;
    } catch {
      return false;
    }
  }

  getRateLimit() {
    return {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
    };
  }

  getCapabilities() {
    return {
      streaming: true,
      embeddings: true,
      functionCalling: true,
      vision: false,
      jsonMode: true,
    };
  }
}

module.exports = GroqProvider;
