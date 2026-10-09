'use strict';

/**
 * FactChecker — Gen B reasoning quality.
 * Checks factual claims against an in-memory store of known facts using pattern matching.
 *
 * - addFact(fact, category, confidence) — register a known fact
 * - check(claim) → { verified, matchedFact, confidence, verdict }
 * - checkAll(text) → { results, overallTrustScore }
 *
 * Pre-loaded with stable technical facts.
 */

// Similarity threshold for fact matching
const MATCH_THRESHOLD = 0.35;

function normalizeClaim(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWords(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
    'has', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'shall', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
    'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'and', 'but',
    'or', 'so', 'yet', 'not', 'no',
  ]);
  return normalizeClaim(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function wordOverlapScore(claimWords, factWords) {
  if (claimWords.length === 0 || factWords.length === 0) return 0;
  const factSet = new Set(factWords);
  const matches = claimWords.filter((w) => factSet.has(w)).length;
  return matches / Math.max(claimWords.length, factWords.length);
}

function detectNegation(text) {
  return /\b(?:not|never|no|isn'?t|aren'?t|wasn'?t|weren'?t|doesn'?t|don'?t|didn'?t|cannot|can'?t)\b/i.test(text);
}

// Pre-built stable technical facts
const BUILTIN_FACTS = [
  { fact: 'Node.js is a JavaScript runtime built on Chrome\'s V8 engine', category: 'tech', confidence: 1.0 },
  { fact: 'HTTP uses port 80 by default', category: 'networking', confidence: 1.0 },
  { fact: 'HTTPS uses port 443 by default', category: 'networking', confidence: 1.0 },
  { fact: 'DNS stands for Domain Name System', category: 'networking', confidence: 1.0 },
  { fact: 'JavaScript is a dynamically typed language', category: 'tech', confidence: 1.0 },
  { fact: 'Python is an interpreted programming language', category: 'tech', confidence: 1.0 },
  { fact: 'SQL stands for Structured Query Language', category: 'database', confidence: 1.0 },
  { fact: 'JSON stands for JavaScript Object Notation', category: 'tech', confidence: 1.0 },
  { fact: 'REST stands for Representational State Transfer', category: 'tech', confidence: 1.0 },
  { fact: 'Git is a distributed version control system', category: 'tech', confidence: 1.0 },
  { fact: 'SSH uses port 22 by default', category: 'networking', confidence: 1.0 },
  { fact: 'FTP uses port 21 by default', category: 'networking', confidence: 1.0 },
  { fact: 'SMTP uses port 25 by default', category: 'networking', confidence: 1.0 },
  { fact: 'IPv4 addresses are 32 bits long', category: 'networking', confidence: 1.0 },
  { fact: 'IPv6 addresses are 128 bits long', category: 'networking', confidence: 1.0 },
  { fact: 'A byte consists of 8 bits', category: 'computing', confidence: 1.0 },
  { fact: 'HTML stands for HyperText Markup Language', category: 'web', confidence: 1.0 },
  { fact: 'CSS stands for Cascading Style Sheets', category: 'web', confidence: 1.0 },
  { fact: 'TCP is a connection-oriented protocol', category: 'networking', confidence: 1.0 },
  { fact: 'UDP is a connectionless protocol', category: 'networking', confidence: 1.0 },
  { fact: 'React is a JavaScript library for building user interfaces', category: 'tech', confidence: 1.0 },
  { fact: 'Express is a web framework for Node.js', category: 'tech', confidence: 1.0 },
  { fact: 'MongoDB is a NoSQL database', category: 'database', confidence: 1.0 },
  { fact: 'PostgreSQL is a relational database', category: 'database', confidence: 1.0 },
  { fact: 'JWT stands for JSON Web Token', category: 'security', confidence: 1.0 },
  { fact: 'HTTPS encrypts data in transit using TLS', category: 'security', confidence: 1.0 },
  { fact: 'A null value in programming represents the absence of a value', category: 'tech', confidence: 1.0 },
  { fact: 'The OSI model has 7 layers', category: 'networking', confidence: 1.0 },
  { fact: 'Linux is an open-source operating system', category: 'tech', confidence: 1.0 },
  { fact: 'Docker is a containerization platform', category: 'tech', confidence: 1.0 },
  { fact: 'Kubernetes is a container orchestration system', category: 'tech', confidence: 1.0 },
  { fact: 'NPM stands for Node Package Manager', category: 'tech', confidence: 1.0 },
];

class FactChecker {
  constructor() {
    this._facts = [];
    this.stats = { checks: 0, verified: 0, refuted: 0, uncertain: 0, factsAdded: 0 };

    // Pre-load built-in facts
    for (const f of BUILTIN_FACTS) {
      this._facts.push({
        raw: f.fact,
        normalized: normalizeClaim(f.fact),
        words: extractWords(f.fact),
        category: f.category,
        confidence: f.confidence,
        addedAt: Date.now(),
      });
    }
  }

  /**
   * Register a new known fact.
   * @param {string} fact
   * @param {string} [category]
   * @param {number} [confidence]  — 0-1
   */
  addFact(fact, category, confidence) {
    try {
      if (!fact || typeof fact !== 'string') return { added: false, error: 'fact must be a non-empty string' };
      const normalized = normalizeClaim(fact);
      // Avoid exact duplicates
      if (this._facts.some((f) => f.normalized === normalized)) {
        return { added: false, reason: 'duplicate' };
      }
      this._facts.push({
        raw: fact,
        normalized,
        words: extractWords(fact),
        category: category || 'general',
        confidence: Math.max(0, Math.min(1, parseFloat(confidence) || 0.8)),
        addedAt: Date.now(),
      });
      this.stats.factsAdded++;
      return { added: true, factCount: this._facts.length };
    } catch (err) {
      return { added: false, error: err.message };
    }
  }

  /**
   * Check a single claim against the fact store.
   * @param {string} claim
   * @returns {{ verified: boolean|null, matchedFact: string|null, confidence: number, verdict: 'true'|'false'|'uncertain' }}
   */
  check(claim) {
    try {
      if (!claim || typeof claim !== 'string') {
        return { verified: null, matchedFact: null, confidence: 0, verdict: 'uncertain' };
      }

      this.stats.checks++;
      const claimWords = extractWords(claim);
      const claimNegated = detectNegation(claim);

      let bestMatch = null;
      let bestScore = 0;

      for (const fact of this._facts) {
        const score = wordOverlapScore(claimWords, fact.words);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = fact;
        }
      }

      if (bestScore < MATCH_THRESHOLD || !bestMatch) {
        this.stats.uncertain++;
        return { verified: null, matchedFact: null, confidence: 0, verdict: 'uncertain' };
      }

      // If claim is a negation of a known fact, it's false; otherwise true
      const factNegated = detectNegation(bestMatch.raw);
      const contradiction = claimNegated !== factNegated;

      const confidence = Math.round(bestScore * bestMatch.confidence * 100) / 100;

      if (contradiction) {
        this.stats.refuted++;
        return { verified: false, matchedFact: bestMatch.raw, confidence, verdict: 'false' };
      } else {
        this.stats.verified++;
        return { verified: true, matchedFact: bestMatch.raw, confidence, verdict: 'true' };
      }
    } catch (err) {
      return { verified: null, matchedFact: null, confidence: 0, verdict: 'uncertain', error: err.message };
    }
  }

  /**
   * Check all factual-looking claims in a block of text.
   * @param {string} text
   * @returns {{ results: Array, overallTrustScore: number }}
   */
  checkAll(text) {
    try {
      if (!text || typeof text !== 'string') {
        return { results: [], overallTrustScore: 1 };
      }

      // Split into sentences and check each
      const sentences = text
        .replace(/([.!?])\s+/g, '$1\n')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 15);

      const results = [];
      for (const sentence of sentences) {
        const result = this.check(sentence);
        if (result.verdict !== 'uncertain' || result.confidence > 0) {
          results.push({ claim: sentence.substring(0, 150), ...result });
        }
      }

      if (results.length === 0) {
        return { results: [], overallTrustScore: 1 };
      }

      // Trust score: proportion of true verdicts, penalised by false verdicts
      const trueCount = results.filter((r) => r.verdict === 'true').length;
      const falseCount = results.filter((r) => r.verdict === 'false').length;
      const total = results.length;

      const overallTrustScore = Math.max(0, (trueCount - falseCount * 2) / Math.max(total, 1));

      return {
        results,
        overallTrustScore: Math.round(Math.min(1, Math.max(0, overallTrustScore)) * 100) / 100,
      };
    } catch (err) {
      return { results: [], overallTrustScore: 1, error: err.message };
    }
  }

  /**
   * List all known facts.
   * @param {string} [category]  — filter by category
   * @returns {Array}
   */
  listFacts(category) {
    try {
      const facts = category
        ? this._facts.filter((f) => f.category === category)
        : this._facts;
      return facts.map((f) => ({ fact: f.raw, category: f.category, confidence: f.confidence }));
    } catch (err) {
      return [];
    }
  }

  getStats() {
    return { ...this.stats, totalFacts: this._facts.length };
  }
}

let _instance = null;
function getFactChecker() {
  if (!_instance) _instance = new FactChecker();
  return _instance;
}

module.exports = { FactChecker, getFactChecker };
