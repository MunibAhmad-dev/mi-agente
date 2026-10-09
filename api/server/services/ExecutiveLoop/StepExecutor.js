/**
 * StepExecutor — Face 8: real LLM-backed step execution.
 *
 * Calls UniversalLLMRouter for each step with a compact, focused prompt.
 * Falls back to a heuristic summary if no LLM provider is available.
 */

'use strict';

const { UniversalLLMRouter } = require('../Harness/cognitive/llm/UniversalLLMRouter');

const logger = {
  info: (...a) => console.log('[StepExecutor]', ...a),
  warn: (...a) => console.warn('[StepExecutor]', ...a),
};

// Per-step system prompts tuned for concise, focused output
const STEP_SYSTEM_PROMPTS = {
  default: `You are a focused AI assistant executing ONE step of a larger task.
Answer only for the current step. Be concise (3-8 sentences max).
Do not repeat context. Output the result of the step directly.`,

  code: `You are a senior developer executing ONE coding step.
Output only the relevant code or analysis for this step.
No preamble, no markdown headers. Short and precise.`,

  research: `You are a research assistant executing ONE research step.
Output only the key facts or findings for this step.
Be factual and cite what you know. 3-6 sentences max.`,
};

const STEP_TYPE_MAP = {
  'Understand requirements': 'default',
  'Design data model': 'code',
  'Write implementation': 'code',
  'Write code': 'code',
  'Handle edge cases': 'code',
  'Write tests': 'code',
  'Verify correctness': 'code',
  'Search': 'research',
  'Research': 'research',
  'Extract': 'research',
  'Synthesize': 'research',
};

function getSystemPrompt(stepName) {
  for (const [key, type] of Object.entries(STEP_TYPE_MAP)) {
    if (stepName.toLowerCase().includes(key.toLowerCase())) {
      return STEP_SYSTEM_PROMPTS[type];
    }
  }
  return STEP_SYSTEM_PROMPTS.default;
}

const _router = new UniversalLLMRouter({});

// Gen B Phase 1 — UniversalAgentAbstraction: full cognitive pipeline around LLM calls
let _uaa = null;
function getUAA() {
  if (!_uaa) {
    try {
      const { getUniversalAgentAbstraction } = require('../CognitiveBehavior/UniversalAgentAbstraction');
      _uaa = getUniversalAgentAbstraction();
    } catch { _uaa = null; }
  }
  return _uaa;
}

let _constitutionBuilder = null;
function getConstitutionBuilder() {
  if (!_constitutionBuilder) {
    try {
      _constitutionBuilder = require('../AgentRuntime/Scaffolding/SystemPromptBuilder');
    } catch {
      _constitutionBuilder = { loadConstitutionPersona: async () => null };
    }
  }
  return _constitutionBuilder;
}

/**
 * Execute a single step via LLM.
 *
 * @param {object} params
 * @param {string} params.stepName    - name of this step
 * @param {number} params.stepIndex   - 0-based index
 * @param {string} params.message     - original user message
 * @param {string} params.intent      - classified intent
 * @param {object[]} [params.history] - previous step results for context
 * @param {string} [params.model]     - optional model override
 * @returns {Promise<{ result: string, error?: string, provider?: string, latencyMs?: number }>}
 */
async function executeStep({ stepName, stepIndex, message, intent, history = [], model, priorContext: sessionContext = null, constitutionText = null }) {
  const stepPrompt = getSystemPrompt(stepName);

  // Prepend active Agent Constitution (Face 7).
  // Prefer constitutionText passed by ExecutiveLoop (freshly read from MongoDB).
  // Fall back to the SystemPromptBuilder if not provided.
  let constitutionPrefix = '';
  if (constitutionText) {
    constitutionPrefix = constitutionText.slice(0, 2000) + '\n\n---\n\n';
  } else {
    try {
      const persona = await getConstitutionBuilder().loadConstitutionPersona();
      if (persona) constitutionPrefix = persona + '\n\n---\n\n';
    } catch {
      // no constitution set — use step prompt as-is
    }
  }

  // Inject cross-session memory context into system prompt when available
  const memoryContext = sessionContext ? `\n\n${sessionContext.slice(0, 600)}\n\n---\n\n` : '';
  const systemPrompt = constitutionPrefix + memoryContext + stepPrompt;

  // Build context from prior step results (last 2 to stay under token budget)
  const stepHistory =
    history.length > 0
      ? '\n\nPrior steps completed:\n' +
        history
          .slice(-2)
          .map((h) => `- ${h.stepName}: ${(h.result || '').slice(0, 200)}`)
          .join('\n')
      : '';

  const userPrompt =
    `Original request: "${message.slice(0, 300)}"\n\n` +
    `Step ${stepIndex + 1}: ${stepName}${stepHistory}\n\n` +
    `Complete this step now.`;

  try {
    const start = Date.now();

    // Gen B Phase 1 — route through UniversalAgentAbstraction for full cognitive pipeline
    // (QuestionUnderstanding → AskVsAct → LoopDetection → AnswerContract → LLM → QualityGate)
    const uaa = getUAA();
    if (uaa) {
      const uaaResult = await uaa.route(userPrompt, {
        sessionId: `step_${stepIndex}_${Date.now()}`,
        history: [{ role: 'system', content: systemPrompt }],
        model,
        options: { maxTokens: 512, temperature: 0.4, taskType: intent === 'code_task' ? 'code' : 'general' },
      });

      if (uaaResult.action === 'ask' || uaaResult.action === 'loop_detected') {
        // Treat ask/loop as a soft failure — return a describable result so verifier can score it
        return { result: uaaResult.message || `[${uaaResult.action}]`, provider: 'uaa', latencyMs: Date.now() - start, uaaAction: uaaResult.action };
      }

      const result = uaaResult.content || '';
      logger.info(`step=${stepIndex} "${stepName}" provider=${uaaResult.provider} via UAA latency=${Date.now() - start}ms`);
      return { result: result.trim(), provider: uaaResult.provider || 'uaa', latencyMs: Date.now() - start, quality: uaaResult.quality };
    }

    // Fallback: direct LLMRouter call when UAA unavailable
    const response = await _router.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        maxTokens: 512,
        temperature: 0.4,
        model,
        taskType: intent === 'code_task' ? 'code' : 'general',
      },
    );

    const result = response.content || response.message?.content || '';
    logger.info(`step=${stepIndex} "${stepName}" provider=${response.provider} latency=${response.latency}ms`);

    return {
      result: result.trim(),
      provider: response.provider,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    logger.warn(`step=${stepIndex} LLM call failed (${err.message})`);

    // Return a genuine failure so the verifier scores it 0 and the loop
    // can retry, skip, or abort — never silently claim success.
    return {
      result: null,
      error: err.message,
      failed: true,
    };
  }
}

module.exports = { executeStep };
