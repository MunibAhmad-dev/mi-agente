'use strict';

/**
 * ToolHarness — Face 14: DeepSeek / Universal tool-use agentic loop.
 *
 * Wraps UniversalLLMRouter with a full tool-execution loop:
 *   1. Send messages + tool definitions to any provider
 *   2. If finishReason === 'tool_calls', execute each registered handler
 *   3. Append tool results as role:'tool' messages and loop
 *   4. Stop when the provider returns 'stop' or maxIterations is reached
 *
 * Works identically with DeepSeek, OpenAI, xAI, Ollama, and Anthropic —
 * tool_call normalization is handled by UniversalLLMRouter._normalizeToolCalls().
 */

const { UniversalLLMRouter } = require('./UniversalLLMRouter');

const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_TIMEOUT_MS = 120_000;

class ToolHarness {
  constructor(config = {}) {
    this.router = config.router || new UniversalLLMRouter(config);
    this.maxIterations = config.maxIterations || DEFAULT_MAX_ITERATIONS;
    this._handlers = new Map(); // name → async (args) => string|object
  }

  /**
   * Register a tool handler.
   * @param {string} name - must match the function name in the tool definitions
   * @param {function} handler - async (parsedArgs) => string|object
   */
  register(name, handler) {
    if (typeof handler !== 'function') throw new TypeError(`handler for '${name}' must be a function`);
    this._handlers.set(name, handler);
    return this;
  }

  /**
   * Run the agentic tool-use loop.
   *
   * @param {object[]} messages - initial conversation (system + user turns)
   * @param {object[]} tools    - OpenAI-format tool definitions
   * @param {object}   handlers - optional inline { name: async fn } map (merged with registered)
   * @param {object}   options  - forwarded to router.chat() (model, provider, temperature, …)
   * @returns {Promise<{ success, content, iterations, log, provider, usage, error? }>}
   */
  async run(messages, tools = [], handlers = {}, options = {}) {
    const mergedHandlers = new Map([...this._handlers, ...Object.entries(handlers)]);
    const history = [...messages];
    const log = [];
    const maxIter = options.maxIterations || this.maxIterations;

    for (let iteration = 1; iteration <= maxIter; iteration++) {
      let response;
      try {
        response = await this.router.chat(history, {
          ...options,
          tools: tools.length > 0 ? tools : undefined,
        });
      } catch (err) {
        return { success: false, error: err.message, iterations: iteration, log };
      }

      const entry = { iteration, finishReason: response.finishReason, content: response.content };
      log.push(entry);

      if (response.finishReason !== 'tool_calls' || !response.toolCalls?.length) {
        return {
          success: true,
          content: response.content,
          iterations: iteration,
          log,
          provider: response.provider,
          usage: response.usage,
        };
      }

      // Append assistant turn that requested tool calls
      history.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      // Execute each tool and feed the result back
      for (const tc of response.toolCalls) {
        const name = tc.function.name;
        const handler = mergedHandlers.get(name);
        let result;

        if (handler) {
          try {
            const args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function.arguments || {});
            result = await Promise.race([
              handler(args),
              new Promise((_, rej) => setTimeout(() => rej(new Error('Tool timeout')), DEFAULT_TIMEOUT_MS)),
            ]);
          } catch (err) {
            result = `Error executing ${name}: ${err.message}`;
          }
        } else {
          result = `Tool '${name}' is not registered in this harness.`;
        }

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: resultStr,
        });
        log.push({ iteration, toolCall: name, result: resultStr.slice(0, 300) });
      }
    }

    return {
      success: false,
      error: `Reached max iterations (${maxIter}) without a final answer.`,
      iterations: maxIter,
      log,
    };
  }

  /** Convenience: run with a single user message and no tools (plain chat). */
  async ask(message, options = {}) {
    return this.run([{ role: 'user', content: message }], [], {}, options);
  }

  getStats() {
    return this.router.stats;
  }
}

/**
 * BUILTIN_TOOLS — ready-to-use OpenAI-format tool definitions.
 * Pass any subset to ToolHarness.run() as the `tools` array.
 * Pair with matching handlers in the `handlers` argument.
 *
 * Example:
 *   const harness = new ToolHarness();
 *   const result = await harness.run(
 *     messages,
 *     [BUILTIN_TOOLS.web_search, BUILTIN_TOOLS.get_time],
 *     { web_search: mySearchFn, get_time: () => new Date().toISOString() },
 *   );
 */
const BUILTIN_TOOLS = {
  web_search: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web and return a list of relevant results with titles, URLs, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query.' },
          maxResults: { type: 'integer', description: 'Maximum number of results to return (default 5).', default: 5 },
        },
        required: ['query'],
      },
    },
  },

  read_file: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative file path to read.' },
        },
        required: ['path'],
      },
    },
  },

  write_file: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating it if it does not exist.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'File path to write.' },
          content: { type: 'string', description: 'Content to write to the file.' },
        },
        required: ['path', 'content'],
      },
    },
  },

  run_code: {
    type: 'function',
    function: {
      name: 'run_code',
      description: 'Execute a code snippet and return its stdout/stderr output.',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['python', 'javascript', 'bash'], description: 'Programming language.' },
          code:     { type: 'string', description: 'Code to execute.' },
        },
        required: ['language', 'code'],
      },
    },
  },

  get_time: {
    type: 'function',
    function: {
      name: 'get_time',
      description: 'Get the current UTC date and time as an ISO 8601 string.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  memory_recall: {
    type: 'function',
    function: {
      name: 'memory_recall',
      description: 'Search the agent\'s persistent memory for facts related to a query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look up in memory.' },
          limit: { type: 'integer', description: 'Max results to return (default 5).', default: 5 },
        },
        required: ['query'],
      },
    },
  },
};

/** Convenience: all builtin tool definitions as an array. */
const ALL_BUILTIN_TOOLS = Object.values(BUILTIN_TOOLS);

module.exports = { ToolHarness, BUILTIN_TOOLS, ALL_BUILTIN_TOOLS };
