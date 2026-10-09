'use strict';

/**
 * core/store.js — in-memory JSON persistence with automatic persistence to
 * `data/store.json` (debossed time-ordered writes). Same async interface as
 * the Mongo repositories of the target platform, so adapters can replace it
 * without touching the engines (lightweight-first rule, plan §94).
 */

const fs = require('fs');
const path = require('path');

const COLLECTIONS = new Map();
const FILE = process.env.RESEARCH_OS_STORE ||
  path.join(process.cwd(), 'data', 'store.json');

let flushTimer = null;
let dirty = false;

function _scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      const dir = path.dirname(FILE);
      fs.mkdirSync(dir, { recursive: true });
      const obj = {};
      for (const [k, v] of COLLECTIONS) obj[k] = [...v.values()];
      fs.writeFileSync(FILE, JSON.stringify(obj, null, 1));
    } catch (err) { /* storage best-effort; memory remains source of truth */ }
  }, 400);
  if (flushTimer.unref) flushTimer.unref();
}

function collection(name) {
  if (!COLLECTIONS.has(name)) COLLECTIONS.set(name, new Map());
  const map = COLLECTIONS.get(name);
  return {
    name,
    async insert(doc) {
      const _id = doc._id || require('./ids').uid(name.slice(0, 3));
      const record = { ...doc, _id, created_at: doc.created_at || require('./ids').nowIso() };
      map.set(_id, record);
      _scheduleFlush();
      return record;
    },
    async update(_id, patch) {
      let rec = map.get(_id);
      if (!rec) {
        for (const r of map.values()) if (r.id === _id) { rec = r; break; }
      }
      if (!rec) return null;
      Object.assign(rec, patch, { updated_at: require('./ids').nowIso() });
      _scheduleFlush();
      return rec;
    },
    async get(_id) {
      const direct = map.get(_id);
      if (direct) return direct;
      for (const rec of map.values()) if (rec.id === _id) return rec;
      return null;
    },
    async all() { return [...map.values()]; },
    find(pred) { return [...map.values()].filter(pred); },
    size() { return map.size; },
  };
}

function stats() {
  const out = {};
  for (const [k, v] of COLLECTIONS) out[k] = v.size;
  return out;
}

function reset() {
  COLLECTIONS.clear();
}

module.exports = { collection, stats, reset, FILE };
