/**
 * xAI Provider — Grok 4.5/4.6, Grok 3
 *
 * xAI API is OpenAI-compatible, so we use the OpenAI SDK with a custom baseURL.
 * Supports streaming, tool calling, Think mode, DeepSearch.
 */

const BaseProvider = require('./BaseProvider');
const OpenAI = require('openai');

const logger = require('../../../../utils/logger');

const XAI_BASE_URL = 'https://api.x.ai/v1';

class XAIProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: 'xai',
      baseUrl: config.baseUrl || XAI_BASE_URL,
      apiKey: config.apiKey || process.env.XAI_API_KEY,
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
      'grok-4-0709',
      'grok-4-0709-fast',
      'grok-4.5',
      'grok-3',
      'grok-3-mini',
    ];

    this.capabilities = ['chat', 'code', 'reasoning', 'vision', 'tools', 'streaming', 'deepsearch'];

    logger.info('[XAIProvider] Initialized');
  }

  /**
   * Chat completion (non-streaming).
   */
  async chat(messages, options = {}) {
    const model = options.model || 'grok-4-0709-fast';
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

    // Grok-specific: search parameters for DeepSearch
    if (options.search_parameters) {
      body.search_parameters = options.search_parameters;
    }

    const startTime = Date.now();
    const response = await this.client.chat.completions.create(body);
    const latency = Date.now() - startTime;

    const choice = response.choices?.[0];

    return {
      content: choice?.message?.content || '',
      reasoningContent: choice?.message?.reasoning_content || null,
      model: response.model || model,
      provider: 'xai',
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
    const model = options.model || 'grok-4-0709-fast';
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
    if (options.search_parameters) body.search_parameters = options.search_parameters;

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

  /**
   * DeepSearch — Grok's built-in web research.
   */
  async deepSearch(query, options = {}) {
    return this.chat(
      [
        {
          role: 'system',
          content:
            'You are a research assistant. Use web search to find comprehensive information. Cite your sources.',
        },
        { role: 'user', content: query },
      ],
      {
        model: options.model || 'grok-4-0709',
        reasoning_effort: 'high',
        search_parameters: { mode: 'on', return_citations: true },
      },
    );
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

module.exports = XAIProvider;
