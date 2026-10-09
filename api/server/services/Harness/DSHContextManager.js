/**
 * DSHContextManager — Manages context window, token limits, message building,
 * and memory integration.
 *
 * Responsibilities:
 * - Build context messages for each agent phase
 * - Manage context window limits per model
 * - Auto-summarize when approaching limits (not just truncate)
 * - Include relevant tool results
 * - Integrate with MemoryManager for task/project/error context
 * - Prevent context pollution
 * - Smart selection of most relevant messages
 *
 * Goal: Maximize USEFUL_INFO / TOKENS, minimize NOISE / TOKENS
 */

const logger = {
  debug: (...args) => console.log('[DSHContextManager]', ...args),
  info: (...args) => console.info('[DSHContextManager]', ...args),
  warn: (...args) => console.warn('[DSHContextManager]', ...args),
  error: (...args) => console.error('[DSHContextManager]', ...args),
};

/**
 * Context window sizes per model (tokens).
 */
const CONTEXT_WINDOWS = {
  'o3': 1050000,
  'gpt-4o': 512000,
  'gpt-4o-mini': 256000,
  'gpt-4.1': 1048576,
  'gpt-4.1-mini': 1048576,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'o3': 200000,
  'o3-mini': 200000,
  'o4-mini': 200000,
  'grok-4-0709': 500000,
  'grok-4-0709-fast': 131072,
  'grok-4.5': 131072,
  'grok-3': 131072,
  'grok-3-mini': 131072,
  'deepseek-chat': 128000,
  'deepseek-coder': 128000,
  default: 128000,
};

/**
 * DSHContextManager — context management for agent runs.
 */
class DSHContextManager {
  constructor(config = {}) {
    this.config = {
      reservedTokens: config.reservedTokens || 8192,
      summaryThreshold: config.summaryThreshold || 0.8,
      maxToolResultTokens: config.maxToolResultTokens || 4096,
      enableAutoSummarize: config.enableAutoSummarize !== false,
      maxToolResultsInContext: config.maxToolResultsInContext || 5,
      maxHistoryInContext: config.maxHistoryInContext || 15,
      ...config,
    };

    // Optional MemoryManager reference (set via setMemoryManager)
    this._memoryManager = null;

    // Summarization cache (avoid re-summarizing same content)
    this._summaryCache = new Map();
  }

  /**
   * Set the MemoryManager for context enrichment.
   */
  setMemoryManager(memoryManager) {
    this._memoryManager = memoryManager;
  }

  // ============================================================
  // PHASE BUILDERS
  // ============================================================

  /**
   * Build messages for the UNDERSTAND phase.
   */
  buildUnderstandingMessages(params, state) {
    const systemParts = [
      'You are an AI agent analyzing a task to understand what needs to be done.',
      '',
      'Given the task, provide:',
      '1. A clear analysis of what is being asked',
      '2. What capabilities are needed (code, search, filesystem, git, browser, etc.)',
      '3. Potential challenges or considerations',
      '4. A brief summary of the approach',
      '',
      'Be concise and structured.',
    ];

    // Inject project memory context
    const memoryContext = this._getMemoryContext(params);
    if (memoryContext) {
      systemParts.push('', '## Project Knowledge', memoryContext);
    }

    const messages = [
      { role: 'system', content: systemParts.join('\n') },
      { role: 'user', content: `Task: ${params.task}` },
    ];

    if (params.context) {
      messages.push({
        role: 'user',
        content: `Additional context: ${typeof params.context === 'string' ? params.context : JSON.stringify(params.context)}`,
      });
    }

    return this._fitToContextWindow(messages, params.model);
  }

  /**
   * Build messages for the PLAN phase.
   */
  buildPlanningMessages(understanding, params, state) {
    const systemParts = [
      'You are an AI agent creating a step-by-step plan to accomplish a task.',
      '',
      'Based on the analysis, create a concrete plan with numbered steps.',
      'Each step should be specific and actionable.',
      'Include which tools/capabilities each step needs.',
      '',
      'Respond with a JSON array of steps:',
      '[{"step": 1, "description": "...", "capability": "code|search|filesystem|git|browser|general"}]',
    ];

    // Inject error memory for self-healing awareness
    const errorContext = this._getErrorMemoryContext(params.task);
    if (errorContext) {
      systemParts.push('', '## Known Past Errors (avoid these)', errorContext);
    }

    const messages = [
      { role: 'system', content: systemParts.join('\n') },
      { role: 'user', content: `Analysis: ${understanding.analysis}\n\nOriginal task: ${params.task}` },
    ];

    return this._fitToContextWindow(messages, params.model);
  }

