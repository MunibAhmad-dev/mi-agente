/**
 * EntityResolver — Cross-platform identity resolution
 * =====================================================
 * Matches the same person across Bluesky, Reddit, GitHub, Mastodon, etc.
 * Uses multi-signal approach: usernames, URLs, bios, content patterns.
 */

const { createLogger } = require('../logger');
const crypto = require('crypto');

const logger = createLogger('EntityResolver');

class EntityResolver {
  constructor() {
    this._entities = new Map(); // entityId → entity
    this._usernameIndex = new Map(); // normalized_username → [entityId]
    this._urlIndex = new Map(); // url → entityId
  }

  /**
   * Register an account for entity resolution.
   * @param {object} account - Normalized account
   * @returns {object} Entity with cross-platform matches
   */
  registerAccount(account) {
    if (!account) return null;

    const normalizedUsername = this._normalizeUsername(account.username);
    const urls = this._extractUrls(account);
    const bio = (account.bio || '').toLowerCase();

    // Find existing entity or create new one
    let entity = this._findExistingEntity(normalizedUsername, urls, bio, account.platform);

    if (!entity) {
      entity = this._createEntity(account);
    } else {
      // Merge account into existing entity
      this._mergeAccount(entity, account);
    }

    // Update indexes
    this._indexEntity(entity, normalizedUsername, urls);

    return entity;
  }

  /**
   * Find entities matching a query.
   * @param {string} query - Search query (username, display name, etc.)
   * @returns {object[]} Matching entities
   */
  findEntities(query) {
    const normalized = this._normalizeUsername(query);
    const results = [];

    // Exact username match
    const exactMatches = this._usernameIndex.get(normalized) || [];
    for (const entityId of exactMatches) {
      const entity = this._entities.get(entityId);
      if (entity) results.push({ ...entity, matchType: 'exact_username', confidence: 1.0 });
    }

    // Fuzzy username match
    if (results.length === 0) {
      for (const [username, entityIds] of this._usernameIndex) {
        const similarity = this._jaccardSimilarity(normalized, username);
        if (similarity >= 0.7) {
          for (const entityId of entityIds) {
            const entity = this._entities.get(entityId);
            if (entity) results.push({ ...entity, matchType: 'fuzzy_username', confidence: similarity });
          }
        }
      }
    }

    // Display name match
    for (const [, entity] of this._entities) {
      const displayName = this._normalizeUsername(entity.displayName || '');
      if (displayName.includes(normalized) || normalized.includes(displayName)) {
        if (!results.find((r) => r.id === entity.id)) {
          results.push({ ...entity, matchType: 'display_name', confidence: 0.7 });
        }
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get entity by ID.
   */
  getEntity(id) {
    return this._entities.get(id) || null;
  }

  /**
   * Get all entities.
   */
  getAllEntities() {
    return Array.from(this._entities.values());
  }

  /**
   * Get entity summary.
   */
  getSummary() {
    const entities = this.getAllEntities();
    const platforms = {};
    for (const entity of entities) {
      for (const account of entity.accounts) {
        platforms[account.platform] = (platforms[account.platform] || 0) + 1;
      }
    }
    return {
      totalEntities: entities.length,
      multiPlatform: entities.filter((e) => e.accounts.length > 1).length,
      platforms,
    };
  }

  // ─── INTERNAL ────────────────────────────────────────────────

  _findExistingEntity(username, urls, bio, platform) {
    // Check username index
    const usernameMatches = this._usernameIndex.get(username) || [];
    if (usernameMatches.length > 0) {
      return this._entities.get(usernameMatches[0]);
    }

    // Check URL index
    for (const url of urls) {
      const entityId = this._urlIndex.get(url);
      if (entityId) {
        return this._entities.get(entityId);
      }
    }

    // Check bio similarity for same platform
    for (const [, entity] of this._entities) {
      const existingAccount = entity.accounts.find((a) => a.platform === platform);
      if (existingAccount) {
        const bioSimilarity = this._jaccardSimilarity(bio, (existingAccount.bio || '').toLowerCase());
        if (bioSimilarity >= 0.8 && this._normalizeUsername(existingAccount.username) === username) {
          return entity;
        }
      }
    }

    return null;
  }

  _createEntity(account) {
    const id = `ent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entity = {
      id,
      displayName: account.displayName || account.username,
      accounts: [{ ...account }],
      primaryPlatform: account.platform,
      topics: [...(account.topics || [])],
      confidence: 0.5,
      createdAt: Date.now(),
    };
    this._entities.set(id, entity);
    return entity;
  }

  _mergeAccount(entity, account) {
    // Check if already exists on this platform
    const existing = entity.accounts.find((a) => a.platform === account.platform);
    if (existing) {
      // Update with newer data
      Object.assign(existing, account);
    } else {
      entity.accounts.push(account);
    }

    // Merge topics
    const allTopics = new Set([...entity.topics, ...(account.topics || [])]);
    entity.topics = [...allTopics].slice(0, 20);

    // Update confidence based on cross-platform matches
    entity.confidence = Math.min(0.5 + entity.accounts.length * 0.15, 1.0);

    // Update primary platform (most followers)
    const primary = entity.accounts.reduce((a, b) => (a.followers || 0) > (b.followers || 0) ? a : b);
    entity.primaryPlatform = primary.platform;
  }

  _indexEntity(entity, username, urls) {
    this._usernameIndex.set(username, [
      ...(this._usernameIndex.get(username) || []).filter((id) => id !== entity.id),
      entity.id,
    ]);
    for (const url of urls) {
      this._urlIndex.set(url, entity.id);
    }
  }

  _normalizeUsername(username) {
    return (username || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  _extractUrls(account) {
    const urls = [];
    if (account.url) urls.push(this._normalizeUrl(account.url));
    if (account.avatarUrl) urls.push(this._normalizeUrl(account.avatarUrl));
    return urls.filter(Boolean);
  }

  _normalizeUrl(url) {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/+$/, '');
    } catch {
      return null;
    }
  }

  _jaccardSimilarity(a, b) {
    const setA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
    const setB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}

module.exports = EntityResolver;
