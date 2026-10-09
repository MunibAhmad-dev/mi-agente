'use strict';

/**
 * ContextResolution — Gen B Phase 5.
 * Resolves context from a message + conversation history.
 * Extracts referenced entities, fills pronouns, links to prior messages.
 */

const PRONOUN_MAP = {
  it: null,
  that: null,
  this: null,
  they: null,
  them: null,
  he: null,
  she: null,
  his: null,
  her: null,
  their: null,
  its: null,
};

class ContextResolution {
  constructor() {
    this.stats = { resolutions: 0, entitiesExtracted: 0, pronounsFilled: 0 };
  }

  /**
   * Resolve context for a message given conversation history.
   * @param {string} message  - Current message text
   * @param {object[]} history - Array of { role, content } objects
   * @returns {object} { resolvedMessage, entities, pronounResolutions, linkedMessages, context }
   */
  resolve(message, history = []) {
    try {
      this.stats.resolutions++;
      const entities = this._extractEntities(message);
      this.stats.entitiesExtracted += entities.length;

      const pronounResolutions = this._resolvePronouns(message, history);
      this.stats.pronounsFilled += Object.keys(pronounResolutions).length;

      const linkedMessages = this._linkToPriorMessages(message, history);
      const resolvedMessage = this._buildResolvedMessage(message, pronounResolutions, entities);

      return {
        resolvedMessage,
        entities,
        pronounResolutions,
        linkedMessages,
        context: this._buildContext(history),
        original: message,
      };
    } catch (err) {
      return { error: err.message, resolvedMessage: message, entities: [], pronounResolutions: {}, linkedMessages: [] };
    }
  }

  /**
   * Extract named entities from a message.
   * Simple heuristic: capitalized words, quoted strings, numbers with units.
   */
  _extractEntities(text) {
    const entities = [];
    try {
      // Quoted strings
      const quotedMatches = text.match(/"([^"]+)"|'([^']+)'/g) || [];
      for (const q of quotedMatches) {
        entities.push({ value: q.replace(/['"]/g, ''), type: 'quoted' });
      }

      // Capitalized words (potential proper nouns, not at start of sentence)
      const capPattern = /(?<![.!?]\s)(?<!\n)\b[A-Z][a-z]{2,}\b/g;
      const caps = text.match(capPattern) || [];
      for (const c of caps) {
        if (!entities.some((e) => e.value === c)) {
          entities.push({ value: c, type: 'proper_noun' });
        }
      }

      // Numbers with units
      const numPattern = /\b\d+(?:\.\d+)?\s*(?:px|ms|s|kb|mb|gb|%|usd|\$|€|£)\b/gi;
      const nums = text.match(numPattern) || [];
      for (const n of nums) {
        entities.push({ value: n, type: 'quantity' });
      }
    } catch { /* non-fatal */ }
    return entities;
  }

  /**
   * Attempt to resolve pronouns to entities in recent history.
   * Returns a map of pronoun → resolved entity text.
   */
  _resolvePronouns(message, history) {
    const resolved = {};
    try {
      const lowerMsg = message.toLowerCase();
      const pronounsInMessage = Object.keys(PRONOUN_MAP).filter((p) =>
        new RegExp(`\\b${p}\\b`, 'i').test(lowerMsg)
      );

      if (pronounsInMessage.length === 0) return resolved;

      // Collect entities from recent assistant messages (last 5)
      const recentAssistant = history
        .filter((h) => h.role === 'assistant')
        .slice(-5)
        .reverse();

      for (const pronoun of pronounsInMessage) {
        for (const msg of recentAssistant) {
          const entities = this._extractEntities(msg.content || '');
          if (entities.length > 0) {
            resolved[pronoun] = entities[0].value;
            break;
          }
        }
      }
    } catch { /* non-fatal */ }
    return resolved;
  }

  /**
   * Find prior messages that seem related to the current message.
   * Matches by shared keywords (>= 2 words in common).
   */
  _linkToPriorMessages(message, history) {
    const linked = [];
    try {
      const msgWords = new Set(
        message.toLowerCase().split(/\W+/).filter((w) => w.length > 4)
      );

      history.forEach((h, idx) => {
        if (!h.content) return;
        const hWords = h.content.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
        const common = hWords.filter((w) => msgWords.has(w));
        if (common.length >= 2) {
          linked.push({ index: idx, role: h.role, sharedKeywords: common.slice(0, 5) });
        }
      });
    } catch { /* non-fatal */ }
    return linked.slice(0, 5);
  }

  /**
   * Build a resolved message with pronouns replaced by their resolutions.
   */
  _buildResolvedMessage(message, pronounResolutions) {
    try {
      let resolved = message;
      for (const [pronoun, entity] of Object.entries(pronounResolutions)) {
        if (entity) {
          resolved = resolved.replace(new RegExp(`\\b${pronoun}\\b`, 'gi'), entity);
        }
      }
      return resolved;
    } catch {
      return message;
    }
  }

  /**
   * Summarize the conversation context for downstream use.
   */
  _buildContext(history) {
    try {
      const turns = history.length;
      const userMessages = history.filter((h) => h.role === 'user').length;
      const lastUserMessage = history.filter((h) => h.role === 'user').pop()?.content || null;
      return { turns, userMessages, lastUserMessage };
    } catch {
      return { turns: 0, userMessages: 0, lastUserMessage: null };
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getContextResolution() {
  if (!_instance) _instance = new ContextResolution();
  return _instance;
}

module.exports = { ContextResolution, getContextResolution };
