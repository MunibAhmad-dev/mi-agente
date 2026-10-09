'use strict';

/**
 * Face 26 — AcquisitionCascade (plan §11).
 *
 * CACHE → HTTP FETCH → TEXT EXTRACTION → CRAWLER → BROWSER.
 * Browser is used ONLY when JS/dynamic content is required, and every
 * escalation records the reason. Integrates CacheManager and ResourceGovernor.
 */

const { config } = require('../core/config');
const HttpTransport = require('./HttpTransport');
const DocumentExtractor = require('./DocumentExtractor');
const CacheManager = require('../cache/CacheManager');
const ResourceGovernor = require('../router/ResourceGovernor');
const { uid, nowIso, sha1 } = require('../core/ids');

/** In-memory browser level (external dependency optional). */
const BrowserLevel = {
  available: Boolean(process.env.RESEARCH_OS_BROWSER_CMD),
  fetch(url) {
    // A real browser automation (Playwright sidecar) plugs in here via
    // RESEARCH_OS_BROWSER_CMD. Without it: not available.
    return Promise.reject(new Error('browser_sidecar_not_configured'));
  },
};

function cacheKey(url) {
  return 'doc:' + sha1(url);
}

/**
 * Fetch one URL through the cascade.
 * @returns { level, reason?, doc?, access_status? }
 */
async function fetchUrl(url, opts = {}) {
  const sessionId = opts.session_id || 'adhoc';

  // Level 0: cache
  const hit = await CacheManager.get(cacheKey(url));
  if (hit && !opts.noCache) {
    return { level: 'cache', doc: hit };
  }

  // Governor admission for network ops
  const adm = ResourceGovernor.admit(sessionId, { kind: 'fetch' });
  if (!adm.admitted && !adm.downgrade) {
    return { level: 'none', access_status: 'RESOURCE_LIMIT', violations: adm.violations };
  }

  // Level 1: HTTP fetch
  let res;
  try {
    res = await HttpTransport.fetchRaw(url, opts.http || {});
  } catch (err) {
    if (err.code === 'SSRF_BLOCKED') return { level: 'none', access_status: 'BLOCKED', reason: err.reason };
    // Network/HTTP failure: ACCESS_LIMITED and continue (never crash the run)
    return { level: 'none', access_status: 'ACCESS_LIMITED', reason: err.message };
  }

  ResourceGovernor.charge(sessionId, { pages: 1, network_mb: res.body.length / 1e6, runtime_ms: 1000 });

  const extracted = DocumentExtractor.extract(res.body, res.headers['content-type'], url);
  const doc = {
    id: uid('doc'),
    canonical_url: res.url,
    fetched_via: 'http',
    title: extracted.title,
    text: extracted.text,
    links: extracted.links || [],
    extraction_method: extracted.extraction_method,
    etag: res.etag,
    last_modified: res.lastModified,
    content_hash: sha1(extracted.text),
    fetched_at: nowIso(),
    escalations: [],
  };

  // Level 2 (crawler) / Level 3 (browser) are explicit follow-ups, not defaults.
  // If HTTP text is too thin and a browser is configured, escalate with reason.
  if (doc.text.length < 500 && BrowserLevel.available && opts.allowBrowser) {
    doc.escalations.push({ level: 'browser', reason: 'thin_http_text', at: nowIso() });
    try {
      const bdoc = await BrowserLevel.fetch(url);
      if (bdoc && bdoc.text && bdoc.text.length > doc.text.length) {
        doc.text = bdoc.text;
        doc.fetched_via = 'browser';
      }
    } catch { /* keep HTTP result */ }
  }

  await CacheManager.set(cacheKey(url), doc, opts.ttlMs);
  return { level: doc.fetched_via === 'browser' ? 'browser' : 'http', doc };
}

module.exports = { fetchUrl, cacheKey, BrowserLevel };
