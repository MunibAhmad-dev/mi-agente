/**
 * Claude API Service (Enhanced)
 * =============================
 *
 * Servicio mejorado para integrar con Claude API.
 * Incluye:
 * - Streaming responses
 * - Tool use / Function calling
 * - Better error handling
 * - Rate limiting
 * - Token tracking
 *
 * Autor: Mi LibreChat
 * Version: 1.1.0
 */

const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLAUDE_API_BASE = 'https://api.anthropic.com/v1';
const CLAUDE_API_VERSION = '2023-06-01';

class ClaudeConfig {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || null;
    this.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS || '8192', 10);
    this.timeout = parseInt(process.env.CLAUDE_TIMEOUT || '120000', 10);
    this.defaultModel = process.env.CLAUDE_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022';
    this.defaultTemperature = parseFloat(process.env.CLAUDE_TEMPERATURE || '1.0');

    // Rate limiting
    this.rateLimit = {
      requestsPerMinute: parseInt(process.env.CLAUDE_RPM || '50', 10),
      tokensPerMinute: parseInt(process.env.CLAUDE_TPM || '100000', 10),
    };

    // Cache
    this.cacheEnabled = process.env.CLAUDE_CACHE_ENABLED === 'true';
    this.cacheTTL = parseInt(process.env.CLAUDE_CACHE_TTL || '3600', 10);
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': CLAUDE_API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  isConfigured() {
    return !!this.apiKey;
  }
}

const config = new ClaudeConfig();

// In-memory rate limiter
const rateLimiter = {
  requests: [],
  tokens: [],

  canMakeRequest() {
    this.cleanup();
    return this.requests.length < config.rateLimit.requestsPerMinute;
  },

  canUseTokens(count) {
    this.cleanupTokens();
    const used = this.tokens.reduce((sum, t) => sum + t, 0);
    return used + count <= config.rateLimit.tokensPerMinute;
  },

  recordRequest(tokenCount = 0) {
    this.requests.push(Date.now());
    if (tokenCount > 0) {
      this.tokens.push(tokenCount);
    }
  },

  cleanup() {
    const minuteAgo = Date.now() - 60000;
    this.requests = this.requests.filter((t) => t > minuteAgo);
  },

  cleanupTokens() {
    const minuteAgo = Date.now() - 60000;
    this.tokens = this.tokens.filter((t) => t > minuteAgo);
  },
};

// ============================================================================
// HTTP CLIENT
// ============================================================================

async function claudeRequest(endpoint, data, options = {}) {
  if (!config.isConfigured()) {
    throw new Error('Claude API key not configured');
  }

  // Check rate limits
  if (options.checkRateLimit !== false) {
    if (!rateLimiter.canMakeRequest()) {
      throw new Error('Rate limit exceeded. Please wait before making more requests.');
    }
  }

  const startTime = Date.now();

  try {
    const response = await axios({
      url: `${CLAUDE_API_BASE}${endpoint}`,
      method: 'POST',
      headers: config.getHeaders(),
      data,
      timeout: config.timeout,
      responseType: options.stream ? 'stream' : 'json',
    });

    const duration = Date.now() - startTime;

    // Record usage
    const inputTokens = data.messages?.reduce((sum, m) => sum + estimateTokens(m.content), 0) || 0;
    const outputTokens = estimateTokens(response.data?.content);
    rateLimiter.recordRequest(outputTokens);

    logger.info(`[Claude] ${endpoint} - ${duration}ms - in:${inputTokens} out:${outputTokens}`);

    return {
      ok: true,
      data: response.data,
      status: response.status,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(`[Claude] Request failed: ${endpoint}`, {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
      duration,
    });

    return {
      ok: false,
      error: parseError(error),
      status: error.response?.status || 500,
      duration,
    };
  }
}

function parseError(error) {
  if (error.response?.data?.error) {
    const { type, message } = error.response.data.error;
    return { type, message };
  }
  return { type: 'unknown', message: error.message };
}

// ============================================================================
// MESSAGE CREATION
// ============================================================================

/**
 * Crea un mensaje simple
 */
async function createMessage({ model, messages, system, maxTokens, temperature, stream = false }) {
  const payload = {
    model: model || config.defaultModel,
    messages: formatMessages(messages),
    max_tokens: maxTokens || config.maxTokens,
    temperature: temperature ?? config.defaultTemperature,
    stream,
  };

  if (system) {
    payload.system = system;
  }

  return claudeRequest('/messages', payload);
}

/**
 * Crea un mensaje con tools (function calling)
 */
async function createMessageWithTools({
  model,
  messages,
  tools,
  system,
  maxTokens,
  temperature,
  stream = false,
}) {
  const payload = {
    model: model || config.defaultModel,
    messages: formatMessages(messages),
    max_tokens: maxTokens || config.maxTokens,
    temperature: temperature ?? config.defaultTemperature,
    stream,
    tools: tools.map(formatTool),
  };

  if (system) {
    payload.system = system;
  }

  return claudeRequest('/messages', payload);
}

/**
 * Crea un mensaje con streaming
 */
async function createStreamingMessage({
  model,
  messages,
  system,
  maxTokens,
  temperature,
  onChunk,
  onComplete,
  onError,
}) {
  const payload = {
    model: model || config.defaultModel,
    messages: formatMessages(messages),
    max_tokens: maxTokens || config.maxTokens,
    temperature: temperature ?? config.defaultTemperature,
    stream: true,
  };

  if (system) {
    payload.system = system;
  }

  if (!config.isConfigured()) {
    onError?.('Claude API key not configured');
    return;
  }

  try {
    const response = await axios({
      url: `${CLAUDE_API_BASE}/messages`,
      method: 'POST',
      headers: config.getHeaders(),
      data: payload,
      responseType: 'stream',
      timeout: config.timeout,
    });

    let fullContent = '';
    let toolUses = [];
    let usage = null;

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data.trim() === '') continue;

        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case 'content_block_start':
              if (event.content_block?.type === 'tool_use') {
                toolUses.push({
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: '',
                });
              }
              break;

            case 'content_block_delta':
              if (event.delta?.type === 'text_delta') {
                fullContent += event.delta.text;
                onChunk?.(event.delta.text, 'text');
              } else if (event.delta?.type === 'input_json_delta') {
                if (toolUses.length > 0) {
                  toolUses[toolUses.length - 1].input += event.delta.partial_json;
                }
              }
              break;

            case 'message_delta':
              if (event.usage) {
                usage = event.usage;
              }
              break;

            case 'message_stop':
              onComplete?.({
                content: fullContent,
                toolUses,
                usage,
              });
              break;
          }
        } catch (e) {
          // Ignore parse errors for incomplete JSON
        }
      }
    });

    response.data.on('error', (error) => {
      onError?.(error.message);
    });
  } catch (error) {
    onError?.(parseError(error).message);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatMessages(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: Array.isArray(msg.content)
      ? msg.content.map((c) => {
          if (typeof c === 'string') {
            return { type: 'text', text: c };
          }
          return c;
        })
      : msg.content,
  }));
}

