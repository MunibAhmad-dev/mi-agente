'use strict';

/**
 * ProviderManager — Face 13 §16: Central service for all provider/model management.
 *
 * Responsibilities:
 *   - Discover available providers (local + cloud)
 *   - Fetch model lists from each provider
 *   - Track account status and usage
 *   - Maintain provider registry with health status
 *   - Expose unified interface to AIRouter
 */

const { discoverAll } = require('../ModelDiscovery/ModelDiscoveryService');
const { getHardwareInfo, checkCompatibility } = require('./HardwareDetector');
const { selectBest, buildFallbackChain, getProviderHealth } = require('./AIRouter');
const { searchModels: ghSearch, CURATED_AI_REPOS } = require('./GitHubAdapter');
const { searchModels: hfSearch, CURATED_HF_MODELS } = require('./HuggingFaceAdapter');
const { logger } = require('@librechat/data-schemas');

// In-memory favorites store (persists per-process; replace with DB for production)
const _favorites = new Set();
const _history = [];
const MAX_HISTORY = 200;

let _providerCache = null;
let _providerCacheTs = 0;
const PROVIDER_CACHE_TTL_MS = 3 * 60 * 1000;

/**
 * Get all providers with live status (cached 3 min).
 */
async function getProviders(forceRefresh = false) {
  if (!forceRefresh && _providerCache && Date.now() - _providerCacheTs < PROVIDER_CACHE_TTL_MS) {
    return _providerCache;
  }
  try {
    const results = await discoverAll();
    const health = getProviderHealth();
    const enriched = results.map((p) => ({
      ...p,
      healthState: health[p.id] || null,
      modelCount: (p.models || []).length,
    }));
    _providerCache = enriched;
    _providerCacheTs = Date.now();
    return enriched;
  } catch (err) {
    logger.error('[ProviderManager] getProviders failed:', err.message);
    return _providerCache || [];
  }
}

/**
 * Get models for a specific provider.
 */
async function getProviderModels(providerId) {
  const providers = await getProviders();
  const p = providers.find((x) => x.id === providerId);
  if (!p) return null;
  return p.models || p.knownModels || [];
}

/**
 * Refresh all providers (force re-probe).
 */
async function refreshProviders() {
  _providerCache = null;
  return getProviders(true);
}

/**
 * Get hardware info + compatibility check for a model.
 */
function checkModelCompatibility(requirements) {
  return checkCompatibility(requirements);
}

/**
 * Use AIRouter to recommend the best model for a task.
 * @param {string} task - 'code', 'reasoning', 'chat', 'vision', 'fast', etc.
 * @param {object} preferences - { preferLocal, preferFree, minimizeCost }
 */
async function recommendModel(task = 'chat', preferences = {}) {
  const providers = await getProviders();
  const selection = selectBest(providers, { task, ...preferences });
  const chain = buildFallbackChain(selection);
  return { recommendation: selection, fallbackChain: chain, availableProviders: providers.length };
}

/**
 * Search models from GitHub (AI repos).
 */
async function searchGitHub(query, limit = 20) {
  if (!query || query.trim() === '') {
    return { results: CURATED_AI_REPOS, source: 'curated', query: '' };
  }
  try {
    const result = await ghSearch(query, limit);
    return result;
  } catch (err) {
    logger.warn('[ProviderManager] GitHub search failed:', err.message);
    return { results: CURATED_AI_REPOS, source: 'curated_fallback', error: err.message };
  }
}

/**
 * Search models from Hugging Face.
 */
async function searchHuggingFace(query, options = {}) {
  if (!query || query.trim() === '') {
    return { results: CURATED_HF_MODELS, source: 'curated', query: '' };
  }
  try {
    const result = await hfSearch(query, options);
    return result;
  } catch (err) {
    logger.warn('[ProviderManager] HuggingFace search failed:', err.message);
    return { results: CURATED_HF_MODELS, source: 'curated_fallback', error: err.message };
  }
}

// Favorites management
function addFavorite(modelId) { _favorites.add(modelId); return { ok: true }; }
function removeFavorite(modelId) { _favorites.delete(modelId); return { ok: true }; }
function getFavorites() { return [..._favorites]; }

// History management
function recordUsage(entry) {
  _history.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;
}
function getHistory(limit = 50) { return _history.slice(0, limit); }

module.exports = {
  getProviders,
  getProviderModels,
  refreshProviders,
  checkModelCompatibility,
  recommendModel,
  searchGitHub,
  searchHuggingFace,
  getHardwareInfo,
  addFavorite,
  removeFavorite,
  getFavorites,
  recordUsage,
  getHistory,
};
