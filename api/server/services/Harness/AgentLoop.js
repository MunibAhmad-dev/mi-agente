/**
 * @deprecated NOT the canonical runtime loop.
 * The live agent loop used by HarnessManager is DSHAgentLoop.js (same directory).
 * This file is a reference implementation kept for documentation purposes only.
 * Nothing in the production path imports this file.
 *
 * AgentLoop.js — Core Agent Loop (while tool_call pattern)
 * 
 * Implements the pattern used by Claude Code, Codex, and modern agents:
 * 
 *   USER MESSAGE
 *       ↓
 *   while (not finished):
 *       1. REASON — Analyze context, decide what to do
 *       2. PLAN   — Select tools, parameters, strategy
 *       3. EXECUTE — Run tool calls
 *       4. OBSERVE — Collect results
 *       5. EVALUATE — Check if task is done, need more tools, or error
 *       6. CONTINUE / FINISH / REPLAN / ASK_USER
 * 
 * Self-healing:
 *   ERROR → CLASSIFY → DIAGNOSE → FIX → RETRY / REPLAN / ABORT
 * 
 * Based on: Claude Code agent loop, OpenHands SDK, Cline SDK patterns.
 */

const { EventEmitter } = require('events');
const { ResponseNormalizer } = require('./cognitive/llm/ResponseNormalizer');

const logger = {
    debug: (...args) => console.log('[AgentLoop]', ...args),
    info: (...args) => console.info('[AgentLoop]', ...args),
    warn: (...args) => console.warn('[AgentLoop]', ...args),
    error: (...args) => console.error('[AgentLoop]', ...args),
};

/**
 * Error categories for self-healing.
 */
const ErrorCategory = {
    SYNTAX: 'syntax',
    DEPENDENCY: 'dependency',
    LOGIC: 'logic',
    INTEGRATION: 'integration',
    ENVIRONMENT: 'environment',
    TOOL: 'tool',
    PROVIDER: 'provider',
    CONTEXT: 'context',
    CONCURRENCY: 'concurrency',
    SECURITY: 'security',
    TIMEOUT: 'timeout',
    UNKNOWN: 'unknown',
};

function classifyError(error) {
    const message = (error.message || '').toLowerCase();
    const code = error.code || '';

    if (message.includes('syntax') || message.includes('unexpected token') || code === 'ERR_PARSE')
        return ErrorCategory.SYNTAX;
    if (message.includes('cannot find module') || message.includes('module not found'))
        return ErrorCategory.DEPENDENCY;
    if (message.includes('tool') && (message.includes('timeout') || message.includes('not found')))
        return ErrorCategory.TOOL;
    if (message.includes('rate_limit') || message.includes('429') || message.includes('503') || message.includes('api key'))
        return ErrorCategory.PROVIDER;
    if (message.includes('permission') || message.includes('eacces') || message.includes('access denied'))
        return ErrorCategory.ENVIRONMENT;
    if (message.includes('context') && (message.includes('overflow') || message.includes('length') || message.includes('limit')))
        return ErrorCategory.CONTEXT;
    if (message.includes('connection') || message.includes('econnrefused') || message.includes('network'))
        return ErrorCategory.INTEGRATION;
    if (message.includes('timeout') || message.includes('timed out') || code === 'ETIMEDOUT' || message.includes('etimedout'))
        return ErrorCategory.TIMEOUT;
    if (message.includes('assertion') || message.includes('invalid') || message.includes('unexpected result'))
        return ErrorCategory.LOGIC;

    return ErrorCategory.UNKNOWN;
}

function getSuggestedFix(category) {
    const strategies = {
        [ErrorCategory.SYNTAX]: { action: 'retry_with_correction', maxAttempts: 2, description: 'Fix syntax and retry' },
        [ErrorCategory.DEPENDENCY]: { action: 'install_dependency', maxAttempts: 1, description: 'Install missing dependency' },
        [ErrorCategory.TOOL]: { action: 'retry_tool', maxAttempts: 2, description: 'Retry tool with different params' },
        [ErrorCategory.PROVIDER]: { action: 'retry_with_backoff', maxAttempts: 3, description: 'Wait and retry' },
        [ErrorCategory.ENVIRONMENT]: { action: 'skip_or_alter', maxAttempts: 1, description: 'Skip or find alternative' },
        [ErrorCategory.CONTEXT]: { action: 'truncate_and_retry', maxAttempts: 1, description: 'Reduce context and retry' },
        [ErrorCategory.INTEGRATION]: { action: 'retry_with_backoff', maxAttempts: 3, description: 'Wait for service' },
        [ErrorCategory.TIMEOUT]: { action: 'retry_with_backoff', maxAttempts: 2, description: 'Retry with longer timeout' },
        [ErrorCategory.LOGIC]: { action: 'replan', maxAttempts: 1, description: 'Replan with different approach' },
        [ErrorCategory.CONCURRENCY]: { action: 'retry_sequential', maxAttempts: 1, description: 'Retry sequentially' },
        [ErrorCategory.SECURITY]: { action: 'abort', maxAttempts: 0, description: 'Abort for security' },
        [ErrorCategory.UNKNOWN]: { action: 'retry_once', maxAttempts: 1, description: 'Retry once' },
    };
    return strategies[category] || strategies[ErrorCategory.UNKNOWN];
}

