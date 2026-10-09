/**
 * ModelPipeline.js — Multi-Model Pipeline Engine
 * 
 * Execute tasks through multiple models:
 * - Sequential pipelines
 * - Parallel pipelines
 * - Result aggregation
 * - Fallback chains
 * 
 * License: MIT
 * RAM: ~3MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[ModelPipeline]', ...args),
    info: (...args) => console.info('[ModelPipeline]', ...args),
    warn: (...args) => console.warn('[ModelPipeline]', ...args),
    error: (...args) => console.error('[ModelPipeline]', ...args),
};

class ModelPipeline extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'ModelPipeline';
        this._pipelines = new Map();
        this._llmProviders = config.llmProviders || {};
    }

    /**
     * Create a pipeline.
     */
    createPipeline(config) {
        const { id, stages, strategy = 'sequential' } = config;

        const pipeline = {
            id: id || `pipe_${Date.now()}`,
            stages: stages.map((s, i) => ({
                id: s.id || `stage_${i}`,
                model: s.model,
                provider: s.provider,
                prompt: s.prompt,
                transform: s.transform || null,
                condition: s.condition || null,
                timeout: s.timeout || 30000,
            })),
            strategy, // sequential, parallel, fallback, voting
            createdAt: Date.now(),
            executions: 0,
        };

        this._pipelines.set(pipeline.id, pipeline);
        logger.info(`[ModelPipeline] Created pipeline ${pipeline.id}: ${stages.length} stages (${strategy})`);
        return pipeline;
    }

    /**
     * Execute a pipeline.
     */
    async execute(pipelineId, input, options = {}) {
        const pipeline = this._pipelines.get(pipelineId);
        if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);

        pipeline.executions++;
        const startTime = Date.now();

        logger.info(`[ModelPipeline] Executing pipeline ${pipelineId}`);

        try {
            let result;

            switch (pipeline.strategy) {
                case 'sequential':
                    result = await this._executeSequential(pipeline, input, options);
                    break;
                case 'parallel':
                    result = await this._executeParallel(pipeline, input, options);
                    break;
                case 'fallback':
                    result = await this._executeFallback(pipeline, input, options);
                    break;
                case 'voting':
                    result = await this._executeVoting(pipeline, input, options);
                    break;
                default:
                    result = await this._executeSequential(pipeline, input, options);
            }

            const duration = Date.now() - startTime;
            logger.info(`[ModelPipeline] Pipeline ${pipelineId} completed in ${duration}ms`);

            return {
                success: true,
                pipelineId,
                result,
                duration,
                stages: result.stages || [],
            };
        } catch (err) {
            const duration = Date.now() - startTime;
            logger.error(`[ModelPipeline] Pipeline ${pipelineId} failed: ${err.message}`);
            return {
                success: false,
                pipelineId,
                error: err.message,
                duration,
            };
        }
    }

    /**
     * Get pipeline stats.
     */
    getStats(pipelineId) {
        const pipeline = this._pipelines.get(pipelineId);
        if (!pipeline) return null;

        return {
            id: pipeline.id,
            stages: pipeline.stages.length,
            strategy: pipeline.strategy,
            executions: pipeline.executions,
            createdAt: pipeline.createdAt,
        };
    }

    // ── Internal ──────────────────────────────────────────────

    async _executeSequential(pipeline, input, options) {
        let currentInput = input;
        const stages = [];

        for (const stage of pipeline.stages) {
            if (stage.condition && !stage.condition(currentInput)) {
                stages.push({ id: stage.id, skipped: true });
                continue;
            }

            const stageResult = await this._callModel(stage, currentInput, options);
            stages.push({ id: stage.id, result: stageResult });

            if (stage.transform) {
                currentInput = stage.transform(currentInput, stageResult);
            } else {
                currentInput = stageResult;
            }
        }

        return { output: currentInput, stages };
    }

    async _executeParallel(pipeline, input, options) {
        const promises = pipeline.stages.map(stage => {
            if (stage.condition && !stage.condition(input)) {
                return Promise.resolve({ id: stage.id, skipped: true });
            }
            return this._callModel(stage, input, options)
                .then(result => ({ id: stage.id, result }));
        });

        const results = await Promise.allSettled(promises);
        const stages = results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason.message });

        // Aggregate results
        const outputs = stages.filter(s => s.result).map(s => s.result);
        const output = outputs.length === 1 ? outputs[0] : outputs.join('\n\n');

        return { output, stages };
    }

    async _executeFallback(pipeline, input, options) {
        const errors = [];

        for (const stage of pipeline.stages) {
            try {
                const result = await this._callModel(stage, input, options);
                return { output: result, stages: [{ id: stage.id, result }], fallbackUsed: false };
            } catch (err) {
                errors.push({ id: stage.id, error: err.message });
                logger.warn(`[ModelPipeline] Stage ${stage.id} failed, trying next: ${err.message}`);
            }
        }

        throw new Error(`All pipeline stages failed: ${errors.map(e => e.error).join(', ')}`);
    }

    async _executeVoting(pipeline, input, options) {
        const promises = pipeline.stages.map(stage =>
            this._callModel(stage, input, options)
                .then(result => ({ id: stage.id, result }))
                .catch(err => ({ id: stage.id, error: err.message }))
        );

        const results = await Promise.allSettled(promises);
        const successful = results
            .filter(r => r.status === 'fulfilled' && r.value.result)
            .map(r => r.value.result);

        if (successful.length === 0) {
            throw new Error('All voting stages failed');
        }

        // Simple majority voting (return most common result)
        const counts = {};
        for (const result of successful) {
            const key = typeof result === 'string' ? result : JSON.stringify(result);
            counts[key] = (counts[key] || 0) + 1;
        }

        const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        const output = successful.find(r => {
            const key = typeof r === 'string' ? r : JSON.stringify(r);
            return key === winner[0];
        });

        return { output, stages: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message }), votes: counts };
    }

    async _callModel(stage, input, options) {
        const provider = this._llmProviders[stage.provider];
        if (!provider) {
            throw new Error(`Provider not available: ${stage.provider}`);
        }

        const prompt = typeof stage.prompt === 'function'
            ? stage.prompt(input)
            : `${stage.prompt}\n\n${input}`;

        const response = await Promise.race([
            provider.chat({ messages: [{ role: 'user', content: prompt }], model: stage.model }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Pipeline stage timeout')), stage.timeout)),
        ]);

        return response.content || response;
    }
}

module.exports = { ModelPipeline };
module.exports.default = ModelPipeline;
