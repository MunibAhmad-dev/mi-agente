/**
 * HybridSearch.js — Unified Hybrid Search Engine
 * 
 * Combines:
 * - BM25 keyword search
 * - Vector semantic search
 * - Metadata filtering
 * - Result merging with RRF (Reciprocal Rank Fusion)
 * 
 * License: MIT
 * RAM: ~5MB
 */

const logger = {
    debug: (...args) => console.log('[HybridSearch]', ...args),
    info: (...args) => console.info('[HybridSearch]', ...args),
};

class HybridSearch {
    constructor(config = {}) {
        this._name = 'HybridSearch';
        this._vectorStore = config.vectorStore || null;
        this._documents = new Map();
        this._invertedIndex = new Map(); // word -> [docIds]
        this._docIndex = new Map(); // docId -> { content, metadata }
        this._k1 = config.k1 || 1.5; // BM25 parameter
        this._b = config.b || 0.75; // BM25 parameter
        this._avgDocLength = 0;
    }

    /**
     * Index a document.
     */
    index(doc) {
        const id = doc.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const content = doc.content || doc.text || '';
        const metadata = doc.metadata || {};

        this._docIndex.set(id, { id, content, metadata, length: content.split(/\s+/).length });

        // Build inverted index
        const words = this._tokenize(content);
        for (const word of words) {
            if (!this._invertedIndex.has(word)) {
                this._invertedIndex.set(word, new Set());
            }
            this._invertedIndex.get(word).add(id);
        }

        // Update average document length
        this._updateAvgDocLength();

        // Index in vector store if available
        if (this._vectorStore) {
            try {
                this._vectorStore.add(id, content, metadata);
            } catch (err) {
                logger.warn(`[HybridSearch] Vector index failed: ${err.message}`);
            }
        }

        return id;
    }

    /**
     * Hybrid search combining BM25 + Vector.
     */
    async search(query, options = {}) {
        const { limit = 10, weights = { bm25: 0.5, vector: 0.5 }, metadata = {} } = options;

        const startTime = Date.now();

        // 1. BM25 search
        const bm25Results = this._bm25Search(query, limit * 2);

        // 2. Vector search
        let vectorResults = [];
        if (this._vectorStore) {
            try {
                vectorResults = await this._vectorStore.search(query, { limit: limit * 2 });
            } catch (err) {
                logger.warn(`[HybridSearch] Vector search failed: ${err.message}`);
            }
        }

        // 3. Merge results using RRF
        const merged = this._rrfMerge(bm25Results, vectorResults, weights, limit);

        // 4. Apply metadata filters
        const filtered = this._applyMetadataFilters(merged, metadata);

        const latency = Date.now() - startTime;
        logger.info(`[HybridSearch] Search completed: ${filtered.length} results (${latency}ms)`);

        return {
            results: filtered,
            total: filtered.length,
            latency,
            bm25Count: bm25Results.length,
            vectorCount: vectorResults.length,
        };
    }

    /**
     * Delete a document.
     */
    delete(docId) {
        const doc = this._docIndex.get(docId);
        if (!doc) return false;

        // Remove from inverted index
        const words = this._tokenize(doc.content);
        for (const word of words) {
            const postings = this._invertedIndex.get(word);
            if (postings) {
                postings.delete(docId);
                if (postings.size === 0) this._invertedIndex.delete(word);
            }
        }

        this._docIndex.delete(docId);
        this._updateAvgDocLength();

        if (this._vectorStore) {
            try {
                this._vectorStore.delete(docId);
            } catch (err) {}
        }

        return true;
    }

    /**
     * Get stats.
     */
    getStats() {
        return {
            documents: this._docIndex.size,
            terms: this._invertedIndex.size,
            avgDocLength: Math.round(this._avgDocLength),
            vectorStore: !!this._vectorStore,
        };
    }

    // ── Internal ──────────────────────────────────────────────

    _bm25Search(query, limit) {
        const queryTerms = this._tokenize(query);
        const scores = new Map();

        for (const term of queryTerms) {
            const postings = this._invertedIndex.get(term);
            if (!postings) continue;

            const df = postings.size; // Document frequency
            const idf = Math.log((this._docIndex.size - df + 0.5) / (df + 0.5) + 1);

            for (const docId of postings) {
                const doc = this._docIndex.get(docId);
                if (!doc) continue;

                const tf = this._termFrequency(term, doc.content);
                const score = idf * (tf * (this._k1 + 1)) / (tf + this._k1 * (1 - this._b + this._b * doc.length / this._avgDocLength));

                scores.set(docId, (scores.get(docId) || 0) + score);
            }
        }

        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([docId, score]) => {
                const doc = this._docIndex.get(docId);
                return { id: docId, score, content: doc?.content, metadata: doc?.metadata };
            });
    }

    _rrfMerge(bm25Results, vectorResults, weights, limit) {
        const k = 60; // RRF constant
        const mergedScores = new Map();

        // BM25 scores
        bm25Results.forEach((result, rank) => {
            const rrfScore = weights.bm25 / (k + rank + 1);
            mergedScores.set(result.id, {
                ...result,
                score: (mergedScores.get(result.id)?.score || 0) + rrfScore,
                bm25Rank: rank,
            });
        });

        // Vector scores
        vectorResults.forEach((result, rank) => {
            const rrfScore = weights.vector / (k + rank + 1);
            const existing = mergedScores.get(result.id) || { id: result.id, content: result.content, metadata: result.metadata };
            mergedScores.set(result.id, {
                ...existing,
                score: (existing.score || 0) + rrfScore,
                vectorRank: rank,
            });
        });

        return [...mergedScores.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    _applyMetadataFilters(results, filters) {
        if (!filters || Object.keys(filters).length === 0) return results;

        return results.filter(result => {
            if (!result.metadata) return true;
            for (const [key, value] of Object.entries(filters)) {
                if (result.metadata[key] !== value) return false;
            }
            return true;
        });
    }

    _tokenize(text) {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !this._isStopWord(w));
    }

    _isStopWord(word) {
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of',
            'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
            'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
            'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
            'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very']);
        return stopWords.has(word);
    }

    _termFrequency(term, content) {
        const words = this._tokenize(content);
        let count = 0;
        for (const word of words) {
            if (word === term) count++;
        }
        return count;
    }

    _updateAvgDocLength() {
        if (this._docIndex.size === 0) {
            this._avgDocLength = 0;
            return;
        }
        let totalLength = 0;
        for (const doc of this._docIndex.values()) {
            totalLength += doc.length;
        }
        this._avgDocLength = totalLength / this._docIndex.size;
    }
}

module.exports = { HybridSearch };
module.exports.default = HybridSearch;
