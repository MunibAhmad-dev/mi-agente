'use strict';

/**
 * Director — Face 8 FASE 16: Decides the high-level approach for a classified intent.
 *
 * Upgrades vs original static-table version:
 *   1. _deriveStepsFromContext — dynamic steps adapted from WorldModel context and message
 *   2. decideWithJudge — calls MultiModelJudge for high-risk decisions (riskLevel >= 5)
 *   3. replan — generates a recovery plan when a step fails (FASE 13)
 */

const { ExecutiveBrain } = require('../Harness/cognitive/ExecutiveBrain');
const { INTENT } = require('./IntentClassifier');
const { getMultiModelJudge } = require('./MultiModelJudge');

const APPROACH = {
  DIRECT: 'direct_answer',
  PLAN_EXECUTE: 'plan_and_execute',
  RESEARCH_FIRST: 'research_first',
  CODE_PIPELINE: 'code_pipeline',
};

// Baseline step templates per approach — overrideable by dynamic derivation
const STEP_TEMPLATES = {
  [APPROACH.DIRECT]: ['Understand request', 'Generate answer'],
  [APPROACH.PLAN_EXECUTE]: ['Understand goal', 'Break into steps', 'Execute plan', 'Verify result'],
  [APPROACH.RESEARCH_FIRST]: ['Search sources', 'Read & extract facts', 'Synthesize answer', 'Verify accuracy'],
  [APPROACH.CODE_PIPELINE]: ['Understand requirements', 'Plan implementation', 'Write code', 'Verify & test'],
};

const APPROACH_BY_INTENT = {
  [INTENT.SIMPLE_QUERY]: APPROACH.DIRECT,
  [INTENT.RESEARCH]: APPROACH.RESEARCH_FIRST,
  [INTENT.MULTI_STEP]: APPROACH.PLAN_EXECUTE,
  [INTENT.CODE]: APPROACH.CODE_PIPELINE,
};

const DURATION_ESTIMATE = {
  [APPROACH.DIRECT]: 3,
  [APPROACH.RESEARCH_FIRST]: 20,
  [APPROACH.PLAN_EXECUTE]: 30,
  [APPROACH.CODE_PIPELINE]: 40,
};

/**
 * Dynamically adapt steps using WorldModel context and message signals.
 * Falls back to the static baseline when context is unavailable.
 */
function _deriveStepsFromContext(approach, worldContext, message) {
  const base = [...(STEP_TEMPLATES[approach] || STEP_TEMPLATES[APPROACH.DIRECT])];
  if (!worldContext && !message) return base;

  const combined = `${worldContext || ''} ${message || ''}`.toLowerCase();

  // Prepend diagnostic step when failure context is active
  if (/error|fail|broken|bug|exception|crash/i.test(combined)) {
    if (!base.includes('Diagnose root cause')) base.unshift('Diagnose root cause');
  }

  // Append security review for sensitive operations
  if (/security|auth|permiss|credential|token|password|secret/i.test(combined)) {
    if (!base.includes('Security review')) base.push('Security review');
  }

  // Append integration step for multi-system contexts
  if (/integrat|connect|api|webhook|database|service/i.test(combined) && approach !== APPROACH.DIRECT) {
    if (!base.includes('Integration check')) base.push('Integration check');
  }

  // Add validation step for code and multi-step tasks when constraints mentioned
  if (/must|required|constraint|assert|validat/i.test(combined) && base.includes('Verify result')) {
    if (!base.includes('Validate constraints')) base.splice(base.indexOf('Verify result'), 0, 'Validate constraints');
  }

  return base;
}

/**
 * Decide how to handle the classified intent, with optional WorldModel context.
 * @param {{ intent: string, confidence: number }} classification
 * @param {string} message
 * @param {string} [worldContext] - summary from WorldModel.getContextSummary()
 * @returns {{ approach, model, steps, estimatedDurationSec }}
 */
function decide(classification, message, worldContext) {
  const { intent } = classification;
  const approach = APPROACH_BY_INTENT[intent] || APPROACH.DIRECT;

  const brain = new ExecutiveBrain();
  let brainPlan = null;
  try { brainPlan = brain._analyzeTask(message); } catch {}
  const model = brainPlan ? brain._selectModelStrategy(brainPlan) : 'fast';

  const steps = _deriveStepsFromContext(approach, worldContext, message);

  return { approach, model, steps, estimatedDurationSec: DURATION_ESTIMATE[approach] || 5 };
}

