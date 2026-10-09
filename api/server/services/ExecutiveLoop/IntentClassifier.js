/**
 * IntentClassifier — Classifies a user message into an intent type.
 *
 * Intent types:
 *   simple_query    — quick question, one-step answer
 *   research_request — needs web search, multi-source synthesis
 *   multi_step_task  — complex task requiring planning + multiple steps
 *   code_task        — write, debug, or analyse code
 *
 * Two modes:
 *   classify(message)              — synchronous, keyword-based (always available)
 *   classifyAsync(message, router) — async, tries LLM first, falls back to keywords
 */

const INTENT = {
  SIMPLE_QUERY: 'simple_query',
  RESEARCH: 'research_request',
  MULTI_STEP: 'multi_step_task',
  CODE: 'code_task',
};

const CODE_SIGNALS = [
  'code', 'function', 'class', 'script', 'program', 'debug', 'error',
  'bug', 'fix', 'implement', 'refactor', 'test', 'api', 'endpoint',
  'sql', 'query', 'database', 'import', 'module', 'typescript', 'javascript',
  'python', 'react', 'node', 'express', 'docker', 'deploy',
  'código', 'función', 'clase',
];

const RESEARCH_SIGNALS = [
  'search', 'find', 'research', 'what is', 'who is', 'when did', 'where',
  'explain', 'latest', 'news', 'current', 'today', '2024', '2025', '2026',
  'compare', 'difference', 'vs ', 'versus', 'statistics', 'data',
  'buscar', 'investigar', 'encontrar', 'qué es', 'cuándo',
];

const MULTI_STEP_SIGNALS = [
  'and then', 'after that', 'first', 'second', 'finally', 'step',
  'create and', 'build and', 'analyze and', 'generate and', 'set up',
  'configure', 'integrate', 'workflow', 'pipeline', 'process',
  'luego', 'después', 'primero', 'segundo', 'finalmente',
];

function countSignals(lower, signals) {
  return signals.filter((s) => lower.includes(s)).length;
}

/**
 * Synchronous keyword-based classification (always available, no LLM needed).
 */
function classify(message) {
  if (!message || typeof message !== 'string') {
    return {
      intent: INTENT.SIMPLE_QUERY,
      confidence: 0.5,
      signals: [],
      routing: { needsPlanning: false, needsResearch: false, needsCode: false, estimatedSteps: 1 },
      method: 'keyword',
    };
  }

  const lower = message.toLowerCase();
  const wordCount = lower.split(/\s+/).length;

  const codeHits = countSignals(lower, CODE_SIGNALS);
  const researchHits = countSignals(lower, RESEARCH_SIGNALS);
  const multiStepHits = countSignals(lower, MULTI_STEP_SIGNALS);

  const scores = {
    [INTENT.CODE]: codeHits * 3,
    [INTENT.RESEARCH]: researchHits * 2,
    [INTENT.MULTI_STEP]: multiStepHits * 2 + (wordCount > 30 ? 4 : 0),
    [INTENT.SIMPLE_QUERY]: 2,
  };

  if (wordCount > 50) scores[INTENT.MULTI_STEP] += 3;
  if (wordCount <= 8 && message.includes('?')) scores[INTENT.SIMPLE_QUERY] += 4;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const intent = best[0];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const confidence = Math.min(0.95, best[1] / totalScore + 0.4);

  const matched = [
    ...CODE_SIGNALS.filter((s) => lower.includes(s)),
    ...RESEARCH_SIGNALS.filter((s) => lower.includes(s)),
    ...MULTI_STEP_SIGNALS.filter((s) => lower.includes(s)),
  ].slice(0, 5);

  return {
    intent,
    confidence: +confidence.toFixed(2),
    signals: matched,
    routing: {
      needsPlanning: intent === INTENT.MULTI_STEP || intent === INTENT.CODE,
      needsResearch: intent === INTENT.RESEARCH,
      needsCode: intent === INTENT.CODE,
      estimatedSteps:
        intent === INTENT.SIMPLE_QUERY ? 1
        : intent === INTENT.RESEARCH ? 3
        : intent === INTENT.CODE ? 4
        : 3,
    },
    method: 'keyword',
  };
}

// LLM classification prompt — compact, structured output
const LLM_PROMPT = `You are an intent classifier. Classify the user message into exactly one of these intents:
- simple_query: a quick factual question with a direct answer
- research_request: needs web search, comparisons, or multi-source synthesis
- multi_step_task: a complex task requiring planning and multiple sequential steps
- code_task: write, debug, refactor, or analyze code

Respond with ONLY a JSON object on one line, no markdown:
{"intent":"<one of the four>","confidence":<0.0-1.0>,"reason":"<10 words max>"}

User message: `;

/**
 * Parse LLM response text into a classification result.
 * Returns null if parsing fails.
 */
function parseLLMResponse(text) {
  try {
    // Extract JSON from the response (handle extra text around it)
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const validIntents = Object.values(INTENT);
    if (!validIntents.includes(parsed.intent)) return null;
    return {
      intent: parsed.intent,
      confidence: Math.min(0.99, Math.max(0.1, Number(parsed.confidence) || 0.7)),
      reason: parsed.reason || '',
    };
  } catch {
    return null;
  }
}

/**
 * Async classification: tries LLM first, falls back to keywords.
 *
 * @param {string} message — the user's message
 * @param {object|null} router — UniversalLLMRouter instance (or null to skip LLM)
 * @returns {Promise<{intent, confidence, signals, routing, method}>}
 */
async function classifyAsync(message, router) {
  // Keyword fallback result always computed first (fast)
  const keywordResult = classify(message);

  // Short messages — keyword matching is reliable enough, skip LLM overhead
  const wordCount = (message || '').split(/\s+/).length;
  if (!router || wordCount <= 5) return keywordResult;

  try {
    const response = await router.chat({
      messages: [{ role: 'user', content: LLM_PROMPT + message }],
      temperature: 0,
      max_tokens: 80,
    });

    const text = response?.content?.[0]?.text
      || response?.choices?.[0]?.message?.content
      || response?.message?.content
      || '';

    const llmResult = parseLLMResponse(text);
    if (!llmResult) return keywordResult;

    // Merge: LLM intent with keyword routing metadata
    const routing = {
      needsPlanning: llmResult.intent === INTENT.MULTI_STEP || llmResult.intent === INTENT.CODE,
      needsResearch: llmResult.intent === INTENT.RESEARCH,
      needsCode: llmResult.intent === INTENT.CODE,
      estimatedSteps:
        llmResult.intent === INTENT.SIMPLE_QUERY ? 1
        : llmResult.intent === INTENT.RESEARCH ? 3
        : llmResult.intent === INTENT.CODE ? 4
        : 3,
    };

    return {
      intent: llmResult.intent,
      confidence: llmResult.confidence,
      signals: keywordResult.signals,
      routing,
      method: 'llm',
      reason: llmResult.reason,
    };
  } catch {
    // LLM call failed — fall back to keywords silently
    return keywordResult;
  }
}

module.exports = { classify, classifyAsync, INTENT };
