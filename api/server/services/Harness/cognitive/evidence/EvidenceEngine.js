'use strict';

/**
 * EvidenceEngine - Tracks provenance, confidence, contradictions, and knowledge decay.
 */
class EvidenceEngine {
  constructor(config = {}) {
    this.config = config;
    this.bus = config.bus;
    this.claims = new Map();
    this.contradictions = [];
    this.decayRates = new Map();
  }

  async addClaim(claim) {
    const id = claim.id || `claim_${Date.now()}`;
    const entry = {
      id,
      content: claim.content,
      sources: claim.sources || [],
      confidence: claim.confidence || 0.5,
      createdAt: Date.now(),
      lastVerified: Date.now(),
      verificationCount: 0,
      status: 'active',
    };
    this.claims.set(id, entry);

    // Check for contradictions with existing claims
    const conflicts = await this.detectContradiction(entry);
    if (conflicts.length > 0) {
      entry.status = 'conflicted';
      this.contradictions.push({ claimId: id, conflicts: conflicts.map(c => c.id) });
    }

    return entry;
  }

  async verify(claimId) {
    const claim = this.claims.get(claimId);
    if (!claim) return null;
    claim.verificationCount++;
    claim.lastVerified = Date.now();
    return claim;
  }

  async detectContradiction(newClaim) {
    const conflicts = [];
    for (const [id, existing] of this.claims) {
      if (id === newClaim.id) continue;
      if (existing.status === 'forgotten') continue;

      // Simple contradiction detection: opposite statements about same topic
      const existingWords = (existing.content || '').toLowerCase().split(/\s+/);
      const newWords = (newClaim.content || '').toLowerCase().split(/\s+/);
      const overlap = existingWords.filter(w => newWords.includes(w) && w.length > 3);

      if (overlap.length >= 3) {
        // Check for negation patterns
        const negations = ['not', 'no', 'never', 'false', 'incorrect', 'wrong', 'no es', 'nunca', 'falso'];
        const existingNeg = negations.some(n => (existing.content || '').toLowerCase().includes(n));
        const newNeg = negations.some(n => (newClaim.content || '').toLowerCase().includes(n));

        if (existingNeg !== newNeg) {
          conflicts.push({ ...existing, reason: 'negation_detected' });
        }
      }
    }
    return conflicts;
  }

  async getConfidence(claimId) {
    const claim = this.claims.get(claimId);
    if (!claim) return 0;

    // Confidence degrades over time
    const age = Date.now() - claim.lastVerified;
    const decayFactor = Math.max(0.1, 1 - (age / (86400000 * 30)) * 0.01);
    return claim.confidence * decayFactor;
  }

  async detectDecay(claimId) {
    const claim = this.claims.get(claimId);
    if (!claim) return { decayed: false };

    const age = Date.now() - claim.createdAt;
    const daysSinceVerification = (Date.now() - claim.lastVerified) / 86400000;

    return {
      decayed: daysSinceVerification > 30,
      age: Math.floor(age / 86400000),
      daysSinceVerification: Math.floor(daysSinceVerification),
      recommendation: daysSinceVerification > 90 ? 'verify_or_forget' : daysSinceVerification > 30 ? 'verify' : 'fresh',
    };
  }

  async markOutdated(claimId) {
    const claim = this.claims.get(claimId);
    if (claim) claim.status = 'outdated';
  }

  getStats() {
    return {
      claims: this.claims.size,
      active: Array.from(this.claims.values()).filter(c => c.status === 'active').length,
      conflicted: Array.from(this.claims.values()).filter(c => c.status === 'conflicted').length,
      outdated: Array.from(this.claims.values()).filter(c => c.status === 'outdated').length,
      contradictions: this.contradictions.length,
    };
  }
}

module.exports = { EvidenceEngine };
