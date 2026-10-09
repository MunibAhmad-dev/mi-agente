'use strict';

/**
 * MemoryCompressor - Compresses and optimizes memory storage.
 *
 * Features:
 * - Deduplication: merge identical/similar memories
 * - Compression: summarize long memories into key facts
 * - Selective Activation: only load memory zones relevant to current query
 * - Decay: old/unimportant memories lose priority
 * - Archival: very old memories move to archive
 */
class MemoryCompressor {
  constructor(config = {}) {
    this.config = config;
    this.compressionStats = { compressed: 0, deduplicated: 0, archived: 0, activated: 0 };
    this.archive = [];
  }

  /**
   * Compress a set of memories - merge duplicates, summarize.
   */
  async compress(memories) {
    if (!memories || memories.length === 0) return memories;

    // Step 1: Deduplicate
    const deduplicated = this._deduplicate(memories);
    this.compressionStats.deduplicated += memories.length - deduplicated.length;

    // Step 2: Compress similar memories
    const compressed = this._compressSimilar(deduplicated);
    this.compressionStats.compressed += deduplicated.length - compressed.length;

    // Step 3: Apply decay
    const decayed = this._applyDecay(compressed);

    return decayed;
  }

  /**
   * Selectively activate only relevant memory zones for a query.
   */
  selectiveActivate(query, allMemories) {
    const q = (query || '').toLowerCase();
    const activated = {
      relevant: [],
      loaded: 0,
      skipped: 0,
    };

    // Score each memory for relevance
    for (const memory of allMemories) {
      const text = (memory.content || memory.text || '').toLowerCase();
      const score = this._relevanceScore(q, text);

      if (score > 0.1) {
        activated.relevant.push({ ...memory, activationScore: score });
        activated.loaded++;
      } else {
        activated.skipped++;
      }
    }

    // Sort by relevance
    activated.relevant.sort((a, b) => b.activationScore - a.activationScore);
    this.compressionStats.activated += activated.loaded;

    return activated;
  }

  /**
   * Archive old memories.
   */
  async archive(memories, maxAge = 90 * 24 * 60 * 60 * 1000) { // 90 days
    const now = Date.now();
    const toArchive = [];
    const toKeep = [];

    for (const mem of memories) {
      const age = now - (mem.timestamp || now);
      if (age > maxAge && (mem.importance || 'low') !== 'critical') {
        toArchive.push(mem);
      } else {
        toKeep.push(mem);
      }
    }

    this.archive.push(...toArchive);
    this.compressionStats.archived += toArchive.length;

    return { kept: toKeep.length, archived: toArchive.length };
  }

  getStats() {
    return {
      ...this.compressionStats,
      archivedTotal: this.archive.length,
    };
  }

  // ===================== INTERNAL =====================

  _deduplicate(memories) {
    const seen = new Map();
    const result = [];

    for (const mem of memories) {
      const key = this._fingerprint(mem.content || mem.text || '');
      if (seen.has(key)) {
        // Merge: keep higher confidence
        const existing = seen.get(key);
        if ((mem.confidence || 0) > (existing.confidence || 0)) {
          result.splice(result.indexOf(existing), 1, mem);
          seen.set(key, mem);
        }
      } else {
        seen.set(key, mem);
        result.push(mem);
      }
    }

    return result;
  }

  _compressSimilar(memories) {
    // Group similar memories and summarize
    const groups = [];
    const used = new Set();

    for (let i = 0; i < memories.length; i++) {
      if (used.has(i)) continue;
      const group = [memories[i]];
      used.add(i);

      for (let j = i + 1; j < memories.length; j++) {
        if (used.has(j)) continue;
        const sim = this._relevanceScore(
          (memories[i].content || '').toLowerCase(),
          (memories[j].content || '').toLowerCase()
        );
        if (sim > 0.7) {
          group.push(memories[j]);
          used.add(j);
        }
      }

      if (group.length > 1) {
        // Compress group into single memory
        const compressed = {
          ...group[0],
          content: group.map(m => m.content || m.text).join(' | '),
          confidence: Math.max(...group.map(m => m.confidence || 0)),
          compressedFrom: group.length,
          timestamp: Math.max(...group.map(m => m.timestamp || 0)),
        };
        groups.push(compressed);
      } else {
        groups.push(memories[i]);
      }
    }

    return groups;
  }

  _applyDecay(memories) {
    const now = Date.now();
    return memories.map(mem => {
      const age = now - (mem.timestamp || now);
      const daysOld = age / (24 * 60 * 60 * 1000);
      // Decay: 10% per month, but never below 0.1 for important memories
      const decayFactor = Math.max(
        (mem.importance || 'medium') === 'high' ? 0.3 : 0.1,
        1 - (daysOld / 30) * 0.1
      );
      return { ...mem, decayFactor, effectiveScore: (mem.score || 0.5) * decayFactor };
    });
  }

  _fingerprint(text) {
    // Simple fingerprint: normalize and take first 50 chars
    return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
  }

  _relevanceScore(query, text) {
    if (!query || !text) return 0;
    const qWords = query.split(/\s+/).filter(w => w.length > 2);
    const tWords = text.split(/\s+/);
    if (qWords.length === 0 || tWords.length === 0) return 0;

    let matches = 0;
    for (const qw of qWords) {
      for (const tw of tWords) {
        if (tw.includes(qw) || qw.includes(tw)) { matches++; break; }
      }
    }
    return matches / qWords.length;
  }
}

module.exports = { MemoryCompressor };
