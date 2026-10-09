/**
 * Mistral AI Provider - European, open-source models
 * Free tier: ~1B tokens/month
 */

const BaseProvider = require('./BaseProvider');

class MistralProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
    });

    this.defaultModels = ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const requestBody = {
      model: model || 'mistral-small-latest',
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

module.exports = MistralProvider;
