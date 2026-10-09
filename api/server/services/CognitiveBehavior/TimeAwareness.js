'use strict';

/**
 * TimeAwareness.js — Gen B Batch-C Phase 8.
 * Temporal reasoning — understands dates, deadlines, durations.
 */

const URGENCY_SIGNALS = [
  /\bASAP\b/i,
  /\burgent(ly)?\b/i,
  /\bdeadline\b/i,
  /\btoday\b/i,
  /\bright now\b/i,
  /\bimmediately\b/i,
  /\bcritical\b/i,
  /\boverdue\b/i,
  /\bdue (today|now|soon|tonight)\b/i,
  /\bno time (to lose|to waste)\b/i,
  /\btime[ -]sensitive\b/i,
  /\bEOD\b/,
  /\bEOW\b/,
  /\bCOB\b/,
];

const RELATIVE_PATTERNS = [
  { re: /\bin (\d+)\s+day[s]?\b/i, handler: (m) => addDays(new Date(), parseInt(m[1])) },
  { re: /\bin (\d+)\s+hour[s]?\b/i, handler: (m) => addHours(new Date(), parseInt(m[1])) },
  { re: /\bin (\d+)\s+minute[s]?\b/i, handler: (m) => addMinutes(new Date(), parseInt(m[1])) },
  { re: /\bin (\d+)\s+week[s]?\b/i, handler: (m) => addDays(new Date(), parseInt(m[1]) * 7) },
  { re: /\btomorrow\b/i, handler: () => addDays(new Date(), 1) },
  { re: /\byesterday\b/i, handler: () => addDays(new Date(), -1) },
  { re: /\bnext week\b/i, handler: () => addDays(new Date(), 7) },
  { re: /\bnext month\b/i, handler: () => addMonths(new Date(), 1) },
  { re: /\bnext year\b/i, handler: () => addMonths(new Date(), 12) },
  { re: /\blast week\b/i, handler: () => addDays(new Date(), -7) },
  { re: /\blast month\b/i, handler: () => addMonths(new Date(), -1) },
  { re: /\bthis weekend\b/i, handler: () => nextWeekday(new Date(), 6) },
  { re: /\bEOD\b/, handler: () => endOfDay(new Date()) },
  { re: /\bEOW\b/, handler: () => endOfWeek(new Date()) },
];

// ISO date: 2024-01-15 or 2024/01/15
const ISO_DATE_RE = /\b(\d{4}[-/]\d{2}[-/]\d{2})\b/g;
// Natural date: January 15, 2024 / Jan 15 2024
const NATURAL_DATE_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:[a-z]{2})?,?\s*(\d{4})\b/gi;
// Duration patterns: 3 hours, 2 days, 30 minutes
const DURATION_RE = /\b(\d+)\s*(second|minute|hour|day|week|month|year)s?\b/gi;
// Deadline keywords
const DEADLINE_RE = /\b(due|deadline|by|before|no later than|not later than)\s+([^\.,;!?]+)/gi;

class TimeAwareness {
  constructor() {
    this.stats = { parsed: 0, urgencyChecks: 0, conversions: 0 };
  }

  /**
   * Extract temporal references from text.
   * @param {string} text
   * @returns {{ dates: Date[], durations: string[], deadlines: string[], relativeRefs: string[] }}
   */
  parse(text) {
    try {
      if (!text || typeof text !== 'string') {
        return { dates: [], durations: [], deadlines: [], relativeRefs: [] };
      }
      this.stats.parsed++;

      const dates = [];
      // ISO dates
      for (const m of text.matchAll(new RegExp(ISO_DATE_RE.source, 'g'))) {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) dates.push(d);
      }
      // Natural dates
      for (const m of text.matchAll(NATURAL_DATE_RE)) {
        const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
        if (!isNaN(d.getTime())) dates.push(d);
      }

      const durations = [];
      for (const m of text.matchAll(new RegExp(DURATION_RE.source, 'gi'))) {
        durations.push(`${m[1]} ${m[2]}${parseInt(m[1]) > 1 ? 's' : ''}`);
      }

      const deadlines = [];
      for (const m of text.matchAll(new RegExp(DEADLINE_RE.source, 'gi'))) {
        deadlines.push(`${m[1]} ${m[2].trim()}`);
      }

      const relativeRefs = [];
      for (const { re } of RELATIVE_PATTERNS) {
        const match = text.match(re);
        if (match) relativeRefs.push(match[0]);
      }

      return { dates, durations, deadlines, relativeRefs };
    } catch (err) {
      return { dates: [], durations: [], deadlines: [], relativeRefs: [], error: err.message };
    }
  }

  /**
   * Detect urgency signals in text.
   * @param {string} text
   * @returns {boolean}
   */
  isUrgent(text) {
    try {
      this.stats.urgencyChecks++;
      if (!text) return false;
      return URGENCY_SIGNALS.some((re) => re.test(text));
    } catch {
      return false;
    }
  }

  /**
   * Convert a relative reference like "tomorrow" to an absolute Date.
   * @param {string} relativeRef
   * @returns {Date|null}
   */
  toAbsolute(relativeRef) {
    try {
      if (!relativeRef) return null;
      this.stats.conversions++;
      for (const { re, handler } of RELATIVE_PATTERNS) {
        const m = relativeRef.match(re);
        if (m) return handler(m);
      }
      // Try parsing as a direct date string
      const d = new Date(relativeRef);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  /**
   * How much time remains until a deadline.
   * @param {Date|string} deadline
   * @returns {{ ms: number, human: string, isOverdue: boolean }}
   */
  remaining(deadline) {
    try {
      const d = deadline instanceof Date ? deadline : new Date(deadline);
      if (isNaN(d.getTime())) return { ms: 0, human: 'invalid date', isOverdue: false };

      const now = new Date();
      const ms = d.getTime() - now.getTime();
      const isOverdue = ms < 0;
      const abs = Math.abs(ms);

      const human = isOverdue
        ? `${formatDuration(abs)} overdue`
        : `${formatDuration(abs)} remaining`;

      return { ms, human, isOverdue };
    } catch (err) {
      return { ms: 0, human: err.message, isOverdue: false };
    }
  }

  /**
   * Get current date/time context for injection into prompts.
   * @returns {{ now: string, date: string, time: string, timezone: string, dayOfWeek: string }}
   */
  getContext() {
    try {
      const now = new Date();
      return {
        now: now.toISOString(),
        date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
        unixMs: now.getTime(),
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

// ── date helpers ──────────────────────────────────────────────────────────────

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addHours(d, n) { const r = new Date(d); r.setHours(r.getHours() + n); return r; }
function addMinutes(d, n) { const r = new Date(d); r.setMinutes(r.getMinutes() + n); return r; }
function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
function endOfDay(d) { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
function endOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() + (7 - r.getDay())); r.setHours(23, 59, 59, 999); return r; }
function nextWeekday(d, day) { const r = new Date(d); const diff = (day - r.getDay() + 7) % 7 || 7; r.setDate(r.getDate() + diff); return r; }

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// ─────────────────────────────────────────────────────────────────────────────

let _instance = null;
function getTimeAwareness() {
  if (!_instance) _instance = new TimeAwareness();
  return _instance;
}

module.exports = { TimeAwareness, getTimeAwareness };
