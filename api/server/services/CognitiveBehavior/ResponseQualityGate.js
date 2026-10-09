'use strict';

/**
 * ResponseQualityGate — Face 17: response quality scoring and gating.
 *
 * Scores outgoing LLM responses against the AnswerContract and verbosity
 * expectations. Returns pass/fail + a detailed quality report.
 *
 * Unlike LearningEvaluationGate (which records gate events for training),
 * this gate is concerned with real-time quality control of the response.
 */

const QUALITY_CHECKS = [
  // Response should not be empty
  { id: 'non_empty', weight: 30, check: (text) => text && text.trim().length > 10 },
  // Should not start with "I cannot" / "I am unable" — unhelpful refusals
  { id: 'no_boilerplate_refusal', weight: 15, check: (text) => !/^(I cannot|I am unable|I'm unable|I don't have access|As an AI)/i.test(text.trim()) },
  // Code responses should include code blocks when type is 'code'
  { id: 'code_block_present', weight: 15, check: (text, ctx) => ctx.answerType !== 'code' || /```/.test(text) },
  // List responses should have multiple items
  { id: 'list_items_present', weight: 10, check: (text, ctx) => ctx.answerType !== 'list' || /\n[-*•]|\n\d+\./.test(text) },
  // Should not be too short for non-terse verbosity
  { id: 'adequate_length', weight: 15, check: (text, ctx) => ctx.verbosityLevel === 'terse' || text.length > 100 },
  // Should not repeat the user's question verbatim at length
  { id: 'no_question_repetition', weight: 10, check: (text, ctx) => !ctx.prompt || text.length < 2000 || !text.slice(0, 200).toLowerCase().includes((ctx.prompt || '').toLowerCase().slice(0, 40)) },
  // No excessive filler phrases
  { id: 'no_excessive_filler', weight: 5, check: (text) => (text.match(/\bof course\b|\bcertainly\b|\babsolutely\b/gi) || []).length < 4 },
];

class ResponseQualityGate {
  constructor({ threshold = 0.6 } = {}) {
    this._threshold = threshold;
    this._history = [];
  }

  /**
   * Score a response against the answer contract.
   * @param {string} responseText
   * @param {object} contract   - from AnswerContract.buildContract()
   * @param {object} [opts]     - { verbosityLevel, prompt }
   * @returns {{ pass: boolean, score: number, report: object[] }}
   */
  gate(responseText, contract = {}, opts = {}) {
    const ctx = {
      answerType: contract.answer_type || 'unknown',
      verbosityLevel: opts.verbosityLevel || 'moderate',
      prompt: opts.prompt || '',
    };

    const text = typeof responseText === 'string' ? responseText : '';
    const report = [];
    let totalWeight = 0;
    let earnedWeight = 0;

    for (const { id, weight, check } of QUALITY_CHECKS) {
      const passed = Boolean(check(text, ctx));
      totalWeight += weight;
      if (passed) earnedWeight += weight;
      report.push({ id, weight, passed });
    }

    // Contract alignment: check that contract.required_elements are present
    if (Array.isArray(contract.required_elements)) {
      for (const element of contract.required_elements) {
        const present = new RegExp(element, 'i').test(text);
        report.push({ id: `contract:${element}`, weight: 5, passed: present });
        totalWeight += 5;
        if (present) earnedWeight += 5;
      }
    }

    const score = totalWeight > 0 ? earnedWeight / totalWeight : 0;
    const pass = score >= this._threshold;

    const record = {
      ts: new Date().toISOString(),
      score: +score.toFixed(3),
      pass,
      answerType: ctx.answerType,
      textLength: text.length,
    };
    this._history.push(record);
    if (this._history.length > 200) this._history.shift();

    return { pass, score: +score.toFixed(3), report };
  }

  /**
   * Quick quality check — does this response look acceptable at a glance?
   */
  isAcceptable(responseText) {
    if (!responseText || responseText.trim().length < 5) return false;
    if (/^(I cannot|I am unable|I don't|As an AI, I)/i.test(responseText.trim())) return false;
    return true;
  }

  getStats() {
    const all = this._history;
    if (!all.length) return { total: 0, passRate: 0, avgScore: 0 };
    const passes = all.filter((r) => r.pass).length;
    const avgScore = all.reduce((s, r) => s + r.score, 0) / all.length;
    return { total: all.length, passRate: +(passes / all.length).toFixed(3), avgScore: +avgScore.toFixed(3) };
  }
}

let _instance = null;
function getResponseQualityGate(opts) {
  if (!_instance) _instance = new ResponseQualityGate(opts);
  return _instance;
}

module.exports = { ResponseQualityGate, getResponseQualityGate };
