/**
 * VisionComplexityRouter.js — Intelligent Vision Model Selection
 * 
 * Selects the right vision model based on task complexity:
 * - Simple: quick OCR, UI element detection, basic recognition
 * - Medium: detailed image analysis, object detection, scene understanding
 * - Hard: complex reasoning, fine-grained analysis, multi-step visual tasks
 * 
 * All models are open-source, permissive, and free:
 * - Simple: moondream2 (1.8B) — MIT
 * - Medium: llava:7b or qwen2-vl:7b — Apache 2.0
 * - Hard: llava:13b or qwen2-vl:32b — Apache 2.0
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[VisionRouter]', ...args),
    info: (...args) => console.info('[VisionRouter]', ...args),
    warn: (...args) => console.warn('[VisionRouter]', ...args),
    error: (...args) => console.error('[VisionRouter]', ...args),
};

/**
 * Vision model tiers
 */
const VISION_TIERS = {
    simple: {
        name: 'Simple Vision',
        description: 'Quick OCR, basic recognition, UI element detection',
        models: [
            { id: 'moondream', name: 'Moondream2', size: '1.8B', license: 'MIT', priority: 1 },
            { id: 'minicpm-v', name: 'MiniCPM-V', size: '3B', license: 'Apache-2.0', priority: 2 },
            { id: 'nanollava', name: 'NanoLLaVA', size: '1.8B', license: 'Apache-2.0', priority: 3 },
        ],
        maxResolution: 512,
        maxTokens: 512,
        latencyTarget: '500ms',
        useCases: ['OCR', 'UI detection', 'color analysis', 'basic object count', 'text extraction'],
    },
    medium: {
        name: 'Medium Vision',
        description: 'Detailed image analysis, object detection, scene understanding',
        models: [
            { id: 'llava:7b', name: 'LLaVA 1.6 7B', size: '7B', license: 'Apache-2.0', priority: 1 },
            { id: 'qwen2-vl:7b', name: 'Qwen2-VL 7B', size: '7B', license: 'Apache-2.0', priority: 2 },
            { id: 'bakllava', name: 'BakLLaVA', size: '7B', license: 'Apache-2.0', priority: 3 },
        ],
        maxResolution: 1024,
        maxTokens: 1024,
        latencyTarget: '2s',
        useCases: ['object detection', 'scene description', 'spatial reasoning', 'diagram analysis', 'code screenshot'],
    },
    hard: {
        name: 'Hard Vision',
        description: 'Complex reasoning, fine-grained analysis, multi-step visual tasks',
        models: [
            { id: 'llava:13b', name: 'LLaVA 1.6 13B', size: '13B', license: 'Apache-2.0', priority: 1 },
            { id: 'qwen2-vl:32b', name: 'Qwen2-VL 32B', size: '32B', license: 'Apache-2.0', priority: 2 },
            { id: 'llava:34b', name: 'LLaVA-Llama3 34B', size: '34B', license: 'Apache-2.0', priority: 3 },
        ],
        maxResolution: 2048,
        maxTokens: 2048,
        latencyTarget: '5s',
        useCases: ['complex diagrams', 'multi-page docs', 'visual reasoning', 'detailed UI analysis', 'medical/scientific images'],
    },
};

/**
 * Complexity keywords for classification
 */
const COMPLEXITY_SIGNALS = {
    simple: [
        'read text', 'ocr', 'screenshot', 'what does this say', 'extract text',
        'what color', 'how many', 'is there a button', 'find the', 'basic',
        'quick look', 'simple', 'read this', 'what is shown',
    ],
    medium: [
        'describe', 'analyze image', 'what is in', 'find objects', 'explain the',
        'how does', 'compare elements', 'layout', 'structure', 'diagram',
        'flowchart', 'chart', 'graph', 'UI', 'interface', 'screenshot analysis',
    ],
    hard: [
        'deep analysis', 'reason about', 'complex', 'multi-step', 'step by step',
        'what would happen', 'predict', 'compare and contrast', 'evaluate',
        'comprehensive', 'detailed analysis', 'investigate', 'audit',
        'medical', 'scientific', 'technical drawing', 'architecture diagram',
    ],
};

