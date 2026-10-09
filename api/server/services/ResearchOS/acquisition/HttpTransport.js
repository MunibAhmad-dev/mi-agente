'use strict';

/**
 * Face 26 — HttpTransport: the "HTTP FETCH" cascade level.
 * Hardened: SSRF validation, redirect-chain validation, timeout, size cap.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { config } = require('../core/config');
const SsrfGuard = require('./SsrfGuard');

function _once(target, event, fn) {
  let done = false;
  target.on(event, (...a) => { if (!done) { done = true; fn(...a); } });
}

function fetchRaw(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + (opts.timeoutMs || config.HTTP_TIMEOUT_MS);
    const seen = [];

    const attempt = (u) => {
      seen.push(u);
      SsrfGuard.validate(u).then((v) => {
        if (!v.ok) return reject(Object.assign(new Error(`ssrf_blocked:${v.reason}`), { code: 'SSRF_BLOCKED', reason: v.reason }));
        const parsed = new URL(v.url);
        const mod = parsed.protocol === 'https:' ? https : http;
        const req = mod.get(parsed, {
          headers: { 'User-Agent': 'ResearchOS/1.0 (+research; contact: local)', 'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.8,*/*;q=0.5' },
          timeout: 10000,
        }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            const next = new URL(res.headers.location, parsed).toString();
            if (seen.length >= 5) return reject(new Error('too_many_redirects'));
            SsrfGuard.validateRedirectChain([next]).then((rv) => {
              if (!rv.ok) return reject(Object.assign(new Error(`ssrf_redirect:${rv.reason}`), { code: 'SSRF_BLOCKED' }));
              return attempt(next);
            }).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(Object.assign(new Error(`http_${res.statusCode}`), { code: 'HTTP_ERROR', status: res.statusCode }));
          }
          const chunks = [];
          let size = 0;
          const cap = opts.maxBytes || config.MAX_HTML_BYTES;
          res.on('data', (c) => {
            size += c.length;
            if (size > cap) { req.destroy(); return reject(new Error('body_too_large')); }
            chunks.push(c);
          });
          res.on('end', () => resolve({
            url: parsed.toString(),
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
            etag: res.headers.etag || null,
            lastModified: res.headers['last-modified'] || null,
            redirects: seen.slice(0, -1),
          }));
          _once(res, 'error', reject);
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        _once(req, 'error', reject);
        const delay = deadline - Date.now();
        if (delay > 0) {
          const t = setTimeout(() => { if (!req.destroyed) { req.destroy(); reject(new Error('deadline_exceeded')); } }, delay);
          if (t.unref) t.unref();
        }
      }).catch(reject);
    };
    attempt(url);
  });
}

module.exports = { fetchRaw };
