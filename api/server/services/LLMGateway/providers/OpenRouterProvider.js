/** OpenRouter Provider - Multi-provider routing */
const BaseProvider = require('./BaseProvider');

class OpenRouterProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
    });

    this.defaultModels = [
      'anthropic/claude-3-haiku-20240307',
      'google/gemma-2-9b-it',
      'meta-llama/llama-3-8b-instruct',
    ];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const requestBody = {
      model: model || this.defaultModels[0],
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
      vision: true,
      jsonMode: true,
    };
  }
}

module.exports = OpenRouterProvider;
