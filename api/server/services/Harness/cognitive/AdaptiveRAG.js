/**
 * AdaptiveRAG.js — Adaptive Retrieval-Augmented Generation
 * 
 * Selects RAG strategy based on query:
 * - Simple queries → keyword search
 * - Complex queries → vector search
 * - Factual queries → hybrid search
 * - Exploratory queries → deep research
 * 
 * License: MIT
 * RAM: ~3MB
 */

const logger = {
    debug: (...args) => console.log('[AdaptiveRAG]', ...args),
    info: (...args) => console.info('[AdaptiveRAG]', ...args),
};

const QueryType = {
    FACTUAL: 'factual',
    EXPLORATORY: 'exploratory',
    COMPARATIVE: 'comparative',
    PROCEDURAL: 'procedural',
    OPINION: 'opinion',
};

const RAGStrategy = {
    KEYWORD: 'keyword',
    VECTOR: 'vector',
    HYBRID: 'hybrid',
    DEEP: 'deep',
    DIRECT: 'direct',
};

class AdaptiveRAG {
    constructor(config = {}) {
        this._name = 'AdaptiveRAG';
        this._ragEngine = config.ragEngine || null;
        this._searchEngine = config.searchEngine || null;
        this._memoryEngine = config.memoryEngine || null;
        this._stats = { queries: 0, byType: {}, byStrategy: {} };
    }

    /**
     * Process a query adaptively.
     */
    async query(queryText, options = {}) {
        this._stats.queries++;

        // 1. Classify query
        const queryType = this._classifyQuery(queryText);
        this._stats.byType[queryType] = (this._stats.byType[queryType] || 0) + 1;

        // 2. Select strategy
        const strategy = this._selectStrategy(queryType, options);
        this._stats.byStrategy[strategy] = (this._stats.byStrategy[strategy] || 0) + 1;

        logger.info(`[AdaptiveRAG] Query type: ${queryType}, Strategy: ${strategy}`);

        // 3. Execute strategy
        const result = await this._executeStrategy(strategy, queryText, options);

        // 4. Evaluate if we have enough evidence
        const evaluation = this._evaluateEvidence(result);

        return {
            query: queryText,
            queryType,
            strategy,
            result: evaluation.context,
            sources: evaluation.sources,
            confidence: evaluation.confidence,
            needsMore: evaluation.confidence < 0.6,
            stats: { chunks: evaluation.chunks, latency: evaluation.latency },
        };
    }

    /**
     * Get stats.
     */
    getStats() {
        return this._stats;
    }

    // ── Internal ──────────────────────────────────────────────

    _classifyQuery(query) {
        const lower = query.toLowerCase();

        // Factual: asks for specific information
        if (/\b(what|when|where|who|how many|how much|how old)\b/.test(lower)) {
            return QueryType.FACTUAL;
        }

        // Comparative: compares things
        if (/\b(compare|vs|versus|difference|better|worse|faster|slower)\b/.test(lower)) {
            return QueryType.COMPARATIVE;
        }

        // Procedural: how-to
        if (/\b(how to|how do|steps|guide|tutorial|install|setup|configure)\b/.test(lower)) {
            return QueryType.PROCEDURAL;
        }

        // Exploratory: open-ended
        if (/\b(explain|describe|tell me about|overview|summarize|analyze)\b/.test(lower)) {
            return QueryType.EXPLORATORY;
        }

        // Default to factual
        return QueryType.FACTUAL;
    }

    _selectStrategy(queryType, options) {
        if (options.forceStrategy) return options.forceStrategy;

        switch (queryType) {
            case QueryType.FACTUAL:
                return RAGStrategy.KEYWORD;
            case QueryType.PROCEDURAL:
                return RAGStrategy.HYBRID;
            case QueryType.COMPARATIVE:
                return RAGStrategy.VECTOR;
            case QueryType.EXPLORATORY:
                return RAGStrategy.DEEP;
            case QueryType.OPINION:
                return RAGStrategy.HYBRID;
            default:
                return RAGStrategy.HYBRID;
        }
    }

    async _executeStrategy(strategy, query, options) {
        const startTime = Date.now();

        switch (strategy) {
            case RAGStrategy.KEYWORD:
                return this._keywordSearch(query, options);
            case RAGStrategy.VECTOR:
                return this._vectorSearch(query, options);
            case RAGStrategy.HYBRID:
                return this._hybridSearch(query, options);
            case RAGStrategy.DEEP:
                return this._deepSearch(query, options);
            case RAGStrategy.DIRECT:
                return this._directAnswer(query, options);
            default:
                return this._hybridSearch(query, options);
        }
    }

    async _keywordSearch(query, options) {
        if (!this._ragEngine) return { chunks: [], sources: [] };

        try {
            const results = await this._ragEngine.search(query, { type: 'keyword', limit: options.limit || 5 });
            return { chunks: results.chunks || [], sources: results.sources || [] };
        } catch (err) {
            logger.warn(`[AdaptiveRAG] Keyword search failed: ${err.message}`);
            return { chunks: [], sources: [] };
        }
    }

    async _vectorSearch(query, options) {
        if (!this._ragEngine) return { chunks: [], sources: [] };

        try {
            const results = await this._ragEngine.search(query, { type: 'vector', limit: options.limit || 5 });
            return { chunks: results.chunks || [], sources: results.sources || [] };
        } catch (err) {
            logger.warn(`[AdaptiveRAG] Vector search failed: ${err.message}`);
            return { chunks: [], sources: [] };
        }
    }

    async _hybridSearch(query, options) {
        if (!this._ragEngine) return { chunks: [], sources: [] };

        try {
            const results = await this._ragEngine.search(query, { type: 'hybrid', limit: options.limit || 5 });
            return { chunks: results.chunks || [], sources: results.sources || [] };
        } catch (err) {
            logger.warn(`[AdaptiveRAG] Hybrid search failed: ${err.message}`);
            return this._keywordSearch(query, options);
        }
    }

    async _deepSearch(query, options) {
        // Combine RAG with web search
        const ragResults = await this._hybridSearch(query, options);

        if (this._searchEngine) {
            try {
                const webResults = await this._searchEngine.search(query, { limit: 3 });
                return {
                    chunks: [...ragResults.chunks, ...(webResults.chunks || [])],
                    sources: [...ragResults.sources, ...(webResults.sources || [])],
                };
            } catch (err) {
                logger.warn(`[AdaptiveRAG] Web search failed: ${err.message}`);
            }
        }

        return ragResults;
    }

    async _directAnswer(query, options) {
        // Check memory first
        if (this._memoryEngine) {
            try {
                const memories = await this._memoryEngine.recall(query, { limit: 3 });
                if (memories.length > 0) {
                    return { chunks: memories, sources: [] };
                }
            } catch (err) {
                // Ignore
            }
        }

        return this._hybridSearch(query, options);
    }

    _evaluateEvidence(result) {
        const { chunks, sources } = result;
        const totalChunks = chunks.length;
        const totalSources = sources.length;

        let confidence = 0;
        if (totalChunks > 0) confidence += 0.3;
        if (totalChunks > 3) confidence += 0.2;
        if (totalSources > 0) confidence += 0.3;
        if (totalSources > 2) confidence += 0.2;

        return {
            context: chunks.map(c => c.content || c.text || c).join('\n\n'),
            sources: sources.map(s => s.url || s),
            confidence: Math.min(1, confidence),
            chunks: totalChunks,
            latency: 0,
        };
    }
}

module.exports = { AdaptiveRAG, QueryType, RAGStrategy };
module.exports.default = AdaptiveRAG;
