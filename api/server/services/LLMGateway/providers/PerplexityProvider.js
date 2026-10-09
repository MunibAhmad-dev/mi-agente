/** Perplexity Provider - Search-focused */
const BaseProvider = require('./BaseProvider');

class PerplexityProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'perplexity',
      baseUrl: 'https://api.perplexity.ai',
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
    });

    this.defaultModels = ['sonar', 'sonar-pro', 'sonar-reasoning'];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const requestBody = {
      model: model || 'sonar',
      messages,
      temperature: temperature ?? 0.2,
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
      embeddings: false,
      functionCalling: false,
      vision: false,
      jsonMode: false,
      specializations: ['web_search', 'factual'],
    };
  }
}

module.exports = PerplexityProvider;
