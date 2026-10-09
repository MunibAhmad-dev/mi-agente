'use strict';

/**
 * UncertaintyQuantifier — Gen B reasoning quality.
 * Quantifies and communicates uncertainty in responses.
 *
 * Signals:
 *   hedging words, question marks, approximations, ranges, conditional phrasing
 *
 * - quantify(text) → { uncertaintyLevel, score, signals, recommendation }
 * - getSuggestedDisclaimer(level) → appropriate caveat string
 */

// Weighted uncertainty signals
const UNCERTAINTY_SIGNALS = [
  // Strong uncertainty
  { pattern: /\bi don'?t know\b|\bi'?m not sure\b|\bi have no idea\b/i, label: 'explicit ignorance', weight: 0.7 },
  { pattern: /\bunknown|unclear|uncertain|unconfirmed|unverified|undetermined\b/i, label: 'uncertain state', weight: 0.55 },
  { pattern: /\bno (?:data|information|evidence) (?:available|found|exists)\b/i, label: 'missing data', weight: 0.65 },
  { pattern: /\bcannot (?:confirm|verify|guarantee|determine)\b/i, label: 'unverifiable', weight: 0.6 },

  // Medium uncertainty
  { pattern: /\bperhaps|maybe|possibly|potentially|conceivably\b/i, label: 'possibility hedging', weight: 0.45 },
  { pattern: /\bmight|could be|may be|seem(?:s)? to|appear(?:s)? to\b/i, label: 'conditional claim', weight: 0.35 },
  { pattern: /\bi (?:believe|think|suppose|assume|guess|suspect)\b/i, label: 'belief language', weight: 0.4 },
  { pattern: /\bsome sources?|some experts?|some (?:argue|claim|suggest)\b/i, label: 'conflicting sources', weight: 0.4 },
  { pattern: /\bmore research (?:is )?(?:needed|required)\b/i, label: 'research gap', weight: 0.5 },
  { pattern: /\bdepends on|depends upon|it varies|varies by|case.by.case\b/i, label: 'context-dependent', weight: 0.3 },

  // Light uncertainty
  { pattern: /\bapproximately|roughly|around|about|circa|~\s*\d/i, label: 'approximation', weight: 0.25 },
  { pattern: /\bup to|at least|at most|as many as|as few as\b/i, label: 'range estimate', weight: 0.2 },
  { pattern: /\bgenerally|typically|usually|often|commonly|in most cases\b/i, label: 'generalisation', weight: 0.15 },
  { pattern: /\bif (?:you|we|this|that|it|there)|assuming|provided that|given that\b/i, label: 'conditional', weight: 0.15 },
  { pattern: /\bto my knowledge|as far as I know|as I understand\b/i, label: 'knowledge caveat', weight: 0.35 },
];

const DISCLAIMERS = {
  low: 'This response is based on well-established information. Minor variations may apply in specific contexts.',
  medium:
    'Some aspects of this response involve uncertainty. Key claims should be verified against authoritative sources before acting on them.',
  high:
    'This response contains significant uncertainty. Important decisions should not be based solely on this information — consult relevant experts or primary sources.',
};

const RECOMMENDATIONS = {
  low: 'Response appears reliable. Standard review recommended.',
  medium: 'Consider adding sources or caveats for uncertain claims.',
  high: 'Strongly recommend adding explicit uncertainty notices and source citations before sharing.',
};

function countQuestionMarks(text) {
  return (text.match(/\?/g) || []).length;
}

function detectRanges(text) {
  // Patterns like "10-20", "between X and Y", "X to Y%"
  return (text.match(/\b\d+\s*[-–]\s*\d+|\bbetween\s+\d|\d\s+to\s+\d/gi) || []).length;
}

class UncertaintyQuantifier {
  constructor() {
    this.stats = { quantifications: 0 };
  }

  /**
   * Quantify the uncertainty level in the given text.
   * @param {string} text
   * @returns {{ uncertaintyLevel: 'low'|'medium'|'high', score: number, signals: string[], recommendation: string }}
   */
  quantify(text) {
    try {
      if (!text || typeof text !== 'string') {
        return { uncertaintyLevel: 'low', score: 0, signals: [], recommendation: RECOMMENDATIONS.low };
      }

      this.stats.quantifications++;

      const detectedSignals = [];
      let totalWeight = 0;

      for (const signal of UNCERTAINTY_SIGNALS) {
        const matches = text.match(new RegExp(signal.pattern.source, 'gi')) || [];
        if (matches.length > 0) {
          detectedSignals.push(`${signal.label} ("${matches[0].trim()}")`);
          totalWeight += signal.weight * Math.min(matches.length, 3); // cap at 3x
        }
      }

      // Self-questioning bonus
      const qmarks = countQuestionMarks(text);
      if (qmarks > 1) {
        detectedSignals.push(`self-questioning (${qmarks} question marks)`);
        totalWeight += 0.1 * Math.min(qmarks, 5);
      }

      // Range estimates
      const ranges = detectRanges(text);
      if (ranges > 0) {
        detectedSignals.push(`${ranges} numerical range(s) used`);
        totalWeight += 0.1 * Math.min(ranges, 3);
      }

      // Normalise score to 0-1
      const score = Math.min(1, totalWeight / 3);
      const roundedScore = Math.round(score * 100) / 100;

      let uncertaintyLevel;
      if (roundedScore < 0.25) uncertaintyLevel = 'low';
      else if (roundedScore < 0.55) uncertaintyLevel = 'medium';
      else uncertaintyLevel = 'high';

      return {
        uncertaintyLevel,
        score: roundedScore,
        signals: detectedSignals,
        recommendation: RECOMMENDATIONS[uncertaintyLevel],
      };
    } catch (err) {
      return { uncertaintyLevel: 'low', score: 0, signals: [], recommendation: RECOMMENDATIONS.low, error: err.message };
    }
  }

  /**
   * Get a suggested disclaimer for the given uncertainty level.
   * @param {'low'|'medium'|'high'} level
   * @returns {string}
   */
  getSuggestedDisclaimer(level) {
    try {
      return DISCLAIMERS[level] || DISCLAIMERS.medium;
    } catch (err) {
      return DISCLAIMERS.medium;
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getUncertaintyQuantifier() {
  if (!_instance) _instance = new UncertaintyQuantifier();
  return _instance;
}

module.exports = { UncertaintyQuantifier, getUncertaintyQuantifier };
