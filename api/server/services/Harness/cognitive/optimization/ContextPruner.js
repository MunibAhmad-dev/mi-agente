'use strict';

/**
 * ContextPruner - Determines which parts of context are needed.
 * Scores each context item by relevance, importance, recency, and
 * dependency, then selects items within token budget.
 */
class ContextPruner {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 8000,
      relevanceThreshold: config.relevanceThreshold || 0.3,
      weights: config.weights || {
        relevance: 0.35,
        importance: 0.25,
        recency: 0.20,
        dependency: 0.20,
      },
      ...config,
    };
    this.stats = { pruned: 0, kept: 0, tokensSaved: 0 };
  }

  /**
   * Score a context item.
   */
  _scoreItem(item, query) {
    const text = String(item.content || item.text || '');

    // Relevance: term overlap with query
    const qTerms = new Set(String(query).toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const tTerms = new Set(text.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    let overlap = 0;
    for (const t of qTerms) if (tTerms.has(t)) overlap++;
    const relevance = qTerms.size > 0 ? overlap / qTerms.size : 0;

    // Importance: from item or default
    const importance = item.importance || item.priority || 0.5;

    // Recency: decay by age
    const age = item.timestamp ? (Date.now() - item.timestamp) / (1000 * 60 * 60) : 24; // hours
    const recency = Math.exp(-age / 12);

    // Dependency: marked as required or has references
    const dependency = item.required ? 1.0 :
      (item.dependencies && item.dependencies.length > 0 ? 0.8 : 0.3);

    const w = this.config.weights;
    const score =
      relevance * w.relevance +
      importance * w.importance +
      recency * w.recency +
      dependency * w.dependency;

    return score;
  }

  /**
   * Prune context items to fit within token budget.
   */
  prune(items, query, tokenCountFn, tokenBudget) {
    if (!items || items.length === 0) return { kept: [], pruned: 0 };

    const budget = tokenBudget || this.config.maxTokens;

    // Score items
    const scored = items.map(item => ({
      item,
      score: this._scoreItem(item, query),
      tokens: tokenCountFn
        ? tokenCountFn(item.content || item.text || '')
        : Math.ceil(String(item.content || item.text || '').length / 4),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Always keep required items
    const required = scored.filter(s => s.item.required);
    const optional = scored.filter(s => !s.item.required);

    const kept = [];
    let usedTokens = 0;

    // Add required first
    for (const s of required) {
      if (usedTokens + s.tokens <= budget) {
        kept.push(s.item);
        usedTokens += s.tokens;
      }
    }

    // Add optional by score
    for (const s of optional) {
      if (s.score < this.config.relevanceThreshold) continue;
      if (usedTokens + s.tokens <= budget) {
        kept.push(s.item);
        usedTokens += s.tokens;
      }
    }

    this.stats.kept += kept.length;
    this.stats.pruned += (items.length - kept.length);
    this.stats.tokensSaved += (items.length - kept.length) * 100; // estimate

    return {
      kept,
      pruned: items.length - kept.length,
      total: items.length,
      tokensUsed: usedTokens,
      budget,
    };
  }

  /**
   * Multi-category context pruning.
   */
  pruneMultiCategory(context, query, tokenCountFn, totalBudget) {
    const categories = ['system', 'memory', 'rag', 'history', 'tools', 'task'];
    const perCategoryBudget = Math.floor(totalBudget / categories.length);

    const result = {};
    let totalUsed = 0;

    for (const cat of categories) {
      const items = context[cat] || [];
      const pruned = this.prune(items, query, tokenCountFn, perCategoryBudget);
      result[cat] = pruned.kept;
      totalUsed += pruned.tokensUsed;
    }

    return {
      context: result,
      tokensUsed: totalUsed,
      budget: totalBudget,
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { ContextPruner };
