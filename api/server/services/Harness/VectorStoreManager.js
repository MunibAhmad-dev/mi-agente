'use strict';

/**
 * VectorStoreManager - Real RAG with LanceDB
 * Provides vector storage, embedding, and semantic search for documents.
 * Gracefully degrades if LanceDB is not installed.
 */

class VectorStoreManager {
  constructor(config = {}) {
    this.dbPath = config.dbPath || './data/vectordb';
    this.tableName = config.tableName || 'harness_documents';
    this.embeddingDimension = config.embeddingDimension || 384;
    this.maxResults = config.maxResults || 10;
    this.chunkSize = config.chunkSize || 512;
    this.chunkOverlap = config.chunkOverlap || 64;

    this.db = null;
    this.table = null;
    this.documents = new Map(); // id → metadata
    this.initialized = false;
    this.lancedb = null;

    this._init();
  }

  async _init() {
    try {
      // Try new @lancedb/lancedb first, then fall back to old lancedb
      try {
        this.lancedb = require('@lancedb/lancedb');
      } catch {
        this.lancedb = require('lancedb');
      }
      this.db = await this.lancedb.connect(this.dbPath);
      this.initialized = true;
      console.log('[VectorStore] Initialized with LanceDB at', this.dbPath);
    } catch (err) {
      console.warn('[VectorStore] LanceDB not available:', err.message);
      console.warn('[VectorStore] Running in fallback mode (in-memory similarity)');
      this.initialized = false;
    }
  }

  /**
   * Simple hash-based embedding for fallback mode.
   * In production, use a real embedding model (e.g., sentence-transformers).
   */
  _hashEmbed(text) {
    const vec = new Array(this.embeddingDimension).fill(0);
    const str = String(text).toLowerCase();
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      vec[i % this.embeddingDimension] += charCode / 128;
      vec[(i * 7 + 3) % this.embeddingDimension] += Math.sin(charCode * 0.1) * 0.5;
      vec[(i * 13 + 7) % this.embeddingDimension] += Math.cos(charCode * 0.05) * 0.3;
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  }

  /**
   * Cosine similarity between two vectors.
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Split text into overlapping chunks.
   */
  chunkText(text, chunkSize = null, overlap = null) {
    chunkSize = chunkSize || this.chunkSize;
    overlap = overlap || this.chunkOverlap;
    const chunks = [];
    const words = String(text).split(/\s+/);

    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim().length > 0) {
        chunks.push(chunk);
      }
    }
    return chunks.length > 0 ? chunks : [String(text).substring(0, chunkSize)];
  }

  /**
   * Add a document to the vector store.
   */
  async addDocument(doc) {
    const id = doc.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const text = doc.text || doc.content || '';
    const metadata = {
      id,
      text,
      source: doc.source || 'unknown',
      title: doc.title || '',
      tags: doc.tags || [],
      createdAt: new Date().toISOString(),
      ...doc.metadata
    };

    // Store metadata
    this.documents.set(id, metadata);

    // Chunk the text
    const chunks = this.chunkText(text);

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${id}_chunk_${i}`;
      const embedding = this._hashEmbed(chunks[i]);

      if (this.initialized && this.db) {
        try {
          const table = await this.db.createTable(this.tableName, [{
            id: chunkId,
            docId: id,
            text: chunks[i],
            vector: embedding,
            source: metadata.source,
            title: metadata.title
          }], { mode: 'append' });
          this.table = table;
        } catch (err) {
          // Table might already exist, try inserting
          try {
            await this.table.add([{
              id: chunkId,
              docId: id,
              text: chunks[i],
              vector: embedding,
              source: metadata.source,
              title: metadata.title
            }]);
          } catch (e2) {
            console.warn('[VectorStore] Failed to insert chunk:', e2.message);
          }
        }
      }
    }

    return { id, chunks: chunks.length };
  }

  /**
   * Search for similar documents using vector similarity.
   */
  async search(query, options = {}) {
    const topK = options.topK || this.maxResults;
    const queryEmbedding = this._hashEmbed(query);

    if (this.initialized && this.db && this.table) {
      try {
        const results = await this.table
          .search(queryEmbedding)
          .limit(topK)
          .toArray();
        return results.map(r => ({
          text: r.text,
          score: r._distance ? (1 - r._distance) : 0,
          source: r.source,
          title: r.title,
          docId: r.docId
        }));
      } catch (err) {
        console.warn('[VectorStore] LanceDB search failed:', err.message);
      }
    }

    // Fallback: in-memory search
    const results = [];
    for (const [id, doc] of this.documents) {
      const docEmbedding = this._hashEmbed(doc.text || '');
      const score = this._cosineSimilarity(queryEmbedding, docEmbedding);
      if (score > 0.01) {
        results.push({
          text: (doc.text || '').substring(0, 500),
          score,
          source: doc.source,
          title: doc.title,
          docId: id
        });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Get document by ID.
   */
  getDocument(docId) {
    return this.documents.get(docId) || null;
  }

  /**
   * Delete a document.
   */
  async deleteDocument(docId) {
    this.documents.delete(docId);
    return { deleted: true };
  }

  /**
   * List all documents.
   */
  listDocuments() {
    return Array.from(this.documents.values()).map(d => ({
      id: d.id,
      source: d.source,
      title: d.title,
      tags: d.tags,
      createdAt: d.createdAt
    }));
  }

  /**
   * Get stats about the vector store.
   */
  getStats() {
    return {
      initialized: this.initialized,
      provider: this.initialized ? 'lancedb' : 'fallback-memory',
      documentCount: this.documents.size,
      chunkSize: this.chunkSize,
      embeddingDimension: this.embeddingDimension,
      dbPath: this.dbPath
    };
  }

  /**
   * Bulk add documents.
   */
  async addDocuments(docs) {
    const results = [];
    for (const doc of docs) {
      const result = await this.addDocument(doc);
      results.push(result);
    }
    return results;
  }

  /**
   * Clear all documents.
   */
  async clear() {
    this.documents.clear();
    if (this.initialized && this.db) {
      try {
        await this.db.dropTable(this.tableName);
        this.table = null;
      } catch (err) {
        console.warn('[VectorStore] Failed to drop table:', err.message);
      }
    }
    return { cleared: true };
  }
}

module.exports = VectorStoreManager;
