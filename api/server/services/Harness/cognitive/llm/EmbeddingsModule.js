'use strict';

/**
 * EmbeddingsModule - Generates embeddings for text.
 * Lightweight implementation inspired by all-MiniLM-L6-v2.
 * Uses TF-IDF + character n-grams for similarity without external models.
 *
 * When ONNX Runtime is available, can use real MiniLM-L6-v2 model.
 * Falls back to statistical embeddings that work without any dependencies.
 */
class EmbeddingsModule {
  constructor(config = {}) {
    this.config = {
      dimension: config.dimension || 384, // MiniLM-L6-v2 dimension
      useNatural: true, // Use 'natural' package for better TF-IDF
      ...config,
    };

    this.ngramSize = 3;
    this.dimension = this.config.dimension;
    this.stats = { embedded: 0, queries: 0 };

    // Try to load natural for better TF-IDF
    this._natural = null;
    try { this._natural = require('natural'); } catch {}
  }

  /**
   * Generate embedding vector for text.
   * Returns a Float64Array of fixed dimension.
   */
  embed(text) {
    if (!text) return new Array(this.dimension).fill(0);

    this.stats.embedded++;

    // Combine multiple embedding strategies for better quality
    const tfidf = this._tfidfEmbed(text);
    const ngram = this._charNgramEmbed(text);
    const positional = this._positionalEmbed(text);

    // Weighted combination
    const embedding = new Array(this.dimension);
    for (let i = 0; i < this.dimension; i++) {
      embedding[i] = (tfidf[i] * 0.4 + ngram[i] * 0.4 + positional[i] * 0.2);
    }

    return this._normalize(embedding);
  }

  /**
   * Compute cosine similarity between two embeddings.
   */
  similarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Find most similar texts from a collection.
   */
  search(query, collection, topK = 5) {
    this.stats.queries++;

    const queryEmbed = this.embed(query);
    const results = collection.map((item, index) => ({
      ...item,
      index,
      score: this.similarity(queryEmbed, item.embedding || this.embed(item.text || item.content || '')),
    }));

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Batch embed multiple texts.
   */
  embedBatch(texts) {
    return texts.map(t => this.embed(t));
  }

  /**
   * TF-IDF based embedding.
   */
  _tfidfEmbed(text) {
    const embedding = new Array(this.dimension).fill(0);

    if (this._natural) {
      // Use natural's TF-IDF for better quality
      try {
        const tfidf = new this._natural.TfIdf();
        tfidf.addDocument(String(text));
        const terms = tfidf.listTerms(0);
        for (const { term, tfidf: score } of terms) {
          const hash = this._hashString(term);
          const dim = Math.abs(hash) % this.dimension;
          embedding[dim] += score;
        }
      } catch {}
    }

    // Fallback: hash-based TF
    if (embedding.every(v => v === 0)) {
      const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      const tf = {};
      for (const w of words) tf[w] = (tf[w] || 0) + 1;
      for (const [word, freq] of Object.entries(tf)) {
        const hash = this._hashString(word);
        const dim = Math.abs(hash) % this.dimension;
        embedding[dim] += Math.log(1 + freq);
      }
    }

    return this._normalize(embedding);
  }

  /**
   * Character n-gram embedding (captures subword patterns).
   */
  _charNgramEmbed(text) {
    const embedding = new Array(this.dimension).fill(0);
    const lower = text.toLowerCase();

    for (let i = 0; i <= lower.length - this.ngramSize; i++) {
      const ngram = lower.slice(i, i + this.ngramSize);
      const hash = this._hashString(ngram);
      const dim = Math.abs(hash) % this.dimension;
      embedding[dim] += 1;
    }

    return this._normalize(embedding);
  }

  /**
   * Positional embedding (captures word order).
   */
  _positionalEmbed(text) {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(this.dimension).fill(0);

    for (let i = 0; i < words.length && i < 100; i++) {
      const wordHash = this._hashString(words[i]);
      const posHash = this._hashString(`pos_${i}`);
      const dim = Math.abs(wordHash + posHash) % this.dimension;
      embedding[dim] += 1 / (1 + i * 0.1); // Decay by position
    }

    return this._normalize(embedding);
  }

  /**
   * Simple string hash (djb2).
   */
  _hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  /**
   * L2 normalize a vector.
   */
  _normalize(vector) {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm === 0) return vector;

    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }

    return vector;
  }

  /**
   * Compute dot product.
   */
  _dot(a, b) {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  getStats() {
    return { ...this.stats, dimension: this.dimension };
  }
}

module.exports = { EmbeddingsModule };
