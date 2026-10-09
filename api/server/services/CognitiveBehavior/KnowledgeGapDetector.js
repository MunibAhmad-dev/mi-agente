'use strict';

/**
 * KnowledgeGapDetector — Gen B reasoning quality.
 * Identifies what the agent doesn't know or is uncertain about in its response.
 *
 * Gap signals:
 *   - Hedging phrases: "I'm not sure", "I don't know", "unclear", "approximately"
 *   - Unknown acronyms (ALL_CAPS sequences not in a known list)
 *   - Question marks within the response (self-questioning)
 *   - Conditional phrasing: "might", "could be", "possibly"
 *   - Source-free estimates
 */

// Phrases that signal the agent is uncertain or lacks knowledge
const GAP_SIGNALS = [
  { pattern: /\b(?:i'?m not sure|i don'?t know|i am not sure|i do not know)\b/i, reason: 'explicit uncertainty', weight: 0.8 },
  { pattern: /\bunknown|unclear|uncertain|unconfirmed|unverified\b/i, reason: 'uncertain state', weight: 0.6 },
  { pattern: /\bapproximately|roughly|around|about|circa\b/i, reason: 'approximation', weight: 0.3 },
  { pattern: /\bperhaps|maybe|possibly|potentially|conceivably\b/i, reason: 'hedging language', weight: 0.4 },
  { pattern: /\bmight be|could be|may be|seem(?:s)? to be|appear(?:s)? to be\b/i, reason: 'conditional claim', weight: 0.35 },
  { pattern: /\bI (?:believe|think|suppose|assume|guess|suspect)\b/i, reason: 'belief not fact', weight: 0.45 },
  { pattern: /\binsufficient (?:data|information|evidence)\b/i, reason: 'data gap', weight: 0.7 },
  { pattern: /\bmore research (?:is )?(?:needed|required)\b/i, reason: 'research gap', weight: 0.65 },
  { pattern: /\bI'?m not (?:certain|confident|100%)\b/i, reason: 'low confidence', weight: 0.7 },
  { pattern: /\bcannot (?:confirm|verify|guarantee)\b/i, reason: 'verification gap', weight: 0.6 },
  { pattern: /\bno (?:information|data) (?:available|found)\b/i, reason: 'missing data', weight: 0.75 },
  { pattern: /\bsome sources (?:say|suggest|indicate)\b/i, reason: 'conflicting sources', weight: 0.4 },
];

// Known acronyms that should not trigger the "unknown acronym" signal
const KNOWN_ACRONYMS = new Set([
  'API', 'HTTP', 'HTTPS', 'URL', 'JSON', 'XML', 'HTML', 'CSS', 'JS', 'SQL',
  'REST', 'CRUD', 'JWT', 'AWS', 'GCP', 'CPU', 'GPU', 'RAM', 'SSD', 'HDD',
  'UI', 'UX', 'SDK', 'CLI', 'GUI', 'IDE', 'VPN', 'DNS', 'IP', 'TCP', 'UDP',
  'SSH', 'FTP', 'SFTP', 'SMTP', 'IMAP', 'POP', 'TLS', 'SSL', 'EOF', 'UTF',
  'ASCII', 'ANSI', 'UUID', 'URI', 'DOM', 'PDF', 'CSV', 'AI', 'ML', 'NLP',
  'LLM', 'RAG', 'MCP', 'NPM', 'PIP', 'MIT', 'GNU', 'GPL', 'BSD', 'CI', 'CD',
  'PR', 'QA', 'KPI', 'SLA', 'SLO', 'SLI', 'ETL', 'ETA', 'GMT', 'UTC', 'ISO',
  'IDs', 'ID', 'FAQ', 'TBD', 'N/A', 'NA', 'USA', 'UK', 'EU', 'US',
]);

function detectUnknownAcronyms(text) {
  const acronymRe = /\b([A-Z]{2,}(?:s)?)\b/g;
  const found = [];
  let m;
  while ((m = acronymRe.exec(text)) !== null) {
    const acr = m[1].replace(/s$/, ''); // strip trailing s
    if (!KNOWN_ACRONYMS.has(acr) && !KNOWN_ACRONYMS.has(m[1])) {
      found.push(m[1]);
    }
  }
  return [...new Set(found)];
}

function detectSelfQuestions(text) {
  // Count question marks in the middle of the response (agent questioning itself)
  const questions = (text.match(/\?/g) || []).length;
  return questions;
}

class KnowledgeGapDetector {
  constructor() {
    this.stats = { checks: 0, gapsFound: 0 };
  }

  /**
   * Detect knowledge gaps in the given text.
   * @param {string} text
   * @returns {{ gaps: Array<{topic, confidence, reason}>, overallConfidence: number }}
   */
  detect(text) {
    try {
      if (!text || typeof text !== 'string') {
        return { gaps: [], overallConfidence: 1 };
      }

      this.stats.checks++;
      const gaps = [];
      let totalPenalty = 0;

      // Check each gap signal
      for (const signal of GAP_SIGNALS) {
        const matches = text.match(new RegExp(signal.pattern.source, 'gi')) || [];
        for (const match of matches) {
          gaps.push({
            topic: match.trim().substring(0, 80),
            confidence: 1 - signal.weight,
            reason: signal.reason,
          });
          totalPenalty += signal.weight;
        }
      }

      // Check unknown acronyms
      const unknownAcr = detectUnknownAcronyms(text);
      for (const acr of unknownAcr) {
        gaps.push({
          topic: `Unknown acronym: ${acr}`,
          confidence: 0.4,
          reason: 'undefined acronym in response',
        });
        totalPenalty += 0.3;
      }

      // Self-questioning penalty
      const questionCount = detectSelfQuestions(text);
      if (questionCount > 2) {
        gaps.push({
          topic: 'Multiple self-directed questions in response',
          confidence: 0.5,
          reason: 'self-questioning signals uncertainty',
        });
        totalPenalty += 0.2 * (questionCount - 2);
      }

      if (gaps.length > 0) this.stats.gapsFound++;

      // Divide by 2 so that a total penalty of 2+ yields confidence near 0
      const overallConfidence = Math.max(0, Math.min(1, 1 - totalPenalty / 2));

      return {
        gaps,
        overallConfidence: Math.round(overallConfidence * 100) / 100,
      };
    } catch (err) {
      return { gaps: [], overallConfidence: 1, error: err.message };
    }
  }

  /**
   * Returns true if the overall confidence is below 0.5.
   * @param {string} text
   * @returns {boolean}
   */
  hasSignificantGaps(text) {
    try {
      const result = this.detect(text);
      return result.overallConfidence < 0.5;
    } catch (err) {
      return false;
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getKnowledgeGapDetector() {
  if (!_instance) _instance = new KnowledgeGapDetector();
  return _instance;
}

module.exports = { KnowledgeGapDetector, getKnowledgeGapDetector };
