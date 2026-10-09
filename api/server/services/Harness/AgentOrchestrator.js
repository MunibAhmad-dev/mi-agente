/**
 * AgentOrchestrator — Routes tasks to specialist sub-agents.
 *
 * Architecture:
 *   ORCHESTRATOR (this)
 *   ├── ResearcherAgent — DeepSearch, fact-finding, comparison
 *   ├── CoderAgent     — Code generation, editing, debugging
 *   ├── TesterAgent    — Write/run tests, verify correctness
 *   ├── ReviewerAgent  — Code review, quality checks
 *   └── SecurityAgent  — Vulnerability scanning, security audit
 *
 * The orchestrator:
 *   1. Analyzes the task
 *   2. Determines which specialist(s) to invoke
 *   3. Distributes sub-tasks
 *   4. Collects results
 *   5. Merges/synthesizes final output
 *
 * Design: Provider-agnostic, uses DSHModelPlugin for LLM calls.
 */

const logger = {
  info: (...args) => console.info('[AgentOrchestrator]', ...args),
  debug: (...args) => console.log('[AgentOrchestrator]', ...args),
  warn: (...args) => console.warn('[AgentOrchestrator]', ...args),
  error: (...args) => console.error('[AgentOrchestrator]', ...args),
};

/**
 * Specialist agent definitions.
 */
const SPECIALIST_AGENTS = {
  researcher: {
    name: 'Researcher',
    description: 'Research, fact-finding, web search, comparison, deep analysis',
    capabilities: ['search', 'research', 'compare', 'analyze', 'investigate'],
    systemPrompt: [
      'You are a Research specialist agent.',
      'Your job is to find accurate, comprehensive information.',
      'Always cite sources.',
      'Cross-verify facts when possible.',
      'Be thorough but concise.',
    ].join('\n'),
    preferredTools: ['web_search', 'web_fetch', 'browser_navigate', 'read_file'],
    preferredModel: 'gpt-4o-mini', // Fast, good for research
  },
  coder: {
    name: 'Coder',
    description: 'Code generation, editing, refactoring, debugging, implementation',
    capabilities: ['code', 'implement', 'fix', 'refactor', 'debug', 'write'],
    systemPrompt: [
      'You are a Coder specialist agent.',
      'Your job is to write, edit, and debug code.',
      'Follow existing project conventions.',
      'Write clean, well-commented code.',
      'Handle errors properly.',
      'Verify your changes compile/parse correctly.',
    ].join('\n'),
    preferredTools: ['read_file', 'write_file', 'edit_file', 'run_command', 'search_code'],
    preferredModel: 'gpt-4o', // Good balance of quality/speed
  },
  tester: {
    name: 'Tester',
    description: 'Test writing, test running, verification, quality assurance',
    capabilities: ['test', 'verify', 'qa', 'validate'],
    systemPrompt: [
      'You are a Tester specialist agent.',
      'Your job is to write and run tests to verify correctness.',
      'Cover edge cases.',
      'Report test results clearly.',
      'If tests fail, analyze why.',
    ].join('\n'),
    preferredTools: ['read_file', 'write_file', 'run_command', 'search_code'],
    preferredModel: 'gpt-4o-mini', // Fast for test generation
  },
  reviewer: {
    name: 'Reviewer',
    description: 'Code review, quality checks, best practices, documentation',
    capabilities: ['review', 'audit', 'quality', 'document'],
    systemPrompt: [
      'You are a Reviewer specialist agent.',
      'Your job is to review code for quality, correctness, and best practices.',
      'Check for: bugs, security issues, performance, readability, maintainability.',
      'Provide specific, actionable feedback.',
      'Rate the overall quality.',
    ].join('\n'),
    preferredTools: ['read_file', 'search_code', 'git_diff'],
    preferredModel: 'gpt-4o', // Good for analysis
  },
  security: {
    name: 'Security',
    description: 'Security audit, vulnerability scanning, secure coding practices',
    capabilities: ['security', 'vulnerability', 'hardening', 'audit'],
    systemPrompt: [
      'You are a Security specialist agent.',
      'Your job is to identify security vulnerabilities and recommend fixes.',
      'Check for: injection, XSS, SSRF, path traversal, secrets exposure,',
      'privilege escalation, insecure dependencies, hardcoded credentials.',
      'Rate severity: critical/high/medium/low.',
      'Provide specific remediation steps.',
    ].join('\n'),
    preferredTools: ['read_file', 'search_code', 'run_command', 'git_diff'],
    preferredModel: 'gpt-4o',
  },
};

