'use strict';

/**
 * ContradictionEngine — Face 7.
 * Detects contradictions across timeline events and investigation evidence.
 * A contradiction is when two claims about the same entity, time window, or fact
 * are logically incompatible (e.g., "was in Paris" vs "was in Tokyo" on the same day).
 */

class ContradictionEngine {
  constructor() {
    this._contradictions = [];
    this._id = 0;
  }

  /**
   * Analyse a set of claims and return detected contradictions.
   * @param {Array<{id, subject, predicate, object, timestamp?, source?, confidence?}>} claims
   * @returns {Array<Contradiction>}
   */
  analyse(claims = []) {
    const found = [];

    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i];
        const b = claims[j];
        const contradiction = this._check(a, b);
        if (contradiction) {
          found.push(contradiction);
          this._contradictions.push(contradiction);
        }
      }
    }

    return found;
  }

  /**
   * Compare two timeline events for contradictions.
   * @param {object} a
   * @param {object} b
   * @returns {Contradiction|null}
   */
  compareEvents(a, b) {
    return this._check(
      { id: a.id, subject: a.title, predicate: 'location', object: a.data?.location, timestamp: a.timestamp, source: a.source },
      { id: b.id, subject: b.title, predicate: 'location', object: b.data?.location, timestamp: b.timestamp, source: b.source },
    );
  }

  /**
   * Cross-check investigation evidence items for contradictions.
   * @param {Array} evidenceItems
   * @returns {Array<Contradiction>}
   */
  crossCheckEvidence(evidenceItems = []) {
    const claims = evidenceItems.map((e) => ({
      id: e.id,
      subject: e.subject || e.description,
      predicate: e.type || 'claim',
      object: e.value || e.text,
      timestamp: e.timestamp,
      source: e.source,
      confidence: e.confidence,
    }));
    return this.analyse(claims);
  }

  /**
   * Get all stored contradictions (optionally filtered by subject).
   */
  getAll({ subject } = {}) {
    if (subject) return this._contradictions.filter((c) => c.subjects.includes(subject));
    return [...this._contradictions];
  }

  /**
   * Clear stored contradiction cache.
   */
  clear() {
    this._contradictions = [];
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _check(a, b) {
    if (!a || !b) return null;

    // Temporal impossibility: same entity in two places at the same time (checked first)
    if (this._sameSubject(a, b) && this._exactSameTime(a, b) && a.predicate === 'location' && b.predicate === 'location') {
      if (a.object && b.object && a.object.toLowerCase() !== b.object.toLowerCase()) {
        return this._make(a, b, 'TEMPORAL', `"${a.subject}" cannot be in "${a.object}" and "${b.object}" at the same time`);
      }
    }

    // Same subject, same predicate, overlapping time window, different object → contradiction
    if (this._sameSubject(a, b) && this._samePredicate(a, b) && this._overlapsTime(a, b)) {
      if (a.object && b.object && !this._compatible(a.object, b.object)) {
        // Negation pattern check within DIRECT block
        if (this._isNegation(a.object, b.object)) {
          return this._make(a, b, 'NEGATION', `"${a.subject}.${a.predicate}" has contradictory values: "${a.object}" vs "${b.object}"`);
        }
        return this._make(a, b, 'DIRECT', `"${a.subject}" cannot have both "${a.predicate}: ${a.object}" and "${b.predicate}: ${b.object}" simultaneously`);
      }
    }

    return null;
  }

  _make(a, b, type, description) {
    return {
      id: `contra_${++this._id}`,
      type,
      description,
      subjects: [a.subject, b.subject].filter(Boolean),
      claim_a: { id: a.id, subject: a.subject, predicate: a.predicate, object: a.object, source: a.source, timestamp: a.timestamp },
      claim_b: { id: b.id, subject: b.subject, predicate: b.predicate, object: b.object, source: b.source, timestamp: b.timestamp },
      severity: this._severity(a, b),
      detected_at: new Date().toISOString(),
    };
  }

  _sameSubject(a, b) {
    if (!a.subject || !b.subject) return false;
    return a.subject.toLowerCase().trim() === b.subject.toLowerCase().trim();
  }

  _samePredicate(a, b) {
    if (!a.predicate || !b.predicate) return false;
    return a.predicate.toLowerCase().trim() === b.predicate.toLowerCase().trim();
  }

  _overlapsTime(a, b) {
    if (!a.timestamp || !b.timestamp) return true; // assume overlap when no timestamp
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    const diff = Math.abs(ta - tb);
    return diff < 24 * 60 * 60 * 1000; // within 24 hours
  }

  _exactSameTime(a, b) {
    if (!a.timestamp || !b.timestamp) return false;
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return Math.abs(ta - tb) < 60 * 60 * 1000; // within 1 hour
  }

  _compatible(objA, objB) {
    const a = String(objA).toLowerCase().trim();
    const b = String(objB).toLowerCase().trim();
    return a === b;
  }

  _isNegation(objA, objB) {
    const a = String(objA).toLowerCase();
    const b = String(objB).toLowerCase();
    return (b.startsWith('not ') && b.slice(4) === a) || (a.startsWith('not ') && a.slice(4) === b);
  }

  _severity(a, b) {
    const confA = a.confidence || 0.5;
    const confB = b.confidence || 0.5;
    const combined = (confA + confB) / 2;
    if (combined > 0.8) return 'high';
    if (combined > 0.5) return 'medium';
    return 'low';
  }
}

let _instance = null;
function getContradictionEngine() {
  if (!_instance) _instance = new ContradictionEngine();
  return _instance;
}

module.exports = { ContradictionEngine, getContradictionEngine };
