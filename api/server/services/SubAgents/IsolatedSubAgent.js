/**
 * IsolatedSubAgent.js — Isolated Sub-Agent Execution
 * 
 * Executes sub-agents with:
 * - Isolated context (copy, not reference)
 * - Summary-only return (not full result)
 * - Depth limits (max 3 levels)
 * - Concurrency limits (max 5 parallel)
 * - Timeout per sub-agent
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[IsolatedSubAgent]', ...args),
    info: (...args) => console.info('[IsolatedSubAgent]', ...args),
    warn: (...args) => console.warn('[IsolatedSubAgent]', ...args),
    error: (...args) => console.error('[IsolatedSubAgent]', ...args),
};

class IsolatedSubAgent extends EventEmitter {
    constructor(config = {}) {
        super();
        this._maxDepth = config.maxDepth || 3;
        this._maxConcurrent = config.maxConcurrent || 5;
        this._timeout = config.timeout || 120000; // 2 minutes
        this._llmProvider = config.llmProvider || null;
        this._activeAgents = new Map();
        this._agentCount = 0;
    }

    setLLMProvider(provider) { this._llmProvider = provider; }

    /**
     * Execute a sub-agent with isolated context.
     * 
     * @param {string} task - The task description
     * @param {object} parentContext - Parent agent's context (will be copied)
     * @param {object} options - { depth, timeout, maxTokens }
     * @returns {Promise<object>} - { success, summary, duration }
     */
    async execute(task, parentContext = {}, options = {}) {
        const depth = (options.depth || 0) + 1;
        const agentId = `sub_${Date.now()}_${++this._agentCount}`;

        // Check depth limit
        if (depth > this._maxDepth) {
            throw new Error(`Sub-agent depth limit reached (${this._maxDepth}). Cannot spawn deeper sub-agents.`);
        }

        // Check concurrency limit
        if (this._activeAgents.size >= this._maxConcurrent) {
            throw new Error(`Sub-agent concurrency limit reached (${this._maxConcurrent}). Wait for existing sub-agents to finish.`);
        }

        const startTime = Date.now();
        this._activeAgents.set(agentId, { task, depth, startedAt: new Date() });

        logger.info(`[IsolatedSubAgent] Starting ${agentId} (depth ${depth}): "${task.substring(0, 80)}..."`);

        try {
            // Create isolated context (COPY, not reference)
            const isolatedContext = this._createIsolatedContext(parentContext, task);

            // Execute with timeout
            const result = await this._executeWithTimeout(
                () => this._runAgent(task, isolatedContext, depth, options),
                options.timeout || this._timeout
            );

            // Extract summary (NOT full result)
            const summary = await this._extractSummary(task, result);

            const duration = Date.now() - startTime;

            logger.info(`[IsolatedSubAgent] ${agentId} completed in ${duration}ms`);

            this.emit('completed', { agentId, task, summary, duration });

            return {
                success: true,
                summary,
                duration,
                agentId,
                depth,
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[IsolatedSubAgent] ${agentId} failed: ${error.message}`);

            this.emit('failed', { agentId, task, error: error.message, duration });

            return {
                success: false,
                summary: `Sub-agent failed: ${error.message}`,
                error: error.message,
                duration,
                agentId,
                depth,
            };

        } finally {
            this._activeAgents.delete(agentId);
        }
    }

    /**
     * Execute multiple sub-agents in parallel.
     */
    async executeParallel(tasks, parentContext = {}, options = {}) {
        const results = await Promise.allSettled(
            tasks.map(task => this.execute(task, parentContext, options))
        );

        return results.map((r, i) => ({
            task: tasks[i],
            ...(r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message }),
        }));
    }

    /**
     * Get active sub-agents.
     */
    getActiveAgents() {
        return [...this._activeAgents.entries()].map(([id, info]) => ({
            id,
            ...info,
            duration: Date.now() - info.startedAt.getTime(),
        }));
    }

    /**
     * Cancel a specific sub-agent.
     */
    cancel(agentId) {
        const agent = this._activeAgents.get(agentId);
        if (agent) {
            agent.cancelled = true;
            this._activeAgents.delete(agentId);
            return { success: true };
        }
        return { success: false, error: 'Agent not found' };
    }

    // ── Internal ──────────────────────────────────────────────

    _createIsolatedContext(parentContext, task) {
        // Deep copy to prevent contamination
        const isolated = JSON.parse(JSON.stringify({
            messages: [],
            tools: parentContext.tools || [],
            workingDir: parentContext.workingDir || process.cwd(),
            metadata: {
                isSubAgent: true,
                task,
                parentSessionId: parentContext.sessionId,
            },
        }));

        // Add system prompt for sub-agent
        isolated.messages.push({
            role: 'system',
            content: `You are a sub-agent executing a specific task. Focus ONLY on the task given to you.
Do not attempt to spawn sub-agents. Keep your response concise and focused.
Provide your findings/results as a clear summary.`,
        });

        // Add the task
        isolated.messages.push({
            role: 'user',
            content: task,
        });

        return isolated;
    }

    async _runAgent(task, context, depth, options) {
        if (!this._llmProvider) {
            // Fallback: return a placeholder
            return { content: `Sub-agent executed task: ${task.substring(0, 200)}` };
        }

        // Simple loop: ask LLM for the answer
        const response = await this._llmProvider.chat({
            messages: context.messages,
            tools: context.tools?.length > 0 ? context.tools.slice(0, 5) : undefined, // Limit tools for sub-agents
            maxTokens: options.maxTokens || 2048,
            temperature: 0.3,
        });

        return response;
    }

    async _extractSummary(task, result) {
        // If we have an LLM, use it to summarize
        if (this._llmProvider && result.content) {
            try {
                const response = await this._llmProvider.chat({
                    messages: [{
                        role: 'user',
                        content: `Summarize this result in 2-3 sentences:\n\nTask: ${task}\nResult: ${result.content?.substring(0, 1000)}`,
                    }],
                    maxTokens: 200,
                    temperature: 0.3,
                });
                return response.content || result.content?.substring(0, 500);
            } catch (e) {
                // Fallback to direct content
            }
        }

        // Fallback: truncate content
        const content = result.content || JSON.stringify(result);
        return content.substring(0, 500);
    }

    async _executeWithTimeout(fn, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Sub-agent timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            fn()
                .then(result => { clearTimeout(timer); resolve(result); })
                .catch(error => { clearTimeout(timer); reject(error); });
        });
    }
}

module.exports = { IsolatedSubAgent };
module.exports.default = IsolatedSubAgent;
