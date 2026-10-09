/**
 * PlanMode — Deliberate planning before execution.
 *
 * When Plan Mode is active, the agent:
 *   1. Analyzes the task and formulates a step-by-step plan
 *   2. Identifies files to read/modify and tools needed
 *   3. Estimates complexity and risk
 *   4. Presents the plan for user approval BEFORE any execution
 *   5. Only executes after explicit approval
 *
 * This prevents the agent from making changes blindly.
 */

const path = require('path');
const EventBusPath = path.join(__dirname, '..', 'EventBus');
const { getEventBus } = require(EventBusPath);

const PLANNING_SYSTEM_PROMPT = `When operating in PLAN MODE, you MUST:
1. Analyze the task thoroughly before proposing any action.
2. Create a numbered, step-by-step plan.
3. For each step, specify:
   - What you will do (read file X, modify function Y)
   - Which tool you will use
   - Expected outcome
   - Risk level (low/medium/high)
4. Identify all files that will be affected.
5. Estimate total complexity (simple/moderate/complex).
6. Present the plan and WAIT for user approval.
DO NOT execute any write/modify/shell commands until the user approves the plan.`;

/**
 * Build a plan-mode prompt wrapper.
 * @param {string} userMessage
 * @returns {string}
 */
function wrapUserMessage(userMessage) {
  return `${PLANNING_SYSTEM_PROMPT}\n\nUser request: ${userMessage}\n\nCreate a detailed plan. Do NOT execute yet.`;
}

/**
 * Parse a plan from LLM output.
 * @param {string} llmOutput
 * @returns {object}
 */
function parsePlan(llmOutput) {
  const steps = [];
  const files = new Set();
  const lines = llmOutput.split('\n');
  let currentStep = null;
  for (const line of lines) {
    const stepMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    if (stepMatch) {
      if (currentStep) steps.push(currentStep);
      currentStep = {
        number: parseInt(stepMatch[1], 10),
        action: stepMatch[2],
        tool: null,
        risk: 'low',
      };
    }
    const fileMatch = line.match(/(?:file|files?)[:\s]+([^\s,]+\.\w+)/g);
    if (fileMatch) {
      for (const f of fileMatch) {
        const cleaned = f.replace(/.*?:\s*/, '').trim();
        files.add(cleaned);
      }
    }
    const toolMatch = line.match(
      /\b(?:read_file|write_file|edit_file|grep_search|glob_search|web_search|apply_patch|execute_command)\b/i,
    );
    if (toolMatch && currentStep) {
      currentStep.tool = toolMatch[0].toLowerCase();
    }
    const riskMatch = line.match(/\brisk\s*:\s*(low|medium|high)/i);
    if (riskMatch && currentStep) {
      currentStep.risk = riskMatch[1].toLowerCase();
    }
  }
  if (currentStep) steps.push(currentStep);

  let complexity = 'moderate';
  if (steps.length <= 3) complexity = 'simple';
  else if (steps.length >= 8) complexity = 'complex';

  return {
    steps,
    files: Array.from(files),
    complexity,
    totalSteps: steps.length,
    rawPlan: llmOutput,
  };
}

/**
 * Check if a plan is approved for execution.
 * @param {object} plan - parsed plan from parsePlan
 * @param {object} approval - {approved: boolean, modifiedSteps?: Array}
 * @returns {boolean}
 */
function isApproved(plan, approval) {
  if (!approval) return false;
  return approval.approved === true;
}

/**
 * Emit plan for user review via EventBus.
 * @param {object} plan
 */
function emitPlan(plan) {
  let eventBus;
  try {
    eventBus = getEventBus();
    if (eventBus) {
      eventBus.publish('plan.proposed', plan, 'PlanMode');
    }
  } catch {
    // ignore
  }
}

module.exports = {
  PLANNING_SYSTEM_PROMPT,
  wrapUserMessage,
  parsePlan,
  isApproved,
  emitPlan,
};
