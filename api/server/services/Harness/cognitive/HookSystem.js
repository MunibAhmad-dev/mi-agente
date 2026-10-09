/**
 * HookSystem.js — Pre/Post Tool Hooks
 * 
 * Deterministic enforcement like Claude Code hooks:
 * - PreToolUse: Before a tool is executed
 * - PostToolUse: After a tool is executed
 * - PrePrompt: Before sending to LLM
 * - PostPrompt: After receiving from LLM
 * - Permission gates
 * - Audit logging
 * 
 * License: MIT
 * RAM: ~2MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[HookSystem]', ...args),
    info: (...args) => console.info('[HookSystem]', ...args),
    warn: (...args) => console.warn('[HookSystem]', ...args),
    error: (...args) => console.error('[HookSystem]', ...args),
};

const HookType = {
    PRE_TOOL_USE: 'pre_tool_use',
    POST_TOOL_USE: 'post_tool_use',
    PRE_PROMPT: 'pre_prompt',
    POST_PROMPT: 'post_prompt',
    ON_ERROR: 'on_error',
    ON_APPROVAL: 'on_approval',
};

class HookSystem extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'HookSystem';
        this._hooks = new Map();
        this._auditLog = [];
        this._maxAuditLog = config.maxAuditLog || 1000;
        this._enabled = config.enabled !== false;
    }

    /**
     * Register a hook.
     */
    register(hookType, hook) {
        if (!this._hooks.has(hookType)) {
            this._hooks.set(hookType, []);
        }

        const entry = {
            id: `hook_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: hook.name || 'unnamed',
            handler: hook.handler,
            priority: hook.priority || 0,
            enabled: hook.enabled !== false,
            conditions: hook.conditions || {},
        };

        this._hooks.get(hookType).push(entry);
        this._hooks.get(hookType).sort((a, b) => b.priority - a.priority);

        logger.info(`[HookSystem] Registered hook: ${entry.name} (${hookType})`);
        return entry.id;
    }

    /**
     * Unregister a hook.
     */
    unregister(hookType, hookId) {
        const hooks = this._hooks.get(hookType);
        if (!hooks) return false;

        const index = hooks.findIndex(h => h.id === hookId);
        if (index === -1) return false;

        hooks.splice(index, 1);
        return true;
    }

    /**
     * Execute pre-tool hooks.
     */
    async executePreToolHooks(toolName, params, context) {
        if (!this._enabled) return { allowed: true };

        const hooks = this._hooks.get(HookType.PRE_TOOL_USE) || [];
        const results = [];

        for (const hook of hooks) {
            if (!hook.enabled) continue;

            // Check conditions
            if (hook.conditions.tools && !hook.conditions.tools.includes(toolName)) {
                continue;
            }

            try {
                const result = await hook.handler({
                    toolName,
                    params,
                    context,
                    hookName: hook.name,
                });

                results.push({
                    hookId: hook.id,
                    hookName: hook.name,
                    result,
                });

                // If any hook blocks, the tool is blocked
                if (result && result.blocked) {
                    this._audit('pre_tool_blocked', { toolName, hook: hook.name, reason: result.reason });
                    return {
                        allowed: false,
                        reason: result.reason || `Blocked by hook: ${hook.name}`,
                        hookResults: results,
                    };
                }
            } catch (error) {
                logger.error(`[HookSystem] Hook error: ${hook.name}: ${error.message}`);
                results.push({
                    hookId: hook.id,
                    hookName: hook.name,
                    error: error.message,
                });
            }
        }

        this._audit('pre_tool_executed', { toolName, hooksExecuted: results.length });
        return { allowed: true, hookResults: results };
    }

    /**
     * Execute post-tool hooks.
     */
    async executePostToolHooks(toolName, params, result, context) {
        if (!this._enabled) return { processed: true };

        const hooks = this._hooks.get(HookType.POST_TOOL_USE) || [];
        const hookResults = [];

        for (const hook of hooks) {
            if (!hook.enabled) continue;

            if (hook.conditions.tools && !hook.conditions.tools.includes(toolName)) {
                continue;
            }

            try {
                const hookResult = await hook.handler({
                    toolName,
                    params,
                    result,
                    context,
                    hookName: hook.name,
                });

                hookResults.push({
                    hookId: hook.id,
                    hookName: hook.name,
                    result: hookResult,
                });
            } catch (error) {
                logger.error(`[HookSystem] Post-hook error: ${hook.name}: ${error.message}`);
            }
        }

        this._audit('post_tool_executed', { toolName, hooksExecuted: hookResults.length });
        return { processed: true, hookResults };
    }

    /**
     * Execute pre-prompt hooks.
     */
    async executePrePromptHooks(messages, context) {
        if (!this._enabled) return { messages };

        const hooks = this._hooks.get(HookType.PRE_PROMPT) || [];
        let modifiedMessages = [...messages];

        for (const hook of hooks) {
            if (!hook.enabled) continue;

            try {
                const result = await hook.handler({
                    messages: modifiedMessages,
                    context,
                    hookName: hook.name,
                });

                if (result && result.messages) {
                    modifiedMessages = result.messages;
                }
            } catch (error) {
                logger.error(`[HookSystem] Pre-prompt hook error: ${hook.name}: ${error.message}`);
            }
        }

        return { messages: modifiedMessages };
    }

    /**
     * Get audit log.
     */
    getAuditLog(limit = 100) {
        return this._auditLog.slice(-limit);
    }

    /**
     * Get hook statistics.
     */
    getStats() {
        const stats = {};
        for (const [type, hooks] of this._hooks) {
            stats[type] = {
                total: hooks.length,
                enabled: hooks.filter(h => h.enabled).length,
            };
        }
        return stats;
    }

    /**
     * List all registered hooks.
     */
    listHooks() {
        const all = [];
        for (const [type, hooks] of this._hooks) {
            for (const hook of hooks) {
                all.push({
                    type,
                    id: hook.id,
                    name: hook.name,
                    priority: hook.priority,
                    enabled: hook.enabled,
                });
            }
        }
        return all;
    }

    // ── Internal ──────────────────────────────────────────────

    _audit(event, data) {
        this._auditLog.push({
            event,
            data,
            timestamp: Date.now(),
        });

        if (this._auditLog.length > this._maxAuditLog) {
            this._auditLog = this._auditLog.slice(-this._maxAuditLog);
        }
    }
}

module.exports = { HookSystem, HookType };
module.exports.default = HookSystem;
