/**
 * ContextCompactor.js — Context Compaction System
 * 
 * Automatically compresses conversation context when approaching token limits:
 * - Detects when context > 80% of limit
 * - Summarizes old messages while preserving key info
 * - Keeps tool calls, decisions, and errors intact
 * - Injects summary into context
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[ContextCompactor]', ...args),
    info: (...args) => console.info('[ContextCompactor]', ...args),
    warn: (...args) => console.warn('[ContextCompactor]', ...args),
    error: (...args) => console.error('[ContextCompactor]', ...args),
};

class ContextCompactor extends EventEmitter {
    constructor(config = {}) {
        super();
        this._threshold = config.threshold || 0.8; // 80% of context window
        this._maxTokens = config.maxTokens || 128000;
        this._reservedTokens = config.reservedTokens || 4096; // Reserve for response
        this._llmProvider = config.llmProvider || null;
        this._summaries = new Map();
    }

    setLLMProvider(provider) { this._llmProvider = provider; }

    /**
     * Check if context needs compaction and perform it.
     * Returns the compacted messages array.
     */
    async compactIfNeeded(messages, tools = []) {
        const estimatedTokens = this._estimateTokens(messages, tools);
        const usableTokens = this._maxTokens - this._reservedTokens;
        const utilization = estimatedTokens / usableTokens;

        if (utilization < this._threshold) {
            return { compacted: false, messages, tokensSaved: 0 };
        }

        logger.info(`[ContextCompactor] Context at ${Math.round(utilization * 100)}% (${estimatedTokens}/${usableTokens} tokens), compacting...`);

        const result = await this._compact(messages);
        const newTokens = this._estimateTokens(result.messages, tools);
        const saved = estimatedTokens - newTokens;

        logger.info(`[ContextCompactor] Saved ${saved} tokens (${Math.round(saved / estimatedTokens * 100)}%)`);
        this.emit('compacted', { before: estimatedTokens, after: newTokens, saved });

        return { compacted: true, messages: result.messages, tokensSaved: saved };
    }

    /**
     * Manually compact messages.
     */
    async compact(messages, keepRecent = 6) {
        return this._compact(messages, keepRecent);
    }

    /**
     * Get compaction stats.
     */
    getStats() {
        return {
            threshold: this._threshold,
            maxTokens: this._maxTokens,
            summariesCount: this._summaries.size,
        };
    }

    // ── Internal ──────────────────────────────────────────────

    async _compact(messages, keepRecent = 6) {
        if (messages.length <= keepRecent) {
            return { messages };
        }

        // Keep system prompt
        const systemMsg = messages.find(m => m.role === 'system');
        const otherMsgs = messages.filter(m => m.role !== 'system');

        // Split: old messages (to summarize) + recent messages (to keep)
        const toSummarize = otherMsgs.slice(0, -keepRecent);
        const toKeep = otherMsgs.slice(-keepRecent);

        // Extract key information from old messages
        const keyInfo = this._extractKeyInfo(toSummarize);

        // Create summary
        let summary;
        if (this._llmProvider) {
            summary = await this._summarizeWithLLM(toSummarize, keyInfo);
        } else {
            summary = this._summarizeLocally(toSummarize, keyInfo);
        }

        // Build compacted messages
        const compacted = [];
        if (systemMsg) compacted.push(systemMsg);

        // Add summary as system message
        compacted.push({
            role: 'system',
            content: `[Context Summary - ${toSummarize.length} messages compressed]\n\n${summary}`,
        });

        // Add recent messages
        compacted.push(...toKeep);

        return { messages: compacted };
    }

    _extractKeyInfo(messages) {
        const info = {
            toolCalls: [],
            errors: [],
            decisions: [],
            facts: [],
            userRequests: [],
        };

        for (const msg of messages) {
            // Extract tool calls
            if (msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                    info.toolCalls.push({
                        tool: tc.function?.name || tc.name,
                        summary: this._summarizeToolCall(tc),
                    });
                }
            }

            // Extract errors
            if (msg.role === 'tool' && msg.content?.includes('Error')) {
                info.errors.push(msg.content.substring(0, 200));
            }

            // Extract user requests
            if (msg.role === 'user') {
                info.userRequests.push(msg.content?.substring(0, 200));
            }

            // Extract assistant decisions
            if (msg.role === 'assistant' && msg.content) {
                const content = msg.content;
                if (content.length > 100) {
                    info.decisions.push(content.substring(0, 200));
                }
            }
        }

        return info;
    }

    _summarizeLocally(messages, keyInfo) {
        const parts = [];

        if (keyInfo.userRequests.length > 0) {
            parts.push(`User asked: ${keyInfo.userRequests[keyInfo.userRequests.length - 1]}`);
        }

        if (keyInfo.toolCalls.length > 0) {
            const tools = keyInfo.toolCalls.map(tc => tc.tool).join(', ');
            parts.push(`Tools used: ${tools}`);
        }

        if (keyInfo.errors.length > 0) {
            parts.push(`Errors encountered: ${keyInfo.errors.length}`);
        }

        if (keyInfo.decisions.length > 0) {
            parts.push(`Key decisions: ${keyInfo.decisions.length} made`);
        }

        parts.push(`Messages compressed: ${messages.length}`);

        return parts.join('\n');
    }

    async _summarizeWithLLM(messages, keyInfo) {
        if (!this._llmProvider) return this._summarizeLocally(messages, keyInfo);

        try {
            const prompt = `Summarize this conversation concisely, preserving:
- What the user asked
- What tools were used and their results
- Key decisions made
- Any errors encountered
- Current state of the task

Messages to summarize:
${messages.map(m => `${m.role}: ${(m.content || '').substring(0, 200)}`).join('\n')}

Provide a concise summary (max 500 words):`;

            const response = await this._llmProvider.chat({
                messages: [{ role: 'user', content: prompt }],
                maxTokens: 500,
                temperature: 0.3,
            });

            return response.content || this._summarizeLocally(messages, keyInfo);
        } catch (e) {
            return this._summarizeLocally(messages, keyInfo);
        }
    }

    _summarizeToolCall(tc) {
        const name = tc.function?.name || tc.name || 'unknown';
        const args = tc.function?.arguments || tc.arguments || '';
        if (typeof args === 'string' && args.length > 100) {
            return `${name}(${args.substring(0, 100)}...)`;
        }
        return `${name}(...)`;
    }

    _estimateTokens(messages, tools = []) {
        // Rough estimation: 1 token ≈ 4 characters
        let total = 0;
        for (const msg of messages) {
            total += (msg.content || '').length / 4;
            if (msg.tool_calls) {
                total += JSON.stringify(msg.tool_calls).length / 4;
            }
        }
        if (tools) {
            total += JSON.stringify(tools).length / 4;
        }
        return Math.ceil(total);
    }
}

module.exports = { ContextCompactor };
module.exports.default = ContextCompactor;