/**
 * Decide with MultiModelJudge consensus for high-risk decisions (FASE 16).
 * Triggers when numericRisk >= 5. Falls back to regular decide() if judge unavailable.
 *
 * @param {{ intent: string, confidence: number }} classification
 * @param {string} message
 * @param {number} [numericRisk=0]   - 0–10 risk score from PolicyEngine or caller
 * @param {string} [worldContext]    - WorldModel context summary
 * @returns {Promise<{ approach, model, steps, estimatedDurationSec, judgeVerdict, judgeConfidence, judgeReasoning }>}
 */
async function decideWithJudge(classification, message, numericRisk = 0, worldContext = '') {
  const direction = decide(classification, message, worldContext);

  if (numericRisk < 5) {
    return { ...direction, judgeVerdict: null, judgeConfidence: null, judgeReasoning: [] };
  }

  const riskLabel = numericRisk >= 8 ? 'critical' : numericRisk >= 6 ? 'high' : 'medium';

  try {
    const judge = getMultiModelJudge();
    const judgment = await judge.judge({
      action: `Execute ${direction.approach} plan for: ${message.slice(0, 200)}`,
      intent: classification.intent,
      riskLevel: riskLabel,
      context: worldContext || '',
    });
    return {
      ...direction,
      judgeVerdict: judgment.verdict,
      judgeConfidence: judgment.confidence,
      judgeReasoning: judgment.reasoning || [],
    };
  } catch {
    // Judge unavailable — proceed with the approved direction (fail-open for availability)
    return { ...direction, judgeVerdict: null, judgeConfidence: null, judgeReasoning: [] };
  }
}

/**
 * Generate a recovery plan when a step fails — FASE 13 replanning logic.
 *
 * Escalates to a more thorough approach and prepends a diagnostic step
 * so the retry understands why the original attempt failed.
 *
 * @param {{ intent: string, confidence: number }} classification
 * @param {string} message
 * @param {string} failedStep  - name of the step that failed
 * @param {string} [failureReason]
 * @param {{ approach: string }} [previousDirection] - the direction that failed
 * @param {string} [worldContext]
 * @returns {{ approach, model, steps, estimatedDurationSec, isReplan, failedStep, failureReason }}
 */
function replan(classification, message, failedStep, failureReason, previousDirection, worldContext) {
  const prevApproach = previousDirection?.approach || APPROACH.DIRECT;

  // Escalate: direct → plan_execute → research_first → code_pipeline
  const escalation = {
    [APPROACH.DIRECT]: APPROACH.PLAN_EXECUTE,
    [APPROACH.PLAN_EXECUTE]: APPROACH.RESEARCH_FIRST,
    [APPROACH.RESEARCH_FIRST]: APPROACH.CODE_PIPELINE,
    [APPROACH.CODE_PIPELINE]: APPROACH.PLAN_EXECUTE,
  };
  const approach = escalation[prevApproach] || APPROACH.PLAN_EXECUTE;

  const brain = new ExecutiveBrain();
  let brainPlan = null;
  try { brainPlan = brain._analyzeTask(`RETRY: ${message}`); } catch {}
  const model = brainPlan ? brain._selectModelStrategy(brainPlan) : 'standard';

  const baseSteps = _deriveStepsFromContext(approach, worldContext, message);

  // Recovery steps: diagnose first, skip the exact failed step name if it's a duplicate
  const failedNameLower = (failedStep || '').toLowerCase().slice(0, 20);
  const filteredBase = baseSteps.filter((s) => !s.toLowerCase().includes(failedNameLower) || failedNameLower.length < 5);

  const recoverySteps = [
    `Diagnose failure: ${(failedStep || 'unknown').slice(0, 60)}`,
    ...filteredBase,
  ];

  return {
    approach: `recovery:${approach}`,
    model,
    steps: recoverySteps,
    estimatedDurationSec: (DURATION_ESTIMATE[approach] || 10) * 1.5,
    isReplan: true,
    failedStep,
    failureReason: (failureReason || '').slice(0, 200),
  };
}

module.exports = { decide, decideWithJudge, replan, APPROACH };
