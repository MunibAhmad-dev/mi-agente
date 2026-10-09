'use strict';

const https = require('https');
const http = require('http');
const { logger } = require('@librechat/data-schemas');
const { FREE_PROVIDERS } = require('./freeProviders');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PROBE_TIMEOUT_MS = 6000;

const _cache = new Map(); // providerId → { models, ts }

/**
 * Fetch JSON from a URL with a short timeout. Returns null on any error.
 */
function fetchJson(url, apiKey, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const req = mod.get(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

/**
 * Parse model IDs from a provider's /models response.
 * Handles OpenAI format {data:[{id}]} and Ollama format {models:[{name}]}.
 */
function parseModels(json, provider) {
  if (!json) return null;

  if (provider.ollamaFormat) {
    const models = json.models || [];
    return models.map((m) => m.name || m.model).filter(Boolean);
  }

  const items = json.data || json.models || (Array.isArray(json) ? json : null);
  if (!items) return null;

  let ids = items.map((m) => m.id || m.name).filter(Boolean);

  if (provider.filterFree) {
    ids = ids.filter((id) => id.endsWith(':free'));
  }

  return ids;
}

/**
 * Probe a single provider and return its model list.
 */
async function probeProvider(provider) {
  const cached = _cache.get(provider.id);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached, fromCache: true };
  }

  if (provider.requiresKey && !process.env[provider.envKey]) {
    return {
      id: provider.id,
      label: provider.label,
      reachable: false,
      reason: `Set ${provider.envKey} in .env to enable`,
      signupUrl: provider.signupUrl,
      knownModels: provider.knownModels,
      models: [],
    };
  }

  const apiKey = provider.envKey ? process.env[provider.envKey] : undefined;
  const json = await fetchJson(provider.modelsUrl, apiKey);
  const models = parseModels(json, provider);

  if (models && models.length > 0) {
    const result = {
      id: provider.id,
      label: provider.label,
      reachable: true,
      models,
      chatUrl: provider.chatUrl,
      envKey: provider.envKey,
      signupUrl: provider.signupUrl,
    };
    _cache.set(provider.id, { ...result, ts: Date.now() });
    return result;
  }

  // Unreachable but key is set — use known models as fallback
  return {
    id: provider.id,
    label: provider.label,
    reachable: false,
    reason: models === null ? 'Endpoint unreachable or returned unexpected format' : 'No models returned',
    models: provider.knownModels || [],
    knownModels: provider.knownModels,
    chatUrl: provider.chatUrl,
    envKey: provider.envKey,
    signupUrl: provider.signupUrl,
  };
}

/**
 * Probe all known free providers in parallel.
 * @param {string[]} [filter] - Optional list of provider IDs to include.
 */
async function discoverAll(filter) {
  const providers = filter
    ? FREE_PROVIDERS.filter((p) => filter.includes(p.id))
    : FREE_PROVIDERS;

  const results = await Promise.all(providers.map((p) => probeProvider(p).catch((err) => {
    logger.warn(`[ModelDiscovery] provider ${p.id} probe failed: ${err.message}`);
    return { id: p.id, label: p.label, reachable: false, reason: err.message, models: p.knownModels || [] };
  })));

  return results;
}

/**
 * Return a flat map of { providerKey: [modelId, ...] } suitable for merging
 * into LibreChat's models config response.
 */
async function discoverModelsMap(filter) {
  const results = await discoverAll(filter);
  const map = {};
  for (const r of results) {
    if (r.models && r.models.length > 0) {
      map[r.id] = r.models;
    }
  }
  return map;
}

module.exports = { discoverAll, discoverModelsMap, FREE_PROVIDERS };
