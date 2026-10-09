'use strict';

/**
 * core/eventbus.js — internal pub/sub. All research lifecycle events flow
 * through this bus so services stay decoupled and the event log stays
 * replayable (plan §89).
 */

const { uid, nowIso } = require('./ids');

const HANDLERS = new Map(); // eventType -> Set<fn>
const LOG = [];             // every event ever emitted, replayable

const EVENT_TYPES = [
  'ResearchStarted',
  'SearchStarted',
  'SourceFound',
  'DocumentIngested',
  'ClaimExtracted',
  'EvidenceAdded',
  'ContradictionDetected',
  'HypothesisCreated',
  'ExperimentStarted',
  'ExperimentFinished',
  'ConfidenceUpdated',
  'ResearchCompleted',
];

function on(type, fn) {
  if (!HANDLERS.has(type)) HANDLERS.set(type, new Set());
  HANDLERS.get(type).add(fn);
  return () => off(type, fn);
}

function off(type, fn) {
  const set = HANDLERS.get(type);
  if (set) set.delete(fn);
}

function emit(type, payload = {}) {
  const event = { id: uid('evt'), type, at: nowIso(), payload };
  LOG.push(event);
  const set = HANDLERS.get(type);
  if (set) for (const fn of set) {
    try { fn(event); } catch (err) { /* a broken listener must not break research */ }
  }
  const anySet = HANDLERS.get('*');
  if (anySet) for (const fn of anySet) {
    try { fn(event); } catch (err) { /* ignore */ }
  }
  return event;
}

function log(since = 0) {
  return LOG.slice(since);
}

function eventsFor(sessionId) {
  return LOG.filter((e) => e.payload && e.payload.session_id === sessionId);
}

function reset() {
  HANDLERS.clear();
  LOG.length = 0;
}

module.exports = { on, off, emit, log, eventsFor, reset, EVENT_TYPES };
