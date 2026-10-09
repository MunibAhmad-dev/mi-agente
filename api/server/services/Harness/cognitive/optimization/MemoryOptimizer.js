'use strict';

/**
 * MemoryOptimizer - Selectively retrieves only relevant memories
 * based on relevance, importance, recency, and token budget.
 */
class MemoryOptimizer {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 2000,
      relevanceWeight: config.relevanceWeight || 0.4,
      importanceWeight: config.importanceWeight || 0.3,
      recencyWeight: config.recencyWeight || 0.2,
      typeWeight: config.typeWeight || 0.1,
      ...config,
    };
    this.stats = { totalIn: 0, totalOut: 0, tokensSaved: 0 };
  }

  /**
   * Score a memory entry for relevance to the current query.
   */
  _scoreMemory(memory, query) {
    // Relevance: term overlap
    const memTerms = new Set(String(memory.content || memory.text || '').toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const queryTerms = new Set(String(query).toLowerCase().split(/\s+/).filter(w => w.length > 2));
    let overlap = 0;
    for (const t of queryTerms) {
      if (memTerms.has(t)) overlap++;
    }
    const relevance = queryTerms.size > 0 ? overlap / queryTerms.size : 0;

    // Importance: use stored importance or default
    const importance = memory.importance || memory.confidence || 0.5;

    // Recency: exponential decay from now
    const age = memory.timestamp ? (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24) : 30; // days
    const recency = Math.exp(-age / 7); // half-life ~5 days

    // Type priority: working > episodic > semantic > procedural
    const typePriorities = {
      working: 1.0,
      episodic: 0.9,
      user: 0.85,
      procedural: 0.7,
      semantic: 0.6,
      relational: 0.5,
      temporal: 0.4,
      meta: 0.3,
    };
    const type = memory.type || memory.memoryType || 'semantic';
    const typeScore = typePriorities[type] || 0.5;

    const finalScore =
      relevance * this.config.relevanceWeight +
      importance * this.config.importanceWeight +
      recency * this.config.recencyWeight +
      typeScore * this.config.typeWeight;

    return finalScore;
  }

  /**
   * Select only relevant memories within token budget.
   */
  optimize(memories, query, tokenCountFn, tokenBudget) {
    if (!memories || memories.length === 0) return { selected: [], saved: 0 };

    const budget = tokenBudget || this.config.maxTokens;
    this.stats.totalIn += memories.length;

    // Score and sort
    const scored = memories.map(m => ({
      memory: m,
      score: this._scoreMemory(m, query),
    })).sort((a, b) => b.score - a.score);

    // Select within budget
    const selected = [];
    let usedTokens = 0;

    for (const { memory, score } of scored) {
      const text = memory.content || memory.text || '';
      const tokens = tokenCountFn ? tokenCountFn(text) : Math.ceil(text.length / 4);

      if (usedTokens + tokens <= budget) {
        selected.push(memory);
        usedTokens += tokens;
      }
    }

    this.stats.totalOut += selected.length;
    this.stats.tokensSaved += (memories.length - selected.length);

    return {
      selected,
      count: selected.length,
      total: memories.length,
      removed: memories.length - selected.length,
      tokensUsed: usedTokens,
      budget,
    };
  }

  /**
   * Classify memories by type and relevance.
   */
  classify(memories) {
    const classified = {
      working: [],
      episodic: [],
      semantic: [],
      procedural: [],
      user: [],
      temporal: [],
      relational: [],
      meta: [],
    };

    for (const m of memories) {
      const type = m.type || m.memoryType || 'semantic';
      if (classified[type]) {
        classified[type].push(m);
      } else {
        classified.semantic.push(m);
      }
    }

    return classified;
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { MemoryOptimizer };