class VisionComplexityRouter extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'VisionComplexityRouter';
        this._ollamaBaseUrl = config.ollamaBaseUrl || 'http://localhost:11434';
        this._preferredModels = config.preferredModels || {};
        this._usageStats = { simple: 0, medium: 0, hard: 0 };
        this._fallbackTier = config.fallbackTier || 'simple';
    }

    /**
     * Classify the complexity of a vision task
     */
    classifyComplexity(prompt, options = {}) {
        const lower = (prompt || '').toLowerCase();
        
        // Check explicit override
        if (options.complexity && VISION_TIERS[options.complexity]) {
            return options.complexity;
        }

        // Score each tier
        const scores = { simple: 0, medium: 0, hard: 0 };
        
        for (const [tier, keywords] of Object.entries(COMPLEXITY_SIGNALS)) {
            for (const keyword of keywords) {
                if (lower.includes(keyword)) {
                    scores[tier] += 1;
                }
            }
        }

        // Image complexity hints
        if (options.imageSize) {
            const pixels = options.imageSize.width * options.imageSize.height;
            if (pixels > 2000000) scores.hard += 2;      // >2MP
            else if (pixels > 500000) scores.medium += 1;  // >0.5MP
            else scores.simple += 1;
        }

        // Longer prompts usually need more complex analysis
        if (prompt.length > 200) scores.hard += 1;
        else if (prompt.length > 100) scores.medium += 1;

        // Select tier with highest score
        const maxScore = Math.max(scores.simple, scores.medium, scores.hard);
        if (maxScore === 0) return this._fallbackTier;
        
        if (scores.hard >= scores.medium && scores.hard >= scores.simple) return 'hard';
        if (scores.medium >= scores.simple) return 'medium';
        return 'simple';
    }

    /**
     * Select the best model for a given complexity tier
     */
    selectModel(tier, availableModels = []) {
        const tierConfig = VISION_TIERS[tier] || VISION_TIERS[this._fallbackTier];
        
        // Check if user has a preferred model for this tier
        if (this._preferredModels[tier]) {
            const preferred = tierConfig.models.find(m => m.id === this._preferredModels[tier]);
            if (preferred) return { ...preferred, tier, tierName: tierConfig.name };
        }

        // Find the first available model
        for (const model of tierConfig.models) {
            const isAvailable = availableModels.some(am => 
                am.name && (am.name.includes(model.id) || model.id.includes(am.name))
            );
            if (isAvailable) {
                return { ...model, tier, tierName: tierConfig.name };
            }
        }

        // Return first model in tier (will need to be pulled)
        const fallback = tierConfig.models[0];
        return { ...fallback, tier, tierName: tierConfig.name, needsPull: true };
    }

    /**
     * Full route: classify -> select -> return config
     */
    async route(prompt, options = {}) {
        const startTime = Date.now();
        
        // Get available models from Ollama
        let availableModels = [];
        try {
            const http = require('http');
            availableModels = await new Promise((resolve, reject) => {
                http.get(`${this._ollamaBaseUrl}/api/tags`, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try { resolve(JSON.parse(data).models || []); }
                        catch (e) { resolve([]); }
                    });
                }).on('error', () => resolve([]));
            });
        } catch (e) { /* offline */ }

        // Classify
        const complexity = this.classifyComplexity(prompt, options);
        
        // Select model
        const selected = this.selectModel(complexity, availableModels);
        
        // Get tier config
        const tierConfig = VISION_TIERS[complexity];

        this._usageStats[complexity]++;

        const result = {
            complexity,
            tierConfig: { name: tierConfig.name, description: tierConfig.description, latencyTarget: tierConfig.latencyTarget },
            model: selected,
            maxResolution: tierConfig.maxResolution,
            maxTokens: tierConfig.maxTokens,
            availableModels: availableModels.map(m => m.name),
            routeTime: Date.now() - startTime,
        };

        logger.info(`[VisionRouter] Routed to ${complexity}: ${selected.name} (${selected.size})`);
        this.emit('route', result);

        return result;
    }

    /**
     * Get usage statistics
     */
    getStats() {
        return { ...this._usageStats, total: Object.values(this._usageStats).reduce((a, b) => a + b, 0) };
    }

    /**
     * Get all tiers info
     */
    getTiers() {
        return { ...VISION_TIERS };
    }
}

module.exports = { VisionComplexityRouter, VISION_TIERS, COMPLEXITY_SIGNALS };
module.exports.default = VisionComplexityRouter;
