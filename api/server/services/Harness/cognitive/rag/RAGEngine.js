'use strict';

/**
 * RAGEngine - Hybrid retrieval with BM25, vector, and graph search.
 */
class RAGEngine {
  constructor(config = {}) {
    this.config = config;
    this.bus = config.bus;
    this.documents = new Map();
    this.vectorStore = null;
    this.stats = { ingested: 0, retrieved: 0, reranked: 0 };

    // Try to use existing VectorStoreManager
    try {
      const VectorStoreManager = require('../../VectorStoreManager');
      this.vectorStore = new VectorStoreManager(config);
    } catch (e) {
      console.warn('[RAGEngine] VectorStore not available, using BM25 only');
    }

    // Smart Chunker
    try {
      const { SmartChunker } = require('./SmartChunker');
      this.smartChunker = new SmartChunker(config);
      console.log('[RAGEngine] SmartChunker loaded');
    } catch (e) {
      this.smartChunker = null;
    }

    // Semantic Compressor
    try {
      const { SemanticCompressor } = require('./SemanticCompressor');
      this.semanticCompressor = new SemanticCompressor(config);
      console.log('[RAGEngine] SemanticCompressor loaded');
    } catch (e) {
      this.semanticCompressor = null;
    }
  }

  async ingest(document) {
    const id = document.id || `doc_${Date.now()}`;
    const text = document.content || document.text || '';

    // Use SmartChunker for intelligent chunking
    let chunks;
    let compressed = null;
    if (this.smartChunker) {
      chunks = this.smartChunker.chunk(text);
      // Compress the document
      compressed = this.smartChunker.compressDocument(text);
    } else {
      chunks = this._chunkText(text);
    }

    // Use SemanticCompressor for compression
    if (this.semanticCompressor) {
      compressed = await this.semanticCompressor.compress(id, text);
    }

    const entry = {
      id,
      content: text,
      compressedContent: compressed?.compressed || compressed?.summary || text.substring(0, 500),
      keyFacts: compressed?.keyFacts || [],
      entities: compressed?.entities || [],
      title: document.title || '',
      source: document.source || 'unknown',
      metadata: document.metadata || {},
      chunks: Array.isArray(chunks) ? chunks.map(c => c.text || c) : chunks,
      compressionRatio: compressed?.ratio || 0,
      createdAt: Date.now(),
    };
    this.documents.set(id, entry);

    // Add compressed version to vector store (better for retrieval)
    if (this.vectorStore) {
      const searchText = entry.compressedContent + ' ' + (entry.keyFacts || []).join(' ');
      await this.vectorStore.addDocument({ id, text: searchText, source: entry.source, title: entry.title });
    }

    this.stats.ingested++;
    return entry;
  }

  async retrieve(query, options = {}) {
    const strategy = options.strategy || 'hybrid';
    const limit = options.limit || 10;
    let results = [];

    switch (strategy) {
      case 'vector':
        results = await this._vectorSearch(query, limit);
        break;
      case 'bm25':
        results = this._bm25Search(query, limit);
        break;
      case 'graph':
        results = this._graphSearch(query, limit);
        break;
      case 'hybrid':
      default:
        const vResults = await this._vectorSearch(query, Math.ceil(limit * 0.4));
        const bResults = this._bm25Search(query, Math.ceil(limit * 0.4));
        const gResults = this._graphSearch(query, Math.ceil(limit * 0.2));
        results = this._mergeResults([...vResults, ...bResults, ...gResults], limit);
        break;
    }

    // Rerank if requested
    if (options.rerank) {
      results = this.rerank(results, query);
    }

    this.stats.retrieved++;
    return results;
  }

  rerank(results, query) {
    // Simple reranking: boost results with more query term matches
    const q = (query || '').toLowerCase().split(/\s+/);
    return results.map(r => {
      const text = (r.content || r.text || '').toLowerCase();
      let boost = 0;
      for (const term of q) {
        if (term.length > 2 && text.includes(term)) boost += 0.1;
      }
      return { ...r, score: (r.score || 0) + boost };
    }).sort((a, b) => b.score - a.score);
  }

  async adaptStrategy(query) {
    // Simple heuristic: short queries → vector, long → BM25
    const wordCount = (query || '').split(/\s+/).length;
    if (wordCount <= 3) return 'vector';
    if (wordCount <= 10) return 'hybrid';
    return 'bm25';
  }

  async _vectorSearch(query, limit) {
    if (!this.vectorStore) return [];
    try {
      return await this.vectorStore.search(query, { topK: limit });
    } catch { return []; }
  }

  _bm25Search(query, limit) {
    const q = (query || '').toLowerCase().split(/\s+/);
    const results = [];
    for (const [, doc] of this.documents) {
      const text = (doc.content || '').toLowerCase();
      let score = 0;
      for (const term of q) {
        if (term.length < 2) continue;
        const tf = (text.match(new RegExp(term, 'g')) || []).length;
        const idf = Math.log(this.documents.size / (1 + Array.from(this.documents.values()).filter(d => (d.content || '').toLowerCase().includes(term)).length));
        score += tf * idf;
      }
      if (score > 0) results.push({ id: doc.id, content: doc.content, title: doc.title, source: doc.source, score, method: 'bm25' });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  _graphSearch(query, limit) {
    // Placeholder for graph-based retrieval
    return [];
  }

  _mergeResults(results, limit) {
    const seen = new Set();
    return results.filter(r => {
      const key = r.id || r.content;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
  }

  _chunkText(text, chunkSize = 512, overlap = 64) {
    const words = (text || '').split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }
    return chunks.length > 0 ? chunks : [text];
  }

  getStats() {
    return {
      ...this.stats,
      documents: this.documents.size,
      vectorStoreAvailable: !!this.vectorStore,
      smartChunker: !!this.smartChunker,
      semanticCompressor: !!this.semanticCompressor,
      compressionStats: this.semanticCompressor?.getStats() || null,
    };
  }
}

module.exports = { RAGEngine };
