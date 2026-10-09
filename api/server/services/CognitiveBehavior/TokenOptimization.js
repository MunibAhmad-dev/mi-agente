'use strict';

/**
 * TokenOptimization — Gen B Phase 30 (deepened).
 *
 * Active token budget enforcement for agent sessions.
 * Goes beyond estimation: enforces hard limits, triggers compression
 * automatically when approaching budget ceilings, and provides
 * per-request / per-session budget allocation.
 *
 * Key features:
 *   - Per-session and per-request token budgets
 *   - Real-time usage tracking with rolling windows
 *   - Compression triggers at configurable thresholds
 *   - Budget-aware prompt truncation strategies
 *   - Task-type budget allocation (short_answer, code, research, …)
 *   - Integration hooks for upstream pipelines
 */

// Default per-task-type token budgets (input tokens per request)
const TASK_BUDGETS = {
  short_answer:  2_000,
  chat:          4_000,
  code:          6_000,
  research:      8_000,
  analysis:     10_000,
  document:     12_000,
  default:       6_000,
};

// Session-level totals (sum of all requests within a session)
const SESSION_LIMITS = {
  default:       80_000,
  unlimited: Infinity,
};

// Compression triggers: when (usedPercent >= threshold) we start compressing
const COMPRESSION_THRESHOLDS = {
  warn:     0.70,   // emit warning
  compress: 0.80,   // trigger soft compression
  hard:     0.95,   // trigger hard truncation (last resort)
};

// ── Token counter ──────────────────────────────────────────────────────────

function makeCounter() {
  try {
    const { encode } = require('gpt-tokenizer');
    return (text) => encode(String(text || '')).length;
  } catch {
    return (text) => Math.ceil(String(text || '').length / 4);
  }
}

// ── BudgetEnforcer ─────────────────────────────────────────────────────────

class BudgetEnforcer {
  constructor(config = {}) {
    this._sessions = new Map();   // sessionId → SessionBudget
    this._countFn  = config.countFn || makeCounter();
    this.config    = {
      sessionLimit:          config.sessionLimit          || SESSION_LIMITS.default,
      defaultTaskBudget:     config.defaultTaskBudget     || TASK_BUDGETS.default,
      compressThreshold:     config.compressThreshold     || COMPRESSION_THRESHOLDS.compress,
      hardTruncateThreshold: config.hardTruncateThreshold || COMPRESSION_THRESHOLDS.hard,
      warnThreshold:         config.warnThreshold         || COMPRESSION_THRESHOLDS.warn,
      taskBudgets:           { ...TASK_BUDGETS, ...(config.taskBudgets || {}) },
      sessionLimits:         { ...SESSION_LIMITS, ...(config.sessionLimits || {}) },
    };
    this.stats = { enforced: 0, compressed: 0, hardTruncated: 0, overBudget: 0, sessions: 0 };
  }

  // ── Session lifecycle ────────────────────────────────────────────────────

  /**
   * Initialize or retrieve a session budget tracker.
   * @param {string} sessionId
   * @param {{ limit?, tier? }} opts
   */
  initSession(sessionId, opts = {}) {
    if (this._sessions.has(sessionId)) return this._sessions.get(sessionId);
    const limit = opts.limit
      || this.config.sessionLimits[opts.tier || 'default']
      || this.config.sessionLimit;

    const session = {
      id:          sessionId,
      limit,
      used:        0,
      requests:    0,
      compresses:  0,
      hardTruncates: 0,
      history:     [],   // last N request token counts
      startedAt:   Date.now(),
      lastActivity: Date.now(),
    };
    this._sessions.set(sessionId, session);
    this.stats.sessions++;
    return session;
  }

  /**
   * Reset a session's usage counters (e.g. new conversation window).
   */
  resetSession(sessionId) {
    const s = this._sessions.get(sessionId);
    if (!s) return null;
    s.used         = 0;
    s.requests     = 0;
    s.compresses   = 0;
    s.hardTruncates = 0;
    s.history      = [];
    s.startedAt    = Date.now();
    return s;
  }

  getSession(sessionId) { return this._sessions.get(sessionId) || null; }

  // ── Budget allocation ────────────────────────────────────────────────────

