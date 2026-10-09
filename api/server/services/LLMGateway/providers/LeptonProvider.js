/** Lepton AI Provider - Simple API */
const BaseProvider = require('./BaseProvider');

class LeptonProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'lepton',
      baseUrl: 'https://api.lepton.ai/v1',
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
    });

    this.defaultModels = ['llama-3.1-405b', 'llama-3.1-70b', 'qwen2.5-72b'];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const requestBody = {
      model: model || 'llama-3.1-70b',
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
      embeddings: false,
      functionCalling: false,
      vision: false,
      jsonMode: true,
    };
  }
}

module.exports = LeptonProvider;