/**
 * AgentLoop — The core agent execution loop.
 * 
 * Emits events:
 *   - step: { step, tool, params, result, duration }
 *   - tool_start: { tool, params, step }
 *   - tool_end: { tool, result, step, duration }
 *   - error: { error, category, step, strategy }
 *   - finished: { result, steps, totalDuration }
 *   - ask_user: { question, options }
 *   - replan: { reason, newPlan }
 */
class AgentLoop extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            maxIterations: config.maxIterations || 20,
            maxRetries: config.maxRetries || 3,
            timeout: config.timeout || 300000, // 5 min per tool call
            enableSelfHealing: config.enableSelfHealing !== false,
            enableAskUser: config.enableAskUser !== false,
            enableStreaming: config.enableStreaming !== false,
            ...config,
        };

        this._steps = [];
        this._errorHistory = [];
        this._running = false;
        this._cancelled = false;
        this._toolRegistry = null;
        this._llmProvider = null;
        this._contextManager = null;
        this._sessionManager = null;
        this._memoryManager = null;
        this._repositoryMap = null;
        this._verifier = null;
    }

    /**
     * Set dependencies (injected by HarnessManager).
     */
    setToolRegistry(registry) { this._toolRegistry = registry; return this; }
    setLLMProvider(provider) { this._llmProvider = provider; return this; }
    setContextManager(cm) { this._contextManager = cm; return this; }
    setSessionManager(sm) { this._sessionManager = sm; return this; }
    setMemoryManager(mm) { this._memoryManager = mm; return this; }
    setRepositoryMap(rm) { this._repositoryMap = rm; return this; }
    setVerifier(v) { this._verifier = v; return this; }
    setCheckpointManager(cm) { this._checkpointManager = cm; return this; }
    setToolResultCompressor(tc) { this._toolResultCompressor = tc; return this; }
    setContextCompactor(cc) { this._contextCompactor = cc; return this; }
    setDAGScheduler(dag) { this._dagScheduler = dag; return this; }
    setProviderHealthChecker(phc) { this._providerHealthChecker = phc; return this; }
    setAPIKeyRotation(akr) { this._apiKeyRotation = akr; return this; }
    setQuotaManager(qm) { this._quotaManager = qm; return this; }
    setModelPipeline(mp) { this._modelPipeline = mp; return this; }
    setAdaptiveRAG(ar) { this._adaptiveRAG = ar; return this; }
    setHybridSearch(hs) { this._hybridSearch = hs; return this; }
    setWorkspaceManager(wm) { this._workspaceManager = wm; return this; }
    setDistributedTracer(dt) { this._distributedTracer = dt; return this; }
    setPromptManager(pm) { this._promptManager = pm; return this; }
    setSourceEvaluator(se) { this._sourceEvaluator = se; return this; }
    setFactChecker(fc) { this._factChecker = fc; return this; }
    setMCPClient(mcp) { this._mcpClient = mcp; return this; }
    setAutoLauncher(al) { this._autoLauncher = al; return this; }
    setVisionRouter(vr) { this._visionRouter = vr; return this; }

    /**
     * Run the agent loop for a user message.
     * 
     * @param {string} userMessage - The user's input
     * @param {object} options - { sessionId, userId, workingDir, ... }
     * @returns {Promise<object>} - { success, response, steps, totalDuration, toolCalls }
     */
    async run(userMessage, options = {}) {
        if (this._running) throw new Error('Agent loop is already running');
        
        this._running = true;
        this._cancelled = false;
        this._steps = [];
        const startTime = Date.now();
        const sessionId = options.sessionId || 'default';
        const workingDir = options.workingDir || process.cwd();

        // Auto-launch services if configured
        if (this._autoLauncher && options.autoStart !== false) {
            try {
                logger.info('[AgentLoop] Auto-launching services...');
                await this._autoLauncher.autoStartAll();
            } catch (launchErr) {
                logger.warn(`[AgentLoop] Auto-launch warning: ${launchErr.message}`);
            }
        }

        // Connect MCP servers if configured
        if (this._mcpClient && options.connectMCP !== false) {
            try {
                logger.info('[AgentLoop] Connecting MCP servers...');
                await this._mcpClient.connectAll();
            } catch (mcpErr) {
                logger.warn(`[AgentLoop] MCP connect warning: ${mcpErr.message}`);
            }
        }

        // Start distributed trace
        let traceId = null;
        let traceSpanId = null;
        if (this._distributedTracer) {
            traceId = this._distributedTracer.startTrace('agent_run', { sessionId, userMessage: userMessage.substring(0, 100) });
            traceSpanId = this._distributedTracer.startSpan(traceId, 'main_loop');
        }

        // Check quota before executing
        if (this._quotaManager) {
            const quotaCheck = this._quotaManager.checkQuota(options.userId || 'default', 'tokens', 100);
            if (!quotaCheck.allowed) {
                logger.warn(`[AgentLoop] Quota exceeded for user ${options.userId}`);
                if (traceId) this._distributedTracer.endTrace(traceId, 'quota_exceeded');
                return { success: false, error: 'Quota exceeded', response: null, steps: [], totalDuration: Date.now() - startTime };
            }
        }

        logger.info(`[AgentLoop] Starting for message: "${userMessage.substring(0, 100)}..."`);

        try {
            // 1. Initialize context
            const context = await this._initializeContext(userMessage, options);

            // 2. Main agent loop: while tool_call
            let iteration = 0;
            let finalResponse = null;
            let finished = false;

            while (!finished && iteration < this.config.maxIterations && !this._cancelled) {
                iteration++;
                const stepStart = Date.now();

                logger.info(`[AgentLoop] === Iteration ${iteration}/${this.config.maxIterations} ===`);

                try {
                    // STEP 1: REASON — Ask LLM what to do next
                    const llmResponse = await this._reason(context, iteration);
                    logger.info(`[AgentLoop] LLM response type: ${llmResponse.type}`);

                    // STEP 2: EVALUATE — Is the LLM done or does it want to use tools?
                    if (llmResponse.type === 'final') {
                        // LLM is done, return final response
                        finalResponse = llmResponse.content;
                        finished = true;
                        logger.info(`[AgentLoop] Task completed at iteration ${iteration}`);
                    } else if (llmResponse.type === 'tool_calls') {
                        // STEP 3: EXECUTE — Run the tool calls
                        const toolResults = await this._executeToolCalls(
                            llmResponse.toolCalls, 
                            context, 
                            iteration
                        );

                        // STEP 4: OBSERVE — Add results to context (with compression)
                        for (const result of toolResults) {
                            let content = result.success 
                                ? JSON.stringify(result.result).substring(0, 10000)
                                : `Error: ${result.error}`;

                            // Apply tool result compression if available
                            if (this._toolResultCompressor) {
                                try {
                                    content = this._toolResultCompressor.compress(result.tool, content);
                                } catch (compressErr) {
                                    // If compression fails, use original content
                                }
                            }

                            context.messages.push({
                                role: 'tool',
                                tool_call_id: result.toolCallId,
                                content,
                            });
                        }

                        // STEP 5: Check if we need to continue
                        const allSucceeded = toolResults.every(r => r.success);
                        if (!allSucceeded && !this.config.enableSelfHealing) {
                            // If self-healing is disabled and tools failed, abort
                            const failedTool = toolResults.find(r => !r.success);
                            throw new Error(`Tool failed: ${failedTool.tool} - ${failedTool.error}`);
                        }

                        this.emit('step', {
                            step: iteration,
                            toolCalls: llmResponse.toolCalls.map(t => ({ tool: t.name, params: t.params })),
                            results: toolResults.map(r => ({ tool: r.tool, success: r.success, duration: r.duration })),
                            duration: Date.now() - stepStart,
                        });

                    } else if (llmResponse.type === 'ask_user') {
                        // LLM wants to ask the user something
                        if (this.config.enableAskUser) {
                            this.emit('ask_user', { question: llmResponse.question, options: llmResponse.options });
                            // Wait for user response (in real implementation, this would be async)
                            finalResponse = llmResponse.question;
                            finished = true;
                        } else {
                            // If ask_user is disabled, use LLM's best guess
                            context.messages.push({ role: 'user', content: 'Continue with your best judgment.' });
                        }
                    } else {
                        // Unknown response type, finish
                        finalResponse = llmResponse.content || 'Task completed.';
                        finished = true;
                    }

                } catch (error) {
                    // ERROR HANDLING with self-healing
                    const category = classifyError(error);
                    const strategy = getSuggestedFix(category);

                    this._errorHistory.push({
                        iteration,
                        error: error.message,
                        category,
                        strategy: strategy.action,
                        timestamp: new Date().toISOString(),
                    });

                    logger.warn(`[AgentLoop] Error at iteration ${iteration}: [${category}] ${error.message}`);

                    // AUTO-CHECKPOINT on error
                    if (this._checkpointManager) {
                        try {
                            this._checkpointManager.save(sessionId, {
                                iteration,
                                context: { messages: context.messages.slice(-10) }, // Last 10 messages
                                error: error.message,
                                category,
                                strategy: strategy.action,
                                steps: this._steps,
                                errorHistory: this._errorHistory,
                            }, {
                                label: `error_${category}_iter${iteration}`,
                                metadata: { sessionId, userId: options.userId }
                            });
                            logger.info(`[AgentLoop] Auto-checkpoint saved on error`);
                        } catch (cpErr) {
                            logger.warn(`[AgentLoop] Failed to save checkpoint: ${cpErr.message}`);
                        }
                    }

                    this.emit('error', { error: error.message, category, iteration, strategy: strategy.action });

                    if (!this.config.enableSelfHealing || strategy.action === 'abort') {
                        throw error;
                    }

                    // Check retries
                    const categoryErrors = this._errorHistory.filter(e => e.category === category);
                    if (categoryErrors.length > strategy.maxAttempts) {
                        logger.warn(`[AgentLoop] Exhausted retries for ${category} (${strategy.maxAttempts})`);
                        throw error;
                    }

                    // Apply strategy
                    await this._applyHealingStrategy(strategy, error, context, iteration);
                }
            }

            // 3. Finalize
            if (!finished && iteration >= this.config.maxIterations) {
                logger.warn(`[AgentLoop] Max iterations reached (${this.config.maxIterations})`);
                finalResponse = finalResponse || 'Max iterations reached. Please try again with a more specific request.';
            }

            const totalDuration = Date.now() - startTime;
            const result = {
                success: finished,
                response: finalResponse,
                steps: this._steps,
                iterations: iteration,
                totalDuration,
                toolCalls: this._steps.filter(s => s.type === 'tool_call').length,
                errors: this._errorHistory.length,
            };

            // Record usage for quota tracking
            if (this._quotaManager) {
                this._quotaManager.recordUsage(options.userId || 'default', 'tokens', result.toolCalls * 100);
                this._quotaManager.recordUsage(options.userId || 'default', 'requests', 1);
            }

            // End distributed trace
            if (traceId) {
                if (traceSpanId) this._distributedTracer.endSpan(traceId, traceSpanId, finished ? 'ok' : 'error');
                this._distributedTracer.endTrace(traceId, finished ? 'ok' : 'error');
            }

            this.emit('finished', result);
            logger.info(`[AgentLoop] Finished in ${totalDuration}ms, ${iteration} iterations, ${result.toolCalls} tool calls`);

            return result;

        } catch (error) {
            const totalDuration = Date.now() - startTime;
            logger.error(`[AgentLoop] Fatal error: ${error.message}`);
            this.emit('finished', { success: false, error: error.message, totalDuration, iterations: this._steps.length });
            return { success: false, error: error.message, response: null, steps: this._steps, totalDuration };
        } finally {
            this._running = false;
        }
    }

    /**
     * Cancel the running loop.
     */
    cancel() {
        this._cancelled = true;
        logger.info('[AgentLoop] Cancelled by user');
    }

    /**
     * Check if the loop is running.
     */
    isRunning() {
        return this._running;
    }

    /**
     * Get error history.
     */
    getErrorHistory() {
        return [...this._errorHistory];
    }

    /**
     * Get error stats.
     */
    getErrorStats() {
        const stats = {};
        for (const entry of this._errorHistory) {
            stats[entry.category] = (stats[entry.category] || 0) + 1;
        }
        return stats;
    }

    // ── Internal Methods ──────────────────────────────────────

    /**
     * Initialize context for the conversation.
     */
    async _initializeContext(userMessage, options) {
        const context = {
            messages: [],
            tools: [],
            workingDir: options.workingDir || process.cwd(),
            sessionId: options.sessionId || 'default',
            userId: options.userId || 'anonymous',
            iteration: 0,
            metadata: options.metadata || {},
        };

        // Add system prompt
        const systemPrompt = await this._buildSystemPrompt(options);
        context.messages.push({ role: 'system', content: systemPrompt });

        // Add tool definitions from registry
        if (this._toolRegistry) {
            context.tools = this._toolRegistry.getToolDefinitions();
        }

        // Add MCP server tools (if MCPClient connected)
        if (this._mcpClient) {
            try {
                const mcpTools = this._mcpClient.getToolDefinitions();
                if (mcpTools.length > 0) {
                    context.tools.push(...mcpTools);
                    logger.info(`[AgentLoop] Added ${mcpTools.length} MCP tools`);
                }
            } catch (mcpErr) {
                logger.warn(`[AgentLoop] Failed to load MCP tools: ${mcpErr.message}`);
            }
        }

        // Add conversation history (from session manager)
        if (this._sessionManager) {
            const history = await this._sessionManager.getHistory(options.sessionId);
            if (history && history.length > 0) {
                context.messages.push(...history.slice(-20)); // Last 20 messages
            }
        }

        // Add user message
        context.messages.push({ role: 'user', content: userMessage });

        return context;
    }

    /**
     * Build system prompt with available tools and context.
     */
    async _buildSystemPrompt(options) {
        let prompt = `You are an AI agent that helps users with software engineering tasks.

You have access to the following tools. Use them when needed to accomplish the user's request.

IMPORTANT RULES:
1. Always think step by step before using a tool.
2. Use the most appropriate tool for each task.
3. After using a tool, observe the result and decide if you need to use another tool.
4. When the task is complete, provide a clear final response.
5. If a tool fails, try a different approach or ask the user.
6. Never modify files without being sure about the changes.
7. Always verify your work when possible.
8. If you need to write code, use the write_file tool.
9. If you need to edit code, use the edit_file tool with exact string matches.
10. If you need to read code, use the read_file tool.`;

        // Add repository map context
        if (this._repositoryMap) {
            try {
                const repoMap = await this._repositoryMap.getSummary();
                if (repoMap) {
                    prompt += `\n\n## Repository Structure\n\`\`\`\n${repoMap}\n\`\`\``;
                }
            } catch (e) { /* ignore */ }
        }

        // Add working directory
        prompt += `\n\nWorking directory: ${options.workingDir || process.cwd()}`;

        // Inject PromptManager template if wired — overrides the base prompt when available
        if (this._promptManager) {
            try {
                const rendered = this._promptManager.render('system_base', {
                    workingDir: options.workingDir || process.cwd(),
                });
                if (rendered) {
                    prompt = rendered;
                }
            } catch { /* template missing — fall through to hardcoded prompt */ }
        }

        return prompt;
    }

    /**
     * REASON step — Ask LLM what to do next.
     */
    async _reason(context, iteration) {
        if (!this._llmProvider) {
            throw new Error('No LLM provider configured. Set LLM provider with setLLMProvider().');
        }

        context.iteration = iteration;

        // Auto-compact context if it's getting too large
        if (this._contextCompactor && context.messages.length > 10) {
            try {
                const compactResult = await this._contextCompactor.compactIfNeeded(context.messages, context.tools);
                if (compactResult.compacted) {
                    context.messages = compactResult.messages;
                    logger.info(`[AgentLoop] Context compacted: saved ${compactResult.tokensSaved} tokens`);
                }
            } catch (compactErr) {
                logger.warn(`[AgentLoop] Context compaction failed: ${compactErr.message}`);
            }
        }

        // Build the request
        const request = {
            messages: context.messages,
            tools: context.tools.length > 0 ? context.tools : undefined,
            temperature: 0.3, // Low temperature for reasoning
            maxTokens: 4096,
        };

        // Call the LLM
        const response = await this._llmProvider.chat(request);

        // Parse the response
        return this._parseLLMResponse(response);
    }

    /**
     * Parse LLM response into structured format.
     */
    _parseLLMResponse(response) {
        // Use universal normalizer for ANY LLM provider (Ollama, OpenAI, DeepSeek, Grok, Anthropic)
        const providerId = response.provider || 'unknown';
        const normalized = ResponseNormalizer.normalize(response, providerId);

        if (normalized.type === 'tool_calls' && normalized.toolCalls && normalized.toolCalls.length > 0) {
            return {
                type: 'tool_calls',
                toolCalls: normalized.toolCalls.map(tc => ({
                    id: tc.id,
                    name: tc.name,
                    params: tc.arguments || {},
                })),
            };
        }

        if (normalized.content) {
            return {
                type: 'final',
                content: normalized.content,
            };
        }

        return {
            type: 'final',
            content: 'Task completed.',
        };
    }

        /**
     * Execute tool calls sequentially.
     */
    async _executeToolCalls(toolCalls, context, iteration) {
        const results = [];

        for (const toolCall of toolCalls) {
            if (this._cancelled) break;

            const toolStart = Date.now();
            logger.info(`[AgentLoop] Executing tool: ${toolCall.name}`);

            this.emit('tool_start', { tool: toolCall.name, params: toolCall.params, step: iteration });

            try {
                // Check MCP first, then local registry
                let result;
                if (this._mcpClient && this._mcpClient.hasTool(toolCall.name)) {
                    // Route to MCP server
                    result = await this._executeWithTimeout(
                        () => this._mcpClient.callTool(toolCall.name, toolCall.params),
                        this.config.timeout
                    );
                } else {
                    // Find the tool in the local registry
                    const tool = this._toolRegistry ? this._toolRegistry.getTool(toolCall.name) : null;
                    if (!tool) {
                        throw new Error(`Tool not found: ${toolCall.name}`);
                    }

                    // Execute the tool locally
                    result = await this._executeWithTimeout(
                        () => tool.execute(toolCall.params, {
                            workingDir: context.workingDir,
                            sessionId: context.sessionId,
                            userId: context.userId,
                        }),
                        this.config.timeout
                    );
                }

                const duration = Date.now() - toolStart;

                results.push({
                    toolCallId: toolCall.id,
                    tool: toolCall.name,
                    success: true,
                    result,
                    duration,
                });

                this.emit('tool_end', { tool: toolCall.name, result, step: iteration, duration });

                this._steps.push({
                    type: 'tool_call',
                    iteration,
                    tool: toolCall.name,
                    params: toolCall.params,
                    result: typeof result === 'string' ? result.substring(0, 500) : JSON.stringify(result).substring(0, 500),
                    duration,
                });

            } catch (error) {
                const duration = Date.now() - toolStart;

                results.push({
                    toolCallId: toolCall.id,
                    tool: toolCall.name,
                    success: false,
                    error: error.message,
                    duration,
                });

                this.emit('tool_end', { tool: toolCall.name, error: error.message, step: iteration, duration });

                this._steps.push({
                    type: 'tool_error',
                    iteration,
                    tool: toolCall.name,
                    params: toolCall.params,
                    error: error.message,
                    duration,
                });
            }
        }

        return results;
    }

    /**
     * Execute a function with timeout.
     */
    async _executeWithTimeout(fn, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            fn()
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * Apply healing strategy after an error.
     */
    async _applyHealingStrategy(strategy, error, context, iteration) {
        switch (strategy.action) {
            case 'retry_with_correction':
                // Add error context to messages so LLM can fix it
                context.messages.push({
                    role: 'user',
                    content: `The previous action failed with error: ${error.message}\nPlease try a different approach or fix the error.`,
                });
                break;

            case 'truncate_and_retry':
                // Truncate old messages to reduce context
                if (context.messages.length > 10) {
                    const systemMsg = context.messages[0];
                    const recentMessages = context.messages.slice(-6);
                    context.messages = [systemMsg, ...recentMessages];
                    logger.info('[AgentLoop] Context truncated for retry');
                }
                break;

            case 'replan':
                // Ask LLM to replan
                context.messages.push({
                    role: 'user',
                    content: `The previous approach failed: ${error.message}\nPlease replan and try a completely different approach.`,
                });
                break;

            case 'retry_with_backoff':
                // Wait and retry
                const delay = 2000 * Math.pow(2, this._errorHistory.filter(e => e.category === classifyError(error)).length);
                logger.info(`[AgentLoop] Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                break;

            case 'skip_or_alter':
                // Skip this step and continue
                context.messages.push({
                    role: 'tool',
                    content: `Skipped due to error: ${error.message}`,
                });
                break;

            case 'abort':
                throw error;

            default:
                // retry_once
                break;
        }
    }
}

module.exports = { AgentLoop, ErrorCategory, classifyError, getSuggestedFix };