  /**
   * Allocate a per-request token budget based on task type.
   * @param {string} taskType   Key in TASK_BUDGETS
   * @param {string} sessionId  For remaining-budget awareness
   * @returns {{ requestBudget, sessionRemaining, compress, hard }}
   */
  allocate(taskType, sessionId) {
    const requestBudget = this.config.taskBudgets[taskType] || this.config.defaultTaskBudget;
    const session = sessionId ? this.initSession(sessionId) : null;
    const sessionRemaining = session ? Math.max(0, session.limit - session.used) : Infinity;

    // Cap request budget by what's left in the session
    const effectiveBudget = Math.min(requestBudget, sessionRemaining);

    return {
      requestBudget:    effectiveBudget,
      sessionRemaining,
      sessionUsed:      session?.used || 0,
      sessionLimit:     session?.limit || Infinity,
      usedPercent:      session ? session.used / session.limit : 0,
      compress:         session ? (session.used / session.limit) >= this.config.compressThreshold : false,
      hard:             session ? (session.used / session.limit) >= this.config.hardTruncateThreshold : false,
    };
  }

  // ── Usage tracking ────────────────────────────────────────────────────────

  /**
   * Record token usage for a request.
   * @param {string} sessionId
   * @param {number} tokensUsed
   * @param {{ requestId?, taskType? }} meta
   * @returns {{ accepted, overBudget, newTotal, remaining }}
   */
  track(sessionId, tokensUsed, meta = {}) {
    const session = this.initSession(sessionId);
    session.used         += tokensUsed;
    session.requests++;
    session.lastActivity  = Date.now();
    session.history.push({ tokens: tokensUsed, at: Date.now(), ...meta });
    if (session.history.length > 100) session.history.shift();

    const overBudget = session.used > session.limit;
    if (overBudget) this.stats.overBudget++;
    this.stats.enforced++;

    return {
      accepted:    !overBudget,
      overBudget,
      newTotal:    session.used,
      remaining:   Math.max(0, session.limit - session.used),
      usedPercent: session.used / session.limit,
    };
  }

  /**
   * Real-time usage report for a session.
   */
  getUsage(sessionId) {
    const s = this._sessions.get(sessionId);
    if (!s) return null;
    const usedPct = s.used / s.limit;
    return {
      sessionId:    s.id,
      used:         s.used,
      limit:        s.limit,
      remaining:    Math.max(0, s.limit - s.used),
      usedPercent:  Math.round(usedPct * 1000) / 10,   // e.g. 72.3
      requests:     s.requests,
      status:       usedPct >= this.config.hardTruncateThreshold ? 'critical'
        : usedPct >= this.config.compressThreshold    ? 'compress'
        : usedPct >= this.config.warnThreshold        ? 'warn'
        : 'ok',
      startedAt:    s.startedAt,
      lastActivity: s.lastActivity,
    };
  }

  // ── Enforcement ────────────────────────────────────────────────────────────

  /**
   * Enforce a budget on a request object: count its tokens, decide whether to
   * compress or truncate, and return the (possibly modified) request + decision.
   *
   * @param {{ messages?: object[], system?: string, prompt?: string }} request
   * @param {{ sessionId?, taskType?, allowTruncate? }} opts
   * @returns {{ request, decision, tokensBefore, tokensAfter, action }}
   */
  enforce(request, opts = {}) {
    const sessionId  = opts.sessionId || 'default';
    const taskType   = opts.taskType  || 'default';
    const allocation = this.allocate(taskType, sessionId);
    const countFn    = this._countFn;

    // Count raw tokens
    const rawText    = this._extractText(request);
    const tokensBefore = countFn(rawText);

    // Nothing to do if within budget
    if (tokensBefore <= allocation.requestBudget && !allocation.compress) {
      return { request, decision: 'pass', tokensBefore, tokensAfter: tokensBefore, action: 'none' };
    }

    // Hard truncation (session is nearly exhausted)
    if (allocation.hard || (opts.allowTruncate && tokensBefore > allocation.requestBudget * 1.5)) {
      const truncated = this.hardTruncate(request, allocation.requestBudget, countFn);
      this.stats.hardTruncated++;
      const session = this.initSession(sessionId);
      session.hardTruncates++;
      return {
        request:      truncated.request,
        decision:     'hard_truncate',
        tokensBefore,
        tokensAfter:  truncated.tokenCount,
        action:       'truncated',
        targetBudget: allocation.requestBudget,
      };
    }

    // Soft compression (approaching limit)
    if (allocation.compress) {
      const compressed = this.softCompress(request, allocation.requestBudget, countFn);
      this.stats.compressed++;
      const session = this.initSession(sessionId);
      session.compresses++;
      return {
        request:      compressed.request,
        decision:     'compress',
        tokensBefore,
        tokensAfter:  compressed.tokenCount,
        action:       'compressed',
        targetBudget: allocation.requestBudget,
      };
    }

    // Over request budget but session is OK — still compress
    const compressed = this.softCompress(request, allocation.requestBudget, countFn);
    this.stats.compressed++;
    return {
      request:      compressed.request,
      decision:     'compress',
      tokensBefore,
      tokensAfter:  compressed.tokenCount,
      action:       'compressed',
      targetBudget: allocation.requestBudget,
    };
  }

