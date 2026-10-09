/** HuggingFace Provider - Inference API */
const BaseProvider = require('./BaseProvider');

class HuggingFaceProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'huggingface',
      baseUrl: 'https://api-inference.huggingface.co/models',
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
    });
  }

  async complete({ model, messages, temperature, maxTokens, stream }) {
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const requestBody = {
      inputs: prompt,
      parameters: {
        temperature: temperature ?? 0.7,
        max_new_tokens: maxTokens || 512,
        return_full_text: false,
      },
    };

    if (stream) {
      requestBody.parameters.stream = true;
    }

    return this.request(`/${model}`, requestBody, stream);
  }

  async healthCheck() {
    try {
      await this.request('/meta-llama/Llama-3.1-8B-Instruct', { inputs: 'test' });
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
    };
  }
}

module.exports = HuggingFaceProvider;
