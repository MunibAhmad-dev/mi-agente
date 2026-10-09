/**
 * OpenAI Provider — GPT-5.6 (Sol/Terra/Luna), o3, o4, GPT-4.1
 *
 * Uses the official OpenAI SDK (already a dependency).
 * Supports streaming, tool calling, reasoning modes, vision.
 */

const BaseProvider = require('./BaseProvider');
const OpenAI = require('openai');

const logger = require('../../../../utils/logger');

class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: 'openai',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      timeout: config.timeout || 180000,
      maxRetries: config.maxRetries || 2,
      ...config,
    });

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    });

    this.models = [
      'o3',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'o3',
      'o3-mini',
      'o4-mini',
      'gpt-4o',
      'gpt-4o-mini',
    ];

    this.capabilities = ['chat', 'code', 'reasoning', 'vision', 'tools', 'streaming'];

    logger.info('[OpenAIProvider] Initialized');
  }

  /**
   * Chat completion (non-streaming).
   */
  async chat(messages, options = {}) {
    const model = options.model || 'gpt-4o-mini';
    const body = {
      model,
      messages: this._normalizeMessages(messages),
      stream: false,
    };

    if (options.temperature != null) body.temperature = options.temperature;
    if (options.maxTokens != null) body.max_tokens = options.maxTokens;
    if (options.reasoning_effort) body.reasoning_effort = options.reasoning_effort;
    if (options.tools) body.tools = options.tools;
    if (options.tool_choice) body.tool_choice = options.tool_choice;
    if (options.response_format) body.response_format = options.response_format;
    if (options.seed != null) body.seed = options.seed;

    const startTime = Date.now();
    const response = await this.client.chat.completions.create(body);
    const latency = Date.now() - startTime;

    const choice = response.choices?.[0];

    return {
      content: choice?.message?.content || '',
      reasoningContent: choice?.message?.reasoning_content || null,
      model: response.model || model,
      provider: 'openai',
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : null,
      finishReason: choice?.finish_reason || 'stop',
      toolCalls: choice?.message?.tool_calls || null,
      latency,
    };
  }

  /**
   * Stream a chat completion.
   */
  async *streamChat(messages, options = {}) {
    const model = options.model || 'gpt-4o-mini';
    const body = {
      model,
      messages: this._normalizeMessages(messages),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options.temperature != null) body.temperature = options.temperature;
    if (options.maxTokens != null) body.max_tokens = options.maxTokens;
    if (options.reasoning_effort) body.reasoning_effort = options.reasoning_effort;
    if (options.tools) body.tools = options.tools;
    if (options.tool_choice) body.tool_choice = options.tool_choice;
    if (options.response_format) body.response_format = options.response_format;

    const stream = await this.client.chat.completions.create(body);

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;

      if (delta?.reasoning_content) {
        yield { type: 'reasoning', content: delta.reasoning_content };
      }
      if (delta?.content) {
        yield { type: 'delta', content: delta.content };
      }
      if (delta?.tool_calls) {
        yield { type: 'tool_calls', toolCalls: delta.tool_calls };
      }
      if (chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          },
        };
      }
    }
  }

  _normalizeMessages(messages) {
    if (!messages || !Array.isArray(messages)) return [];
    return messages.map((msg) => {
      if (typeof msg === 'string') return { role: 'user', content: msg };
      return { role: msg.role || 'user', content: msg.content || '' };
    });
  }

  getCapabilities() {
    return this.capabilities;
  }

  getModels() {
    return this.models;
  }
}

module.exports = OpenAIProvider;
