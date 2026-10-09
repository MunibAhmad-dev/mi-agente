'use strict';

/**
 * SelfReflection — Gen B reasoning quality.
 * Post-response reflection to improve the next response in the session.
 *
 * - reflect(prompt, response, quality) → { insights, improvements, rating }
 * - getSessionInsights(sessionId) → accumulated insights for a session
 * - applyInsights(sessionId, nextPrompt) → prompt with reflection context appended
 * - Stores up to MAX_INSIGHTS_PER_SESSION insights per session
 */

const MAX_INSIGHTS_PER_SESSION = 10;

// Quality dimension heuristics
const QUALITY_HEURISTICS = [
  {
    name: 'length_adequate',
    check: (prompt, response) => response.split(/\s+/).length >= 20,
    improvement: 'Provide more detailed responses with adequate length.',
    insight: 'Response was too brief.',
  },
  {
    name: 'addresses_question',
    check: (prompt, response) => {
      const promptWords = new Set(prompt.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 4));
      const responseText = response.toLowerCase();
      const matched = [...promptWords].filter((w) => responseText.includes(w));
      return matched.length / Math.max(1, promptWords.size) >= 0.2;
    },
    improvement: 'Ensure response directly addresses the question keywords.',
    insight: 'Response may not have addressed the core question.',
  },
  {
    name: 'no_repetition',
    check: (prompt, response) => {
      const sentences = response.replace(/([.!?])\s+/g, '$1|||').split('|||');
      const unique = new Set(sentences.map((s) => s.trim().toLowerCase().substring(0, 50)));
      return unique.size >= sentences.length * 0.8;
    },
    improvement: 'Avoid repeating the same ideas in different words.',
    insight: 'Response contained repetitive content.',
  },
  {
    name: 'actionable',
    check: (prompt, response) => {
      const actionWords = ['you can', 'to do this', 'step', 'first', 'then', 'next', 'try', 'use', 'run', 'click', 'open', 'create', 'add', 'remove'];
      const lower = response.toLowerCase();
      return actionWords.some((w) => lower.includes(w));
    },
    improvement: 'Make responses more actionable with clear steps or examples.',
    insight: 'Response lacked actionable guidance.',
  },
  {
    name: 'concrete_examples',
    check: (prompt, response) => {
      const exampleMarkers = ['for example', 'e.g.', 'for instance', 'such as', 'like', '```', 'const ', 'function ', 'def '];
      const lower = response.toLowerCase();
      return exampleMarkers.some((m) => lower.includes(m));
    },
    improvement: 'Include concrete examples, code snippets, or specific cases.',
    insight: 'Response lacked concrete examples.',
  },
];

function computeRating(quality, failedChecks) {
  // quality is 0-1 score from caller, mapped to 1-5
  if (typeof quality === 'number' && quality >= 0 && quality <= 1) {
    const base = Math.round(quality * 4) + 1; // 1–5
    return Math.max(1, Math.min(5, base - Math.floor(failedChecks / 2)));
  }
  // Fallback from failed checks only
  if (failedChecks === 0) return 5;
  if (failedChecks === 1) return 4;
  if (failedChecks === 2) return 3;
  if (failedChecks === 3) return 2;
  return 1;
}

class SelfReflection {
  constructor() {
    // sessionId → [{ insight, improvement, at }]
    this._sessions = new Map();
    this.stats = { reflections: 0, totalInsights: 0 };
  }

  /**
   * Reflect on a completed response to generate insights.
   * @param {string} prompt
   * @param {string} response
   * @param {number|null} quality  — 0-1 score (optional)
   * @returns {{ insights: string[], improvements: string[], rating: number }}
   */
  reflect(prompt, response, quality) {
    try {
      if (!response || typeof response !== 'string') {
        return { insights: [], improvements: [], rating: 1 };
      }

      this.stats.reflections++;
      const insights = [];
      const improvements = [];

      for (const h of QUALITY_HEURISTICS) {
        const passed = h.check(prompt || '', response);
        if (!passed) {
          insights.push(h.insight);
          improvements.push(h.improvement);
        }
      }

      const rating = computeRating(quality, insights.length);

      return { insights, improvements, rating };
    } catch (err) {
      return { insights: [], improvements: [], rating: 3, error: err.message };
    }
  }

  /**
   * Reflect and store insights for a session.
   * @param {string} sessionId
   * @param {string} prompt
   * @param {string} response
   * @param {number|null} quality
   * @returns {{ insights: string[], improvements: string[], rating: number }}
   */
  reflectAndStore(sessionId, prompt, response, quality) {
    try {
      const result = this.reflect(prompt, response, quality);
      if (sessionId && result.insights.length > 0) {
        const session = this._getOrCreate(sessionId);
        for (const insight of result.insights) {
          if (session.length < MAX_INSIGHTS_PER_SESSION) {
            session.push({ insight, improvement: result.improvements[result.insights.indexOf(insight)] || '', at: new Date().toISOString() });
            this.stats.totalInsights++;
          }
        }
        // Trim to max
        if (session.length > MAX_INSIGHTS_PER_SESSION) {
          this._sessions.set(sessionId, session.slice(-MAX_INSIGHTS_PER_SESSION));
        }
      }
      return result;
    } catch (err) {
      return { insights: [], improvements: [], rating: 3, error: err.message };
    }
  }

  /**
   * Get accumulated insights for a session.
   * @param {string} sessionId
   * @returns {Array<{insight, improvement, at}>}
   */
  getSessionInsights(sessionId) {
    try {
      if (!sessionId) return [];
      return this._sessions.get(sessionId) || [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Append reflection context from previous session insights to the next prompt.
   * @param {string} sessionId
   * @param {string} nextPrompt
   * @returns {string}
   */
  applyInsights(sessionId, nextPrompt) {
    try {
      const insights = this.getSessionInsights(sessionId);
      if (insights.length === 0) return nextPrompt || '';

      const improvements = [...new Set(insights.map((i) => i.improvement).filter(Boolean))];
      if (improvements.length === 0) return nextPrompt || '';

      const context = `\n\n[Reflection guidance from previous responses: ${improvements.join(' ')}]`;
      return (nextPrompt || '') + context;
    } catch (err) {
      return nextPrompt || '';
    }
  }

  /**
   * Clear session data.
   * @param {string} sessionId
   */
  clearSession(sessionId) {
    try {
      this._sessions.delete(sessionId);
      return { cleared: true };
    } catch (err) {
      return { cleared: false, error: err.message };
    }
  }

  _getOrCreate(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, []);
    }
    return this._sessions.get(sessionId);
  }

  getStats() {
    return { ...this.stats, activeSessions: this._sessions.size };
  }
}

let _instance = null;
function getSelfReflection() {
  if (!_instance) _instance = new SelfReflection();
  return _instance;
}

module.exports = { SelfReflection, getSelfReflection };
