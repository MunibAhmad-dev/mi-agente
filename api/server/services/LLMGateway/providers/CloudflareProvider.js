/**
 * Cloudflare Workers AI Provider - Serverless, global
 * Free tier: 10,000 requests/day
 */

const BaseProvider = require('./BaseProvider');

class CloudflareProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'cloudflare',
      baseUrl: 'https://api.cloudflare.com/client/v4/ai',
      apiKey: config.apiKey,
      accountId: config.accountId,
      timeout: config.timeout || 30000,
    });

    this.defaultModels = [
      '@cf/meta/llama-3.1-8b-instruct',
      '@cf/mistral/mistral-7b-instruct-v0.2',
      '@cf/google/gemma-2-2b-it',
    ];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const prompt = this.messagesToPrompt(messages);

    const requestBody = {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: stream || false,
      ...(temperature && { temperature }),
      ...(maxTokens && { max_tokens: maxTokens }),
    };

    return this.request(`/v1/run/${model}`, requestBody, stream);
  }

  messagesToPrompt(messages) {
    return messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getHeaders() {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  getRateLimit() {
    return {
      requestsPerDay: 10000,
    };
  }

  getCapabilities() {
    return {
      streaming: true,
      embeddings: false,
      functionCalling: false,
      vision: false,
      jsonMode: false,
    };
  }
}

module.exports = CloudflareProvider;
