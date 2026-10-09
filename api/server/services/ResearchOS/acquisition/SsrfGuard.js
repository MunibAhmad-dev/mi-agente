'use strict';

/**
 * Face 26/39 — SsrfGuard (plan §61, §14).
 *
 * Every fetched URL passes here. Blocks: private/loopback/link-local ranges,
 * IP-literal hosts, non-http(s) schemes, credentials in URL, and redirects
 * that escape the public range. DNS rebinding: resolves host and re-checks
 * resolved addresses before connect (best-effort without extra deps: we check
 * the literal and the first resolved address via dns.lookup).
 */

const dns = require('dns').promises;

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'instance-data']);

function isPrivateIp(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false; // not IPv4 literal
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

/** Validate a URL for public fetching. Returns { ok, reason?, url } */
async function validate(rawUrl, opts = {}) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { return { ok: false, reason: 'invalid_url' }; }
  if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, reason: 'scheme_not_http' };
  if (u.username || u.password) return { ok: false, reason: 'credentials_in_url' };
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, reason: 'blocked_host' };

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIp(host)) return { ok: false, reason: 'private_ip' };
    if (opts.allowIpLiterals !== true) return { ok: false, reason: 'ip_literal_not_allowed' };
    return { ok: true, url: u.toString() };
  }
  if (host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) {
    return { ok: false, reason: 'non_public_host' };
  }
  // Resolve and verify every address is public (DNS-rebinding guard).
  try {
    const addrs = await Promise.race([
      dns.lookup(host, { all: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('dns_timeout')), 3000)),
    ]);
    if (!addrs.length) return { ok: false, reason: 'dns_empty' };
    for (const a of addrs) {
      if (a.family === 4 && isPrivateIp(a.address)) return { ok: false, reason: 'resolves_private_ip' };
      if (a.family === 6 && (a.address === '::1' || a.address.startsWith('fe80') || a.address.startsWith('fc') || a.address.startsWith('fd'))) {
        return { ok: false, reason: 'resolves_private_ip' };
      }
    }
  } catch (err) {
    return { ok: false, reason: 'dns_error' };
  }
  return { ok: true, url: u.toString() };
}

/** Check every hop of a redirect chain. */
async function validateRedirectChain(chain) {
  for (const url of chain) {
    const v = await validate(url, { allowIpLiterals: false });
    if (!v.ok) return v;
  }
  return { ok: true };
}

module.exports = { validate, validateRedirectChain, isPrivateIp };
