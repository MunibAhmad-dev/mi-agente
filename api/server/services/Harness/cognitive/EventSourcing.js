'use strict';

/**
 * EventSourcing — Phase 19: Complete audit trail with event replay.
 *
 * Every significant agent action is recorded as an immutable event.
 * The log supports:
 *   - Full audit trail (who did what, when, why)
 *   - Event replay to reconstruct any past state
 *   - Query by userId, sessionId, type, or time range
 *
 * Storage: append-only JSONL file on disk.
 * Integration: called by ExecutiveLoop, HarnessEngine, harness.js route.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'data', 'audit_trail.jsonl');

class EventSourcing {
  constructor(options = {}) {
    this.logPath = options.logPath || DEFAULT_LOG_PATH;
    this._sequence = 0;
    this._inMemory = []; // last N events kept in memory for fast queries
    this._maxMemory = options.maxMemory || 1000;
    this._ensureFile();
  }

  // ── Append ──────────────────────────────────────────────────────────────────

  /**
   * Append an event to the audit trail.
   * Returns the created event record.
   * @param {object} event  { type, userId, sessionId, data, severity }
   */
  append(event) {
    const record = {
      id: crypto.randomUUID(),
      seq: ++this._sequence,
      type: event.type || 'unknown',
      userId: event.userId || 'system',
      sessionId: event.sessionId || null,
      severity: event.severity || 'info',   // info | warn | critical
      data: event.data || {},
      ts: new Date().toISOString(),
    };

    // Persist to append-only JSONL
    try {
      fs.appendFileSync(this.logPath, JSON.stringify(record) + '\n', 'utf8');
    } catch { /* non-fatal — audit failure must not block agent */ }

    // Keep in memory ring buffer
    this._inMemory.push(record);
    if (this._inMemory.length > this._maxMemory) this._inMemory.shift();

    return record;
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  /**
   * Query recent events from the in-memory buffer.
   * For historical queries beyond the buffer, use queryFromDisk().
   * @param {object} filter  { userId, sessionId, type, severity, since, limit }
   */
  query({ userId, sessionId, type, severity, since, limit = 100 } = {}) {
    let results = [...this._inMemory];
    if (userId) results = results.filter((e) => e.userId === userId);
    if (sessionId) results = results.filter((e) => e.sessionId === sessionId);
    if (type) results = results.filter((e) => e.type === type || e.type.startsWith(type));
    if (severity) results = results.filter((e) => e.severity === severity);
    if (since) {
      const sinceTs = typeof since === 'string' ? new Date(since).getTime() : since;
      results = results.filter((e) => new Date(e.ts).getTime() >= sinceTs);
    }
    return results.slice(-limit);
  }

  /**
   * Read events from the JSONL file on disk for a given session.
   * Use this for replay or full audit queries.
   * @param {object} filter  { userId, sessionId, limit }
   */
  queryFromDisk({ userId, sessionId, limit = 500 } = {}) {
    try {
      if (!fs.existsSync(this.logPath)) return [];
      const lines = fs.readFileSync(this.logPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);

      let results = lines;
      if (userId) results = results.filter((e) => e.userId === userId);
      if (sessionId) results = results.filter((e) => e.sessionId === sessionId);
      return results.slice(-limit);
    } catch {
      return [];
    }
  }

  // ── Replay ──────────────────────────────────────────────────────────────────

  /**
   * Replay events for a session in order, passing each to a handler.
   * Enables reconstructing any past session state from the log.
   * @param {string} sessionId
   * @param {function} handler  (event) => void
   */
  replay(sessionId, handler) {
    const events = this.queryFromDisk({ sessionId });
    let replayed = 0;
    for (const event of events) {
      try { handler(event); replayed++; } catch { /* handler errors don't stop replay */ }
    }
    return { replayed, sessionId };
  }

  // ── High-level helpers ──────────────────────────────────────────────────────

  logAction(userId, sessionId, action, data = {}) {
    return this.append({ type: `action:${action}`, userId, sessionId, data, severity: 'info' });
  }

  logSecurity(userId, sessionId, incident, data = {}) {
    return this.append({ type: `security:${incident}`, userId, sessionId, data, severity: 'critical' });
  }

  logError(userId, sessionId, error, data = {}) {
    return this.append({ type: `error:${error}`, userId, sessionId, data, severity: 'warn' });
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _ensureFile() {
    try {
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(this.logPath)) fs.writeFileSync(this.logPath, '', 'utf8');
    } catch { /* non-fatal */ }
  }

  getStats() {
    const size = (() => { try { return fs.statSync(this.logPath).size; } catch { return 0; } })();
    return {
      inMemoryEvents: this._inMemory.length,
      totalSequence: this._sequence,
      logFileSizeBytes: size,
    };
  }
}

// Singleton
let _instance = null;
function getEventSourcing(options) {
  if (!_instance) _instance = new EventSourcing(options);
  return _instance;
}

module.exports = { EventSourcing, getEventSourcing };
