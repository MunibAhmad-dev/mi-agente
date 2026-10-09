'use strict';

/**
 * Face 26/58 — CacheManager: TTL cache for documents, search results,
 * embeddings, source profiles. Stores { value, expires_at, etag, last_modified }.
 * Persisted through core/store so it survives restarts.
 */

const { collection } = require('../core/store');

const CACHE = () => collection('cache');

function _expired(rec) {
  return rec && rec.expires_at && Date.parse(rec.expires_at) < Date.now();
}

async function get(key) {
  const found = (await CACHE().find((r) => r.key === key))[0];
  if (!found || _expired(found)) return null;
  return found.value;
}

async function getWithMeta(key) {
  return (await CACHE().find((r) => r.key === key))[0] || null;
}

async function set(key, value, ttlMs = 15 * 60 * 1000, meta = {}) {
  const existing = (await CACHE().find((r) => r.key === key))[0];
  const rec = {
    key,
    value,
    etag: meta.etag || null,
    last_modified: meta.lastModified || null,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  };
  if (existing) return CACHE().update(existing._id, rec);
  return CACHE().insert(rec);
}

/** Conditional request helper: returns cached validator headers if present. */
async function validators(key) {
  const rec = await getWithMeta(key);
  if (!rec) return {};
  const out = {};
  if (rec.etag) out['If-None-Match'] = rec.etag;
  if (rec.last_modified) out['If-Modified-Since'] = rec.last_modified;
  return out;
}

async function clear() {
  const all = await CACHE().all();
  for (const r of all) await CACHE().update(r._id, { expires_at: new Date(0).toISOString() });
}

module.exports = { get, set, getWithMeta, validators, clear };
