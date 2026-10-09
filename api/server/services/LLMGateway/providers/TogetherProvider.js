/** Together AI Provider - Model variety */
const BaseProvider = require('./BaseProvider');

class TogetherProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'together',
      baseUrl: 'https://api.together.xyz/v1',
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
    });

    this.defaultModels = ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'];
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
      functionCalling: false,
      vision: false,
      jsonMode: true,
    };
  }
}

module.exports = TogetherProvider;
