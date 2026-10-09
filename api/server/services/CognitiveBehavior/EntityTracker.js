'use strict';

/**
 * EntityTracker.js — Gen B Batch-C Phase 5.
 * Tracks entities mentioned across a conversation with their attributes.
 */

const ENTITY_TYPES = {
  PERSON: 'PERSON',
  PLACE: 'PLACE',
  ORG: 'ORG',
  CONCEPT: 'CONCEPT',
  CODE: 'CODE',
  FILE: 'FILE',
  URL: 'URL',
};

// Simple patterns for heuristic extraction
const PATTERNS = [
  { type: ENTITY_TYPES.URL, re: /https?:\/\/[^\s"']+/gi },
  { type: ENTITY_TYPES.FILE, re: /\b[\w.-]+\.(js|ts|py|java|json|yaml|yml|md|txt|html|css|sh|go|rs|rb|php)\b/gi },
  { type: ENTITY_TYPES.CODE, re: /`([^`]+)`/g, group: 1 },
  { type: ENTITY_TYPES.PERSON, re: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g }, // Capitalized names
  { type: ENTITY_TYPES.ORG, re: /\b(OpenAI|Google|Microsoft|Amazon|Apple|Facebook|Meta|Anthropic|GitHub|npm|Node(?:\.js)?|React|Vue|Angular)\b/gi },
];

// Pronoun resolution reference terms
const PRONOUN_MAP = {
  it: null, that: null, this: null,
  they: null, them: null, those: null,
  'the function': ENTITY_TYPES.CODE,
  'the file': ENTITY_TYPES.FILE,
  'the class': ENTITY_TYPES.CODE,
  'the module': ENTITY_TYPES.CODE,
  'the component': ENTITY_TYPES.CODE,
  'the variable': ENTITY_TYPES.CODE,
  'the page': ENTITY_TYPES.URL,
  'the site': ENTITY_TYPES.URL,
};

class EntityTracker {
  constructor() {
    // Map: sessionId → Map<entityName, entityRecord>
    this._sessions = new Map();
    this.stats = { sessions: 0, totalExtracted: 0, updates: 0 };
  }

  /**
   * Extract entities from text and track them for the session.
   * @param {string} sessionId
   * @param {string} text
   * @returns {{ entities: object[] }}
   */
  extract(sessionId, text) {
    try {
      if (!sessionId || !text) return { entities: [] };
      this._ensureSession(sessionId);

      const entities = [];

      for (const { type, re, group } of PATTERNS) {
        const regex = new RegExp(re.source, re.flags);
        let match;
        while ((match = regex.exec(text)) !== null) {
          const name = group !== undefined ? match[group] : match[0];
          if (!name || name.length < 2) continue;
          const entity = {
            name: name.trim(),
            type,
            attributes: { firstSeen: new Date().toISOString() },
            confidence: this._confidence(type, name),
          };
          entities.push(entity);
          this._mergeEntity(sessionId, entity);
        }
      }

      this.stats.totalExtracted += entities.length;
      return { entities };
    } catch (err) {
      return { entities: [], error: err.message };
    }
  }

  /**
   * Update entity attributes for a session.
   * @param {string} sessionId
   * @param {string} entityName
   * @param {object} attributes
   */
  update(sessionId, entityName, attributes = {}) {
    try {
      this._ensureSession(sessionId);
      const map = this._sessions.get(sessionId);
      const key = entityName.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        Object.assign(existing.attributes, attributes);
        existing.updatedAt = new Date().toISOString();
        this.stats.updates++;
        return { ...existing };
      }
      // Create new entity if not found
      const entity = {
        name: entityName,
        type: ENTITY_TYPES.CONCEPT,
        attributes: { ...attributes, firstSeen: new Date().toISOString() },
        confidence: 0.5,
      };
      map.set(key, entity);
      this.stats.updates++;
      return { ...entity };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get all tracked entities for a session, optionally filtered by type.
   * @param {string} sessionId
   * @param {string} type - optional filter
   * @returns {object[]}
   */
  getEntities(sessionId, type) {
    try {
      const map = this._sessions.get(sessionId);
      if (!map) return [];
      const all = Array.from(map.values());
      if (type) return all.filter((e) => e.type === type.toUpperCase());
      return all;
    } catch (err) {
      return [];
    }
  }

  /**
   * Resolve a pronoun or vague reference to the most likely entity.
   * @param {string} sessionId
   * @param {string} reference - e.g. "it", "the function", "that"
   * @returns {string} resolved entity name or original reference
   */
  resolve(sessionId, reference) {
    try {
      const ref = (reference || '').toLowerCase().trim();
      const map = this._sessions.get(sessionId);
      if (!map || map.size === 0) return reference;

      // Check pronoun map for type hint
      const typeHint = Object.prototype.hasOwnProperty.call(PRONOUN_MAP, ref) ? PRONOUN_MAP[ref] : undefined;

      let candidates = Array.from(map.values());
      if (typeHint) candidates = candidates.filter((e) => e.type === typeHint);

      if (candidates.length === 0) {
        // Fall back to most recently updated/created entity
        candidates = Array.from(map.values());
      }

      if (candidates.length === 0) return reference;

      // Pick highest confidence, then most recent
      candidates.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return (b.updatedAt || b.attributes.firstSeen) > (a.updatedAt || a.attributes.firstSeen) ? 1 : -1;
      });

      return candidates[0].name;
    } catch (err) {
      return reference;
    }
  }

  // ── private ──────────────────────────────────────────────────────────────────

  _ensureSession(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, new Map());
      this.stats.sessions++;
    }
  }

  _mergeEntity(sessionId, entity) {
    const map = this._sessions.get(sessionId);
    const key = entity.name.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + 0.05);
      existing.updatedAt = new Date().toISOString();
    } else {
      map.set(key, { ...entity });
    }
  }

  _confidence(type, name) {
    if (type === ENTITY_TYPES.URL) return 0.98;
    if (type === ENTITY_TYPES.FILE) return 0.9;
    if (type === ENTITY_TYPES.CODE) return 0.85;
    if (type === ENTITY_TYPES.ORG) return 0.8;
    if (type === ENTITY_TYPES.PERSON && name.includes(' ')) return 0.7;
    return 0.5;
  }

  getStats() {
    return { ...this.stats, activeSessions: this._sessions.size };
  }
}

let _instance = null;
function getEntityTracker() {
  if (!_instance) _instance = new EntityTracker();
  return _instance;
}

module.exports = { EntityTracker, getEntityTracker, ENTITY_TYPES };
