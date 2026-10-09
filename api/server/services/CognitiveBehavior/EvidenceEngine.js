'use strict';

/**
 * EvidenceEngine — Gen B Phase 13 (deepened).
 *
 * Real evidence-linking logic:
 *   - Claim extraction from free text
 *   - Source registry with credibility scores
 *   - Evidence chains linking evidence items to claims
 *   - Confidence scoring based on source quality + chain depth + verification count
 *   - Contradiction detection with negation analysis
 *   - Knowledge decay tracking
 */

const CLAIM_PATTERNS = [
  /\b(is|are|was|were|will be|has been|have been)\b/i,
  /\b(shows?|proves?|demonstrates?|confirms?|indicates?)\b/i,
  /\b(therefore|thus|hence|consequently|so)\b/i,
  /\b(according to|based on|research suggests?|studies? show)\b/i,
];

const NEGATION_WORDS = [
  'not', 'no', 'never', 'false', 'incorrect', 'wrong', 'untrue',
  'no es', 'nunca', 'falso', 'impossible', 'cannot', 'isn\'t', 'aren\'t',
  'wasn\'t', 'weren\'t', 'doesn\'t', 'don\'t', 'didn\'t',
];

class EvidenceEngine {
  constructor(config = {}) {
    this.config     = config;
    this.claims     = new Map();      // claimId → claim entry
    this.sources    = new Map();      // sourceId → source entry
    this.evidence   = new Map();      // evidenceId → evidence entry
    this.chains     = new Map();      // claimId → Set<evidenceId>
    this.contradictions = [];
    this._seq       = 0;
    this.stats      = { claimsAdded: 0, evidenceLinked: 0, chainsBuilt: 0, contradictionsFound: 0 };
  }

  // ── Source registry ────────────────────────────────────────────────────────

  /**
   * Register a source with a credibility score (0–1).
   * @param {{ id?, name, url?, type, credibility? }} source
   * @returns {object} registered source
   */
  registerSource(source) {
    const id = source.id || `src_${++this._seq}_${Date.now()}`;
    const entry = {
      id,
      name:        source.name || 'Unknown source',
      url:         source.url  || null,
      type:        source.type || 'unknown',   // 'academic'|'news'|'book'|'web'|'expert'|'unknown'
      credibility: this._resolveCredibility(source),
      addedAt:     Date.now(),
    };
    this.sources.set(id, entry);
    return entry;
  }

  _resolveCredibility(source) {
    if (typeof source.credibility === 'number') return Math.min(1, Math.max(0, source.credibility));
    const defaults = { academic: 0.9, expert: 0.85, book: 0.8, news: 0.65, web: 0.5, unknown: 0.4 };
    return defaults[source.type] || 0.4;
  }

  getSource(sourceId) { return this.sources.get(sourceId) || null; }

  // ── Claim management ───────────────────────────────────────────────────────

  /**
   * Add a claim (manual or extracted).
   * @param {{ id?, content, sources?, confidence?, metadata? }} claim
   * @returns {object} stored claim entry
   */
  async addClaim(claim) {
    const id = claim.id || `claim_${++this._seq}_${Date.now()}`;
    const entry = {
      id,
      content:           claim.content || '',
      sourceIds:         claim.sources || [],
      confidence:        claim.confidence || this._initialConfidence(claim),
      createdAt:         Date.now(),
      lastVerified:      Date.now(),
      verificationCount: 0,
      status:            'active',
      metadata:          claim.metadata || {},
    };
    this.claims.set(id, entry);
    this.chains.set(id, new Set());

    const conflicts = await this.detectContradiction(entry);
    if (conflicts.length > 0) {
      entry.status = 'conflicted';
      this.contradictions.push({ claimId: id, conflicts: conflicts.map(c => c.id) });
      this.stats.contradictionsFound++;
    }

    this.stats.claimsAdded++;
    return entry;
  }

  _initialConfidence(claim) {
    if (!claim.sources || claim.sources.length === 0) return 0.4;
    const scores = claim.sources
      .map(id => this.sources.get(id)?.credibility || 0.4);
    return Math.min(0.95, scores.reduce((s, c) => s + c, 0) / scores.length);
  }

  // ── Evidence management ───────────────────────────────────────────────────