/**
 * AgentOrchestrator — routes tasks to specialist agents.
 */
class AgentOrchestrator {
  constructor(config = {}) {
    this.config = {
      maxParallelAgents: config.maxParallelAgents || 3,
      defaultProvider: config.defaultProvider || 'openai',
      defaultModel: config.defaultModel || 'gpt-4o-mini',
      enableAllSpecialists: config.enableAllSpecialists !== false,
      ...config,
    };

    // Will be set via setModelPlugin / setToolAdapter
    this._modelPlugin = null;
    this._toolAdapter = null;

    // Active specialist agents
    this._agents = new Map();
    this._stats = {
      totalTasks: 0,
      bySpecialist: {},
    };
  }

  /**
   * Set the model plugin for LLM calls.
   */
  setModelPlugin(plugin) {
    this._modelPlugin = plugin;
  }

  /**
   * Set the tool adapter for tool execution.
   */
  setToolAdapter(adapter) {
    this._toolAdapter = adapter;
  }

  /**
   * Orchestrate a complex task across specialist agents.
   *
   * @param {object} params
   * @param {string} params.task - Task description
   * @param {string} [params.provider] - LLM provider
   * @param {string} [params.model] - LLM model
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<OrchestrationResult>}
   */
  async orchestrate(params) {
    const startTime = Date.now();
    const { task, provider, model, signal } = params;

    logger.info(`[AgentOrchestrator] Orchestrating: "${task.slice(0, 100)}..."`);

    try {
      // Step 1: Analyze task and determine specialist routing
      const routing = await this._analyzeAndRoute(task, provider, model);

      logger.info(
        `[AgentOrchestrator] Routing: ${routing.agents.map(a => a.name).join(', ')}`,
      );

      // Step 2: Execute specialists (parallel where possible)
      const results = [];

      // Group agents by dependency
      const parallel = routing.agents.filter(a => !a.dependsOn);
      const sequential = routing.agents.filter(a => a.dependsOn);

      // Run parallel agents
      if (parallel.length > 0) {
        const parallelResults = await Promise.allSettled(
          parallel.map(agent =>
            this._runSpecialist(agent, task, routing.context, provider, model, signal),
          ),
        );

        for (let i = 0; i < parallelResults.length; i++) {
          const r = parallelResults[i];
          if (r.status === 'fulfilled') {
            results.push(r.value);
          } else {
            results.push({
              specialist: parallel[i].name,
              success: false,
              error: r.reason?.message || 'Unknown error',
            });
          }
        }
      }

      // Run sequential agents (each gets context from previous results)
      for (const agent of sequential) {
        if (signal?.aborted) break;

        const contextFromPrevious = results.map(r => ({
          specialist: r.specialist,
          summary: r.result?.summary || r.error || 'No result',
        }));

        const result = await this._runSpecialist(
          agent, task, contextFromPrevious, provider, model, signal,
        );
        results.push(result);
      }

      // Step 3: Synthesize final result
      const synthesis = await this._synthesizeResults(task, results, provider, model);

      const latency = Date.now() - startTime;

      return {
        success: results.some(r => r.success),
        result: synthesis,
        specialists: results.map(r => ({
          name: r.specialist,
          success: r.success,
          summary: r.result?.summary || r.error,
        })),
        latency,
      };
    } catch (error) {
      logger.error(`[AgentOrchestrator] Orchestration failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        latency: Date.now() - startTime,
      };
    }
  }

  // ============================================================
  // TASK ANALYSIS + ROUTING
  // ============================================================

  /**
   * Analyze task and determine which specialists to use.
   */
  async _analyzeAndRoute(task, provider, model) {
    if (!this._modelPlugin) {
      // Fallback: keyword-based routing
      return this._keywordRoute(task);
    }

    try {
      const agentDescriptions = Object.entries(SPECIALIST_AGENTS)
        .map(([key, agent]) => `- ${key}: ${agent.description}`)
        .join('\n');

      const systemPrompt = [
        'You are a task routing assistant.',
        'Analyze the task and determine which specialist agents should handle it.',
        '',
        'Available specialists:',
        agentDescriptions,
        '',
        'Respond with a JSON object:',
        '{"agents": [{"name": "specialist_key", "subtask": "specific subtask description", "dependsOn": null}], "context": "any shared context"}',
        '',
        'Rules:',
        '- Use only needed specialists',
        '- Set dependsOn to the name of an agent this one needs results from',
        '- Set dependsOn to null for independent agents',
        '- Keep subtasks specific and actionable',
      ].join('\n');

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Task: ${task}` },
      ];

      const response = await this._modelPlugin.complete({
        messages,
        provider: provider || this.config.defaultProvider,
        model: model || this.config.defaultModel,
        temperature: 0.3,
        maxTokens: 1024,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const routing = JSON.parse(jsonMatch[0]);
        if (routing.agents && Array.isArray(routing.agents)) {
          return {
            agents: routing.agents.map(a => ({
              ...SPECIALIST_AGENTS[a.name],
              key: a.name,
              name: SPECIALIST_AGENTS[a.name]?.name || a.name,
              subtask: a.subtask,
              dependsOn: a.dependsOn,
            })).filter(a => a.systemPrompt), // Filter out unknown agents
            context: routing.context,
          };
        }
      }
    } catch (error) {
      logger.warn('[AgentOrchestrator] LLM routing failed, using keyword fallback:', error.message);
    }

    return this._keywordRoute(task);
  }