  /**
   * Build messages for the EXECUTE phase.
   */
  buildExecutionMessages(plan, currentStep, state, availableTools, params) {
    const systemParts = [
      'You are an AI agent executing a step in a plan.',
      '',
      `Current step: ${currentStep?.description || 'Execute the task'}`,
      `Step ${state.iterations} of ${plan.steps.length}`,
      '',
      'Use the available tools to complete this step.',
      'If you need to call a tool, respond with a tool_call.',
      'If the step is complete with just text, respond with the result.',
      '',
      'Available tools: ' + availableTools.map((t) => t.definition.function.name).join(', '),
    ];

    // Inject task memory context
    const taskContext = this._getTaskMemoryContext();
    if (taskContext) {
      systemParts.push('', '## Task Progress', taskContext);
    }

    const messages = [
      { role: 'system', content: systemParts.join('\n') },
      { role: 'user', content: `Plan: ${plan.originalTask}` },
    ];

    // Add previous tool call results (smart selection: most relevant + recent)
    if (state.toolCalls.length > 0) {
      const relevantCalls = this._selectRelevantToolCalls(
        state.toolCalls,
        currentStep?.capability || 'general',
      );
      for (const call of relevantCalls) {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: call.id || 'call_' + Math.random().toString(36).slice(2),
              type: 'function',
              function: {
                name: call.function?.name || call.name || 'unknown',
                arguments: call.function?.arguments || '{}',
              },
            },
          ],
        });
        // Truncate large tool results
        const resultStr = this._truncateToolResult(
          JSON.stringify(call.result || call),
          this.config.maxToolResultTokens,
        );
        messages.push({ role: 'tool', content: resultStr });
      }
    }

    // Add conversation history (smart selection)
    if (params.messages && params.messages.length > 0) {
      const relevantHistory = this._selectRelevantHistory(
        params.messages,
        params.task || plan.originalTask,
      );
      messages.push(...relevantHistory);
    }

    // Add replan context if available
    if (plan.replanHistory && plan.replanHistory.length > 0) {
      const lastReplan = plan.replanHistory[plan.replanHistory.length - 1];
      messages.push({
        role: 'system',
        content: `[Replan #${plan.replanCount}: Previous approach failed because: ${lastReplan.reason}. Adjust accordingly.]`,
      });
    }

    return this._fitToContextWindow(messages, params.model);
  }

  // ============================================================
  // CONTEXT WINDOW MANAGEMENT
  // ============================================================

  /**
   * Fit messages to the model's context window.
   * Uses summarization instead of pure truncation when possible.
   */
  _fitToContextWindow(messages, model) {
    const contextWindow = CONTEXT_WINDOWS[model] || CONTEXT_WINDOWS.default;
    const available = contextWindow - this.config.reservedTokens;

    const estimatedTokens = this._estimateTokens(messages);

    if (estimatedTokens <= available) {
      return messages;
    }

    logger.warn(
      `[DSHContextManager] Context overflow: ${estimatedTokens} tokens > ${available} available.`,
    );

    // Strategy 1: Truncate tool results first
    let result = this._truncateToolResults(messages);
    let currentTokens = this._estimateTokens(result);

    if (currentTokens <= available) {
      logger.info('[DSHContextManager] Fits after truncating tool results');
      return result;
    }

    // Strategy 2: Remove oldest non-essential messages
    result = this._removeOldestNonEssential(result, available);
    currentTokens = this._estimateTokens(result);

    if (currentTokens <= available) {
      logger.info('[DSHContextManager] Fits after removing old messages');
      return result;
    }

    // Strategy 3: Summarize conversation history (if auto-summarize enabled)
    if (this.config.enableAutoSummarize) {
      result = this._summarizeConversation(result, available, model);
      currentTokens = this._estimateTokens(result);

      if (currentTokens <= available) {
        logger.info('[DSHContextManager] Fits after summarization');
        return result;
      }
    }

    // Strategy 4: Hard truncation (last resort)
    logger.warn('[DSHContextManager] Using hard truncation (last resort)');
    result = this._hardTruncate(result, available);

    return result;
  }

  /**
   * Truncate oversized tool results in messages.
   */
  _truncateToolResults(messages) {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          ...msg,
          content: this._truncateToolResult(msg.content, this.config.maxToolResultTokens),
        };
      }
      return msg;
    });
  }

  /**
   * Truncate a single tool result to max tokens.
   */
  _truncateToolResult(result, maxTokens) {
    if (!result) return result;
    const maxChars = maxTokens * 4;
    if (result.length <= maxChars) return result;
    return result.slice(0, maxChars) + `\n\n[Result truncated: ${result.length} chars total, showing first ${maxChars}]`;
  }

  /**
   * Remove oldest non-essential messages to fit within budget.
   */
  _removeOldestNonEssential(messages, availableTokens) {
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const systemTokens = this._estimateTokens(systemMessages);
    const availableForOther = availableTokens - systemTokens;

    if (availableForOther <= 0) {
      // System messages exceed budget — truncate last system message
      const lastSystem = systemMessages[systemMessages.length - 1];
      const maxChars = availableTokens * 4;
      return [
        ...systemMessages.slice(0, -1),
        { ...lastSystem, content: (lastSystem.content || '').slice(0, maxChars) },
      ];
    }

    // Keep most recent messages that fit
    let tokenCount = 0;
    const kept = [];
    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msgTokens = Math.ceil(this._stringify(otherMessages[i]).length / 4);
      if (tokenCount + msgTokens > availableForOther) break;
      tokenCount += msgTokens;
      kept.unshift(otherMessages[i]);
    }

    if (kept.length < otherMessages.length) {
      kept.unshift({
        role: 'system',
        content: `[Context: ${otherMessages.length - kept.length} earlier messages removed to fit context window]`,
      });
    }

    return [...systemMessages, ...kept];
  }

  /**
   * Summarize conversation history using a simple extractive approach.
   * In production, this would call the LLM for abstractive summarization.
   */
  _summarizeConversation(messages, availableTokens, model) {
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    if (otherMessages.length <= 4) return messages; // Too few to summarize

    // Split into: old (to summarize) and recent (keep intact)
    const keepRecent = Math.min(6, Math.ceil(otherMessages.length / 3));
    const toSummarize = otherMessages.slice(0, -keepRecent);
    const recent = otherMessages.slice(-keepRecent);

    // Create extractive summary
    const summaryParts = [];
    for (const msg of toSummarize) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (content && content.length > 10) {
          // Extract first sentence as summary
          const firstSentence = content.split(/[.!?]\s/)[0];
          if (firstSentence) {
            summaryParts.push(`${msg.role}: ${firstSentence}${firstSentence.endsWith('.') ? '' : '...'}`);
          }
        }
      } else if (msg.role === 'tool') {
        const content = typeof msg.content === 'string' ? msg.content : '';
        // Extract tool result summary
        try {
          const parsed = JSON.parse(content);
          if (parsed.success !== undefined) {
            summaryParts.push(`Tool result: ${parsed.success ? 'success' : 'failed'}`);
          }
        } catch {
          if (content.length > 50) {
            summaryParts.push(`Tool result: ${content.slice(0, 50)}...`);
          }
        }
      }
    }

    const summaryMessage = {
      role: 'system',
      content: `[Conversation summary]\n${summaryParts.join('\n')}`,
    };

    return [...systemMessages, summaryMessage, ...recent];
  }

  /**
   * Hard truncate: keep system + last N messages, discard the rest.
   */
  _hardTruncate(messages, availableTokens) {
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const systemTokens = this._estimateTokens(systemMessages);
    const availableForOther = availableTokens - systemTokens;

    if (availableForOther <= 0) {
      return [systemMessages[0] || { role: 'system', content: '' }];
    }

    // Greedily add messages from most recent
    let tokenCount = 0;
    const kept = [];
    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msgTokens = Math.ceil(this._stringify(otherMessages[i]).length / 4);
      if (tokenCount + msgTokens > availableForOther) break;
      tokenCount += msgTokens;
      kept.unshift(otherMessages[i]);
    }

    return [...systemMessages, ...kept];
  }

  // ============================================================
  // SMART SELECTION
  // ============================================================

  /**
   * Select the most relevant tool calls for the current step.
   * Prioritizes: same capability, recent, high-importance results.
   */
  _selectRelevantToolCalls(toolCalls, currentCapability) {
    if (toolCalls.length <= this.config.maxToolResultsInContext) {
      return toolCalls;
    }

    // Score each tool call
    const scored = toolCalls.map((call, index) => {
      let score = index / toolCalls.length; // Recency score (0-1)

      // Boost if related to current capability
      const toolName = call.function?.name || call.name || '';
      if (this._toolCapabilityMap[currentCapability]?.includes(toolName)) {
        score += 0.3;
      }

      // Boost successful calls
      if (call.success !== false) {
        score += 0.1;
      }

      return { call, score };
    });

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, this.config.maxToolResultsInContext);

    // Re-sort by original order for coherence
    selected.sort((a, b) => toolCalls.indexOf(a.call) - toolCalls.indexOf(b.call));

    return selected.map(s => s.call);
  }

  /**
   * Select most relevant conversation history for current task.
   */
  _selectRelevantHistory(messages, currentTask) {
    const maxHistory = this.config.maxHistoryInContext;
    if (messages.length <= maxHistory) {
      return messages;
    }

    // Keep last N messages
    return messages.slice(-maxHistory);
  }

  /**
   * Tool-to-capability mapping for relevance scoring.
   */
  get _toolCapabilityMap() {
    return {
      code: ['read_file', 'write_file', 'edit_file', 'run_command', 'search_code'],
      filesystem: ['read_file', 'write_file', 'edit_file', 'list_directory', 'search_files'],
      git: ['git_status', 'git_diff', 'git_commit', 'git_log', 'git_checkout'],
      search: ['web_search', 'web_fetch', 'search_files', 'search_code'],
      browser: ['browser_navigate', 'web_fetch'],
      general: ['read_file', 'list_directory', 'run_command'],
    };
  }

  // ============================================================
  // MEMORY INTEGRATION
  // ============================================================

  /**
   * Get project memory context for system prompt injection.
   * Always includes high-importance project facts (architecture, patterns)
   * plus any similarity-matched entries.
   */
  _getMemoryContext(params) {
    if (!this._memoryManager) return null;

    try {
      // Always include high-importance project facts (architecture, patterns)
      const importantFacts = this._memoryManager.getFromProjectMemory(null, 10)
        .filter(f => f.metadata?.importance === 'high' || f.metadata?.importance === 'critical')
        .slice(-5);

      // Also include similarity-matched facts
      const matchedFacts = this._memoryManager.getFromProjectMemory(params?.task, 3);

      // Merge and deduplicate
      const allFacts = [...importantFacts];
      for (const mf of matchedFacts) {
        if (!allFacts.some(af => af.id === mf.id)) {
          allFacts.push(mf);
        }
      }

      if (allFacts.length === 0) return null;
      return allFacts.slice(0, 8).map(f => `- ${f.value}`).join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Get error memory context for replanning.
   */
  _getErrorMemoryContext(task) {
    if (!this._memoryManager) return null;

    try {
      const errors = this._memoryManager.findSimilarErrors(task, 3);
      if (errors.length === 0) return null;
      return errors.map(e => `- ${e.error} → Resolution: ${e.resolution}`).join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Get task memory context for execution.
   */
  _getTaskMemoryContext() {
    if (!this._memoryManager) return null;

    try {
      const facts = this._memoryManager.getFromWorkingMemory(null, 5);
      if (facts.length === 0) return null;
      return facts.map(f => `- ${f.value}`).join('\n');
    } catch {
      return null;
    }
  }

  // ============================================================
  // TOKEN ESTIMATION
  // ============================================================

  /**
   * Estimate token count from messages.
   */
  _estimateTokens(messages) {
    if (!messages || !Array.isArray(messages)) return 0;
    return messages.reduce((total, msg) => {
      return total + Math.ceil(this._stringify(msg).length / 4);
    }, 0);
  }

  /**
   * Stringify a message for token estimation.
   */
  _stringify(msg) {
    if (typeof msg === 'string') return msg;
    if (typeof msg === 'object') {
      return JSON.stringify(msg);
    }
    return String(msg);
  }
}

module.exports = { DSHContextManager, CONTEXT_WINDOWS };
