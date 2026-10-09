/**
 * EvidenceEngine — Tracks and scores evidence for all claims
 * ===========================================================
 * Every assertion must have traceable evidence.
 * Types: OBSERVED, DERIVED, INFERRED, HYPOTHESIS
 */

const crypto = require('crypto');
const { EvidenceType } = require('../types');
const { createLogger } = require('../logger');
const { getEvidenceModel } = require('../schemas/evidence.schema');

const logger = createLogger('EvidenceEngine');

class EvidenceEngine {
  constructor() {
    this._evidenceCache = new Map(); // evidenceId → evidence
  }

  /**
   * Create an evidence entry from observed data.
   * @param {object} params
   * @returns {object} Evidence entry
   */
  createEvidence({
    source,
    url = '',
    content = '',
    timestamp = Date.now(),
    authorRef = '',
    processingMethod = 'direct',
    confidence = 0.5,
    type = EvidenceType.OBSERVED,
    metadata = {},
  }) {
    const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const hash = crypto.createHash('sha256')
      .update(`${source}:${url}:${content.slice(0, 500)}`)
      .digest('hex').slice(0, 16);

    const evidence = {
      id,
      source,
      url,
      content: content.slice(0, 5000),
      timestamp,
      retrievedAt: Date.now(),
      hash,
      authorRef,
      processingMethod,
      confidence: Math.max(0, Math.min(1, confidence)),
      type,
      metadata,
    };

    this._evidenceCache.set(id, evidence);
    logger.debug('Evidence created', { id, source, type });
    return evidence;
  }

  /**
   * Create evidence from a normalized content object.
   * @param {object} content - Normalized content
   * @returns {object} Evidence entry
   */
  createEvidenceFromContent(content) {
    return this.createEvidence({
      source: content.source,
      url: content.url,
      content: `${content.title} ${content.body}`.slice(0, 5000),
      timestamp: content.createdAt ? new Date(content.createdAt).getTime() : Date.now(),
      authorRef: content.author?.username || '',
      processingMethod: 'content_direct',
      confidence: 0.8,
      type: EvidenceType.OBSERVED,
      metadata: {
        sourceId: content.sourceId,
        metrics: content.metrics,
        topics: content.topics,
      },
    });
  }

  /**
   * Create derived evidence (from analysis of other evidence).
   * @param {object} params
   * @param {string[]} sourceEvidenceIds - IDs of source evidence
   * @returns {object} Evidence entry
   */
  createDerivedEvidence(params, sourceEvidenceIds = []) {
    return this.createEvidence({
      ...params,
      type: EvidenceType.DERIVED,
      processingMethod: 'analysis',
      metadata: { ...params.metadata, derivedFrom: sourceEvidenceIds },
    });
  }

  /**
   * Create inferred evidence (from patterns).
   * @param {object} params
   * @param {string[]} sourceEvidenceIds
   * @returns {object} Evidence entry
   */
  createInferredEvidence(params, sourceEvidenceIds = []) {
    return this.createEvidence({
      ...params,
      type: EvidenceType.INFERRED,
      processingMethod: 'inference',
      metadata: { ...params.metadata, inferredFrom: sourceEvidenceIds },
    });
  }

  /**
   * Get evidence by ID.
   * @param {string} id
   * @returns {object|null}
   */
  getEvidence(id) {
    return this._evidenceCache.get(id) || null;
  }

  /**
   * Get multiple evidence entries.
   * @param {string[]} ids
   * @returns {object[]}
   */
  getEvidenceBatch(ids) {
    return ids.map((id) => this._evidenceCache.get(id)).filter(Boolean);
  }

  /**
   * Verify that a claim has sufficient evidence.
   * @param {object} claim
   * @param {string[]} evidenceIds
   * @returns {object} Verification result
   */
  verifyClaim(claim, evidenceIds) {
    const evidence = this.getEvidenceBatch(evidenceIds);

    if (evidence.length === 0) {
      return {
        verified: false,
        confidence: 0,
        reason: 'NO_EVIDENCE',
        evidenceCount: 0,
      };
    }

    // Calculate aggregate confidence
    const confidences = evidence.map((e) => e.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const maxConfidence = Math.max(...confidences);

    // Count by type
    const byType = {};
    for (const e of evidence) {
      byType[e.type] = (byType[e.type] || 0) + 1;
    }

    // Check source diversity
    const sources = new Set(evidence.map((e) => e.source));
    const sourceDiversity = sources.size;

    // Score
    let score = avgConfidence * 0.4 + maxConfidence * 0.3;
    score += Math.min(sourceDiversity / 3, 1) * 0.2;
    score += Math.min(evidence.length / 5, 1) * 0.1;

    const verified = score >= 0.5 && evidence.length >= 2;

    return {
      verified,
      confidence: Math.round(score * 100) / 100,
      reason: verified ? 'SUFFICIENT_EVIDENCE' : 'INSUFFICIENT_EVIDENCE',
      evidenceCount: evidence.length,
      sourceDiversity,
      byType,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
    };
  }

  /**
   * Score the strength of evidence for a topic.
   * @param {string[]} evidenceIds
   * @returns {object} Evidence strength
   */
  scoreEvidenceStrength(evidenceIds) {
    const evidence = this.getEvidenceBatch(evidenceIds);
    if (evidence.length === 0) return { strength: 0, level: 'none' };

    const avgConf = evidence.reduce((a, e) => a + e.confidence, 0) / evidence.length;
    const sources = new Set(evidence.map((e) => e.source)).size;
    const hasObserved = evidence.some((e) => e.type === EvidenceType.OBSERVED);
    const hasDerived = evidence.some((e) => e.type === EvidenceType.DERIVED);

    let strength = avgConf * 0.3 + Math.min(sources / 3, 1) * 0.3 + Math.min(evidence.length / 5, 1) * 0.2;
    if (hasObserved) strength += 0.1;
    if (hasDerived) strength += 0.1;

    let level = 'weak';
    if (strength >= 0.8) level = 'strong';
    else if (strength >= 0.5) level = 'moderate';

    return {
      strength: Math.round(strength * 100) / 100,
      level,
      evidenceCount: evidence.length,
      sourceCount: sources,
      avgConfidence: Math.round(avgConf * 100) / 100,
    };
  }

  /**
   * Get all evidence for persistence.
   */
  getAllEvidence() {
    return Array.from(this._evidenceCache.values());
  }

  /**
   * Persist evidence to MongoDB.
   */
  async persist() {
    const Model = getEvidenceModel();
    if (!Model) {
      logger.debug('No MongoDB, evidence stored in memory only');
      return { persisted: 0 };
    }

    const evidence = this.getAllEvidence();
    let persisted = 0;
    for (const ev of evidence) {
      try {
        await Model.findOneAndUpdate(
          { evidenceId: ev.id },
          { $setOnInsert: ev },
          { upsert: true },
        );
        persisted++;
      } catch (err) {
        logger.error('Evidence persist failed', { id: ev.id, error: err.message });
      }
    }
    logger.info('Evidence persisted', { count: persisted });
    return { persisted };
  }
}

module.exports = EvidenceEngine;