  // ── Compression strategies ─────────────────────────────────────────────────

  /**
   * Soft compression: removes filler, summarizes old messages, truncates long system prompts.
   * Tries to preserve semantic meaning.
   */
  softCompress(request, targetTokens, countFn) {
    let req = { ...request };

    // 1. Trim system prompt to half if oversized
    if (req.system && countFn(req.system) > targetTokens * 0.3) {
      req.system = this._truncateText(req.system, Math.floor(targetTokens * 0.3), countFn);
    }

    // 2. Compress message history: keep last N messages that fit in budget
    if (req.messages && req.messages.length > 0) {
      const systemTokens  = countFn(req.system || '');
      const historyBudget = targetTokens - systemTokens - 200;  // 200 reserve for overhead
      req.messages = this._fitMessages(req.messages, historyBudget, countFn);
    }

    const tokenCount = countFn(this._extractText(req));
    return { request: req, tokenCount };
  }

  /**
   * Hard truncation: aggressively shrinks content to fit within hard limit.
   * Keeps only the most recent user message + system prompt essentials.
   */
  hardTruncate(request, targetTokens, countFn) {
    let req = { ...request };

    // Keep only last user message
    if (req.messages && req.messages.length > 0) {
      const lastUser = [...req.messages].reverse().find(m => m.role === 'user');
      req.messages   = lastUser ? [lastUser] : [req.messages[req.messages.length - 1]];
    }

    // Truncate system prompt
    if (req.system) {
      const systemBudget = Math.floor(targetTokens * 0.25);
      req.system = this._truncateText(req.system, systemBudget, countFn);
    }

    // Truncate the user message itself if still over
    if (req.messages && req.messages.length > 0) {
      const usedSoFar  = countFn(req.system || '');
      const msgBudget  = targetTokens - usedSoFar - 100;
      const last       = req.messages[req.messages.length - 1];
      if (last && countFn(last.content || '') > msgBudget) {
        req.messages = [{
          ...last,
          content: this._truncateText(last.content, msgBudget, countFn) + '\n[truncated]',
        }];
      }
    }

    const tokenCount = countFn(this._extractText(req));
    return { request: req, tokenCount };
  }

  // ── Helper: should trigger compression? ──────────────────────────────────

  /**
   * Returns true when the session is approaching its budget ceiling.
   */
  shouldCompress(sessionId) {
    const s = this._sessions.get(sessionId);
    if (!s) return false;
    return (s.used / s.limit) >= this.config.compressThreshold;
  }

  /**
   * Returns true when the session has hit the hard truncation threshold.
   */
  shouldHardTruncate(sessionId) {
    const s = this._sessions.get(sessionId);
    if (!s) return false;
    return (s.used / s.limit) >= this.config.hardTruncateThreshold;
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  _extractText(request) {
    const parts = [];
    if (request.system) parts.push(request.system);
    if (request.prompt) parts.push(request.prompt);
    if (request.messages) {
      parts.push(...request.messages.map(m => String(m.content || '')));
    }
    return parts.join('\n');
  }

  _truncateText(text, targetTokens, countFn) {
    if (!text || countFn(text) <= targetTokens) return text;
    // Binary search for the right character count
    let lo = 0, hi = text.length;
    while (hi - lo > 10) {
      const mid = Math.floor((lo + hi) / 2);
      if (countFn(text.slice(0, mid)) <= targetTokens) lo = mid;
      else hi = mid;
    }
    return text.slice(0, lo).trimEnd();
  }

  _fitMessages(messages, budgetTokens, countFn) {
    // Always keep the last user message; fill remaining budget from most recent first
    const result = [];
    let used = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m  = messages[i];
      const t  = countFn(String(m.content || ''));
      if (used + t <= budgetTokens || result.length === 0) {
        result.unshift(m);
        used += t;
      } else {
        break;
      }
    }
    return result;
  }

  setTokenizer(fn) { this._countFn = fn; }

  countTokens(text) { return this._countFn(text); }

  getStats() {
    return {
      ...this.stats,
      activeSessions: this._sessions.size,
      taskBudgets:    this.config.taskBudgets,
    };
  }
}

let _instance = null;
function getTokenOptimization(config) {
  if (!_instance) _instance = new BudgetEnforcer(config || {});
  return _instance;
}

module.exports = {
  TokenOptimization: BudgetEnforcer,
  BudgetEnforcer,
  getTokenOptimization,
  TASK_BUDGETS,
  SESSION_LIMITS,
  COMPRESSION_THRESHOLDS,
};
