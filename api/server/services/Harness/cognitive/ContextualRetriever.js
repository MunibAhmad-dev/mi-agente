/**
 * ContextualRetriever.js — Contextual Retrieval Enhancement
 * 
 * Enhances retrieval with context:
 * - Add document context to chunks
 * - Prepend context for better retrieval
 * - Rank by contextual relevance
 * 
 * License: MIT
 * RAM: ~2MB
 */

class ContextualRetriever {
    constructor(config = {}) {
        this._name = 'ContextualRetriever';
        this._contextWindow = config.contextWindow || 2;
    }

    enhanceChunks(chunks, fullDocument) {
        const docLines = fullDocument.split('\n');
        return chunks.map(chunk => {
            const chunkStart = this._findChunkStart(docLines, chunk.content || chunk.text || '');
            const contextBefore = docLines.slice(Math.max(0, chunkStart - this._contextWindow), chunkStart).join('\n');
            const contextAfter = docLines.slice(chunkStart + 1, chunkStart + 1 + this._contextWindow).join('\n');
            return { ...chunk, contextBefore, contextAfter, enhanced: true, originalContent: chunk.content || chunk.text };
        });
    }

    rankByContext(query, enhancedChunks) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        return enhancedChunks.map(chunk => {
            const fullContext = `${chunk.contextBefore} ${chunk.originalContent} ${chunk.contextAfter}`.toLowerCase();
            let score = 0;
            for (const word of queryWords) { if (fullContext.includes(word)) score++; }
            return { ...chunk, contextScore: Math.round((score / queryWords.length) * 100) };
        }).sort((a, b) => b.contextScore - a.contextScore);
    }

    _findChunkStart(lines, content) {
        const firstLine = content.split('\n')[0].trim().substring(0, 50);
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(firstLine)) return i;
        }
        return 0;
    }
}

module.exports = { ContextualRetriever };
module.exports.default = ContextualRetriever;
