'use strict';

const crypto = require('crypto');

/**
 * DeduplicationEngine - Removes exact and near-duplicate content
 * from messages, documents, tool results, and memory before sending to LLM.
 */
class DeduplicationEngine {
  constructor(config = {}) {
    this.config = {
      similarityThreshold: config.similarityThreshold || 0.85,
      maxHistory: config.maxHistory || 200,
      ...config,
    };
    this.seenHashes = new Set();
    this.seenContent = []; // For semantic dedup
    this.stats = { exactRemoved: 0, semanticRemoved: 0, totalProcessed: 0 };
  }

  /**
   * Normalize text for exact comparison.
   */
  _normalize(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Content hash.
   */
  _hash(text) {
    return crypto.createHash('md5').update(this._normalize(text)).digest('hex');
  }

  /**
   * Simple term-frequency vector.
   */
  _tf(text) {
    const words = this._normalize(text).split(/\s+/).filter(w => w.length > 2);
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    return freq;
  }

  _similarity(a, b) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (!keysA.length && !keysB.length) return 1;
    let dot = 0, nA = 0, nB = 0;
    for (const k of new Set([...keysA, ...keysB])) {
      const va = a[k] || 0;
      const vb = b[k] || 0;
      dot += va * vb;
      nA += va * va;
      nB += vb * vb;
    }
    const denom = Math.sqrt(nA) * Math.sqrt(nB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Deduplicate messages array - removes exact and semantic duplicates.
   */
  deduplicateMessages(messages) {
    if (!Array.isArray(messages)) return messages || [];

    const result = [];
    for (const msg of messages) {
      const text = msg.content || '';
      if (!text || text.length < 10) {
        result.push(msg);
        continue;
      }

      this.stats.totalProcessed++;

      // Exact dedup
      const hash = this._hash(text);
      if (this.seenHashes.has(hash)) {
        this.stats.exactRemoved++;
        continue;
      }
      this.seenHashes.add(hash);

      // Semantic dedup
      const tf = this._tf(text);
      let isDuplicate = false;
      for (const seen of this.seenContent) {
        if (this._similarity(tf, seen.tf) >= this.config.similarityThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (isDuplicate) {
        this.stats.semanticRemoved++;
        continue;
      }

      this.seenContent.push({ tf, hash });

      // Trim history
      if (this.seenContent.length > this.config.maxHistory) {
        this.seenContent = this.seenContent.slice(-this.config.maxHistory);
      }
      if (this.seenHashes.size > this.config.maxHistory * 2) {
        this.seenHashes = new Set([...this.seenHashes].slice(-this.config.maxHistory));
      }

      result.push(msg);
    }

    return result;
  }

  /**
   * Deduplicate document/RAG results.
   */
  deduplicateDocuments(docs) {
    if (!Array.isArray(docs)) return docs || [];

    const seen = new Set();
    return docs.filter(doc => {
      const text = doc.content || doc.text || '';
      const hash = this._hash(text);
      if (seen.has(hash)) return false;
      seen.add(hash);
      return true;
    });
  }

  /**
   * Deduplicate tool results.
   */
  deduplicateToolResults(results) {
    if (!Array.isArray(results)) return results || [];

    const seen = new Set();
    return results.filter(r => {
      const hash = this._hash(JSON.stringify(r));
      if (seen.has(hash)) return false;
      seen.add(hash);
      return true;
    });
  }

  /**
   * Merge similar messages into concise summaries.
   */
  mergeSimilar(messages) {
    if (!messages || messages.length < 2) return messages || [];

    const groups = [];
    const used = new Set();

    for (let i = 0; i < messages.length; i++) {
      if (used.has(i)) continue;
      const group = [messages[i]];
      used.add(i);

      for (let j = i + 1; j < messages.length; j++) {
        if (used.has(j)) continue;
        const tfA = this._tf(messages[i].content || '');
        const tfB = this._tf(messages[j].content || '');
        if (this._similarity(tfA, tfB) >= this.config.similarityThreshold) {
          group.push(messages[j]);
          used.add(j);
        }
      }

      groups.push(group);
    }

    // Merge groups with multiple items
    return groups.map(group => {
      if (group.length === 1) return group[0];

      // Keep the longest message as base
      const longest = group.reduce((a, b) =>
        (a.content || '').length > (b.content || '').length ? a : b
      );

      return {
        ...longest,
        _merged: group.length,
        content: longest.content + ` [merged ${group.length - 1} similar messages]`,
      };
    });
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    this.seenHashes.clear();
    this.seenContent = [];
    this.stats = { exactRemoved: 0, semanticRemoved: 0, totalProcessed: 0 };
  }
}

module.exports = { DeduplicationEngine };
