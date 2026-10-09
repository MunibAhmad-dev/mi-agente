'use strict';

/**
 * RAGOptimizer - Optimizes RAG retrieval results for minimum tokens
 * with maximum relevance. Applies dedup, reranking, compression,
 * and token-budget-aware selection.
 */
class RAGOptimizer {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 4000,
      maxDocs: config.maxDocs || 10,
      similarityThreshold: config.similarityThreshold || 0.80,
      compressionRatio: config.compressionRatio || 0.6,
      ...config,
    };
    this.stats = { totalIn: 0, totalOut: 0, tokensSaved: 0 };
  }

  /**
   * Deduplicate RAG results by content similarity.
   */
  deduplicate(docs) {
    if (!docs || docs.length === 0) return [];

    const seen = [];
    return docs.filter(doc => {
      const text = doc.content || doc.text || '';
      const words = new Set(text.toLowerCase().split(/\s+/).filter(w => w.length > 2));

      for (const prev of seen) {
        const overlap = this._jaccard(words, prev);
        if (overlap >= this.config.similarityThreshold) return false;
      }

      seen.push(words);
      return true;
    });
  }

  _jaccard(a, b) {
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const union = a.size + b.size - inter;
    return union > 0 ? inter / union : 0;
  }

  /**
   * Rerank documents by relevance to query.
   */
  rerank(docs, query) {
    const queryTerms = new Set(String(query).toLowerCase().split(/\s+/).filter(w => w.length > 2));

    return docs.map(doc => {
      const text = (doc.content || doc.text || '').toLowerCase();
      const words = new Set(text.split(/\s+/).filter(w => w.length > 2));

      // Term overlap score
      let overlap = 0;
      for (const t of queryTerms) if (words.has(t)) overlap++;
      const termScore = queryTerms.size > 0 ? overlap / queryTerms.size : 0;

      // Position score (earlier docs usually more relevant)
      const posScore = doc.score || 0.5;

      // Length penalty (prefer concise docs)
      const lenScore = Math.min(1, 500 / Math.max(100, text.length));

      const finalScore = termScore * 0.5 + posScore * 0.3 + lenScore * 0.2;

      return { ...doc, _rerankScore: finalScore };
    }).sort((a, b) => b._rerankScore - a._rerankScore);
  }

  /**
   * Compress document content to key facts.
   */
  compressDocument(doc) {
    const text = doc.content || doc.text || '';
    if (text.length < 100) return doc; // Already short

    // Extract sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    // Score sentences by keyword density
    const allWords = text.toLowerCase().split(/\s+/);
    const wordFreq = {};
    for (const w of allWords) {
      if (w.length > 3) wordFreq[w] = (wordFreq[w] || 0) + 1;
    }

    const scored = sentences.map(s => {
      const words = s.toLowerCase().split(/\s+/);
      let score = 0;
      for (const w of words) {
        if (wordFreq[w] && wordFreq[w] > 1) score++;
      }
      return { sentence: s.trim(), score };
    }).sort((a, b) => b.score - a.score);

    // Take top sentences that fit budget
    const targetLen = Math.floor(text.length * this.config.compressionRatio);
    let compressed = '';
    for (const { sentence } of scored) {
      if (compressed.length + sentence.length <= targetLen) {
        compressed += sentence + ' ';
      }
    }

    return {
      ...doc,
      content: compressed.trim() || text.slice(0, targetLen),
      _compressed: true,
      _originalLength: text.length,
      _compressedLength: compressed.trim().length,
    };
  }

  /**
   * Optimize RAG results: dedup → rerank → compress → select.
   */
  optimize(docs, query, tokenCountFn, tokenBudget) {
    if (!docs || docs.length === 0) return { selected: [], saved: 0 };

    const budget = tokenBudget || this.config.maxTokens;
    this.stats.totalIn += docs.length;

    // Step 1: Deduplicate
    let optimized = this.deduplicate(docs);

    // Step 2: Rerank
    optimized = this.rerank(optimized, query);

    // Step 3: Compress and select within budget
    const selected = [];
    let usedTokens = 0;

    for (const doc of optimized) {
      const compressed = this.compressDocument(doc);
      const text = compressed.content || compressed.text || '';
      const tokens = tokenCountFn ? tokenCountFn(text) : Math.ceil(text.length / 4);

      if (usedTokens + tokens <= budget && selected.length < this.config.maxDocs) {
        selected.push(compressed);
        usedTokens += tokens;
      }
    }

    this.stats.totalOut += selected.length;
    this.stats.tokensSaved += (docs.length - selected.length);

    return {
      selected,
      count: selected.length,
      total: docs.length,
      removed: docs.length - selected.length,
      tokensUsed: usedTokens,
      budget,
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { RAGOptimizer };
