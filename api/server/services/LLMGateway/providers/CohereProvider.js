/** Cohere Provider - Specialized for RAG */
const BaseProvider = require('./BaseProvider');

class CohereProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'cohere',
      baseUrl: 'https://api.cohere.ai/v1',
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
    });

    this.defaultModels = ['command-r-plus', 'command-r', 'command'];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const requestBody = {
      model: model || 'command-r-plus',
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 4096,
      stream: stream || false,
    };

    return this.request('/chat', requestBody, stream);
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
      specializations: ['rag', 'reranking'],
    };
  }
}

module.exports = CohereProvider;
