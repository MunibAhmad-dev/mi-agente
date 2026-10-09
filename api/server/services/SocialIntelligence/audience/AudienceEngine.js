/**
 * AudienceEngine — Segments and profiles audiences
 * ==================================================
 * Rule-based, semantic, behavioral, and hybrid segmentation.
 */

const { SegmentMethod } = require('../types');
const { createLogger } = require('../logger');
const { getAudienceModel } = require('../schemas/audience.schema');

const logger = createLogger('AudienceEngine');

class AudienceEngine {
  constructor() {
    this._segments = new Map();
  }

  /**
   * Create an audience segment from rules.
   */
  createSegment({ name, description, rules = {}, topics = [], keywords = [], platforms = [] }) {
    const id = `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const segment = {
      id,
      name,
      description,
      method: SegmentMethod.RULE_BASED,
      rules,
      topics,
      keywords,
      platforms,
      size: 0,
      confidence: 0.5,
      accountIds: [],
      contentIds: [],
      digitalTwin: {
        topics: [],
        needs: [],
        questions: [],
        preferences: {},
        creators: [],
        communities: [],
        intent: [],
        trends: [],
        contentPreferences: {},
      },
      createdAt: Date.now(),
    };
    this._segments.set(id, segment);
    return segment;
  }

  /**
   * Segment content and accounts into audience segments.
   * @param {object[]} contents - Normalized contents
   * @param {object[]} signals - Extracted signals
   * @returns {object[]} Segments with populated data
   */
  segmentAudience(contents, signals) {
    const segments = [];

    // Group by intent signals
    const intentGroups = {};
    for (const signal of signals) {
      if (!intentGroups[signal.type]) intentGroups[signal.type] = [];
      intentGroups[signal.type].push(signal);
    }

    // Create segments from intent groups
    for (const [intentType, intentSignals] of Object.entries(intentGroups)) {
      if (intentSignals.length < 2) continue;

      const segment = this.createSegment({
        name: `Audience: ${intentType.replace(/_/g, ' ')}`,
        description: `People showing ${intentType.replace(/_/g, ' ')} signals`,
        rules: { signalType: intentType },
        topics: [...new Set(intentSignals.flatMap((s) => s.topics || []))].slice(0, 10),
        keywords: [...new Set(intentSignals.flatMap((s) => s.keywords || []))].slice(0, 10),
      });

      segment.size = intentSignals.length;
      segment.contentIds = intentSignals.map((s) => s.content?.id).filter(Boolean);
      segment.accountIds = intentSignals.map((s) => s.account?.id).filter(Boolean);

      // Build digital twin
      segment.digitalTwin = this._buildDigitalTwin(intentSignals, contents);
      segments.push(segment);
    }

    // Group by topics
    const topicGroups = {};
    for (const content of contents) {
      for (const topic of content.topics || []) {
        if (!topicGroups[topic]) topicGroups[topic] = [];
        topicGroups[topic].push(content);
      }
    }

    for (const [topic, topicContents] of Object.entries(topicGroups)) {
      if (topicContents.length < 3) continue;
      const segment = this.createSegment({
        name: `Topic: ${topic}`,
        description: `People interested in ${topic}`,
        rules: { topic },
        topics: [topic],
      });
      segment.size = topicContents.length;
      segment.contentIds = topicContents.map((c) => c.id);
      segment.method = SegmentMethod.SEMANTIC;
      segments.push(segment);
    }

    // Group by platform
    const platformGroups = {};
    for (const content of contents) {
      if (!platformGroups[content.source]) platformGroups[content.source] = [];
      platformGroups[content.source].push(content);
    }

    for (const [platform, platformContents] of Object.entries(platformGroups)) {
      const segment = this.createSegment({
        name: `Platform: ${platform}`,
        description: `Audience on ${platform}`,
        rules: { platform },
        platforms: [platform],
      });
      segment.size = platformContents.length;
      segment.contentIds = platformContents.map((c) => c.id);
      segments.push(segment);
    }

    logger.info('Audience segmented', { segments: segments.length });
    return segments;
  }

  /**
   * Get segment by ID.
   */
  getSegment(id) {
    return this._segments.get(id) || null;
  }

  /**
   * Get all segments.
   */
  getAllSegments() {
    return Array.from(this._segments.values());
  }

  /**
   * Get segment summary.
   */
  getSegmentSummary() {
    const segments = this.getAllSegments();
    return {
      totalSegments: segments.length,
      totalAccounts: new Set(segments.flatMap((s) => s.accountIds)).size,
      totalContents: new Set(segments.flatMap((s) => s.contentIds)).size,
      byMethod: segments.reduce((acc, s) => { acc[s.method] = (acc[s.method] || 0) + 1; return acc; }, {}),
    };
  }

  _buildDigitalTwin(signals, contents) {
    const topics = [...new Set(signals.flatMap((s) => s.topics || []))].slice(0, 10);
    const keywords = [...new Set(signals.flatMap((s) => s.keywords || []))].slice(0, 10);

    const needs = [];
    const questions = [];
    for (const signal of signals) {
      if (signal.type === 'question') questions.push(signal.keywords?.[0] || 'general');
      if (signal.type === 'pain_point') needs.push(signal.keywords?.[0] || 'general');
      if (signal.type === 'purchase_intent') needs.push('purchase');
    }

    return {
      topics,
      needs: [...new Set(needs)].slice(0, 10),
      questions: [...new Set(questions)].slice(0, 10),
      preferences: { topics, keywords },
      creators: [...new Set(signals.map((s) => s.account?.username).filter(Boolean))].slice(0, 10),
      communities: [],
      intent: [...new Set(signals.map((s) => s.type))].slice(0, 10),
      trends: [],
      contentPreferences: { topics, signalTypes: [...new Set(signals.map((s) => s.type))] },
    };
  }
}

module.exports = AudienceEngine;
