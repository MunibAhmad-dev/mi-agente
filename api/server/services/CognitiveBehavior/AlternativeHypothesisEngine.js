'use strict';

/**
 * AlternativeHypothesisEngine — Gen B Phase 34.
 *
 * Given a claim or conclusion, generates N alternative explanations so the
 * agent considers competing hypotheses before committing. Prevents anchoring
 * on the first plausible interpretation. Works entirely from heuristics + the
 * claim text — no external LLM call needed per request.
 */

// Frame templates for generating alternatives
const FRAMES = [
  'Could this instead be explained by {opposite}?',
  'Is there a simpler explanation: {simpler}?',
  'What if the cause is {alternative} rather than the stated claim?',
  'Could this be a correlation rather than causation involving {factor}?',
  'Is this specific to {context} or does it generalise?',
];

// Adjective pairs for opposite generation
const OPPOSITES = [
  ['high', 'low'], ['increase', 'decrease'], ['positive', 'negative'],
  ['success', 'failure'], ['cause', 'effect'], ['internal', 'external'],
  ['intentional', 'accidental'], ['recent', 'historical'], ['global', 'local'],
];

function findOpposite(text) {
  const lower = text.toLowerCase();
  for (const [a, b] of OPPOSITES) {
    if (lower.includes(a)) return b;
    if (lower.includes(b)) return a;
  }
  return 'the inverse scenario';
}

function extractKeyTerms(text) {
  return (text.match(/\b[A-Z][a-z]+\b|\b[a-z]{4,}\b/g) || [])
    .filter((w) => !['this', 'that', 'with', 'from', 'have', 'been', 'will'].includes(w))
    .slice(0, 5);
}

class AlternativeHypothesisEngine {
  constructor() {
    this.stats = { generated: 0, claims: 0 };
  }

  /**
   * Generate alternative hypotheses for a claim.
   * @param {string} claim  The original claim or conclusion.
   * @param {{ count?: number, context?: string }} opts
   * @returns {{ claim: string, alternatives: string[], count: number }}
   */
  generate(claim, opts = {}) {
    this.stats.claims++;
    try {
      const n = Math.min(opts.count || 3, 5);
      const terms = extractKeyTerms(claim);
      const opposite = findOpposite(claim);
      const simpler = terms.length > 0 ? `a simpler ${terms[0]}-related factor` : 'a simpler underlying cause';
      const alternative = terms.length > 1 ? terms[1] : 'an unrelated variable';
      const factor = terms.length > 2 ? terms[2] : 'selection bias';
      const context = opts.context || (terms.length > 0 ? `the ${terms[0]} domain` : 'this specific domain');

      const filledFrames = FRAMES.map((f) =>
        f.replace('{opposite}', opposite)
          .replace('{simpler}', simpler)
          .replace('{alternative}', alternative)
          .replace('{factor}', factor)
          .replace('{context}', context),
      );

      const alternatives = filledFrames.slice(0, n);
      this.stats.generated += alternatives.length;
      return { claim, alternatives, count: alternatives.length };
    } catch (err) {
      return { claim, alternatives: [], count: 0, error: err.message };
    }
  }

  /**
   * Rank a set of hypotheses by plausibility score (heuristic).
   * @param {string[]} hypotheses
   * @param {string} evidence  Evidence string to match against.
   * @returns {Array<{ hypothesis: string, score: number }>}
   */
  rank(hypotheses, evidence = '') {
    try {
      const evidenceWords = new Set(evidence.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
      return hypotheses
        .map((h) => {
          const words = h.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
          const hits = words.filter((w) => evidenceWords.has(w)).length;
          const score = evidenceWords.size > 0 ? Math.round((hits / evidenceWords.size) * 100) / 100 : 0.5;
          return { hypothesis: h, score };
        })
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      return hypotheses.map((h) => ({ hypothesis: h, score: 0, error: err.message }));
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getAlternativeHypothesisEngine() {
  if (!_instance) _instance = new AlternativeHypothesisEngine();
  return _instance;
}

module.exports = { AlternativeHypothesisEngine, getAlternativeHypothesisEngine };