  /**
   * Keyword-based routing fallback.
   */
  _keywordRoute(task) {
    const lower = task.toLowerCase();
    const agents = [];

    if (lower.match(/\b(search|research|find|compare|investigate|what is|how to)\b/)) {
      agents.push({ ...SPECIALIST_AGENTS.researcher, key: 'researcher', subtask: task });
    }
    if (lower.match(/\b(code|implement|fix|debug|write|create|refactor|build)\b/)) {
      agents.push({ ...SPECIALIST_AGENTS.coder, key: 'coder', subtask: task });
    }
    if (lower.match(/\b(test|verify|check|validate|ensure)\b/)) {
      agents.push({ ...SPECIALIST_AGENTS.tester, key: 'tester', subtask: task });
    }
    if (lower.match(/\b(review|audit|quality|improve|check)\b/)) {
      agents.push({ ...SPECIALIST_AGENTS.reviewer, key: 'reviewer', subtask: task });
    }
    if (lower.match(/\b(security|vulnerability|safe|protect|harden)\b/)) {
      agents.push({ ...SPECIALIST_AGENTS.security, key: 'security', subtask: task });
    }

    // Default to coder if nothing matched
    if (agents.length === 0) {
      agents.push({ ...SPECIALIST_AGENTS.coder, key: 'coder', subtask: task });
    }

    return { agents, context: null };
  }

  // ============================================================
  // SPECIALIST EXECUTION
  // ============================================================

