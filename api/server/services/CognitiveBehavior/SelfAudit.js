'use strict';

/**
 * SelfAudit — Gen B reasoning quality.
 * Audits the agent's own reasoning for logical consistency.
 *
 * Checks:
 *   answered_the_question — prompt keywords appear in response
 *   circular_reasoning    — response restates the question as the answer
 *   claim_evidence_ratio  — ratio of claims to supporting evidence markers
 *   unsupported_absolutes — "always", "never", "guaranteed" without evidence
 *
 * Issue types: off_topic, circular_reasoning, unsupported_claim, missing_evidence
 * Severities:  critical | high | medium | low
 */

const ABSOLUTE_WORDS = [
  'always', 'never', 'every', 'all', 'none', 'guaranteed', 'certainly',
  'definitively', 'absolutely', 'impossible', 'inevitably', 'without exception',
];

const EVIDENCE_MARKERS = [
  'because', 'since', 'therefore', 'thus', 'hence', 'as a result',
  'due to', 'evidence', 'study', 'research', 'according to', 'data shows',
  'proven', 'demonstrated', 'shows that', 'indicates', 'for example', 'for instance',
  'such as', 'e.g.', 'i.e.', 'specifically', 'in particular',
];

const CLAIM_MARKERS = [
  'is', 'are', 'was', 'were', 'will', 'would', 'should', 'must',
  'has', 'have', 'does', 'do', 'can', 'cannot', 'impossible',
];

function extractKeywords(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'this', 'that', 'these', 'those', 'it', 'of', 'in',
    'on', 'at', 'to', 'for', 'with', 'by', 'from', 'and', 'but',
    'or', 'so', 'yet', 'what', 'how', 'why', 'when', 'where', 'which',
    'who', 'whom', 'can', 'please', 'tell', 'me', 'explain', 'describe',
    'help', 'i', 'my', 'you', 'your', 'we', 'our', 'they', 'their',
  ]);
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));
}

function topicOverlap(prompt, response) {
  const promptKw = new Set(extractKeywords(prompt));
  const responseKw = extractKeywords(response);
  if (promptKw.size === 0) return 1; // can't check, assume ok
  const matched = responseKw.filter((w) => promptKw.has(w));
  return Math.min(1, matched.length / Math.max(1, promptKw.size));
}

function detectCircularReasoning(prompt, response) {
  // Circular: response is essentially a restatement of the prompt
  const promptKw = extractKeywords(prompt);
  const responseKw = extractKeywords(response);
  if (promptKw.length === 0 || responseKw.length === 0) return false;

  const promptSet = new Set(promptKw);
  const overlap = responseKw.filter((w) => promptSet.has(w)).length;
  const ratio = overlap / responseKw.length;

  // If > 70% of response keywords come from the prompt AND response is short → circular
  return ratio > 0.70 && response.length < prompt.length * 2;
}

function countAbsolutesWithoutEvidence(response) {
  const issues = [];
  const sentences = response.replace(/([.!?])\s+/g, '$1\n').split('\n');

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const hasAbsolute = ABSOLUTE_WORDS.some((w) => lower.includes(w));
    if (!hasAbsolute) continue;

    const hasEvidence = EVIDENCE_MARKERS.some((m) => lower.includes(m));
    if (!hasEvidence) {
      const absoluteUsed = ABSOLUTE_WORDS.find((w) => lower.includes(w));
      issues.push({
        type: 'unsupported_claim',
        severity: 'medium',
        detail: `Absolute statement using "${absoluteUsed}" without supporting evidence: "${sentence.trim().substring(0, 100)}"`,
      });
    }
  }
  return issues;
}

function computeClaimEvidenceRatio(response) {
  const lower = response.toLowerCase();
  const sentences = response.replace(/([.!?])\s+/g, '$1\n').split('\n').filter((s) => s.trim().length > 10);
  if (sentences.length === 0) return { ratio: 1, adequate: true };

  let claims = 0;
  let evidenced = 0;

  for (const sentence of sentences) {
    const s = sentence.toLowerCase();
    const isClaim = CLAIM_MARKERS.some((m) => s.includes(` ${m} `));
    if (isClaim) {
      claims++;
      const hasEvidence = EVIDENCE_MARKERS.some((m) => s.includes(m));
      if (hasEvidence) evidenced++;
    }
  }

  if (claims === 0) return { ratio: 1, adequate: true };
  const ratio = evidenced / claims;
  return { ratio: Math.round(ratio * 100) / 100, adequate: ratio >= 0.25 };
}

class SelfAudit {
  constructor() {
    this.stats = { audits: 0, passed: 0, failed: 0 };
  }

  /**
   * Audit the agent's reasoning.
   * @param {string} response   — agent's response text
   * @param {string} prompt     — original user prompt
   * @param {object} [contract] — optional AnswerContract (used for expected format checks)
   * @returns {{ passed: boolean, issues: Array<{type,severity,detail}>, score: number }}
   */
  audit(response, prompt, contract) {
    try {
      this.stats.audits++;

      if (!response || typeof response !== 'string') {
        this.stats.failed++;
        return { passed: false, issues: [{ type: 'missing_evidence', severity: 'critical', detail: 'Empty response' }], score: 0 };
      }
      const issues = [];

      // 1. Off-topic check
      const overlap = topicOverlap(prompt || '', response);
      if (overlap < 0.15 && (prompt || '').length > 20) {
        issues.push({
          type: 'off_topic',
          severity: 'high',
          detail: `Response shares only ${Math.round(overlap * 100)}% keyword overlap with the prompt`,
        });
      }

      // 2. Circular reasoning check
      if (prompt && detectCircularReasoning(prompt, response)) {
        issues.push({
          type: 'circular_reasoning',
          severity: 'high',
          detail: 'Response appears to restate the question without adding new information',
        });
      }

      // 3. Unsupported absolute statements
      const absoluteIssues = countAbsolutesWithoutEvidence(response);
      issues.push(...absoluteIssues);

      // 4. Claim-evidence ratio
      const { ratio, adequate } = computeClaimEvidenceRatio(response);
      if (!adequate && response.split(/\s+/).length > 50) {
        issues.push({
          type: 'missing_evidence',
          severity: 'low',
          detail: `Low claim-to-evidence ratio (${Math.round(ratio * 100)}%). Consider adding supporting evidence.`,
        });
      }

      // 5. Contract compliance check (basic)
      if (contract && contract.minLength && response.length < contract.minLength) {
        issues.push({
          type: 'missing_evidence',
          severity: 'medium',
          detail: `Response length (${response.length} chars) is below contract minimum (${contract.minLength})`,
        });
      }

      const criticalOrHigh = issues.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
      const passed = criticalOrHigh === 0;

      if (passed) this.stats.passed++;
      else this.stats.failed++;

      // Score: 1.0 = perfect, decreases per issue weighted by severity
      const severityWeights = { critical: 0.4, high: 0.25, medium: 0.1, low: 0.05 };
      const penalty = issues.reduce((sum, i) => sum + (severityWeights[i.severity] || 0.05), 0);
      const score = Math.max(0, Math.min(1, 1 - penalty));

      return {
        passed,
        issues,
        score: Math.round(score * 100) / 100,
      };
    } catch (err) {
      return { passed: false, issues: [{ type: 'missing_evidence', severity: 'critical', detail: err.message }], score: 0, error: err.message };
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getSelfAudit() {
  if (!_instance) _instance = new SelfAudit();
  return _instance;
}

module.exports = { SelfAudit, getSelfAudit };
