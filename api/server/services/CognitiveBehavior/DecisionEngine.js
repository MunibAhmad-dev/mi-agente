'use strict';

/**
 * DecisionEngine — Gen B Phase 8.
 * Makes explicit YES / NO / ASK decisions given a question and context.
 * Returns a decision with confidence, reasoning, and alternatives.
 */

const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const ASK_THRESHOLD = 0.5;

class DecisionEngine {
  constructor() {
    this.stats = { decisions: 0, byDecision: { yes: 0, no: 0, ask: 0 } };
    this._history = [];
  }

  /**
   * Make a decision about a question given context.
   * @param {string} question  - The decision question
   * @param {object} context   - { constraints?, evidence?, riskLevel?, irreversible? }
   * @returns {{ decision: string, confidence: number, reasoning: string, alternatives: string[] }}
   */
  decide(question, context = {}) {
    try {
      if (!question) {
        return { decision: 'ask', confidence: 0, reasoning: 'No question provided', alternatives: [] };
      }

      this.stats.decisions++;

      const { confidence, signals } = this._assessConfidence(question, context);
      let decision;

      if (context.irreversible && confidence < HIGH_CONFIDENCE_THRESHOLD) {
        decision = 'ask';
      } else if (context.riskLevel === 'high' && confidence < HIGH_CONFIDENCE_THRESHOLD) {
        decision = 'ask';
      } else if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        decision = this._deriveYesNo(question, context, signals);
      } else if (confidence >= ASK_THRESHOLD) {
        decision = this._deriveYesNo(question, context, signals);
      } else {
        decision = 'ask';
      }

      const reasoning = this._buildReasoning(question, context, confidence, signals, decision);
      const alternatives = this._buildAlternatives(decision, context);

      this.stats.byDecision[decision]++;
      const record = { question, decision, confidence, at: new Date().toISOString() };
      this._history.push(record);
      if (this._history.length > 200) this._history.shift();

      return { decision, confidence: Math.round(confidence * 100) / 100, reasoning, alternatives };
    } catch (err) {
      return { decision: 'ask', confidence: 0, reasoning: err.message, alternatives: [] };
    }
  }

  _assessConfidence(question, context) {
    let confidence = 0.5;
    const signals = [];

    const q = question.toLowerCase();

    // Positive signals
    if (context.evidence && context.evidence.length > 0) {
      confidence += 0.15;
      signals.push('has evidence');
    }
    if (context.constraints && context.constraints.length > 0) {
      confidence += 0.1;
      signals.push('has constraints');
    }
    if (/\b(should|can|is|will|does)\b/.test(q)) {
      confidence += 0.05;
      signals.push('direct question');
    }

    // Negative signals
    if (context.irreversible) {
      confidence -= 0.2;
      signals.push('irreversible action');
    }
    if (context.riskLevel === 'high') {
      confidence -= 0.2;
      signals.push('high risk');
    }
    if (/\b(might|maybe|possibly|unclear|ambiguous)\b/.test(q)) {
      confidence -= 0.15;
      signals.push('ambiguous language');
    }

    confidence = Math.max(0, Math.min(1, confidence));
    return { confidence, signals };
  }

  _deriveYesNo(question, context, signals) {
    const q = question.toLowerCase();

    // Negative indicators
    const negativePattern = /\b(should not|cannot|must not|avoid|prevent|block|deny|reject|no)\b/i;
    if (negativePattern.test(q)) return 'no';

    // Affirmative indicators
    const affirmativePattern = /\b(should|can|will|yes|proceed|allow|approve|execute|perform)\b/i;
    if (affirmativePattern.test(q)) return 'yes';

    // Default based on context
    if (context.riskLevel === 'high') return 'ask';
    return 'yes';
  }

  _buildReasoning(question, context, confidence, signals, decision) {
    const parts = [`Decision: ${decision.toUpperCase()} (confidence: ${Math.round(confidence * 100)}%)`];
    if (signals.length > 0) parts.push(`Signals: ${signals.join(', ')}`);
    if (context.irreversible) parts.push('Action is irreversible — caution applied');
    if (context.riskLevel) parts.push(`Risk level: ${context.riskLevel}`);
    return parts.join('. ');
  }

  _buildAlternatives(decision, context) {
    if (decision === 'yes') {
      return ['Proceed with reduced scope', 'Request confirmation before executing', 'Execute with rollback plan'];
    }
    if (decision === 'no') {
      return ['Provide explanation and alternatives', 'Escalate to higher authority', 'Request more context'];
    }
    return ['Rephrase question for clarity', 'Provide more context/evidence', 'Break into smaller decisions'];
  }

  getHistory(limit = 50) {
    return this._history.slice(-limit);
  }

  getStats() {
    return { ...this.stats, historySize: this._history.length };
  }
}

let _instance = null;
function getDecisionEngine() {
  if (!_instance) _instance = new DecisionEngine();
  return _instance;
}

module.exports = { DecisionEngine, getDecisionEngine };
