'use strict';

/**
 * AIRouter — Face 13 §17-18: Intelligent model routing + automatic fallback.
 *
 * Selects the best provider/model based on:
 *   task type, cost, speed, privacy, available hardware, provider health.
 *
 * Fallback chain: primary → secondary → ... → error
 */

const { logger } = require('@librechat/data-schemas');

// In-memory provider health state (resets on restart)
const _health = new Map(); // providerId → { ok, lastCheck, failCount }

const TASK_PROFILES = {
  code: { preferModels: ['deepseek', 'qwen', 'codestral', 'llama-3'], avoidModels: [] },
  reasoning: { preferModels: ['deepseek-r1', 'o1', 'qwq'], avoidModels: [] },
  chat: { preferModels: ['llama-3.3', 'mistral', 'gemma'], avoidModels: [] },
  vision: { preferModels: ['llava', 'minicpm-v', 'gpt-4o', 'gemini'], avoidModels: [] },
  fast: { preferModels: ['llama-3.1-8b', 'gemma2-9b', 'phi-3'], avoidModels: [] },
  local_only: { requireLocal: true, preferModels: [], avoidModels: [] },
  free_only: { requireFree: true, preferModels: [], avoidModels: [] },
};

function scoreModel(modelId, providerId, task = 'chat', preferences = {}) {
  let score = 50;
  const profile = TASK_PROFILES[task] || TASK_PROFILES.chat;

  // Task fit
  for (const pref of profile.preferModels) {
    if (modelId.toLowerCase().includes(pref.toLowerCase())) score += 20;
  }
  for (const avoid of profile.avoidModels) {
    if (modelId.toLowerCase().includes(avoid.toLowerCase())) score -= 30;
  }

  // Provider health bonus
  const health = _health.get(providerId);
  if (health?.ok === true) score += 10;
  if (health?.ok === false) score -= 40;

  // Local preference
  if (preferences.preferLocal && ['ollama', 'lmstudio', 'litellm'].includes(providerId)) score += 15;
  if (preferences.preferFree && ['ollama', 'groq', 'openrouter', 'litellm', 'lmstudio'].includes(providerId)) score += 10;

  // Cost (free providers score higher when cost matters)
  if (preferences.minimizeCost) {
    const freeProviders = ['ollama', 'lmstudio', 'groq', 'litellm'];
    if (freeProviders.includes(providerId)) score += 20;
  }

  return score;
}

/**
 * Select the best model from available providers.
 * @param {Array<{id, label, models, chatUrl}>} providers - discovered providers
 * @param {object} options - { task, preferLocal, preferFree, minimizeCost }
 * @returns {{ providerId, modelId, chatUrl, score, fallbacks, reason }}
 */
function selectBest(providers, options = {}) {
  const { task = 'chat' } = options;
  const candidates = [];

  for (const provider of providers) {
    if (!provider.reachable && (!provider.models || provider.models.length === 0)) continue;
    const models = provider.models || provider.knownModels || [];

    for (const modelId of models) {
      const score = scoreModel(modelId, provider.id, task, options);
      candidates.push({
        providerId: provider.id,
        providerLabel: provider.label,
        modelId,
        chatUrl: provider.chatUrl,
        score,
        reachable: provider.reachable,
      });
    }
  }

  if (candidates.length === 0) {
    return { error: 'No providers or models available' };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const fallbacks = candidates.slice(1, 4).map((c) => ({ providerId: c.providerId, modelId: c.modelId, chatUrl: c.chatUrl }));

  return {
    providerId: best.providerId,
    providerLabel: best.providerLabel,
    modelId: best.modelId,
    chatUrl: best.chatUrl,
    score: best.score,
    fallbacks,
    reason: `Mejor opción para tarea "${task}" en proveedor ${best.providerLabel}`,
  };
}

/**
 * Execute with automatic fallback chain.
 * @param {Array<{providerId, modelId, chatUrl}>} chain - ordered fallback candidates
 * @param {Function} executeFn - async fn(candidate) → result; throws on failure
 */
async function executeWithFallback(chain, executeFn) {
  const errors = [];

  for (const candidate of chain) {
    try {
      const result = await executeFn(candidate);
      // Mark provider healthy
      _health.set(candidate.providerId, { ok: true, lastCheck: Date.now(), failCount: 0 });
      return { ...result, usedProvider: candidate.providerId, usedModel: candidate.modelId };
    } catch (err) {
      errors.push({ provider: candidate.providerId, model: candidate.modelId, error: err.message });
      const prev = _health.get(candidate.providerId) || { failCount: 0 };
      _health.set(candidate.providerId, { ok: false, lastCheck: Date.now(), failCount: prev.failCount + 1 });
      logger.warn(`[AIRouter] Fallback: ${candidate.providerId}/${candidate.modelId} failed: ${err.message}`);
    }
  }

  throw new Error(
    `Todos los proveedores fallaron.\n${errors.map((e) => `- ${e.provider}/${e.model}: ${e.error}`).join('\n')}`,
  );
}

/**
 * Get current health state of all known providers.
 */
function getProviderHealth() {
  const result = {};
  for (const [id, h] of _health.entries()) {
    result[id] = h;
  }
  return result;
}

/**
 * Mark a provider's health manually (for admin override).
 */
function setProviderHealth(providerId, ok) {
  const prev = _health.get(providerId) || { failCount: 0 };
  _health.set(providerId, { ok, lastCheck: Date.now(), failCount: ok ? 0 : prev.failCount + 1 });
}

/**
 * Build a fallback chain from a selectBest result.
 */
function buildFallbackChain(selection) {
  if (!selection || selection.error) return [];
  const chain = [{ providerId: selection.providerId, modelId: selection.modelId, chatUrl: selection.chatUrl }];
  for (const fb of selection.fallbacks || []) {
    chain.push(fb);
  }
  return chain;
}

module.exports = { selectBest, executeWithFallback, buildFallbackChain, getProviderHealth, setProviderHealth, TASK_PROFILES };
