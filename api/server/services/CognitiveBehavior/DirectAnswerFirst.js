'use strict';

/**
 * DirectAnswerFirst.js — Gen B Batch-C Phase 3.
 * Enforces that responses lead with a direct answer before elaboration.
 */

// Phrases that indicate the response is NOT leading with an answer
const FILLER_OPENERS = [
  /^great question/i,
  /^that'?s? (a )?(great|interesting|good|excellent|complex|important)/i,
  /^there (are|is) (many|several|a few|multiple)/i,
  /^(certainly|absolutely|of course|sure|indeed)[!,.]?$/i,
  /^(let me|allow me|i('ll| will)) (explain|break|walk|start|begin)/i,
  /^when (it comes|we talk|we consider)/i,
  /^this (is a|can be|depends)/i,
];

class DirectAnswerFirst {
  constructor() {
    this.stats = { analyzed: 0, enforced: 0, leadingWithAnswer: 0 };
  }

  /**
   * Analyze a response for direct-answer positioning.
   * @param {string} prompt
   * @param {string} response
   * @returns {{ hasDirectAnswer: boolean, answerPosition: number, score: number, suggestion: string|null }}
   */
  analyze(prompt, response) {
    try {
      if (!response || typeof response !== 'string') {
        return { hasDirectAnswer: false, answerPosition: -1, score: 0, suggestion: 'Response is empty.' };
      }
      this.stats.analyzed++;

      const isLeading = this.isLeadingWithAnswer(response);
      const sentences = this._splitSentences(response);
      const answerPosition = isLeading ? 0 : this._findAnswerPosition(sentences);
      const score = this._scoreResponse(response, isLeading, answerPosition, sentences.length);

      const suggestion = isLeading
        ? null
        : `Move the direct answer to the first sentence. Currently the answer appears at sentence ${answerPosition + 1}.`;

      if (isLeading) this.stats.leadingWithAnswer++;

      return { hasDirectAnswer: isLeading || answerPosition >= 0, answerPosition, score, suggestion };
    } catch (err) {
      return { hasDirectAnswer: false, answerPosition: -1, score: 0, suggestion: err.message };
    }
  }

  /**
   * Reorder response so direct answer comes first.
   * @param {string} response
   * @param {string} answerType - hint about answer type (e.g. 'yes_no', 'factual', 'code')
   * @returns {string}
   */
  enforce(response, answerType = 'factual') {
    try {
      if (!response || typeof response !== 'string') return response;
      if (this.isLeadingWithAnswer(response)) return response;

      this.stats.enforced++;

      const sentences = this._splitSentences(response);
      const answerPos = this._findAnswerPosition(sentences);

      if (answerPos <= 0 || answerPos >= sentences.length) return response;

      // Move the answer sentence to position 0
      const answerSentence = sentences.splice(answerPos, 1)[0];
      return [answerSentence, ...sentences].join(' ').trim();
    } catch (err) {
      return response;
    }
  }

  /**
   * Check if the first sentence/paragraph leads with the actual answer.
   * @param {string} text
   * @returns {boolean}
   */
  isLeadingWithAnswer(text) {
    try {
      if (!text || typeof text !== 'string') return false;
      const trimmed = text.trim();
      const firstSentence = this._splitSentences(trimmed)[0] || '';

      // Fails if first sentence is a filler opener
      for (const pattern of FILLER_OPENERS) {
        if (pattern.test(firstSentence.trim())) return false;
      }

      // A direct answer typically:
      // - is a declarative statement with content
      // - doesn't start with "I will explain" style hedging
      // - isn't just a question restated
      const startsWithSubject = /^(yes|no|the|a |an |it |they |this|that|when|where|to |because|by |in |you |[A-Z])/i.test(firstSentence.trim());
      return startsWithSubject && firstSentence.trim().length > 5;
    } catch {
      return false;
    }
  }

  // ── private ──────────────────────────────────────────────────────────────────

  _splitSentences(text) {
    // Split on . ! ? followed by whitespace or end, keeping code blocks intact
    return text
      .replace(/```[\s\S]*?```/g, '[CODE_BLOCK]')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  _findAnswerPosition(sentences) {
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      const isFiller = FILLER_OPENERS.some((p) => p.test(s.trim()));
      if (!isFiller && s.length > 10) return i;
    }
    return 0;
  }

  _scoreResponse(response, isLeading, answerPosition, totalSentences) {
    let score = 1.0;
    if (!isLeading) score -= 0.3;
    if (answerPosition > 2) score -= 0.2;
    if (totalSentences > 0 && answerPosition / totalSentences > 0.5) score -= 0.2;
    // Penalize excessive filler at start
    const firstLine = response.split('\n')[0] || '';
    const fillerCount = FILLER_OPENERS.filter((p) => p.test(firstLine)).length;
    score -= fillerCount * 0.1;
    return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getDirectAnswerFirst() {
  if (!_instance) _instance = new DirectAnswerFirst();
  return _instance;
}

module.exports = { DirectAnswerFirst, getDirectAnswerFirst };