function formatTool(tool) {
  // Claude format
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema || tool.parameters || { type: 'object' },
  };
}

function estimateTokens(content) {
  if (!content) return 0;

  // Rough estimate: ~4 chars per token
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }

  if (Array.isArray(content)) {
    return content.reduce((sum, c) => sum + estimateTokens(c.text || c.content || ''), 0);
  }

  return 0;
}

// ============================================================================
// PRESET PROMPTS
// ============================================================================

const PRESET_PROMPTS = {
  codeAssistant: {
    system: `You are an expert programming assistant. You excel at:
- Writing clean, efficient, well-documented code
- Following best practices and design patterns
- Explaining complex concepts clearly
- Debugging and fixing issues
- Writing tests and documentation

Always provide code examples when relevant.`,
  },

  technicalWriter: {
    system: `You are a technical writer. You specialize in:
- Writing clear, concise documentation
- Creating API references and guides
- Explaining technical concepts for different audiences
- Formatting content for readability
- Creating examples and tutorials`,
  },

  securityAuditor: {
    system: `You are a security expert. You analyze code for:
- SQL injection vulnerabilities
- XSS (Cross-Site Scripting)
- Authentication issues
- Authorization flaws
- Data exposure risks
- Cryptographic weaknesses

Provide specific examples of vulnerabilities found and recommended fixes.`,
  },

  codeReviewer: {
    system: `You are a senior code reviewer. You evaluate:
- Code quality and maintainability
- Performance considerations
- Error handling
- Testing coverage
- Adherence to best practices
- Potential bugs or edge cases

Provide actionable feedback with specific line references when possible.`,
  },

  dataAnalyst: {
    system: `You are a data analyst. You can:
- Analyze datasets and summarize findings
- Create visualizations descriptions
- Perform statistical analysis
- Generate insights from data
- Write data processing pipelines
- Create reports and dashboards`,
  },

  apiDesigner: {
    system: `You are an API design expert. You specialize in:
- RESTful API design
- GraphQL schema design
- API versioning strategies
- Authentication/authorization patterns
- Error handling conventions
- Documentation standards

Create comprehensive, developer-friendly APIs.`,
  },
};

function getPresetPrompt(name) {
  return PRESET_PROMPTS[name] || null;
}

function getAllPresetPrompts() {
  return PRESET_PROMPTS;
}

// ============================================================================
// CONVERSATION MANAGEMENT
// ============================================================================

class ConversationManager {
  constructor() {
    this.conversations = new Map();
  }

  createConversation(userId, options = {}) {
    const id = this.generateId();
    const conversation = {
      id,
      userId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        model: options.model || config.defaultModel,
        system: options.system || null,
        temperature: options.temperature ?? config.defaultTemperature,
        maxTokens: options.maxTokens || config.maxTokens,
      },
    };

    this.conversations.set(id, conversation);
    return conversation;
  }

  getConversation(id) {
    return this.conversations.get(id);
  }

  addMessage(conversationId, message) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.messages.push({
      ...message,
      timestamp: new Date(),
    });
    conversation.updatedAt = new Date();

    return conversation;
  }

  deleteConversation(id) {
    return this.conversations.delete(id);
  }

  listConversations(userId) {
    return Array.from(this.conversations.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  generateId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

const conversationManager = new ConversationManager();

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Configuration
  config,
  ClaudeConfig,

  // Core API
  createMessage,
  createMessageWithTools,
  createStreamingMessage,

  // Helpers
  formatMessages,
  formatTool,
  estimateTokens,

  // Presets
  getPresetPrompt,
  getAllPresetPrompts,

  // Conversations
  conversationManager,

  // Rate limiter
  rateLimiter,

  // Constants
  CLAUDE_API_BASE,
  CLAUDE_API_VERSION,
};