  /**
   * Add an evidence item (a piece of supporting or refuting information).
   * @param {{ id?, content, sourceId?, type?, weight? }} evidence
   * @returns {object} stored evidence entry
   */
  addEvidence(evidence) {
    const id = evidence.id || `ev_${++this._seq}_${Date.now()}`;
    const entry = {
      id,
      content:  evidence.content || '',
      sourceId: evidence.sourceId || null,
      type:     evidence.type || 'supporting',  // 'supporting'|'refuting'|'contextual'
      weight:   typeof evidence.weight === 'number' ? evidence.weight : 1.0,
      addedAt:  Date.now(),
    };
    this.evidence.set(id, entry);
    return entry;
  }

  /**
   * Link an evidence item to a claim, building the evidence chain.
   * @param {string} claimId
   * @param {string} evidenceId
   * @returns {{ linked, claimId, evidenceId, chainLength }}
   */
  linkEvidence(claimId, evidenceId) {
    const claim = this.claims.get(claimId);
    const ev    = this.evidence.get(evidenceId);
    if (!claim || !ev) return { linked: false, reason: 'claim or evidence not found' };

    if (!this.chains.has(claimId)) this.chains.set(claimId, new Set());
    this.chains.get(claimId).add(evidenceId);

    // Recompute confidence when refuting evidence is added
    if (ev.type === 'refuting') {
      claim.confidence = Math.max(0.05, claim.confidence - ev.weight * 0.1);
    } else if (ev.type === 'supporting') {
      const src = ev.sourceId ? this.sources.get(ev.sourceId) : null;
      const boost = (src?.credibility || 0.5) * ev.weight * 0.05;
      claim.confidence = Math.min(0.99, claim.confidence + boost);
    }

    this.stats.evidenceLinked++;
    return { linked: true, claimId, evidenceId, chainLength: this.chains.get(claimId).size };
  }

  /**
   * Build the full evidence chain for a claim (recursively includes all linked evidence).
   * @param {string} claimId
   * @returns {{ claimId, claim, chain: object[], confidence, depth }}
   */
  buildEvidenceChain(claimId) {
    const claim = this.claims.get(claimId);
    if (!claim) return { claimId, claim: null, chain: [], confidence: 0, depth: 0 };

    const evIds = this.chains.get(claimId) || new Set();
    const chain = Array.from(evIds).map(id => {
      const ev  = this.evidence.get(id);
      const src = ev?.sourceId ? this.sources.get(ev.sourceId) : null;
      return { ...ev, source: src || null };
    }).filter(Boolean);

    const confidence = this.computeConfidence(claimId);
    this.stats.chainsBuilt++;

    return {
      claimId,
      claim:      { ...claim },
      chain,
      confidence,
      depth:      chain.length,
      supporting: chain.filter(e => e.type === 'supporting').length,
      refuting:   chain.filter(e => e.type === 'refuting').length,
    };
  }

  // ── Confidence scoring ────────────────────────────────────────────────────

  /**
   * Compute dynamic confidence for a claim incorporating:
   *   - Source credibility of all linked evidence
   *   - Evidence chain depth (more evidence → higher confidence up to a ceiling)
   *   - Verification count
   *   - Temporal decay
   */
  computeConfidence(claimId) {
    const claim = this.claims.get(claimId);
    if (!claim) return 0;

    let base = claim.confidence;

    // Source credibility from evidence chain
    const evIds = this.chains.get(claimId) || new Set();
    if (evIds.size > 0) {
      const creds = Array.from(evIds).map(id => {
        const ev  = this.evidence.get(id);
        if (!ev) return 0;
        const src = ev.sourceId ? this.sources.get(ev.sourceId) : null;
        const cred = src?.credibility || 0.4;
        return ev.type === 'refuting' ? -cred : cred;
      });
      const netCred = creds.reduce((s, c) => s + c, 0) / creds.length;
      base = Math.min(0.99, Math.max(0.01, base + netCred * 0.15));
    }

    // Verification bonus (up to +0.1)
    const verBonus = Math.min(0.1, claim.verificationCount * 0.02);
    base = Math.min(0.99, base + verBonus);

    // Temporal decay
    const ageDays = (Date.now() - claim.lastVerified) / 86400000;
    const decay   = Math.max(0.5, 1 - ageDays / 365);
    return Math.round(base * decay * 1000) / 1000;
  }

