/**
 * DeepSeek Provider - Excellent for code and math
 * Free tier: 5M tokens one-time credit
 */

const BaseProvider = require('./BaseProvider');

class DeepSeekProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
    });

    this.defaultModels = ['deepseek-chat', 'deepseek-coder'];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const requestBody = {
      model: model || 'deepseek-chat',
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 4096,
      stream: stream || false,
    };

    return this.request('/chat/completions', requestBody, stream);
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
      requestsPerMinute: 60,
      tokensPerMinute: 200000,
    };
  }

  getCapabilities() {
    return {
      streaming: true,
      embeddings: false,
      functionCalling: true,
      vision: false,
      jsonMode: true,
      specializations: ['code', 'math'],
    };
  }
}

module.exports = DeepSeekProvider;
