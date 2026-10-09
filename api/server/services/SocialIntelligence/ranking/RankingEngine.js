/**
 * RankingEngine — Multi-signal ranking for content and opportunities
 * =================================================================
 * Separates relevance, intent, recency, momentum, evidence, confidence.
 */

const { createLogger } = require('../logger');

const logger = createLogger('RankingEngine');

const DEFAULT_WEIGHTS = {
  relevance: 0.25,
  recency: 0.20,
  engagement: 0.20,
  intent: 0.15,
  confidence: 0.10,
  momentum: 0.10,
};

class RankingEngine {
  constructor(weights = {}) {
    this._weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Rank content items by multiple signals.
   * @param {object[]} items - Items to rank
   * @param {object} context - { query, intent, timeRange }
   * @returns {object[]} Ranked items with scores
   */
  rankContent(items, context = {}) {
    const scored = items.map((item) => {
      const scores = this._calculateScores(item, context);
      const weightedScore = this._weightedTotal(scores);
      return { ...item, _scores: scores, _rankScore: weightedScore };
    });

    return scored.sort((a, b) => b._rankScore - a._rankScore);
  }

  /**
   * Rank opportunities.
   * @param {object[]} opportunities
   * @returns {object[]}
   */
  rankOpportunities(opportunities) {
    return opportunities
      .map((opp) => {
        const score = (opp.demand || 0) * 0.3 + (opp.growth || 0) * 0.2 + (opp.relevance || 0) * 0.25 + (opp.confidence || 0) * 0.15 + (1 - (opp.competition || 0)) * 0.1;
        return { ...opp, _rankScore: Math.round(score * 100) / 100 };
      })
      .sort((a, b) => b._rankScore - a._rankScore);
  }

  /**
   * Rank creators by relevance and authority.
   */
  rankCreators(creators, topics = []) {
    return creators
      .map((creator) => {
        let relevance = 0;
        for (const topic of topics) {
          if ((creator.topics || []).includes(topic)) relevance += 0.2;
        }
        const authority = Math.min((creator.followers || 0) / 10000, 1);
        const engagement = creator.avgEngagement || 0;
        const score = relevance * 0.4 + authority * 0.3 + engagement * 0.3;
        return { ...creator, _rankScore: Math.round(score * 100) / 100 };
      })
      .sort((a, b) => b._rankScore - a._rankScore);
  }

  _calculateScores(item, context) {
    return {
      relevance: this._relevanceScore(item, context),
      recency: this._recencyScore(item),
      engagement: this._engagementScore(item),
      intent: this._intentScore(item),
      confidence: item.confidence || 0.5,
      momentum: item._momentum || 0.5,
    };
  }

  _relevanceScore(item, context) {
    if (!context.topics && !context.query) return 0.5;
    let score = 0;
    const text = `${item.title || ''} ${item.body || ''}`.toLowerCase();
    if (context.query && text.includes(context.query.toLowerCase())) score += 0.5;
    for (const topic of context.topics || []) {
      if ((item.topics || []).includes(topic)) score += 0.15;
      if (text.includes(topic)) score += 0.1;
    }
    return Math.min(score, 1);
  }

  _recencyScore(item) {
    const date = item.createdAt ? new Date(item.createdAt).getTime() : 0;
    if (!date) return 0.3;
    const ageHours = (Date.now() - date) / 3600000;
    if (ageHours < 1) return 1;
    if (ageHours < 24) return 0.9;
    if (ageHours < 168) return 0.7; // 7 days
    if (ageHours < 720) return 0.5; // 30 days
    return 0.3;
  }

  _engagementScore(item) {
    const m = item.metrics || {};
    const total = (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.views || 0);
    return Math.min(total / 1000, 1);
  }

  _intentScore(item) {
    const intent = item.intent || item.intentType || '';
    const highIntent = ['purchase_intent', 'decision_making', 'urgency'];
    const medIntent = ['question', 'comparison', 'recommendation_request'];
    if (highIntent.some((i) => intent.includes(i))) return 0.9;
    if (medIntent.some((i) => intent.includes(i))) return 0.6;
    return 0.3;
  }

  _weightedTotal(scores) {
    let total = 0;
    for (const [key, weight] of Object.entries(this._weights)) {
      total += (scores[key] || 0) * weight;
    }
    return Math.round(total * 1000) / 1000;
  }
}

module.exports = RankingEngine;
