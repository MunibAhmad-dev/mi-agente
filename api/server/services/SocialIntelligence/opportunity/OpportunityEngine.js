/**
 * OpportunityEngine — Detects and scores opportunities
 * =====================================================
 * Analyzes signals, evidence, and audience data to find opportunities.
 */

const { OpportunityType } = require('../types');
const { createLogger } = require('../logger');

const logger = createLogger('OpportunityEngine');

class OpportunityEngine {
  constructor(signalEngine, evidenceEngine) {
    this._signals = signalEngine;
    this._evidence = evidenceEngine;
    this._opportunities = new Map();
  }

  /**
   * Detect opportunities from signals and content.
   * @param {object[]} signals
   * @param {object[]} contents
   * @returns {object[]} Detected opportunities
   */
  detectOpportunities(signals, contents) {
    const opportunities = [];

    // Group signals by type
    const byType = {};
    for (const signal of signals) {
      if (!byType[signal.type]) byType[signal.type] = [];
      byType[signal.type].push(signal);
    }

    // Detect purchase intent opportunities
    if (byType.purchase_intent?.length >= 2) {
      opportunities.push(this._createOpportunity({
        type: OpportunityType.PURCHASE_INTENT,
        title: 'Purchase Intent Detected',
        description: `${byType.purchase_intent.length} signals showing purchase intent`,
        signals: byType.purchase_intent.map((s) => s.id),
        score: this._scoreOpportunity(byType.purchase_intent),
      }));
    }

    // Detect unanswered questions
    if (byType.question?.length >= 3) {
      opportunities.push(this._createOpportunity({
        type: OpportunityType.UNANSWERED_QUESTION,
        title: 'Unanswered Questions Cluster',
        description: `${byType.question.length} questions detected on similar topics`,
        signals: byType.question.map((s) => s.id),
        score: this._scoreOpportunity(byType.question),
      }));
    }

    // Detect pain points (unmet needs)
    if (byType.pain_point?.length >= 2) {
      opportunities.push(this._createOpportunity({
        type: OpportunityType.UNMET_NEED,
        title: 'Pain Points Cluster',
        description: `${byType.pain_point.length} pain points detected`,
        signals: byType.pain_point.map((s) => s.id),
        score: this._scoreOpportunity(byType.pain_point),
      }));
    }

    // Detect content opportunities
    if (byType.recommendation_request?.length >= 2) {
      opportunities.push(this._createOpportunity({
        type: OpportunityType.CONTENT_OPPORTUNITY,
        title: 'Content Demand Detected',
        description: `${byType.recommendation_request.length} recommendation requests`,
        signals: byType.recommendation_request.map((s) => s.id),
        score: this._scoreOpportunity(byType.recommendation_request),
      }));
    }

    // Detect comparison/alternative opportunities
    if (byType.comparison?.length >= 2 || byType.alternative_seeking?.length >= 2) {
      const comparisonSignals = [...(byType.comparison || []), ...(byType.alternative_seeking || [])];
      opportunities.push(this._createOpportunity({
        type: OpportunityType.MARKET_GAP,
        title: 'Market Gap: Alternatives Needed',
        description: `${comparisonSignals.length} comparison/alternative signals`,
        signals: comparisonSignals.map((s) => s.id),
        score: this._scoreOpportunity(comparisonSignals),
      }));
    }

    // Detect trend opportunities
    if (byType.trend?.length >= 3) {
      opportunities.push(this._createOpportunity({
        type: OpportunityType.EMERGING_TREND,
        title: 'Emerging Trend Detected',
        description: `${byType.trend.length} trend signals`,
        signals: byType.trend.map((s) => s.id),
        score: this._scoreOpportunity(byType.trend),
      }));
    }

    // Sort by score
    opportunities.sort((a, b) => b.score - a.score);

    // Store
    for (const opp of opportunities) {
      this._opportunities.set(opp.id, opp);
    }

    logger.info('Opportunities detected', { count: opportunities.length });
    return opportunities;
  }

  /**
   * Get opportunity by ID.
   */
  getOpportunity(id) {
    return this._opportunities.get(id) || null;
  }

  /**
   * Get all opportunities.
   */
  getAllOpportunities() {
    return Array.from(this._opportunities.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Get opportunity summary.
   */
  getOpportunitySummary() {
    const opps = this.getAllOpportunities();
    return {
      total: opps.length,
      byType: opps.reduce((acc, o) => { acc[o.type] = (acc[o.type] || 0) + 1; return acc; }, {}),
      avgScore: opps.length > 0 ? Math.round(opps.reduce((a, o) => a + o.score, 0) / opps.length * 100) / 100 : 0,
      topOpportunities: opps.slice(0, 5).map((o) => ({ id: o.id, type: o.type, title: o.title, score: o.score })),
    };
  }

  _createOpportunity(data) {
    const evidence = data.signals
      .map((sigId) => {
        const signal = this._signals.getSignal(sigId);
        return signal?.evidence || [];
      })
      .flat()
      .filter(Boolean)
      .slice(0, 10);

    return {
      id: `opp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: data.type,
      title: data.title,
      description: data.description,
      signals: data.signals,
      evidence,
      score: data.score,
      demand: data.score,
      growth: 0.5,
      relevance: data.score,
      competition: 0.5,
      confidence: Math.min(data.score + 0.1, 1),
      status: 'new',
      topics: this._extractTopicsFromSignals(data.signals),
      detectedAt: Date.now(),
    };
  }

  _scoreOpportunity(signals) {
    if (!signals || signals.length === 0) return 0;
    const avgConfidence = signals.reduce((a, s) => a + (s.confidence || 0), 0) / signals.length;
    const countBonus = Math.min(signals.length / 10, 0.3);
    const strengthBonus = signals.reduce((a, s) => a + (s.strength || 0), 0) / signals.length * 0.2;
    return Math.round(Math.min(avgConfidence * 0.5 + countBonus + strengthBonus, 1) * 100) / 100;
  }

  _extractTopicsFromSignals(signalIds) {
    const topics = new Set();
    for (const id of signalIds) {
      const signal = this._signals.getSignal(id);
      if (signal?.topics) signal.topics.forEach((t) => topics.add(t));
    }
    return [...topics].slice(0, 10);
  }
}

module.exports = OpportunityEngine;
