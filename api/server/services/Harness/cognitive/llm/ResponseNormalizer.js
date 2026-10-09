'use strict';

/**
 * ResponseNormalizer - Converts ANY LLM response format to a standard format.
 *
 * Handles:
 *   - OpenAI format: { choices: [{ message: { content, tool_calls } }] }
 *   - Ollama format: { message: { content, tool_calls } }
 *   - Anthropic format: { content: [{ type: 'text'|'tool_use', text, name, input }] }
 *   - DeepSeek format: same as OpenAI but with thinking tokens
 *   - xAI/Grok format: same as OpenAI
 *   - llama.cpp format: { choices: [{ message: { content } }] }
 *   - GPT4All format: same as OpenAI
 *   - Any OpenAI-compatible format
 *
 * Output: { type: 'final'|'tool_calls', content, toolCalls }
 */
class ResponseNormalizer {
  /**
   * Normalize any LLM response into a standard format.
   *
   * @param {object} response - Raw response from any LLM provider
   * @param {string} providerId - Provider identifier ('ollama', 'openai', etc.)
   * @returns {object} - { type: 'final'|'tool_calls', content: string, toolCalls: array|null }
   */
  static normalize(response, providerId = 'unknown') {
    if (!response) {
      return { type: 'final', content: 'Empty response from LLM.', toolCalls: null };
    }

    // Try provider-specific normalization first
    switch (providerId) {
      case 'ollama':
        return ResponseNormalizer._normalizeOllama(response);
      case 'anthropic':
        return ResponseNormalizer._normalizeAnthropic(response);
      case 'openai':
      case 'xai':
      case 'deepseek':
      case 'lmstudio':
      case 'llamacpp':
      case 'gpt4all':
      default:
        return ResponseNormalizer._normalizeOpenAI(response);
    }
  }

  /**
   * Normalize Ollama response.
   * Ollama returns: { message: { role, content, tool_calls?: [...] }, done, ... }
   * tool_calls format: [{ function: { name, arguments } }]
   */
  static _normalizeOllama(response) {
    const message = response.message || {};

    // Extract tool calls
    const rawToolCalls = message.tool_calls || [];
    const toolCalls = ResponseNormalizer._normalizeToolCallArray(rawToolCalls);

    if (toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        content: message.content || '',
        toolCalls,
      };
    }

    return {
      type: 'final',
      content: message.content || '',
      toolCalls: null,
    };
  }

  /**
   * Normalize Anthropic response.
   * Anthropic returns: { content: [{ type: 'text'|'tool_use', text?, name?, input? }], stop_reason }
   */
  static _normalizeAnthropic(response) {
    const content = response.content || [];
    const textParts = [];
    const toolCalls = [];

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || `call_${Date.now()}_${toolCalls.length}`,
          function: {
            name: block.name,
            arguments: typeof block.input === 'string'
              ? block.input
              : JSON.stringify(block.input || {}),
          },
        });
      }
    }

    if (toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        content: textParts.join('\n'),
        toolCalls,
      };
    }

    return {
      type: 'final',
      content: textParts.join('\n') || '',
      toolCalls: null,
    };
  }

  /**
   * Normalize OpenAI-compatible response.
   * OpenAI/DeepSeek/xAI returns: { choices: [{ message: { content, tool_calls } }] }
   */
  static _normalizeOpenAI(response) {
    const choice = response.choices?.[0] || {};
    const message = choice.message || {};

    // Extract tool calls
    const rawToolCalls = message.tool_calls || [];
    const toolCalls = ResponseNormalizer._normalizeToolCallArray(rawToolCalls);

    if (toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        content: message.content || '',
        toolCalls,
      };
    }

    return {
      type: 'final',
      content: message.content || response.content?.[0]?.text || '',
      toolCalls: null,
    };
  }

  /**
   * Normalize an array of tool calls from any format.
   * Handles:
   *   - OpenAI: [{ id, function: { name, arguments } }]
   *   - Ollama: [{ function: { name, arguments } }] or [{ name, arguments }]
   *   - Flat: [{ name, arguments }]
   */
  static _normalizeToolCallArray(rawToolCalls) {
    if (!Array.isArray(rawToolCalls) || rawToolCalls.length === 0) return [];

    return rawToolCalls.map((tc, index) => {
      // Already in OpenAI format: { id, function: { name, arguments } }
      if (tc.function && tc.function.name) {
        return {
          id: tc.id || `call_${Date.now()}_${index}`,
          name: tc.function.name,
          arguments: ResponseNormalizer._parseArguments(tc.function.arguments),
        };
      }

      // Flat format: { name, arguments }
      if (tc.name) {
        return {
          id: tc.id || `call_${Date.now()}_${index}`,
          name: tc.name,
          arguments: ResponseNormalizer._parseArguments(tc.arguments),
        };
      }

      // Unknown format — skip
      return null;
    }).filter(Boolean);
  }

  /**
   * Parse tool call arguments from any format (string, object, etc.)
   */
  static _parseArguments(args) {
    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch {
        return { input: args };
      }
    }
    if (typeof args === 'object' && args !== null) {
      return args;
    }
    return {};
  }
}

module.exports = { ResponseNormalizer };
