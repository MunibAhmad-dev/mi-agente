'use strict';

const fs = require('fs');
const path = require('path');

/**
 * CapabilityRegistry - Central database for all capabilities.
 * Stores, indexes, versions, and provides search over all capabilities.
 */
class CapabilityRegistry {
  constructor(config = {}) {
    this.config = {
      storagePath: config.storagePath || path.join(process.cwd(), 'data', 'capability-registry'),
      ...config,
    };
    this.capabilities = new Map(); // id -> capability
    this.indexes = {
      byType: new Map(),
      byPlatform: new Map(),
      byCategory: new Map(),
      byTag: new Map(),
      byLicense: new Map(),
      bySecurityLevel: new Map(),
      byTier: new Map(),
    };
    this.stats = { stored: 0, indexed: 0, queries: 0 };
    this._ensureStorage();
  }

  _ensureStorage() {
    if (!fs.existsSync(this.config.storagePath)) {
      fs.mkdirSync(this.config.storagePath, { recursive: true });
    }
    // Load existing data
    this._loadFromDisk();
  }

  /**
   * Register a capability.
   */
  register(capability) {
    if (!capability || !capability.id) return false;

    this.capabilities.set(capability.id, capability);
    this._index(capability);
    this.stats.stored++;
    return true;
  }

  /**
   * Register multiple capabilities.
   */
  registerBatch(capabilities) {
    let count = 0;
    for (const cap of capabilities) {
      if (this.register(cap)) count++;
    }
    return count;
  }

  /**
   * Get capability by ID.
   */
  get(id) {
    return this.capabilities.get(id) || null;
  }

  /**
   * Search capabilities.
   */
  search(query, options = {}) {
    this.stats.queries++;
    const { type, platform, category, tag, license, securityLevel, tier, minStars } = options;

    let results = Array.from(this.capabilities.values());

    // Text search
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(cap => {
        const text = `${cap.name} ${cap.description} ${cap.tags.join(' ')} ${cap.categories.join(' ')}`.toLowerCase();
        return text.includes(q);
      });
    }

    // Filters
    if (type) results = results.filter(cap => cap.type === type);
    if (platform) results = results.filter(cap => cap.platforms.includes(platform));
    if (category) results = results.filter(cap => cap.categories.includes(category));
    if (tag) results = results.filter(cap => cap.tags.includes(tag));
    if (license) results = results.filter(cap => cap.license === license);
    if (securityLevel) results = results.filter(cap => cap.security.level === securityLevel);
    if (tier) results = results.filter(cap => cap.evaluation.tier === tier);
    if (minStars) results = results.filter(cap => (cap.popularity.stars || 0) >= minStars);

    // Sort by quality score
    results.sort((a, b) => (b.evaluation.overallScore || 0) - (a.evaluation.overallScore || 0));

    return {
      results,
      total: results.length,
      query,
      filters: { type, platform, category, tag, license, securityLevel, tier },
    };
  }

  /**
   * Get all capabilities of a specific type.
   */
  getByType(type) {
    return this.indexes.byType.get(type) || [];
  }

  /**
   * Get all capabilities for a platform.
   */
  getByPlatform(platform) {
    return this.indexes.byPlatform.get(platform) || [];
  }

  /**
   * Get top capabilities.
   */
  getTop(n = 10) {
    return Array.from(this.capabilities.values())
      .sort((a, b) => (b.evaluation.overallScore || 0) - (a.evaluation.overallScore || 0))
      .slice(0, n);
  }

  /**
   * Get capability statistics.
   */
  getStatistics() {
    const caps = Array.from(this.capabilities.values());
    const types = {};
    const platforms = {};
    const tiers = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0, null: 0 };
    const securityLevels = {};

    for (const cap of caps) {
      types[cap.type] = (types[cap.type] || 0) + 1;
      for (const p of cap.platforms) platforms[p] = (platforms[p] || 0) + 1;
      tiers[cap.evaluation.tier || null] = (tiers[cap.evaluation.tier || null] || 0) + 1;
      securityLevels[cap.security.level] = (securityLevels[cap.security.level] || 0) + 1;
    }

    return { total: caps.length, types, platforms, tiers, securityLevels };
  }

  _index(cap) {
    // Index by type
    if (!this.indexes.byType.has(cap.type)) this.indexes.byType.set(cap.type, []);
    this.indexes.byType.get(cap.type).push(cap.id);

    // Index by platform
    for (const p of cap.platforms) {
      if (!this.indexes.byPlatform.has(p)) this.indexes.byPlatform.set(p, []);
      this.indexes.byPlatform.get(p).push(cap.id);
    }

    // Index by category
    for (const c of cap.categories) {
      if (!this.indexes.byCategory.has(c)) this.indexes.byCategory.set(c, []);
      this.indexes.byCategory.get(c).push(cap.id);
    }

    // Index by tag
    for (const t of cap.tags) {
      if (!this.indexes.byTag.has(t)) this.indexes.byTag.set(t, []);
      this.indexes.byTag.get(t).push(cap.id);
    }

    // Index by license
    if (cap.license) {
      if (!this.indexes.byLicense.has(cap.license)) this.indexes.byLicense.set(cap.license, []);
      this.indexes.byLicense.get(cap.license).push(cap.id);
    }

    // Index by security level
    if (cap.security.level) {
      if (!this.indexes.bySecurityLevel.has(cap.security.level)) this.indexes.bySecurityLevel.set(cap.security.level, []);
      this.indexes.bySecurityLevel.get(cap.security.level).push(cap.id);
    }

    // Index by tier
    if (cap.evaluation.tier) {
      if (!this.indexes.byTier.has(cap.evaluation.tier)) this.indexes.byTier.set(cap.evaluation.tier, []);
      this.indexes.byTier.get(cap.evaluation.tier).push(cap.id);
    }

    this.stats.indexed++;
  }

  /**
   * Save to disk.
   */
  save() {
    const data = JSON.stringify(Array.from(this.capabilities.values()), null, 2);
    fs.writeFileSync(path.join(this.config.storagePath, 'registry.json'), data);
  }

  /**
   * Load from disk.
   */
  _loadFromDisk() {
    try {
      const filePath = path.join(this.config.storagePath, 'registry.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const cap of data) {
          this.capabilities.set(cap.id, cap);
          this._index(cap);
        }
        this.stats.stored = this.capabilities.size;
      }
    } catch { /* empty registry */ }
  }

  /**
   * Remove a capability.
   */
  remove(id) {
    return this.capabilities.delete(id);
  }

  /**
   * Update a capability.
   */
  update(id, updates) {
    const cap = this.capabilities.get(id);
    if (!cap) return false;
    Object.assign(cap, updates);
    this.capabilities.set(id, cap);
    return true;
  }

  /**
   * Export registry as JSON.
   */
  exportJson() {
    return JSON.stringify(Array.from(this.capabilities.values()), null, 2);
  }

  getStats() {
    return { ...this.stats, totalCapabilities: this.capabilities.size };
  }
}

module.exports = { CapabilityRegistry };