  /**
   * Run a single specialist agent.
   */
  async _runSpecialist(agent, task, context, provider, model, signal) {
    const specialistName = agent.key || agent.name;
    logger.info(`[AgentOrchestrator] Running ${agent.name}: "${(agent.subtask || task).slice(0, 80)}..."`);

    this._stats.totalTasks++;
    this._stats.bySpecialist[specialistName] = (this._stats.bySpecialist[specialistName] || 0) + 1;

    if (!this._modelPlugin) {
      return {
        specialist: agent.name,
        success: false,
        error: 'Model plugin not available',
      };
    }

    try {
      const systemParts = [agent.systemPrompt];

      // Add context from other agents if available
      if (context && Array.isArray(context) && context.length > 0) {
        systemParts.push(
          '',
          '## Context from other specialists:',
          context.map(c => `- ${c.specialist}: ${c.summary}`).join('\n'),
        );
      }

      // Determine tools
      const availableTools = agent.preferredTools
        .map(toolName => this._toolAdapter?._tools?.get(toolName)?.definition)
        .filter(Boolean);

      const messages = [
        { role: 'system', content: systemParts.join('\n') },
        { role: 'user', content: `Task: ${agent.subtask || task}` },
      ];

      const response = await this._modelPlugin.complete({
        messages,
        provider: provider || this.config.defaultProvider,
        model: agent.preferredModel || model || this.config.defaultModel,
        tools: availableTools.length > 0 ? availableTools : undefined,
        temperature: 0.5,
        maxTokens: 4096,
        signal,
      });

      // Execute any tool calls
      let toolResults = [];
      if (response.toolCalls && response.toolCalls.length > 0 && this._toolAdapter) {
        for (const toolCall of response.toolCalls) {
          try {
            const toolName = toolCall.function?.name || toolCall.name;
            const toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
            const result = await this._toolAdapter.execute(toolName, toolArgs);
            toolResults.push({ tool: toolName, success: result.success });
          } catch (toolError) {
            toolResults.push({ tool: toolCall.name, error: toolError.message });
          }
        }
      }

      return {
        specialist: agent.name,
        success: true,
        result: {
          content: response.content,
          summary: response.content?.slice(0, 200) || 'Completed',
          toolResults,
        },
      };
    } catch (error) {
      logger.error(`[AgentOrchestrator] ${agent.name} failed:`, error.message);
      return {
        specialist: agent.name,
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================
  // SYNTHESIS
  // ============================================================

  /**
   * Synthesize results from multiple specialists into a final output.
   */
  async _synthesizeResults(task, results, provider, model) {
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      return 'All specialist agents failed to produce results.';
    }

    if (successfulResults.length === 1) {
      return successfulResults[0].result?.content || 'Task completed.';
    }

    // Multiple results — synthesize
    if (!this._modelPlugin) {
      return successfulResults
        .map(r => `## ${r.specialist}\n${r.result?.content || 'No content'}`)
        .join('\n\n');
    }

    try {
      const resultsText = successfulResults
        .map(r => `## ${r.specialist} Agent\n${r.result?.content || 'No content'}`)
        .join('\n\n---\n\n');

      const systemPrompt = [
        'You are a result synthesizer.',
        'Combine the outputs from multiple specialist agents into a coherent, comprehensive response.',
        'Remove redundancy.',
        'Resolve any contradictions.',
        'Structure the final output clearly.',
      ].join('\n');

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Original task: ${task}\n\nSpecialist results:\n\n${resultsText}`,
        },
      ];

      const response = await this._modelPlugin.complete({
        messages,
        provider: provider || this.config.defaultProvider,
        model: model || this.config.defaultModel,
        temperature: 0.5,
        maxTokens: 4096,
      });

      return response.content;
    } catch (error) {
      // Fallback: concatenate results
      return successfulResults
        .map(r => `### ${r.specialist}\n${r.result?.content || 'No content'}`)
        .join('\n\n');
    }
  }

  /**
   * Get available specialist names.
   */
  getSpecialistNames() {
    return Object.keys(SPECIALIST_AGENTS);
  }

  /**
   * Get orchestrator stats.
   */
  getStats() {
    return { ...this._stats };
  }
}

module.exports = { AgentOrchestrator, SPECIALIST_AGENTS };
