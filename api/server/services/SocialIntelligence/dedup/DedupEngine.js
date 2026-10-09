/**
 * DedupEngine — Eliminates duplicate content across sources
 * ==========================================================
 * Uses multi-level dedup: exact IDs, URLs, content hashes, and text similarity.
 */

const { createLogger } = require('../logger');

const logger = createLogger('DedupEngine');

class DedupEngine {
  constructor() {
    this._seenUrls = new Map(); // url → contentId
    this._seenHashes = new Map(); // hash → contentId
    this._seenSourceIds = new Map(); // source:sourceId → contentId
    this._contentIndex = new Map(); // contentId → content (for fuzzy match)
  }

  /**
   * Check if content is a duplicate.
   * @param {object} content - Normalized content
   * @returns {object} { isDuplicate, duplicateOf, method }
   */
  checkDuplicate(content) {
    if (!content) return { isDuplicate: false };

    // Level 1: Exact source ID match
    const sourceKey = `${content.source}:${content.sourceId}`;
    if (content.sourceId && this._seenSourceIds.has(sourceKey)) {
      return {
        isDuplicate: true,
        duplicateOf: this._seenSourceIds.get(sourceKey),
        method: 'source_id',
        confidence: 1.0,
      };
    }

    // Level 2: URL match
    if (content.url) {
      const normalizedUrl = this._normalizeUrl(content.url);
      if (this._seenUrls.has(normalizedUrl)) {
        return {
          isDuplicate: true,
          duplicateOf: this._seenUrls.get(normalizedUrl),
          method: 'url',
          confidence: 0.95,
        };
      }
    }

    // Level 3: Content hash match
    if (content.hash) {
      if (this._seenHashes.has(content.hash)) {
        return {
          isDuplicate: true,
          duplicateOf: this._seenHashes.get(content.hash),
          method: 'hash',
          confidence: 0.9,
        };
      }
    }

    // Level 4: Text similarity (fuzzy)
    const fuzzyMatch = this._findFuzzyMatch(content);
    if (fuzzyMatch) {
      return {
        isDuplicate: true,
        duplicateOf: fuzzyMatch.id,
        method: 'fuzzy',
        confidence: fuzzyMatch.similarity,
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Register content as seen.
   * @param {object} content
   */
  register(content) {
    if (!content || !content.id) return;

    const sourceKey = `${content.source}:${content.sourceId}`;
    if (content.sourceId) this._seenSourceIds.set(sourceKey, content.id);
    if (content.url) this._seenUrls.set(this._normalizeUrl(content.url), content.id);
    if (content.hash) this._seenHashes.set(content.hash, content.id);
    this._contentIndex.set(content.id, {
      id: content.id,
      text: `${content.title || ''} ${content.body || ''}`.toLowerCase().slice(0, 500),
      source: content.source,
    });
  }

  /**
   * Deduplicate a batch of content.
   * @param {object[]} contents
   * @returns {object} { unique, duplicates, stats }
   */
  deduplicateBatch(contents) {
    const unique = [];
    const duplicates = [];
    let skipCount = 0;

    for (const content of contents) {
      const check = this.checkDuplicate(content);
      if (check.isDuplicate) {
        duplicates.push({ content, ...check });
        skipCount++;
      } else {
        this.register(content);
        unique.push(content);
      }
    }

    logger.info('Batch dedup complete', {
      total: contents.length,
      unique: unique.length,
      duplicates: skipCount,
    });

    return {
      unique,
      duplicates,
      stats: {
        total: contents.length,
        unique: unique.length,
        duplicates: skipCount,
        reductionRate: contents.length > 0 ? Math.round((skipCount / contents.length) * 100) : 0,
      },
    };
  }

  /**
   * Get dedup statistics.
   */
  getStats() {
    return {
      urls: this._seenUrls.size,
      hashes: this._seenHashes.size,
      sourceIds: this._seenSourceIds.size,
      contents: this._contentIndex.size,
    };
  }

  /**
   * Clear all tracked data.
   */
  clear() {
    this._seenUrls.clear();
    this._seenHashes.clear();
    this._seenSourceIds.clear();
    this._contentIndex.clear();
  }

  // ─── HELPERS ─────────────────────────────────────────────────

  _normalizeUrl(url) {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/+$/, '');
    } catch {
      return url.toLowerCase();
    }
  }

  _findFuzzyMatch(content) {
    const text = `${content.title || ''} ${content.body || ''}`.toLowerCase().slice(0, 500);
    if (!text || text.length < 20) return null;

    for (const [id, indexed] of this._contentIndex) {
      if (indexed.source === content.source) continue; // Same source = already caught by source ID
      const similarity = this._textSimilarity(text, indexed.text);
      if (similarity >= 0.85) {
        return { id, similarity: Math.round(similarity * 100) / 100 };
      }
    }
    return null;
  }

  /**
   * Jaccard similarity for short texts.
   */
  _textSimilarity(a, b) {
    const setA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
    const setB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}

module.exports = DedupEngine;
