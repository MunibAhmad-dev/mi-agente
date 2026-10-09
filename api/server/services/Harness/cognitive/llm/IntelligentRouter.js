/**
 * IntelligentRouter.js — Intelligent Model Router
 * 
 * Classifies tasks by complexity and routes to the optimal model:
 * - Deterministic (grep, ls, cat) → local/cheap model
 * - Simple (resumen, traducción) → small model
 * - Medium (code gen, debug) → medium model
 * - Complex (architecture, planning) → large model
 * - Specialized (vision, audio) → specialized model
 * 
 * Learns from success/failure to improve routing.
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[IntelligentRouter]', ...args),
    info: (...args) => console.info('[IntelligentRouter]', ...args),
    warn: (...args) => console.warn('[IntelligentRouter]', ...args),
    error: (...args) => console.error('[IntelligentRouter]', ...args),
};

const TaskComplexity = {
    DETERMINISTIC: 'deterministic',
    SIMPLE: 'simple',
    MEDIUM: 'medium',
    COMPLEX: 'complex',
    SPECIALIZED: 'specialized',
};

const ModelTier = {
    LOCAL: 'local',
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large',
    SPECIALIZED: 'specialized',
};

class IntelligentRouter extends EventEmitter {
    constructor(config = {}) {
        super();
        this._models = config.models || this._getDefaultModels();
        this._routingHistory = [];
        this._successRates = new Map();
        this._modelCosts = config.modelCosts || {};
    }

    /**
     * Route a task to the optimal model.
     */
    route(task, options = {}) {
        const complexity = this._classifyTask(task);
        const model = this._selectModel(complexity, options);

        logger.info(`[IntelligentRouter] Task classified as ${complexity}, routing to ${model.name}`);

        this.emit('routed', { task: task.substring(0, 100), complexity, model: model.name });

        return {
            model: model.name,
            provider: model.provider,
            complexity,
            reason: model.reason,
            estimatedCost: model.cost,
        };
    }

    /**
     * Record outcome of a routing decision.
     */
    recordOutcome(modelName, success, tokens = 0) {
        const key = modelName;
        if (!this._successRates.has(key)) {
            this._successRates.set(key, { success: 0, total: 0, tokens: 0 });
        }
        const stats = this._successRates.get(key);
        stats.total++;
        if (success) stats.success++;
        stats.tokens += tokens;

        this._routingHistory.push({
            model: modelName,
            success,
            tokens,
            timestamp: Date.now(),
        });

        // Keep only last 1000 entries
        if (this._routingHistory.length > 1000) {
            this._routingHistory = this._routingHistory.slice(-1000);
        }
    }

    /**
     * Get routing statistics.
     */
    getStats() {
        const stats = {};
        for (const [model, data] of this._successRates) {
            stats[model] = {
                successRate: data.total > 0 ? data.success / data.total : 0,
                total: data.total,
                tokens: data.tokens,
            };
        }
        return stats;
    }

    /**
     * Get recommended model for a task description.
     */
    recommend(task) {
        const complexity = this._classifyTask(task);
        const model = this._selectModel(complexity, {});
        return { complexity, model: model.name, reason: model.reason };
    }

    // ── Internal ──────────────────────────────────────────────

    _classifyTask(task) {
        const taskLower = task.toLowerCase();

        // Deterministic: file operations, simple lookups
        const deterministicPatterns = [
            /list\s+(files?|directories?|folders?)/i,
            /read\s+(file|this)/i,
            /what\s+(is|are)\s+the\s+(files?|contents?)/i,
            /show\s+(me\s+)?(file|directory|folder)/i,
            /find\s+(file|directory)/i,
            /grep/i,
            /search\s+(for|in)/i,
        ];

        // Simple: summaries, translations, simple questions
        const simplePatterns = [
            /summar(ize|ise)/i,
            /translate/i,
            /explain\s+(this|it|what)/i,
            /what\s+(does|is)\s+this/i,
            /convert/i,
            /format/i,
            /rename/i,
        ];

        // Medium: code generation, debugging
        const mediumPatterns = [
            /write\s+(code|function|class|module|component)/i,
            /create\s+(a\s+)?(file|function|class|module|component|component)/i,
            /fix\s+(the\s+)?(bug|error|issue)/i,
            /debug/i,
            /refactor/i,
            /implement/i,
            /add\s+(a\s+)?(function|method|feature|capability)/i,
            /update\s+(the\s+)?(code|function|class)/i,
        ];

        // Complex: architecture, planning, multi-step
        const complexPatterns = [
            /design\s+(the\s+)?(architecture|system|database|api)/i,
            /plan\s+(the\s+)?(implementation|migration|refactor)/i,
            /architect/i,
            /optimize\s+(the\s+)?(performance|memory|speed)/i,
            /integrate\s+(with|multiple|all)/i,
            /build\s+(a\s+)?(complete|full|entire)/i,
            /migrate/i,
            /rewrite/i,
        ];

        // Specialized: vision, audio, complex analysis
        const specializedPatterns = [
            /screenshot/i,
            /image/i,
            /visual/i,
            /audio/i,
            /voice/i,
            /speech/i,
            /ocr/i,
        ];

        for (const p of complexPatterns) if (p.test(task)) return TaskComplexity.COMPLEX;
        for (const p of specializedPatterns) if (p.test(task)) return TaskComplexity.SPECIALIZED;
        for (const p of mediumPatterns) if (p.test(task)) return TaskComplexity.MEDIUM;
        for (const p of simplePatterns) if (p.test(task)) return TaskComplexity.SIMPLE;
        for (const p of deterministicPatterns) if (p.test(task)) return TaskComplexity.DETERMINISTIC;

        // Default to medium
        return TaskComplexity.MEDIUM;
    }

    _selectModel(complexity, options) {
        const preferredProvider = options.preferProvider || null;

        // Find models for this complexity tier
        const tierMap = {
            [TaskComplexity.DETERMINISTIC]: ModelTier.LOCAL,
            [TaskComplexity.SIMPLE]: ModelTier.SMALL,
            [TaskComplexity.MEDIUM]: ModelTier.MEDIUM,
            [TaskComplexity.COMPLEX]: ModelTier.LARGE,
            [TaskComplexity.SPECIALIZED]: ModelTier.SPECIALIZED,
        };

        const targetTier = tierMap[complexity];

        // Find best model in tier
        let candidates = this._models.filter(m => m.tier === targetTier);

        // Filter by preferred provider
        if (preferredProvider) {
            const providerMatch = candidates.filter(m => m.provider === preferredProvider);
            if (providerMatch.length > 0) candidates = providerMatch;
        }

        // Filter by success rate
        candidates = candidates.filter(m => {
            const stats = this._successRates.get(m.name);
            if (!stats || stats.total < 5) return true; // Not enough data, include
            return stats.successRate > 0.5;
        });

        // Sort by cost (cheapest first)
        candidates.sort((a, b) => (a.cost || 0) - (b.cost || 0));

        const selected = candidates[0] || this._models.find(m => m.tier === ModelTier.MEDIUM) || this._models[0];

        return {
            ...selected,
            reason: `Task complexity: ${complexity} → tier ${targetTier}`,
        };
    }

    _getDefaultModels() {
        return [
            // LOCAL tier (deterministic tasks)
            { name: 'llama3.2:3b', provider: 'ollama', tier: ModelTier.LOCAL, cost: 0 },
            { name: 'qwen2.5:3b', provider: 'ollama', tier: ModelTier.LOCAL, cost: 0 },
            { name: 'phi3:mini', provider: 'ollama', tier: ModelTier.LOCAL, cost: 0 },

            // SMALL tier (simple tasks)
            { name: 'gpt-4o-mini', provider: 'openai', tier: ModelTier.SMALL, cost: 0.15 },
            { name: 'claude-3-haiku', provider: 'anthropic', tier: ModelTier.SMALL, cost: 0.25 },
            { name: 'gemini-1.5-flash', provider: 'google', tier: ModelTier.SMALL, cost: 0.075 },

            // MEDIUM tier (code generation, debugging)
            { name: 'gpt-4o', provider: 'openai', tier: ModelTier.MEDIUM, cost: 2.5 },
            { name: 'claude-3.5-sonnet', provider: 'anthropic', tier: ModelTier.MEDIUM, cost: 3.0 },
            { name: 'gemini-1.5-pro', provider: 'google', tier: ModelTier.MEDIUM, cost: 1.25 },
            { name: 'deepseek-coder', provider: 'deepseek', tier: ModelTier.MEDIUM, cost: 0.14 },

            // LARGE tier (architecture, planning)
            { name: 'gpt-4.5', provider: 'openai', tier: ModelTier.LARGE, cost: 15.0 },
            { name: 'claude-3-opus', provider: 'anthropic', tier: ModelTier.LARGE, cost: 15.0 },
            { name: 'gemini-2.0', provider: 'google', tier: ModelTier.LARGE, cost: 5.0 },

            // SPECIALIZED tier (vision, audio)
            { name: 'gpt-4o', provider: 'openai', tier: ModelTier.SPECIALIZED, cost: 2.5 },
            { name: 'claude-3.5-sonnet', provider: 'anthropic', tier: ModelTier.SPECIALIZED, cost: 3.0 },
        ];
    }
}

module.exports = { IntelligentRouter, TaskComplexity, ModelTier };
module.exports.default = IntelligentRouter;
