'use strict';

/**
 * SourceCatalog — Face 7.
 * Structured catalog of information sources with reliability, bias, and domain metadata.
 */

const SOURCE_TYPES = ['web', 'academic', 'social', 'news', 'document', 'database', 'api', 'human', 'internal'];

class SourceCatalog {
  constructor() {
    this._sources = new Map();
    this._stats = { queries: 0, adds: 0 };
  }

  add({ id, name, url, type = 'web', reliability = 0.5, bias = null, domains = [], description = '', tags = [] }) {
    if (!SOURCE_TYPES.includes(type)) throw new Error(`Invalid source type: ${type}`);
    const sourceId = id || `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const source = {
      id: sourceId,
      name: name || url || sourceId,
      url: url || null,
      type,
      reliability: Math.min(Math.max(reliability, 0), 1),
      bias,
      domains: Array.isArray(domains) ? domains : [],
      description,
      tags: Array.isArray(tags) ? tags : [],
      query_count: 0,
      added_at: new Date().toISOString(),
    };
    this._sources.set(sourceId, source);
    this._stats.adds++;
    return source;
  }

  get(id) {
    return this._sources.get(id) || null;
  }

  findByUrl(url) {
    for (const s of this._sources.values()) {
      if (s.url === url) return s;
    }
    return null;
  }

  findByDomain(domain) {
    return Array.from(this._sources.values()).filter((s) => s.domains.includes(domain));
  }

  findByType(type) {
    return Array.from(this._sources.values()).filter((s) => s.type === type);
  }

  getReliable(minReliability = 0.7) {
    return Array.from(this._sources.values())
      .filter((s) => s.reliability >= minReliability)
      .sort((a, b) => b.reliability - a.reliability);
  }

  recordQuery(id) {
    const s = this._sources.get(id);
    if (s) { s.query_count++; this._stats.queries++; }
  }

  updateReliability(id, newScore) {
    const s = this._sources.get(id);
    if (!s) throw new Error(`Source not found: ${id}`);
    s.reliability = Math.min(Math.max(newScore, 0), 1);
    s.updated_at = new Date().toISOString();
    return s;
  }

  list() {
    return Array.from(this._sources.values());
  }

  remove(id) {
    return this._sources.delete(id);
  }

  getStats() {
    return { total_sources: this._sources.size, ...this._stats };
  }
}

let _instance = null;
function getSourceCatalog() {
  if (!_instance) _instance = new SourceCatalog();
  return _instance;
}

module.exports = { SourceCatalog, getSourceCatalog, SOURCE_TYPES };
