'use strict';

/**
 * AuditTrailWriter — Gen B Safety Phase 9.
 * Writes detailed audit trails for all significant agent actions.
 * In-memory ring buffer, max 1000 events total.
 *
 * Event types: DECISION, TOOL_USE, LLM_CALL, POLICY_CHECK, ERROR, CORRECTION
 */

const MAX_EVENTS = 1000;

const VALID_TYPES = new Set(['DECISION', 'TOOL_USE', 'LLM_CALL', 'POLICY_CHECK', 'ERROR', 'CORRECTION']);

class AuditTrailWriter {
  constructor() {
    this._events = [];    // ring buffer
    this._head = 0;       // next write position (unused in simple push/shift approach)
    this.stats = { logged: 0, byType: {} };
    for (const t of VALID_TYPES) this.stats.byType[t] = 0;
  }

  /**
   * Log a single audit event.
   * @param {object} event - { type, sessionId, userId?, action, input?, output?, result?, timestamp? }
   * @returns {{ ok: boolean, eventId: string }}
   */
  log(event) {
    try {
      if (!event || !event.type || !event.sessionId) {
        return { ok: false, error: 'event.type and event.sessionId are required' };
      }

      const type = event.type.toUpperCase();
      const eventId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const entry = {
        eventId,
        type: VALID_TYPES.has(type) ? type : 'DECISION',
        sessionId: event.sessionId,
        userId: event.userId || null,
        action: event.action || '',
        input: event.input !== undefined ? event.input : null,
        output: event.output !== undefined ? event.output : null,
        result: event.result !== undefined ? event.result : null,
        timestamp: event.timestamp || new Date().toISOString(),
        loggedAt: new Date().toISOString(),
      };

      this._events.push(entry);
      if (this._events.length > MAX_EVENTS) this._events.shift();

      this.stats.logged++;
      const tKey = entry.type;
      this.stats.byType[tKey] = (this.stats.byType[tKey] || 0) + 1;

      return { ok: true, eventId };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Get the audit trail for a session.
   * @param {string} sessionId
   * @param {object} filters - { type?, userId?, since?, until?, limit? }
   * @returns {{ events: Array, summary: object }}
   */
  getTrail(sessionId, filters = {}) {
    try {
      if (!sessionId) return { events: [], summary: {} };

      let events = this._events.filter((e) => e.sessionId === sessionId);

      if (filters.type) {
        const ft = filters.type.toUpperCase();
        events = events.filter((e) => e.type === ft);
      }
      if (filters.userId) {
        events = events.filter((e) => e.userId === filters.userId);
      }
      if (filters.since) {
        const since = new Date(filters.since);
        events = events.filter((e) => new Date(e.timestamp) >= since);
      }
      if (filters.until) {
        const until = new Date(filters.until);
        events = events.filter((e) => new Date(e.timestamp) <= until);
      }

      const limit = filters.limit ? Math.max(1, Number(filters.limit)) : 200;
      events = events.slice(-limit);

      // Summary
      const typeCounts = {};
      for (const e of events) {
        typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
      }
      const summary = {
        total: events.length,
        typeCounts,
        first: events[0] ? events[0].timestamp : null,
        last: events[events.length - 1] ? events[events.length - 1].timestamp : null,
      };

      return { events, summary };
    } catch (err) {
      return { events: [], summary: {}, error: err.message };
    }
  }

  /**
   * Export the audit trail in JSON or plain-text format.
   * @param {string} sessionId
   * @param {'json'|'text'} format
   * @returns {string}
   */
  export(sessionId, format = 'json') {
    try {
      const { events } = this.getTrail(sessionId);
      if (format === 'text') {
        return events.map((e) =>
          `[${e.timestamp}] ${e.type} | session=${e.sessionId} user=${e.userId || '-'} action=${e.action}` +
          (e.result ? ` result=${JSON.stringify(e.result)}` : ''),
        ).join('\n') || '(no events)';
      }
      return JSON.stringify({ sessionId, events, exportedAt: new Date().toISOString() }, null, 2);
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  }

  /**
   * Get all valid event types.
   */
  getEventTypes() {
    return [...VALID_TYPES];
  }

  getStats() {
    return { ...this.stats, bufferSize: this._events.length, capacity: MAX_EVENTS };
  }
}

let _instance = null;
function getAuditTrailWriter() {
  if (!_instance) _instance = new AuditTrailWriter();
  return _instance;
}

module.exports = { AuditTrailWriter, getAuditTrailWriter };
