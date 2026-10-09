/** Anthropic Provider - Claude models */
const BaseProvider = require('./BaseProvider');

class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: config.apiKey,
      timeout: config.timeout || 120000,
    });

    this.defaultModels = ['claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307'];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    // Extract system message
    let system = '';
    const chatMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else {
        chatMessages.push(msg);
      }
    }

    const requestBody = {
      model: model || 'claude-3-5-sonnet-20240620',
      messages: chatMessages,
      ...(system && { system }),
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 4096,
      stream: stream || false,
    };

    return this.request('/messages', requestBody, stream);
  }

  async healthCheck() {
    try {
      await fetch(`${this.config.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  getHeaders() {
    return {
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }

  getCapabilities() {
    return {
      streaming: true,
      embeddings: false,
      functionCalling: true,
      vision: true,
      jsonMode: true,
      specializations: ['reasoning', 'code', 'analysis'],
    };
  }
}

module.exports = AnthropicProvider;
