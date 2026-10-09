'use strict';

/**
 * LoopVerifier — Scores agent step output quality (0.0–1.0).
 *
 * sync:  verify(stepResult)               — fast, length/error-based
 * async: verifyAsync(stepResult, router)  — LLM-backed when available, falls back to verify()
 */

const LLM_PROMPT = `You are a quality evaluator. Score this step result 0.0–1.0 and list issues.
Respond ONLY with JSON: {"quality":0.82,"issues":["..."],"passed":true}`;

/**
 * @param {{ stepName: string, result: any, error?: string }} stepResult
 * @returns {{ quality: number, passed: boolean, issues: string[] }}
 */
function verify(stepResult) {
  const issues = [];
  let quality = 1.0;

  if (!stepResult) {
    return { quality: 0, passed: false, issues: ['No result provided'] };
  }

  if (stepResult.error) {
    issues.push(`Step error: ${stepResult.error}`);
    quality -= 0.5;
  }

  const result = stepResult.result;

  if (result === null || result === undefined) {
    issues.push('Empty result');
    quality -= 0.3;
  } else if (typeof result === 'string') {
    if (result.trim().length < 10) {
      issues.push('Result is too short');
      quality -= 0.2;
    }
  } else if (typeof result === 'object') {
    if (Array.isArray(result) && result.length === 0) {
      issues.push('Result array is empty');
      quality -= 0.15;
    }
  }

  quality = Math.max(0, Math.min(1, quality));
  return {
    quality: +quality.toFixed(2),
    passed: quality >= 0.6,
    issues,
  };
}

/**
 * LLM-backed quality check. Falls back to sync verify() when no router.
 *
 * @param {{ stepName: string, result: any, error?: string }} stepResult
 * @param {object|null} router  — UniversalLLMRouter instance or null
 * @returns {Promise<{ quality: number, passed: boolean, issues: string[], method: string }>}
 */
async function verifyAsync(stepResult, router) {
  const base = verify(stepResult);

  // Skip LLM if already clearly bad, no router, or result is a fallback placeholder
  if (!router || base.quality === 0 || stepResult.fallback) {
    return { ...base, method: 'heuristic' };
  }

  const content = typeof stepResult.result === 'string'
    ? stepResult.result.slice(0, 800)
    : JSON.stringify(stepResult.result).slice(0, 800);

  // Skip very short content — heuristic already catches it
  if (content.trim().length < 15) {
    return { ...base, method: 'heuristic' };
  }

  try {
    const userMessage = `Step: ${stepResult.stepName || 'unknown'}\nResult:\n${content}`;
    const response = await router.chat([
      { role: 'system', content: LLM_PROMPT },
      { role: 'user', content: userMessage },
    ], { maxTokens: 120, temperature: 0 });

    const text = (response?.content || response?.text || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const llmQuality = typeof parsed.quality === 'number'
        ? Math.max(0, Math.min(1, parsed.quality))
        : base.quality;
      const llmIssues = Array.isArray(parsed.issues) ? parsed.issues : base.issues;
      return {
        quality: +llmQuality.toFixed(2),
        passed: llmQuality >= 0.6,
        issues: llmIssues,
        method: 'llm',
      };
    }
  } catch {
    // LLM unavailable — fall through to heuristic result
  }

  return { ...base, method: 'heuristic' };
}

module.exports = { verify, verifyAsync };
