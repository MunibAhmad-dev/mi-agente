'use strict';

/**
 * AskVsAct — Gen B Phase 9.
 * Decides whether the agent should ask for clarification or act autonomously.
 *
 * Rules:
 *   - ASK when confidence < 0.6
 *   - ASK when the task is irreversible (delete, overwrite, send, deploy, etc.)
 *   - ASK when the task involves personal data or credentials
 *   - ACT when confidence >= 0.6 and no risk signals are present
 */

const IRREVERSIBLE_PATTERNS = [
  /\b(delete|remove|drop|destroy|wipe|erase|purge)\b/i,
  /\b(deploy|push to production|go live|release)\b/i,
  /\b(overwrite|replace|truncate|reset)\b/i,
  /\b(send email|send message|post to|publish|broadcast)\b/i,
  /\b(transfer|withdraw|pay|charge|purchase)\b/i,
];

const CREDENTIAL_PATTERNS = [
  /\b(password|secret|token|api.?key|private.?key|credentials?)\b/i,
  /\b(ssn|social.?security|passport|credit.?card)\b/i,
];

const AMBIGUOUS_PATTERNS = [
  /\b(maybe|perhaps|something like|kind of|sort of)\b/i,
  /\b(or something|or whatever|or similar)\b/i,
  /\?.*\?/s, // multiple question marks
];

class AskVsAct {
  constructor() {
    this.stats = { evaluations: 0, asked: 0, acted: 0 };
  }

  /**
   * Evaluate whether to ask for clarification or act.
   * @param {string} task    - The task/prompt text
   * @param {object} context - { confidence?, history?, irreversible?, permissions? }
   * @returns {{ action: 'ask'|'act', reason: string, clarifyingQuestions: string[], confidence: number }}
   */
  evaluate(task, context = {}) {
    try {
      if (!task || typeof task !== 'string') {
        return { action: 'ask', reason: 'No task provided', clarifyingQuestions: ['What would you like me to do?'], confidence: 0 };
      }

      this.stats.evaluations++;

      const signals = this._analyzeSignals(task, context);
      const confidence = context.confidence !== undefined ? context.confidence : signals.baseConfidence;

      const reasons = [];
      let shouldAsk = false;

      if (confidence < 0.6) {
        shouldAsk = true;
        reasons.push(`low confidence (${Math.round(confidence * 100)}%)`);
      }

      if (signals.isIrreversible) {
        shouldAsk = true;
        reasons.push('task is irreversible');
      }

      if (signals.hasCredentials) {
        shouldAsk = true;
        reasons.push('task involves sensitive credentials');
      }

      if (signals.isAmbiguous) {
        shouldAsk = true;
        reasons.push('task intent is ambiguous');
      }

      const action = shouldAsk ? 'ask' : 'act';
      const clarifyingQuestions = shouldAsk ? this._generateClarifyingQuestions(task, signals, reasons) : [];

      this.stats[shouldAsk ? 'asked' : 'acted']++;

      return {
        action,
        reason: reasons.length > 0 ? reasons.join('; ') : 'sufficient confidence to act',
        clarifyingQuestions,
        confidence: Math.round(confidence * 100) / 100,
        signals: {
          isIrreversible: signals.isIrreversible,
          hasCredentials: signals.hasCredentials,
          isAmbiguous: signals.isAmbiguous,
        },
      };
    } catch (err) {
      return { action: 'ask', reason: err.message, clarifyingQuestions: ['Can you clarify what you need?'], confidence: 0 };
    }
  }

  _analyzeSignals(task, context) {
    const signals = {
      isIrreversible: false,
      hasCredentials: false,
      isAmbiguous: false,
      baseConfidence: 0.65,
    };

    for (const pattern of IRREVERSIBLE_PATTERNS) {
      if (pattern.test(task)) {
        signals.isIrreversible = true;
        signals.baseConfidence -= 0.2;
        break;
      }
    }

    for (const pattern of CREDENTIAL_PATTERNS) {
      if (pattern.test(task)) {
        signals.hasCredentials = true;
        signals.baseConfidence -= 0.3;
        break;
      }
    }

    for (const pattern of AMBIGUOUS_PATTERNS) {
      if (pattern.test(task)) {
        signals.isAmbiguous = true;
        signals.baseConfidence -= 0.15;
        break;
      }
    }

    // Boost confidence if context provides history
    if (context.history && context.history.length > 3) {
      signals.baseConfidence += 0.1;
    }

    signals.baseConfidence = Math.max(0, Math.min(1, signals.baseConfidence));
    return signals;
  }

  _generateClarifyingQuestions(task, signals, reasons) {
    const questions = [];

    if (signals.isIrreversible) {
      questions.push('This action cannot be undone. Please confirm you want to proceed.');
    }
    if (signals.hasCredentials) {
      questions.push('This task involves sensitive data. Please confirm the scope and permissions.');
    }
    if (signals.isAmbiguous) {
      questions.push('Could you clarify exactly what you want to achieve?');
      questions.push('What should the final result look like?');
    }
    if (questions.length === 0) {
      questions.push('Could you provide more details about the expected outcome?');
    }

    return questions.slice(0, 3);
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getAskVsAct() {
  if (!_instance) _instance = new AskVsAct();
  return _instance;
}

module.exports = { AskVsAct, getAskVsAct };
