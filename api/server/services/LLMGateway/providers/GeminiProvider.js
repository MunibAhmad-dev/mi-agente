/** Google Gemini Provider - Best context window */
const BaseProvider = require('./BaseProvider');

class GeminiProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
    });

    this.defaultModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const requestBody = {
      contents,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: maxTokens || 4096,
      },
    };

    if (stream) {
      requestBody.generationConfig.responseModalities = ['TEXT'];
    }

    return this.request(
      `/models/${model || 'gemini-1.5-flash'}:generateContent`,
      requestBody,
      stream,
    );
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
      jsonMode: false,
      specializations: ['long_context', 'code', 'math'],
    };
  }
}

module.exports = GeminiProvider;
