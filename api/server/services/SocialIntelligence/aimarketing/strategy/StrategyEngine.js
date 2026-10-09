/**
 * StrategyEngine — Generates marketing strategies from intelligence
 * =================================================================
 * Uses signals, opportunities, audience data, and market intelligence
 * to generate actionable marketing strategies.
 */

const { createLogger } = require('../logger');
const logger = createLogger('StrategyEngine');

class StrategyEngine {
  constructor() {
    this._strategies = new Map();
  }

  /**
   * Generate a strategy from intelligence data.
   * @param {object} params
   * @returns {object} Strategy
   */
  generateStrategy({
    objective,
    audience = {},
    opportunities = [],
    signals = [],
    constraints = {},
  }) {
    const id = `strat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Analyze opportunities
    const topOpportunities = opportunities.slice(0, 5);

    // Analyze audience
    const audienceSegments = audience.segments || [];
    const targetTopics = [...new Set(audienceSegments.flatMap((s) => s.topics || []))].slice(0, 10);

    // Analyze signals
    const signalSummary = this._summarizeSignals(signals);

    // Generate recommendations
    const recommendations = this._generateRecommendations({
      objective,
      opportunities: topOpportunities,
      signals: signalSummary,
      audience: audienceSegments,
      constraints,
    });

    // Generate content ideas
    const contentIdeas = this._generateContentIdeas(topOpportunities, targetTopics);

    // Generate channel recommendations
    const channels = this._recommendChannels(signals, audienceSegments);

    const strategy = {
      id,
      name: `Strategy: ${objective || 'General'}`,
      objective,
      status: 'draft',
      targetAudience: {
        segments: audienceSegments.map((s) => ({ id: s.id, name: s.name, size: s.size })),
        topics: targetTopics,
        platforms: [...new Set(signals.map((s) => s.source))],
      },
      opportunities: topOpportunities.map((o) => ({
        id: o.id,
        type: o.type,
        title: o.title,
        score: o.score,
      })),
      signalAnalysis: signalSummary,
      recommendations,
      contentIdeas,
      channels,
      timeline: {
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        phases: [
          { name: 'Research & Planning', duration: '1 week' },
          { name: 'Content Creation', duration: '1 week' },
          { name: 'Launch & Distribution', duration: '1 week' },
          { name: 'Measurement & Optimization', duration: '1 week' },
        ],
      },
      metrics: {
        targetImpressions: 10000,
        targetEngagement: 500,
        targetConversions: 50,
      },
      createdAt: Date.now(),
    };

    this._strategies.set(id, strategy);
    logger.info('Strategy generated', { id, objective });
    return strategy;
  }

  getStrategy(id) { return this._strategies.get(id) || null; }
  getAllStrategies() { return Array.from(this._strategies.values()); }

  _summarizeSignals(signals) {
    const byType = {};
    for (const s of signals) {
      byType[s.type] = (byType[s.type] || 0) + 1;
    }
    return {
      totalSignals: signals.length,
      byType,
      topTypes: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5),
      avgConfidence: signals.length > 0 ? Math.round(signals.reduce((a, s) => a + s.confidence, 0) / signals.length * 100) / 100 : 0,
    };
  }

  _generateRecommendations({ objective, opportunities, signals, audience, constraints }) {
    const recs = [];
    if (signals.totalSignals > 10) {
      recs.push({ priority: 'high', action: 'Create content addressing top pain points', rationale: `${signals.totalSignals} signals detected` });
    }
    if (opportunities.length > 0) {
      recs.push({ priority: 'high', action: `Address ${opportunities[0].type} opportunity`, rationale: `Highest scoring opportunity: ${opportunities[0].title}` });
    }
    if (audience.length > 0) {
      recs.push({ priority: 'medium', action: `Target ${audience[0].name} segment`, rationale: `${audience[0].size} members` });
    }
    recs.push({ priority: 'medium', action: 'Monitor competitor activity', rationale: 'Ongoing market intelligence' });
    return recs;
  }

  _generateContentIdeas(opportunities, topics) {
    const ideas = [];
    for (const opp of opportunities.slice(0, 3)) {
      ideas.push({
        type: 'blog_post',
        title: `How to Solve: ${opp.title}`,
        topics: opp.topics || topics.slice(0, 3),
        format: 'long_form',
        opportunity: opp.id,
      });
    }
    return ideas;
  }

  _recommendChannels(signals, audiences) {
    const sourceCounts = {};
    for (const s of signals) {
      sourceCounts[s.source] = (sourceCounts[s.source] || 0) + 1;
    }
    return Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, signalCount: count, priority: count > 5 ? 'high' : 'medium' }));
  }
}

module.exports = StrategyEngine;