  async getConfidence(claimId) {
    return this.computeConfidence(claimId);
  }

  // ── Claim extraction from text ────────────────────────────────────────────

  /**
   * Extract potential claims from free text.
   * Returns an array of candidate claim strings (declarative sentences that
   * match assertion patterns).
   * @param {string} text
   * @returns {{ text: string, score: number }[]}
   */
  extractClaims(text) {
    if (!text || typeof text !== 'string') return [];

    const sentences = text
      .replace(/([.!?])\s+/g, '$1\n')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 15 && s.length < 500);

    return sentences
      .map(sentence => {
        const score = CLAIM_PATTERNS.reduce((s, re) => s + (re.test(sentence) ? 1 : 0), 0);
        return { text: sentence, score };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  // ── Contradiction detection ───────────────────────────────────────────────

  async detectContradiction(newClaim) {
    const conflicts = [];
    const newWords  = (newClaim.content || '').toLowerCase().split(/\s+/);
    const newNeg    = NEGATION_WORDS.some(n => (newClaim.content || '').toLowerCase().includes(n));

    for (const [id, existing] of this.claims) {
      if (id === newClaim.id || existing.status === 'forgotten') continue;

      const exWords  = (existing.content || '').toLowerCase().split(/\s+/);
      const exNeg    = NEGATION_WORDS.some(n => (existing.content || '').toLowerCase().includes(n));
      const overlap  = exWords.filter(w => newWords.includes(w) && w.length > 3);

      if (overlap.length >= 3 && exNeg !== newNeg) {
        conflicts.push({ ...existing, reason: 'negation_polarity_mismatch', overlap });
      }
    }
    return conflicts;
  }

  // ── Verification and decay ────────────────────────────────────────────────

  async verify(claimId) {
    const claim = this.claims.get(claimId);
    if (!claim) return null;
    claim.verificationCount++;
    claim.lastVerified = Date.now();
    claim.confidence   = this.computeConfidence(claimId);
    return claim;
  }

  async detectDecay(claimId) {
    const claim = this.claims.get(claimId);
    if (!claim) return { decayed: false };
    const ageDays  = (Date.now() - claim.createdAt)   / 86400000;
    const sinceDays = (Date.now() - claim.lastVerified) / 86400000;
    return {
      decayed:             sinceDays > 30,
      age:                 Math.floor(ageDays),
      daysSinceVerification: Math.floor(sinceDays),
      recommendation:      sinceDays > 90 ? 'verify_or_forget' : sinceDays > 30 ? 'verify' : 'fresh',
    };
  }

  async markOutdated(claimId) {
    const claim = this.claims.get(claimId);
    if (claim) claim.status = 'outdated';
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /**
   * Search claims by text query.
   * @param {string} query
   * @param {{ limit?, statusFilter? }} opts
   */
  searchClaims(query, opts = {}) {
    const q      = (query || '').toLowerCase();
    const limit  = opts.limit || 10;
    const filter = opts.statusFilter || null;

    return Array.from(this.claims.values())
      .filter(c => !filter || c.status === filter)
      .map(c => {
        const words   = q.split(/\s+/);
        const content = (c.content || '').toLowerCase();
        const score   = words.reduce((s, w) => s + (w.length > 2 && content.includes(w) ? 1 : 0), 0);
        return { ...c, score };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
      .slice(0, limit);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats() {
    const claims = Array.from(this.claims.values());
    return {
      ...this.stats,
      claims:      this.claims.size,
      active:      claims.filter(c => c.status === 'active').length,
      conflicted:  claims.filter(c => c.status === 'conflicted').length,
      outdated:    claims.filter(c => c.status === 'outdated').length,
      sources:     this.sources.size,
      evidence:    this.evidence.size,
      contradictions: this.contradictions.length,
      avgConfidence: claims.length
        ? Math.round(claims.reduce((s, c) => s + (c.confidence || 0), 0) / claims.length * 1000) / 1000
        : 0,
    };
  }
}

let _instance = null;
function getEvidenceEngine(config) {
  if (!_instance) _instance = new EvidenceEngine(config || {});
  return _instance;
}

module.exports = { EvidenceEngine, getEvidenceEngine };
