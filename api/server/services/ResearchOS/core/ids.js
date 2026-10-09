'use strict';

/**
 * core/ids.js — deterministic-ish unique IDs and time helpers.
 * All entities get prefixed ids: evt_..., doc_..., clm_..., etc.
 */

const crypto = require('crypto');

const counters = new Map();

function uid(prefix) {
  const n = (counters.get(prefix) || 0) + 1;
  counters.set(prefix, n);
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}${n.toString(36)}`;
}

function sha1(data) {
  return crypto.createHash('sha1').update(String(data)).digest('hex');
}

function sha256(data) {
  return crypto.createHash('sha256').update(String(data)).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { uid, sha1, sha256, nowIso };
